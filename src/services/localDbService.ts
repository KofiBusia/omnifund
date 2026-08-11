/**
 * OmniFund Pro — High-Availability Local Database & Quota Resilience Layer
 * Provides zero-downtime offline & quota-exceeded fallback storage using LocalStorage & Event Emitters.
 */

import { Asset, InvestmentAccount, Investor, Transaction, Valuation } from '../types';

const STORAGE_KEYS = {
  ACCOUNTS: 'omnifund_accounts_cache',
  INVESTORS: 'omnifund_investors_cache',
  PORTFOLIO: 'omnifund_portfolio_cache',
  TRANSACTIONS: 'omnifund_transactions_cache',
  VALUATIONS: 'omnifund_valuations_cache',
  PENDING_WRITES: 'omnifund_pending_writes'
};

type CollectionName = 'accounts' | 'investors' | 'portfolio' | 'transactions' | 'valuations';

// Event bus for notifying UI components when local data changes under quota fallback
type DataChangeListener = (collection: CollectionName, data: any[]) => void;
const listeners: Set<DataChangeListener> = new Set();

export function subscribeToLocalDb(listener: DataChangeListener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notifyListeners(collectionName: CollectionName, data: any[]) {
  listeners.forEach(fn => {
    try { fn(collectionName, data); } catch (e) { console.error('LocalDB listener error:', e); }
  });
}

// ── Local Storage Readers ──────────────────────────────────────────────────
export function getLocalCollection<T>(name: CollectionName): T[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[name.toUpperCase() as keyof typeof STORAGE_KEYS]);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error(`Error reading local collection ${name}:`, e);
    return [];
  }
}

export function setLocalCollection<T>(name: CollectionName, items: T[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS[name.toUpperCase() as keyof typeof STORAGE_KEYS], JSON.stringify(items));
    notifyListeners(name, items);
  } catch (e) {
    console.error(`Error saving local collection ${name}:`, e);
  }
}

// ── Local Mutation Engine for Quota Fallback ──────────────────────────────────
export function saveLocalAsset(assetData: Partial<Asset> & { accountId: string }): Asset {
  const portfolio = getLocalCollection<Asset>('portfolio');
  const id = assetData.id || `LOC-AST-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const existingIdx = portfolio.findIndex(a => a.id === id);
  const costBasis = Number(assetData.costBasis || 0);
  const quantity = Number(assetData.quantity || 0);
  const currentPrice = Number(assetData.currentPrice || assetData.tradePrice || costBasis);
  const marketValue = Number(assetData.marketValue || (quantity * currentPrice));
  const totalCostBasis = Number(assetData.totalCostBasis || (quantity * costBasis));

  const newAsset: Asset = {
    id,
    accountId: assetData.accountId,
    ticker: (assetData.ticker || 'ASSET').toUpperCase(),
    name: assetData.name || 'Local Asset',
    sector: assetData.sector || 'Equities',
    quantity,
    costBasis,
    totalCostBasis,
    currentPrice,
    marketValue,
    unrealizedGainLoss: marketValue - totalCostBasis,
    valuationDate: assetData.valuationDate || new Date().toISOString(),
    recordedAt: assetData.recordedAt || new Date().toISOString().split('T')[0],
    brokerName: assetData.brokerName || '',
    csdNumber: assetData.csdNumber || '',
    clientAccountNo: assetData.clientAccountNo || '',
    contractNoteRef: assetData.contractNoteRef || ''
  };

  let updated: Asset[];
  if (existingIdx >= 0) {
    updated = [...portfolio];
    updated[existingIdx] = { ...updated[existingIdx], ...newAsset };
  } else {
    updated = [newAsset, ...portfolio];
  }

  setLocalCollection('portfolio', updated);

  // Also update Account cash balance locally if adding/editing
  if (totalCostBasis > 0 && !assetData.id) {
    const accounts = getLocalCollection<InvestmentAccount>('accounts');
    const accIdx = accounts.findIndex(a => a.id === assetData.accountId);
    if (accIdx >= 0) {
      accounts[accIdx] = {
        ...accounts[accIdx],
        cashBalance: (accounts[accIdx].cashBalance || 0) - totalCostBasis
      };
      setLocalCollection('accounts', accounts);
    }
  }

  return newAsset;
}

export function updateLocalAssetPrice(assetId: string, newPrice: number): void {
  const portfolio = getLocalCollection<Asset>('portfolio');
  const idx = portfolio.findIndex(a => a.id === assetId);
  if (idx >= 0) {
    const asset = portfolio[idx];
    const newMarketVal = asset.quantity * newPrice;
    portfolio[idx] = {
      ...asset,
      currentPrice: newPrice,
      marketValue: newMarketVal,
      unrealizedGainLoss: newMarketVal - asset.totalCostBasis,
      valuationDate: new Date().toISOString()
    };
    setLocalCollection('portfolio', portfolio);
  }
}

export function deleteLocalAsset(assetId: string): void {
  const portfolio = getLocalCollection<Asset>('portfolio');
  const updated = portfolio.filter(a => a.id !== assetId);
  setLocalCollection('portfolio', updated);
}

// ── Check if Error is Firebase Quota Exceeded ──────────────────────────────
export function isQuotaExceededError(err: any): boolean {
  const str = String(err?.message || err?.error || err || '').toLowerCase();
  return str.includes('quota') || str.includes('resource_exhausted') || str.includes('free daily write units');
}

/**
 * Executes a Firestore write operation safely.
 * If Firestore returns "Quota limit exceeded", executes the local fallback silently,
 * notifies the UI, and returns true without throwing an exception.
 */
export async function executeSafeWrite<T>(
  firestoreFn: () => Promise<T>,
  localFallbackFn: () => T
): Promise<{ result: T; isQuotaFallback: boolean }> {
  try {
    const result = await firestoreFn();
    return { result, isQuotaFallback: false };
  } catch (err: any) {
    if (isQuotaExceededError(err)) {
      console.warn('⚡ Firestore Quota Exceeded — Executing Local Storage Fallback Strategy');
      const fallbackResult = localFallbackFn();
      return { result: fallbackResult, isQuotaFallback: true };
    }
    throw err;
  }
}
