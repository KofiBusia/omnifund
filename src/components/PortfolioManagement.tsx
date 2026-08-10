import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Asset, InvestmentAccount } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { getGeminiResponse } from '../lib/gemini';
import { 
  Plus, 
  Search, 
  Briefcase, 
  TrendingUp, 
  DollarSign, 
  Trash2, 
  Edit3,
  Calendar,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertCircle,
  Table,
  Sparkles,
  X,
  History,
  RotateCcw,
  FileText,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { addDoc, collection, doc, updateDoc, deleteDoc, runTransaction, increment, query, where, getDocs, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { runGlobalValuation, revertAssetValuation, recalculateAccountValuation } from '../services/valuationService';
import { AssetValuation } from '../types';
import { generatePortfolioStatementPDF } from '../lib/pdfGenerator';

interface PortfolioManagementProps {
  portfolio: Asset[];
  fund: InvestmentAccount | null;
  accounts: InvestmentAccount[];
  role?: 'admin' | 'investor' | null;
}

export default function PortfolioManagement({ portfolio, fund, accounts, role }: PortfolioManagementProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [assetHistory, setAssetHistory] = useState<AssetValuation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedAssetForHistory, setSelectedAssetForHistory] = useState<Asset | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [localAccountId, setLocalAccountId] = useState<string | null>(fund?.id || (accounts.length > 0 ? accounts[0].id : null));
  const [isExportingStatement, setIsExportingStatement] = useState(false);
  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false);
  const [statementOptions, setStatementOptions] = useState({
    showSector: true,
    showCostBasis: true,
    showMarketValue: true,
    showWeight: true,
    showGainLoss: true,
    showSummary: true,
    showCashBalance: true,
    showDisclaimer: true,
  });

  const handleExportPortfolioStatement = async () => {
    setIsExportingStatement(true);
    setIsOptionsModalOpen(false);
    const loadingToast = toast.loading("Generating your portfolio valuation statement...");
    try {
      const pdf = await generatePortfolioStatementPDF(activeFund, filteredPortfolio, statementOptions);
      pdf.save(`Portfolio_Statement_${activeFund ? activeFund.ticker : 'Consolidated'}_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success("Portfolio Statement generated successfully", { id: loadingToast });
    } catch (error: any) {
      console.error(error);
      toast.error(`Failed to generate statement: ${error.message || 'Unknown error'}`, { id: loadingToast });
    } finally {
      setIsExportingStatement(false);
    }
  };
  
  // Initialize localAccountId when fund or accounts become available
  React.useEffect(() => {
    if (!localAccountId) {
      const id = fund?.id || (accounts.length > 0 ? accounts[0].id : null);
      if (id) setLocalAccountId(id);
    }
  }, [fund, accounts, localAccountId]);

  const activeFund = useMemo(() => 
    accounts.find(a => a.id === localAccountId) || fund,
    [accounts, localAccountId, fund]
  );

  const filteredPortfolio = useMemo(() => 
    localAccountId 
      ? portfolio.filter(p => p.accountId === localAccountId)
      : portfolio,
    [portfolio, localAccountId]
  );

  // Real-time Valuation Calculation (Derived from props)
  const liveValuation = useMemo(() => {
    if (!activeFund) return { aum: 0, nav: 1 };
    const totalMarketValue = filteredPortfolio.reduce((sum, asset) => sum + asset.marketValue, 0);
    const calculatedAUM = totalMarketValue + (activeFund.cashBalance || 0);
    const calculatedNAV = activeFund.totalUnits > 0 ? calculatedAUM / activeFund.totalUnits : activeFund.nav;
    
    return {
      aum: calculatedAUM,
      nav: calculatedNAV
    };
  }, [filteredPortfolio, activeFund]);

  const [newAsset, setNewAsset] = useState({ 
    ticker: '', 
    name: '', 
    sector: 'Banking',
    quantity: 0, 
    costBasis: 0, // Avg per share
    totalCostBasis: 0,
    currentPrice: 0,
    marketValue: 0,
    recordedAt: new Date().toISOString().split('T')[0],
    accountId: localAccountId || ''
  });

  // Auto-calculate logic
  const handleFinancialChange = (field: string, value: number) => {
    setNewAsset(prev => {
      const updated = { ...prev, [field]: value };
      
      if (field === 'quantity' || field === 'costBasis') {
        updated.totalCostBasis = updated.quantity * updated.costBasis;
      } else if (field === 'totalCostBasis' && updated.quantity > 0) {
        updated.costBasis = updated.totalCostBasis / updated.quantity;
      }

      if (field === 'quantity' || field === 'currentPrice') {
        updated.marketValue = updated.quantity * updated.currentPrice;
      } else if (field === 'marketValue' && updated.quantity > 0) {
        updated.currentPrice = updated.marketValue / updated.quantity;
      }

      return updated;
    });
  };

  // Update newAsset accountId when localAccountId changes
  React.useEffect(() => {
    setNewAsset(prev => ({ ...prev, accountId: localAccountId || '' }));
  }, [localAccountId]);

  const totalMarketValue = filteredPortfolio.reduce((sum, asset) => sum + asset.marketValue, 0);
  const totalCostBasis = filteredPortfolio.reduce((sum, asset) => sum + (asset.quantity * asset.costBasis), 0);
  const totalGainLoss = totalMarketValue - totalCostBasis;
  const totalGainLossPct = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis * 100) : 0;

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkInput.trim() || isProcessingBulk) return;

    setIsProcessingBulk(true);
    const loadingToast = toast.loading("AI is parsing your statement data...");

    try {
      const context = `
        Target Account: ${activeFund?.name} (${activeFund?.ticker})
        Assets to parse:
        ${bulkInput}
        
        Expected Format: Instrument, Quantity, Cost Basis, Price.
      `;
      
      const prompt = "Parse the provided statement data and return a JSON array of assets. For each asset, include: ticker, name, quantity (number), costBasis (number), currentPrice (number). Only return valid JSON.";
      
      const response = await getGeminiResponse(prompt, context);
      const cleanedJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const assets = JSON.parse(cleanedJson);

      if (!Array.isArray(assets)) throw new Error("Invalid output format from AI");

      let totalCostToCover = 0;
      await runTransaction(db, async (transaction) => {
        assets.forEach(assetData => {
          const assetRef = doc(collection(db, 'portfolio'));
          const marketValue = assetData.quantity * assetData.currentPrice;
          const cost = assetData.quantity * assetData.costBasis;
          totalCostToCover += cost;

          transaction.set(assetRef, {
            accountId: activeFund?.id,
            ticker: (assetData.ticker || 'UNKNOWN').toUpperCase(),
            name: assetData.name || 'Unknown Asset',
            sector: 'Mixed',
            quantity: Number(assetData.quantity),
            costBasis: Number(assetData.costBasis),
            totalCostBasis: Number(cost),
            currentPrice: Number(assetData.currentPrice),
            marketValue: Number(marketValue),
            valuationDate: new Date().toISOString(),
            recordedAt: new Date().toISOString().split('T')[0],
            unrealizedGainLoss: Number(marketValue - cost)
          });
        });

        // Deduct from cash
        if (activeFund) {
          const accountRef = doc(db, 'accounts', activeFund.id);
          transaction.update(accountRef, {
            cashBalance: increment(-totalCostToCover)
          });
        }
      });

      toast.success(`Successfully imported ${assets.length} assets.`, { id: loadingToast });
      setIsBulkModalOpen(false);
      setBulkInput('');
    } catch (error: any) {
      console.error("Bulk Import Error:", error);
      toast.error(`Failed to parse data: ${error.message}`, { id: loadingToast });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleFetchPrices = async () => {
    setIsRefreshing(true);
    try {
      await runGlobalValuation();
    } catch (error) {
      console.error("Failed to refresh prices", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewHistory = async (asset: Asset) => {
    setSelectedAssetForHistory(asset);
    setIsHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const q = query(
        collection(db, 'asset_valuations'),
        where('assetId', '==', asset.id),
        orderBy('timestamp', 'desc')
      );
      const snapshot = await getDocs(q);
      const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AssetValuation));
      setAssetHistory(history);
    } catch (error) {
      console.error("Error fetching asset history", error);
      toast.error("Failed to load valuation history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleRevertAssetValuation = async (valuation: AssetValuation) => {
    if (!selectedAssetForHistory) return;
    const loadingToast = toast.loading("Reversing asset valuation...");
    try {
      await revertAssetValuation(selectedAssetForHistory.id, valuation.id);
      toast.success("Valuation reversed successfully", { id: loadingToast });
      // Refresh history
      handleViewHistory(selectedAssetForHistory);
    } catch (error) {
      console.error("Error reversing valuation", error);
      toast.error("Failed to reverse valuation", { id: loadingToast });
    }
  };

  const modalSelectedAccount = useMemo(() => 
    accounts.find(a => a.id === newAsset.accountId) || activeFund,
    [accounts, newAsset.accountId, activeFund]
  );

  const [isAdding, setIsAdding] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateAsset = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isUpdating || !editingAsset) return;

    setIsUpdating(true);
    const loadingToast = toast.loading("Updating portfolio asset...");

    try {
      const assetRef = doc(db, 'portfolio', editingAsset.id);
      
      const marketValue = newAsset.marketValue || (newAsset.quantity * newAsset.currentPrice);
      const totalCost = newAsset.totalCostBasis || (newAsset.quantity * newAsset.costBasis);
      
      await updateDoc(assetRef, {
        ticker: newAsset.ticker.trim().toUpperCase(),
        name: newAsset.name.trim(),
        sector: newAsset.sector,
        quantity: Number(newAsset.quantity),
        costBasis: Number(newAsset.costBasis),
        totalCostBasis: Number(totalCost),
        currentPrice: Number(newAsset.currentPrice),
        marketValue: Number(marketValue),
        recordedAt: newAsset.recordedAt || new Date().toISOString().split('T')[0],
        unrealizedGainLoss: Number(marketValue - totalCost)
      });

      toast.success("Asset updated successfully", { id: loadingToast });
      
      // Critical: Recalculate account valuation after update
      if (editingAsset.accountId) {
        await recalculateAccountValuation(editingAsset.accountId);
      } else if (localAccountId) {
        await recalculateAccountValuation(localAccountId);
      }

      setIsEditModalOpen(false);
      setEditingAsset(null);
      setNewAsset({ 
        ticker: '', 
        name: '', 
        sector: 'Banking',
        quantity: 0, 
        costBasis: 0, 
        totalCostBasis: 0,
        currentPrice: 0,
        marketValue: 0,
        recordedAt: new Date().toISOString().split('T')[0],
        accountId: localAccountId || ''
      });
    } catch (error: any) {
      console.error("Error in handleUpdateAsset:", error);
      toast.error(`Failed to update asset: ${error.message || 'Unknown error'}`, { id: loadingToast });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddAsset = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isAdding) return;
    
    if (!modalSelectedAccount) {
      toast.error("No investment account selected.");
      return;
    }

    const totalCost = newAsset.totalCostBasis || (newAsset.quantity * newAsset.costBasis);

    if (totalCost <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }

    setIsAdding(true);
    const loadingToast = toast.loading("Recording portfolio investment...");

    try {
      await runTransaction(db, async (transaction) => {
        const accountRef = doc(db, 'accounts', modalSelectedAccount.id);
        const assetRef = doc(collection(db, 'portfolio'));
        
        const marketValue = newAsset.marketValue || (newAsset.quantity * newAsset.currentPrice);
        
        transaction.set(assetRef, {
          accountId: modalSelectedAccount.id,
          ticker: newAsset.ticker.trim().toUpperCase(),
          name: newAsset.name.trim(),
          sector: newAsset.sector,
          quantity: Number(newAsset.quantity),
          costBasis: Number(newAsset.costBasis),
          totalCostBasis: Number(totalCost),
          currentPrice: Number(newAsset.currentPrice),
          marketValue: Number(marketValue),
          valuationDate: new Date().toISOString(),
          recordedAt: newAsset.recordedAt || new Date().toISOString().split('T')[0],
          unrealizedGainLoss: Number(marketValue - totalCost)
        });

        // 2. Deduct from cash balance
        transaction.update(accountRef, {
          cashBalance: increment(-totalCost)
        });
      });

      toast.success("Asset added to portfolio successfully", { id: loadingToast });
      
      // Critical: Recalculate account valuation after adding new asset
      if (modalSelectedAccount) {
        await recalculateAccountValuation(modalSelectedAccount.id);
      }

      setIsAddModalOpen(false);
      setNewAsset({ 
        ...newAsset, 
        ticker: '', 
        name: '', 
        quantity: 0, 
        costBasis: 0, 
        totalCostBasis: 0,
        currentPrice: 0,
        marketValue: 0
      });
    } catch (error: any) {
      console.error("Error in handleAddAsset:", error);
      toast.error(`Failed to add asset: ${error.message || 'Unknown error'}`, { id: loadingToast });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteAsset = async (asset: Asset) => {
    if (!window.confirm(`Are you sure you want to delete ${asset.ticker}? This will remove the asset and recalculate the fund's NAV.`)) {
      return;
    }

    const loadingToast = toast.loading("Removing asset and recalculating NAV...");
    try {
      await deleteDoc(doc(db, 'portfolio', asset.id));
      
      // Recalculate NAV after deletion
      if (asset.accountId) {
        await recalculateAccountValuation(asset.accountId);
      }
      
      toast.success("Asset removed and NAV recalculated", { id: loadingToast });
    } catch (error: any) {
      console.error("Error deleting asset:", error);
      toast.error(`Failed to delete asset: ${error.message}`, { id: loadingToast });
    }
  };

  const handleUpdatePrice = async (assetId: string, newPrice: number) => {
    const asset = portfolio.find(a => a.id === assetId);
    if (!asset) return;
    try {
      await updateDoc(doc(db, 'portfolio', assetId), {
        currentPrice: newPrice,
        marketValue: asset.quantity * newPrice,
        valuationDate: new Date().toISOString()
      });
      if (asset.accountId) {
        await recalculateAccountValuation(asset.accountId);
      }
    } catch (error) {
      console.error("Error updating price", error);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-3xl font-bold text-white">Portfolio Management</h2>
            <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Live</span>
            </div>
          </div>
          <p className="text-slate-400 mt-1">Manage fund assets and security holdings</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {accounts.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2">
              <Briefcase className="w-4 h-4 text-emerald-500" />
              <select 
                value={localAccountId || ''} 
                onChange={(e) => setLocalAccountId(e.target.value)}
                className="bg-transparent text-white text-sm font-semibold outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-900">All Accounts</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id} className="bg-slate-900">
                    {acc.name} {acc.isHidden ? '(Hidden)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button 
            onClick={handleFetchPrices}
            disabled={isRefreshing}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all border border-slate-700 disabled:opacity-50"
          >
            {isRefreshing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            Sync with afx.kwayisi.org
          </button>
          <button 
            onClick={() => setIsBulkModalOpen(true)}
            className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all border border-slate-700"
          >
            <Table className="w-5 h-5" />
            Bulk Import
          </button>
          <button 
            onClick={() => setIsOptionsModalOpen(true)}
            disabled={isExportingStatement}
            className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all border border-amber-700 disabled:opacity-50 shadow-md shadow-amber-600/10"
          >
            {isExportingStatement ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            Statement Extract
          </button>
          {role === 'admin' && (
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
            >
              <Plus className="w-5 h-5" />
              Add Asset
            </button>
          )}
        </div>
      </div>

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <p className="text-slate-400 text-sm font-medium mb-1">AUM (Assets Under Management)</p>
          <h3 className="text-2xl font-bold text-white">{formatCurrency(liveValuation.aum)}</h3>
          <div className="mt-2 flex items-center gap-1 text-emerald-500 text-xs font-medium">
            <TrendingUp className="w-3 h-3" />
            <span>Real-time Market Value</span>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <p className="text-slate-400 text-sm font-medium mb-1">NAV (Net Asset Value)</p>
          <h3 className="text-2xl font-bold text-emerald-500">{formatCurrency(liveValuation.nav)}</h3>
          <p className="text-xs text-slate-500 mt-2">Price per Unit (Calculated)</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <p className="text-slate-400 text-sm font-medium mb-1">Total Money Invested</p>
          <h3 className="text-2xl font-bold text-white">{formatCurrency(totalCostBasis)}</h3>
          <p className="text-xs text-slate-500 mt-2">Historical Cost Basis</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <p className="text-slate-400 text-sm font-medium mb-1">Unrealized Gain/Loss</p>
          <div className="flex items-center gap-2">
            <h3 className={cn(
              "text-2xl font-bold",
              totalGainLoss >= 0 ? "text-emerald-500" : "text-red-500"
            )}>
              {totalGainLoss >= 0 ? '+' : ''}{formatCurrency(Math.abs(totalGainLoss))}
            </h3>
            <span className={cn(
              "text-sm font-medium px-2 py-0.5 rounded-full",
              totalGainLoss >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
            )}>
              {totalGainLossPct.toFixed(2)}%
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2">Overall Performance</p>
        </div>
      </div>

      {/* Assets Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800/50 border-b border-slate-800">
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Asset</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Sector</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Recorded On</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Quantity</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Avg Cost</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Price</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Market Value</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredPortfolio.map((asset) => {
              const gainLoss = asset.marketValue - (asset.quantity * asset.costBasis);
              const gainLossPct = (asset.quantity * asset.costBasis) > 0 
                ? (gainLoss / (asset.quantity * asset.costBasis)) * 100 
                : 0;

              return (
                <motion.tr 
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={asset.id} 
                  className="hover:bg-slate-800/30 transition-colors group"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-emerald-500 font-bold border border-slate-700">
                        {asset.ticker.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{asset.ticker}</p>
                        <p className="text-xs text-slate-500">{asset.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-semibold text-slate-400 bg-slate-800 px-2 py-1 rounded-full border border-slate-700">
                      {asset.sector || 'Unclassified'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-300 font-medium">
                      {asset.recordedAt ? new Date(asset.recordedAt).toLocaleDateString() : 'N/A'}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-300 font-medium">{asset.quantity.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">Shares</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-300 font-medium">{formatCurrency(asset.costBasis)}</p>
                    <p className="text-xs text-slate-500">Cost Basis</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-white font-bold">{formatCurrency(asset.currentPrice)}</p>
                      {role === 'admin' && (
                        <button 
                          onClick={() => handleUpdatePrice(asset.id, asset.currentPrice * (1 + (Math.random() * 0.04 - 0.02)))}
                          className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-emerald-500 transition-colors"
                          title="Simulate Price Update"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className={cn(
                      "flex items-center gap-0.5 text-[10px] font-bold",
                      gainLoss >= 0 ? "text-emerald-500" : "text-red-500"
                    )}>
                      {gainLoss >= 0 ? '+' : ''}{gainLossPct.toFixed(1)}%
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-white font-bold">{formatCurrency(asset.marketValue)}</p>
                    <p className="text-xs text-slate-500">Total Value</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {role === 'admin' && (
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleViewHistory(asset)}
                          className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-emerald-500 transition-colors"
                          title="View Valuation History"
                        >
                          <History className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => {
                            setEditingAsset(asset);
                            setNewAsset({
                              ticker: asset.ticker,
                              name: asset.name,
                              sector: asset.sector || 'Banking',
                              quantity: asset.quantity,
                              costBasis: asset.costBasis,
                              totalCostBasis: asset.totalCostBasis,
                              currentPrice: asset.currentPrice,
                              marketValue: asset.marketValue,
                              recordedAt: asset.recordedAt || new Date().toISOString().split('T')[0],
                              accountId: asset.accountId
                            });
                            setIsEditModalOpen(true);
                          }}
                          className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                        >
                          <Edit3 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteAsset(asset)}
                          className="p-2 hover:bg-red-400/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        {portfolio.length === 0 && (
          <div className="py-20 text-center">
            <Briefcase className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500">No assets in the portfolio. Add your first investment.</p>
          </div>
        )}
      </div>

      {/* Add Asset Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-white mb-6">Add Portfolio Asset</h3>
              <form onSubmit={handleAddAsset} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Investment Account</label>
                  <select 
                    required
                    value={newAsset.accountId}
                    onChange={(e) => setNewAsset({...newAsset, accountId: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.ticker})</option>
                    ))}
                  </select>
                  {modalSelectedAccount && modalSelectedAccount.cashBalance < (newAsset.totalCostBasis || (newAsset.quantity * newAsset.costBasis)) && (
                    <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex items-center gap-2 text-amber-500 text-xs font-bold">
                      <AlertCircle className="w-4 h-4" />
                      Warning: Insufficient Cash (Available: {formatCurrency(modalSelectedAccount.cashBalance)})
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Ticker Symbol</label>
                    <input 
                      required
                      type="text" 
                      value={newAsset.ticker}
                      onChange={(e) => setNewAsset({...newAsset, ticker: e.target.value.toUpperCase()})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="e.g. MTNGH"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Asset Name</label>
                    <input 
                      required
                      type="text" 
                      value={newAsset.name}
                      onChange={(e) => setNewAsset({...newAsset, name: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="e.g. MTN Ghana"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Sector</label>
                  <select 
                    required
                    value={newAsset.sector}
                    onChange={(e) => setNewAsset({...newAsset, sector: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  >
                    <option value="Banking">Banking</option>
                    <option value="Mining">Mining</option>
                    <option value="Tech">Tech</option>
                    <option value="Energy">Energy</option>
                    <option value="Consumer">Consumer</option>
                    <option value="Cash">Cash</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Quantity</label>
                  <input 
                    required
                    type="number" 
                    value={newAsset.quantity}
                    onChange={(e) => setNewAsset({...newAsset, quantity: Number(e.target.value)})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="0"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400 uppercase tracking-wider text-[10px]">Avg Per Share (GH₵)</label>
                    <input 
                      type="number" 
                      step="0.000001"
                      value={newAsset.costBasis || ''}
                      onChange={(e) => handleFinancialChange('costBasis', Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="0.0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400 uppercase tracking-wider text-[10px]">Total Cost Basis (GH₵)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={newAsset.totalCostBasis || ''}
                      onChange={(e) => handleFinancialChange('totalCostBasis', Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400 uppercase tracking-wider text-[10px]">Current Price (GH₵)</label>
                    <input 
                      type="number" 
                      step="0.000001"
                      value={newAsset.currentPrice || ''}
                      onChange={(e) => handleFinancialChange('currentPrice', Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="0.0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400 uppercase tracking-wider text-[10px]">Market Value (GH₵)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={newAsset.marketValue || ''}
                      onChange={(e) => handleFinancialChange('marketValue', Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold text-emerald-400"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400 uppercase tracking-wider text-[10px]">Unrealized Gain/Loss</label>
                    <div className={cn(
                      "w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-sm font-bold flex items-center",
                      (newAsset.marketValue - newAsset.totalCostBasis) >= 0 ? "text-emerald-500" : "text-red-500"
                    )}>
                      {formatCurrency(newAsset.marketValue - newAsset.totalCostBasis)}
                      <span className="ml-auto text-[10px] opacity-70">
                        {newAsset.totalCostBasis > 0 ? ((newAsset.marketValue - newAsset.totalCostBasis) / newAsset.totalCostBasis * 100).toFixed(2) : '0.00'}%
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400 uppercase tracking-wider text-[10px]">Acquisition Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input 
                        required
                        type="date" 
                        value={newAsset.recordedAt}
                        onChange={(e) => setNewAsset({...newAsset, recordedAt: e.target.value})}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isAdding}
                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                  >
                    {isAdding && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isAdding ? 'Adding...' : 'Add Asset'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Valuation History Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && selectedAssetForHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
                    <History className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Valuation History</h3>
                    <p className="text-sm text-slate-500">{selectedAssetForHistory.ticker} - {selectedAssetForHistory.name}</p>
                  </div>
                </div>
                <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {historyLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                    <p className="text-slate-400">Loading history...</p>
                  </div>
                ) : assetHistory.length === 0 ? (
                  <div className="py-20 text-center">
                    <History className="w-12 h-12 text-slate-800 mx-auto mb-4" />
                    <p className="text-slate-500">No recorded valuation history for this asset.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {assetHistory.map((val, idx) => (
                      <div key={val.id} className="bg-slate-800/50 border border-slate-800 p-4 rounded-xl flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                            idx === 0 ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-400"
                          )}>
                            {idx === 0 ? 'LIVE' : assetHistory.length - idx}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-white font-bold">{formatCurrency(val.price)}</p>
                              {idx < assetHistory.length - 1 && (
                                <span className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                  val.price >= assetHistory[idx+1].price ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                                )}>
                                  {val.price >= assetHistory[idx+1].price ? '+' : ''}
                                  {(((val.price - assetHistory[idx+1].price) / assetHistory[idx+1].price) * 100).toFixed(2)}%
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              {val.timestamp?.seconds ? new Date(val.timestamp.seconds * 1000).toLocaleString() : 'Just now'}
                            </p>
                            {val.notes && <p className="text-[10px] text-slate-600 italic mt-1">{val.notes}</p>}
                          </div>
                        </div>
                        {role === 'admin' && idx === 0 && (
                          <button 
                            onClick={() => handleRevertAssetValuation(val)}
                            className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition-all border border-red-500/20 flex items-center gap-2"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Reverse
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-800">
                <button 
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all"
                >
                  Close History
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Asset Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingAsset && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">Edit Asset</h3>
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleUpdateAsset} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Ticker Symbol</label>
                    <input 
                      required
                      type="text" 
                      value={newAsset.ticker}
                      onChange={(e) => setNewAsset({...newAsset, ticker: e.target.value.toUpperCase()})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Asset Name</label>
                    <input 
                      required
                      type="text" 
                      value={newAsset.name}
                      onChange={(e) => setNewAsset({...newAsset, name: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Sector</label>
                  <select 
                    required
                    value={newAsset.sector}
                    onChange={(e) => setNewAsset({...newAsset, sector: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  >
                    <option value="Banking">Banking</option>
                    <option value="Mining">Mining</option>
                    <option value="Tech">Tech</option>
                    <option value="Energy">Energy</option>
                    <option value="Consumer">Consumer</option>
                    <option value="Cash">Cash</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Quantity</label>
                  <input 
                    required
                    type="number" 
                    value={newAsset.quantity}
                    onChange={(e) => handleFinancialChange('quantity', Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400 uppercase tracking-wider text-[10px]">Avg Per Share (GH₵)</label>
                    <input 
                      type="number" 
                      step="0.000001"
                      value={newAsset.costBasis || ''}
                      onChange={(e) => handleFinancialChange('costBasis', Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400 uppercase tracking-wider text-[10px]">Total Cost Basis (GH₵)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={newAsset.totalCostBasis || ''}
                      onChange={(e) => handleFinancialChange('totalCostBasis', Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400 uppercase tracking-wider text-[10px]">Current Price (GH₵)</label>
                    <input 
                      type="number" 
                      step="0.000001"
                      value={newAsset.currentPrice || ''}
                      onChange={(e) => handleFinancialChange('currentPrice', Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400 uppercase tracking-wider text-[10px]">Market Value (GH₵)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={newAsset.marketValue || ''}
                      onChange={(e) => handleFinancialChange('marketValue', Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-bold text-emerald-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400 uppercase tracking-wider text-[10px]">Unrealized Gain/Loss</label>
                    <div className={cn(
                      "w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-sm font-bold flex items-center",
                      (newAsset.marketValue - newAsset.totalCostBasis) >= 0 ? "text-emerald-500" : "text-red-500"
                    )}>
                      {formatCurrency(newAsset.marketValue - newAsset.totalCostBasis)}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400 uppercase tracking-wider text-[10px]">Acquisition Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input 
                        required
                        type="date" 
                        value={newAsset.recordedAt}
                        onChange={(e) => setNewAsset({...newAsset, recordedAt: e.target.value})}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isUpdating}
                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                  >
                    {isUpdating && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isUpdating ? 'Updating...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Smart Bulk Import Modal */}
      <AnimatePresence>
        {isBulkModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBulkModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0.95, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-indigo-500/20 rounded-2xl flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-indigo-500" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Smart Portfolio Import</h3>
                    <p className="text-sm text-slate-500">Paste statement text, CSV, or formatted data and let Gemini parse it.</p>
                  </div>
                </div>
                <button onClick={() => setIsBulkModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleBulkImport} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Statement Content / CSV Data</label>
                  <textarea 
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                    placeholder="Paste your asset list here (e.g. Scancom PLC, 1200 units, cost 3.33, price 3.87...)"
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-5 py-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all h-64 font-mono text-sm resize-none"
                    required
                  />
                </div>

                <div className="bg-indigo-500/5 border border-indigo-500/20 p-4 rounded-xl flex gap-3 text-sm text-slate-400">
                  <AlertCircle className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                  <p>Investment costs will be deducted from <b>{activeFund?.name}</b>'s cash balance. You can reconcile negative balances from the Dashboard.</p>
                </div>

                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setIsBulkModalOpen(false)}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isProcessingBulk || !bulkInput.trim()}
                    className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                  >
                    {isProcessingBulk && <Loader2 className="w-5 h-5 animate-spin" />}
                    {isProcessingBulk ? 'AI is Processing...' : 'Import Assets'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isOptionsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOptionsModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0.95, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl z-10"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
                    <FileText className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Statement Checklist</h3>
                    <p className="text-xs text-slate-500">Select information to include on your PDF</p>
                  </div>
                </div>
                <button onClick={() => setIsOptionsModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2.5 my-5 max-h-[60vh] overflow-y-auto pr-1">
                {[
                  { key: 'showSector', label: 'Security Sector', desc: 'Category/sector of each active asset holding' },
                  { key: 'showCostBasis', label: 'Cost Basis & Average Cost', desc: 'Original purchased cost and calculated base value' },
                  { key: 'showMarketValue', label: 'Market Value', desc: 'Total value at current market trading prices' },
                  { key: 'showWeight', label: 'Portfolio Weight (%)', desc: 'Asset weight relative to the entire active portfolio' },
                  { key: 'showGainLoss', label: 'Unrealized Gain / Loss', desc: 'Net gains or losses in both currency value and % yield' },
                  { key: 'showSummary', label: 'Portfolio Financial Summary', desc: 'Consolidated balance blocks at the statement bottom' },
                  { key: 'showCashBalance', label: 'Cash & NAV Details', desc: 'Cash balances, net asset value, and per-unit metrics' },
                  { key: 'showDisclaimer', label: 'Automated System Disclaimer', desc: 'Legal footnote confirming source and accuracy checks' },
                ].map((item) => (
                  <label 
                    key={item.key}
                    className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-950/40 hover:bg-slate-950/80 border border-slate-800/60 cursor-pointer transition-all animate-none"
                  >
                    <input 
                      type="checkbox"
                      checked={(statementOptions as any)[item.key]}
                      onChange={(e) => setStatementOptions(prev => ({
                        ...prev,
                        [item.key]: e.target.checked
                      }))}
                      className="mt-1 accent-amber-500 rounded border-slate-700 bg-slate-950 text-amber-600 focus:ring-amber-500 focus:ring-offset-slate-900 focus:ring-2 w-4 h-4"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-200 block">{item.label}</span>
                      <span className="text-xs text-slate-500 leading-normal">{item.desc}</span>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsOptionsModalOpen(false)}
                  className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={handleExportPortfolioStatement}
                  className="flex-1 py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export PDF
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
