import React, { useState } from 'react';
import { Asset, InvestmentAccount } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { 
  Plus, 
  Search, 
  Briefcase, 
  TrendingUp, 
  DollarSign, 
  Trash2, 
  Edit3,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { addDoc, collection, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { runGlobalValuation } from '../services/valuationService';

interface PortfolioManagementProps {
  portfolio: Asset[];
  fund: InvestmentAccount | null;
  accounts: InvestmentAccount[];
}

export default function PortfolioManagement({ portfolio, fund, accounts }: PortfolioManagementProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [localAccountId, setLocalAccountId] = useState<string | null>(fund?.id || (accounts.length > 0 ? accounts[0].id : null));
  
  const filteredPortfolio = localAccountId 
    ? portfolio.filter(p => p.accountId === localAccountId)
    : portfolio;

  const activeFund = accounts.find(a => a.id === localAccountId) || fund;

  const [newAsset, setNewAsset] = useState({ 
    ticker: '', 
    name: '', 
    quantity: 0, 
    costBasis: 0, 
    currentPrice: 0,
    accountId: localAccountId || ''
  });

  // Update newAsset accountId when localAccountId changes
  React.useEffect(() => {
    setNewAsset(prev => ({ ...prev, accountId: localAccountId || '' }));
  }, [localAccountId]);

  const totalMarketValue = filteredPortfolio.reduce((sum, asset) => sum + asset.marketValue, 0);
  const totalCostBasis = filteredPortfolio.reduce((sum, asset) => sum + (asset.quantity * asset.costBasis), 0);
  const totalGainLoss = totalMarketValue - totalCostBasis;
  const totalGainLossPct = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis * 100) : 0;

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

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'portfolio'), {
        ...newAsset,
        marketValue: newAsset.quantity * newAsset.currentPrice
      });
      setIsAddModalOpen(false);
      setNewAsset({ ...newAsset, ticker: '', name: '', quantity: 0, costBasis: 0, currentPrice: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'portfolio');
    }
  };

  const handleUpdatePrice = async (assetId: string, newPrice: number) => {
    const asset = portfolio.find(a => a.id === assetId);
    if (!asset) return;
    try {
      await updateDoc(doc(db, 'portfolio', assetId), {
        currentPrice: newPrice,
        marketValue: asset.quantity * newPrice
      });
    } catch (error) {
      console.error("Error updating price", error);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white">Portfolio Management</h2>
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
                  <option key={acc.id} value={acc.id} className="bg-slate-900">{acc.name}</option>
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
            onClick={() => setIsAddModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-5 h-5" />
            Add Asset
          </button>
        </div>
      </div>

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <p className="text-slate-400 text-sm font-medium mb-1">AUM (Assets Under Management)</p>
          <h3 className="text-2xl font-bold text-white">{formatCurrency(activeFund?.aum || totalMarketValue)}</h3>
          <div className="mt-2 flex items-center gap-1 text-emerald-500 text-xs font-medium">
            <TrendingUp className="w-3 h-3" />
            <span>Fund Market Value</span>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <p className="text-slate-400 text-sm font-medium mb-1">NAV (Net Asset Value)</p>
          <h3 className="text-2xl font-bold text-emerald-500">{formatCurrency(activeFund?.nav || 1.0000)}</h3>
          <p className="text-xs text-slate-500 mt-2">Price per Unit</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <p className="text-slate-400 text-sm font-medium mb-1">Total Cost Basis</p>
          <h3 className="text-2xl font-bold text-white">{formatCurrency(totalCostBasis)}</h3>
          <p className="text-xs text-slate-500 mt-2">Invested Capital</p>
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
                      <button 
                        onClick={() => handleUpdatePrice(asset.id, asset.currentPrice * (1 + (Math.random() * 0.04 - 0.02)))}
                        className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-emerald-500 transition-colors"
                        title="Simulate Price Update"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
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
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
                        <Edit3 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => deleteDoc(doc(db, 'portfolio', asset.id))}
                        className="p-2 hover:bg-red-400/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
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
                    <label className="text-sm font-medium text-slate-400">Avg Cost Basis (GH₵)</label>
                    <input 
                      required
                      type="number" 
                      step="0.01"
                      value={newAsset.costBasis}
                      onChange={(e) => setNewAsset({...newAsset, costBasis: Number(e.target.value)})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Current Price (GH₵)</label>
                    <input 
                      required
                      type="number" 
                      step="0.01"
                      value={newAsset.currentPrice}
                      onChange={(e) => setNewAsset({...newAsset, currentPrice: Number(e.target.value)})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="0.00"
                    />
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
                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-600/20"
                  >
                    Add Asset
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
