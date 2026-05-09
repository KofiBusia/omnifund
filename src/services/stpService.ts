import { db } from '../firebase';
import { 
  runTransaction, 
  doc, 
  collection, 
  serverTimestamp, 
  setDoc, 
  updateDoc, 
  increment 
} from 'firebase/firestore';
import { IngestionResult } from './ingestionService';
import { InvestmentAccount, Investor, Transaction, Asset } from '../types';

export interface STPOptions {
  autoHydrateInvestors?: boolean;
}

export class STPService {
  /**
   * UNIT OF WORK: Provisions an ingestion result into the live ledger.
   * Performs Investor Hydration, Unit Issuance, Asset Allocation, and Capacity Validation.
   */
  async provision(
    result: IngestionResult, 
    existingContext: { accounts: InvestmentAccount[], investors: Investor[] },
    options: STPOptions = { autoHydrateInvestors: true }
  ) {
    const logs: string[] = [];
    let successCount = 0;
    const hydratedInvestors = new Map<string, Investor>();

    // Pre-process entities to have a lookup for metadata
    const investorMetadata = new Map<string, { name: string; email?: string }>();
    result.entities.investors.forEach(inv => {
      if (inv.name) {
        investorMetadata.set(inv.investorId || inv.name, { 
          name: inv.name, 
          email: inv.email
        });
      }
    });

    const assetMetadata = new Map<string, { name: string; sector?: string }>();
    result.entities.assets.forEach(asset => {
      if (asset.ticker) {
        assetMetadata.set(asset.ticker, { name: asset.name, sector: asset.sector });
      }
    });

    try {
      await runTransaction(db, async (transaction) => {
        const fundCache = new Map<string, InvestmentAccount>();
        const processedFunds = new Set<string>();

        // 0. PROVISION NEW FUNDS
        for (const fundEntity of result.entities.funds) {
          if (!fundEntity.ticker) continue;
          const existingFund = existingContext.accounts.find(a => a.ticker === fundEntity.ticker);
          
          if (!existingFund) {
            const fundRef = doc(collection(db, 'accounts'));
            const newFund: InvestmentAccount = {
              id: fundRef.id,
              name: fundEntity.name || fundEntity.ticker,
              ticker: fundEntity.ticker,
              description: fundEntity.description || `Automated Custodian Managed Fund: ${fundEntity.ticker}`,
              aum: 0,
              nav: fundEntity.nav || 1.00,
              totalUnits: 0,
              cashBalance: 0,
              lastValuationDate: new Date().toISOString(),
              createdAt: new Date().toISOString()
            };
            transaction.set(fundRef, newFund);
            // Update context so subsequent loops find it
            existingContext.accounts.push(newFund);
            fundCache.set(newFund.id, newFund);
            logs.push(`PROVISIONED: New Fund [${newFund.ticker}] created.`);
            successCount++;
          }
        }
        
        // 1. PROCESS INVESTOR SUBSCRIPTIONS
        for (const mapping of result.mappings.investorToFund) {
          try {
            let fund = existingContext.accounts.find(a => a.ticker === mapping.fundTicker);
            if (!fund) {
              logs.push(`SKIPPED: Fund [${mapping.fundTicker}] not found for investor mapping.`);
              continue;
            }
            
            let fundData = fundCache.get(fund.id);
            if (!fundData) {
              const fundRef = doc(db, 'accounts', fund.id);
              const snapshot = await transaction.get(fundRef);
              if (snapshot.exists()) {
                fundData = snapshot.data() as InvestmentAccount;
                fundCache.set(fund.id, fundData);
              } else {
                continue;
              }
            }

            const currentInvestors = [...existingContext.investors, ...Array.from(hydratedInvestors.values())]
              .filter(inv => inv.accountId === fund.id);
            
            let investor = this.resolveInvestor(mapping.investorId, currentInvestors);
            let investorRef;

            if (!investor) {
              if (!options.autoHydrateInvestors) continue;
              
              const newInvestorId = `INV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
              investorRef = doc(collection(db, 'investors'));
              const metadata = investorMetadata.get(mapping.investorId);
              const displayName = metadata?.name || mapping.investorId;
              const email = metadata?.email || '';

              const newInvestor: Investor = {
                id: investorRef.id,
                investorId: newInvestorId,
                uid: '', 
                accountId: fund.id,
                name: displayName, 
                email,
                unitsOwned: 0,
                totalInvestment: 0,
                currentValue: 0,
                kycStatus: 'verified'
              };
              transaction.set(investorRef, newInvestor);
              investor = newInvestor;
              hydratedInvestors.set(mapping.investorId, newInvestor);
              logs.push(`HYDRATED: Investor [${displayName}] created for account ${fund.ticker}.`);
            } else {
              investorRef = doc(db, 'investors', investor.id);
            }

            const unitsToIssue = mapping.units; 
            const totalDeposit = mapping.units * fundData.nav;

            transaction.update(doc(db, 'accounts', fund.id), {
              totalUnits: increment(unitsToIssue),
              aum: increment(totalDeposit),
              lastSyncDate: serverTimestamp()
            });

            transaction.update(investorRef, {
              unitsOwned: increment(unitsToIssue),
              totalInvestment: increment(totalDeposit),
              currentValue: increment(totalDeposit)
            });

            const txRef = doc(collection(db, 'transactions'));
            transaction.set(txRef, {
              id: txRef.id,
              investorId: investor.id,
              accountId: fund.id,
              type: 'BUY',
              units: unitsToIssue,
              pricePerUnit: fundData.nav,
              totalAmount: totalDeposit,
              timestamp: new Date().toISOString()
            } as Transaction);

            successCount++;
          } catch (rowErr: any) {
            logs.push(`ERROR on Subscription [${mapping.investorId}]: ${rowErr.message}`);
          }
        }

        // 2. PROCESS ASSET PORTFOLIO ALLOCATION
        for (const mapping of result.mappings.fundToAsset) {
          try {
            const fund = existingContext.accounts.find(a => a.ticker === mapping.fundTicker);
            if (!fund) {
              logs.push(`SKIPPED: Fund [${mapping.fundTicker}] not found for asset allocation.`);
              continue;
            }

            const assetRef = doc(collection(db, 'portfolio'));
            const metadata = assetMetadata.get(mapping.assetTicker);

            const newAsset: Asset = {
              id: assetRef.id,
              accountId: fund.id,
              ticker: mapping.assetTicker,
              name: metadata?.name || mapping.assetTicker,
              sector: metadata?.sector || 'General',
              quantity: mapping.quantity,
              costBasis: mapping.value / mapping.quantity,
              totalCostBasis: mapping.value,
              currentPrice: mapping.value / mapping.quantity,
              marketValue: mapping.value,
              valuationDate: new Date().toISOString().split('T')[0],
              unrealizedGainLoss: 0
            };

            transaction.set(assetRef, newAsset);
            
            // Increment Fund AUM for asset value
            transaction.update(doc(db, 'accounts', fund.id), {
              aum: increment(mapping.value)
            });

            successCount++;
            logs.push(`PROVISIONED: Asset [${mapping.assetTicker}] - ${mapping.quantity} units added to portfolio.`);
          } catch (assetErr: any) {
            logs.push(`ERROR on Asset [${mapping.assetTicker}]: ${assetErr.message}`);
          }
        }
      });
    } catch (batchErr: any) {
      logs.push(`CRITICAL BATCH FAILURE: ${batchErr.message}`);
      return { 
        success: 0, 
        total: result.mappings.investorToFund.length + result.mappings.fundToAsset.length + result.entities.funds.length, 
        logs 
      };
    }

    return {
      success: successCount,
      total: result.mappings.investorToFund.length + result.mappings.fundToAsset.length + result.entities.funds.length,
      logs
    };
  }

  private resolveInvestor(identifier: string, existing: Investor[]): Investor | null {
    if (!identifier) return null;
    const idNorm = identifier.toLowerCase().trim();
    
    // 1. Strict ID or Name Match
    return existing.find(i => 
      i.investorId.toLowerCase() === idNorm || 
      i.id.toLowerCase() === idNorm ||
      i.name.toLowerCase().trim() === idNorm
    ) || null;
  }

  private validateISIN(isin: string): boolean {
    return /^[A-Z]{2}[A-Z0-9]{9}[0-9]{1}$/.test(isin);
  }
}

