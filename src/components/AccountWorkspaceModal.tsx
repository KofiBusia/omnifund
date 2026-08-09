import React, { useState, useMemo } from 'react';
import { InvestmentAccount, Investor, Asset, Valuation, Transaction } from '../types';
import { formatCurrency, safeFormatDate, safeTimestamp } from '../lib/utils';
import { 
  X, 
  Users, 
  Briefcase, 
  TrendingUp, 
  ArrowRightLeft, 
  Settings, 
  Search, 
  Download, 
  ShieldCheck, 
  AlertCircle,
  FileText,
  Brain,
  MessageSquare,
  DollarSign,
  Plus,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';

interface AccountWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: InvestmentAccount;
  investors: Investor[];
  portfolio: Asset[];
  valuations: Valuation[];
  transactions: Transaction[];
  onUpdateAccount: (updatedAccount: InvestmentAccount) => Promise<void>;
  onOpenStatement?: (account: InvestmentAccount) => void;
  onOpenHistory?: (account: InvestmentAccount) => void;
  onOpenAI?: (account: InvestmentAccount) => void;
}

export default function AccountWorkspaceModal({
  isOpen,
  onClose,
  account,
  investors,
  portfolio,
  valuations,
  transactions,
  onUpdateAccount,
  onOpenStatement,
  onOpenHistory,
  onOpenAI
}: AccountWorkspaceModalProps) {
  const [activeTab, setActiveTab] = useState<'investors' | 'portfolio' | 'valuations' | 'transactions' | 'settings'>('investors');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: account.name,
    ticker: account.ticker,
    description: account.description || '',
    aum: account.aum,
    nav: account.nav,
    totalUnits: account.totalUnits,
    cashBalance: account.cashBalance
  });

  // Strict account isolation: filter entities belonging exclusively to this account
  const accountInvestors = useMemo(() => {
    return investors.filter(i => i.accountId === account.id);
  }, [investors, account.id]);

  const filteredAccountInvestors = useMemo(() => {
    if (!searchTerm) return accountInvestors;
    const term = searchTerm.toLowerCase();
    return accountInvestors.filter(i => 
      i.name.toLowerCase().includes(term) ||
      (i.email && i.email.toLowerCase().includes(term)) ||
      (i.investorId && i.investorId.toLowerCase().includes(term))
    );
  }, [accountInvestors, searchTerm]);

  const accountPortfolio = useMemo(() => {
    return portfolio.filter(p => p.accountId === account.id);
  }, [portfolio, account.id]);

  const accountValuations = useMemo(() => {
    return valuations
      .filter(v => v.accountId === account.id)
      .sort((a, b) => safeTimestamp(b.date) - safeTimestamp(a.date));
  }, [valuations, account.id]);

  const accountTransactions = useMemo(() => {
    return transactions
      .filter(t => t.accountId === account.id)
      .sort((a, b) => safeTimestamp(b.timestamp) - safeTimestamp(a.timestamp));
  }, [transactions, account.id]);

  // Aggregate stats strictly for this account
  const accountStats = useMemo(() => {
    const totalInvestorUnits = accountInvestors.reduce((sum, i) => sum + (i.unitsOwned || 0), 0);
    const totalInvestorInvestment = accountInvestors.reduce((sum, i) => sum + (i.totalInvestment || 0), 0);
    const totalInvestorCurrentValue = totalInvestorUnits * account.nav;
    const portfolioMarketValue = accountPortfolio.reduce((sum, p) => sum + (p.marketValue || 0), 0);

    return {
      totalInvestorUnits,
      totalInvestorInvestment,
      totalInvestorCurrentValue,
      portfolioMarketValue,
      investorCount: accountInvestors.length,
      assetCount: accountPortfolio.length
    };
  }, [accountInvestors, accountPortfolio, account.nav]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onUpdateAccount({
        ...account,
        ...editForm
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportAccountInvestors = () => {
    const exportData = filteredAccountInvestors.map(i => ({
      'Investor ID': i.investorId || 'N/A',
      'Account Name': account.name,
      'Account Ticker': account.ticker,
      'Investor Name': i.name,
      'Email': i.email || 'N/A',
      'Phone': i.phone || 'N/A',
      'Units Owned in Account': i.unitsOwned,
      'Total Investment (GHS)': i.totalInvestment,
      'Current Value (GHS)': (i.unitsOwned * account.nav).toFixed(2),
      'Account Pool Share (%)': account.totalUnits > 0 ? ((i.unitsOwned / account.totalUnits) * 100).toFixed(2) + '%' : '0%',
      'KYC Status': i.kycStatus || 'pending'
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${account.ticker}_Investors_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/85 backdrop-blur-md"
      />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-6xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10"
      >
        {/* Top Account Header */}
        <div className="p-6 sm:p-8 bg-slate-950/80 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 border border-emerald-500/20 shrink-0">
              <Briefcase className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl sm:text-3xl font-bold text-white">{account.name}</h2>
                <span className="bg-emerald-500/10 text-emerald-400 font-mono text-xs font-bold px-3 py-1 rounded-full border border-emerald-500/20 uppercase">
                  {account.ticker}
                </span>
              </div>
              <p className="text-slate-400 text-sm mt-1 line-clamp-1">
                {account.description || "Independent Investment Account Workspace"}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {onOpenStatement && (
              <button 
                onClick={() => onOpenStatement(account)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-2 transition-all"
              >
                <FileText className="w-4 h-4 text-blue-400" />
                Statement
              </button>
            )}
            {onOpenAI && (
              <button 
                onClick={() => onOpenAI(account)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-2 transition-all"
              >
                <Brain className="w-4 h-4 text-purple-400" />
                AI Audit
              </button>
            )}
            <button 
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Independent Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-6 bg-slate-900 border-b border-slate-800">
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">AUM</span>
            <span className="text-base font-bold text-white block">{formatCurrency(account.aum)}</span>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">NAV / Unit</span>
            <span className="text-base font-bold text-emerald-400 block">{formatCurrency(account.nav)}</span>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Total Units</span>
            <span className="text-base font-bold text-white block">{account.totalUnits.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Cash Balance</span>
            <span className="text-base font-bold text-amber-400 block">{formatCurrency(account.cashBalance)}</span>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Account Investors</span>
            <span className="text-base font-bold text-blue-400 block">{accountStats.investorCount}</span>
          </div>

          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Portfolio Assets</span>
            <span className="text-base font-bold text-purple-400 block">{accountStats.assetCount}</span>
          </div>
        </div>

        {/* Workspace Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-slate-800 overflow-x-auto bg-slate-950/40">
          <button
            onClick={() => setActiveTab('investors')}
            className={`px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'investors' 
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            Investors in Account ({accountStats.investorCount})
          </button>

          <button
            onClick={() => setActiveTab('portfolio')}
            className={`px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'portfolio' 
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Portfolio Assets ({accountStats.assetCount})
          </button>

          <button
            onClick={() => setActiveTab('valuations')}
            className={`px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'valuations' 
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Valuations ({accountValuations.length})
          </button>

          <button
            onClick={() => setActiveTab('transactions')}
            className={`px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'transactions' 
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            Transactions ({accountTransactions.length})
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'settings' 
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' 
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            Account Parameters
          </button>
        </div>

        {/* Tab Contents Area */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-900/50">
          {/* TAB 1: INVESTORS IN THIS ACCOUNT */}
          {activeTab === 'investors' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="text"
                    placeholder="Search account investors..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    onClick={handleExportAccountInvestors}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-2 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Export Investors CSV
                  </button>
                </div>
              </div>

              {filteredAccountInvestors.length === 0 ? (
                <div className="text-center py-16 bg-slate-950/40 rounded-2xl border border-slate-800/80">
                  <Users className="w-12 h-12 text-slate-600 mx-auto mb-3 opacity-50" />
                  <h3 className="text-lg font-bold text-white mb-1">No Investors in {account.name}</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    This account is currently independent with no assigned investors. You can onboard investors specifically into this account from the Investor Registry.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3.5 px-4">Investor ID</th>
                        <th className="py-3.5 px-4">Investor Name</th>
                        <th className="py-3.5 px-4 text-right">Units in Account</th>
                        <th className="py-3.5 px-4 text-right">Cost Basis (GHS)</th>
                        <th className="py-3.5 px-4 text-right">Current Value (GHS)</th>
                        <th className="py-3.5 px-4 text-right">Pool Share</th>
                        <th className="py-3.5 px-4 text-center">KYC Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredAccountInvestors.map((i) => {
                        const mktVal = (i.unitsOwned || 0) * account.nav;
                        const poolSharePct = account.totalUnits > 0 ? ((i.unitsOwned || 0) / account.totalUnits) * 100 : 0;

                        return (
                          <tr key={i.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 font-mono text-emerald-400 font-semibold">{i.investorId || 'INV-000'}</td>
                            <td className="py-3 px-4 font-semibold text-white">
                              <div>{i.name}</div>
                              {i.email && <div className="text-[10px] text-slate-500">{i.email}</div>}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-200">
                              {(i.unitsOwned || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-300">
                              {formatCurrency(i.totalInvestment || 0)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                              {formatCurrency(mktVal)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-400">
                              {poolSharePct.toFixed(2)}%
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                i.kycStatus === 'verified' 
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              }`}>
                                {i.kycStatus || 'pending'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PORTFOLIO ASSETS IN THIS ACCOUNT */}
          {activeTab === 'portfolio' && (
            <div className="space-y-6">
              {accountPortfolio.length === 0 ? (
                <div className="text-center py-16 bg-slate-950/40 rounded-2xl border border-slate-800/80">
                  <Briefcase className="w-12 h-12 text-slate-600 mx-auto mb-3 opacity-50" />
                  <h3 className="text-lg font-bold text-white mb-1">No Assets Allocated to {account.name}</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    This account currently holds 100% cash balance ({formatCurrency(account.cashBalance)}). You can record asset acquisitions for this account in the Portfolio module.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3.5 px-4">Ticker</th>
                        <th className="py-3.5 px-4">Asset Name</th>
                        <th className="py-3.5 px-4 text-right">Quantity</th>
                        <th className="py-3.5 px-4 text-right">Avg Cost</th>
                        <th className="py-3.5 px-4 text-right">Current Price</th>
                        <th className="py-3.5 px-4 text-right">Market Value</th>
                        <th className="py-3.5 px-4 text-right">Gain / Loss</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {accountPortfolio.map((p) => {
                        const totalCost = (p.totalCostBasis || (p.quantity * p.costBasis)) || 0;
                        const gainLoss = p.marketValue - totalCost;
                        const isGain = gainLoss >= 0;

                        return (
                          <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-emerald-400">{p.ticker}</td>
                            <td className="py-3 px-4 font-semibold text-white">{p.name}</td>
                            <td className="py-3 px-4 text-right font-mono text-slate-200">{p.quantity.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right font-mono text-slate-300">{formatCurrency(p.costBasis)}</td>
                            <td className="py-3 px-4 text-right font-mono text-slate-200">{formatCurrency(p.currentPrice)}</td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-white">{formatCurrency(p.marketValue)}</td>
                            <td className={`py-3 px-4 text-right font-mono font-bold ${isGain ? 'text-emerald-400' : 'text-red-400'}`}>
                              {isGain ? '+' : ''}{formatCurrency(gainLoss)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: VALUATIONS HISTORY FOR THIS ACCOUNT */}
          {activeTab === 'valuations' && (
            <div className="space-y-6">
              {accountValuations.length === 0 ? (
                <div className="text-center py-16 bg-slate-950/40 rounded-2xl border border-slate-800/80">
                  <TrendingUp className="w-12 h-12 text-slate-600 mx-auto mb-3 opacity-50" />
                  <h3 className="text-lg font-bold text-white mb-1">No Valuation Snapshots Recorded</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Valuations are updated dynamically whenever market assets refresh or deposits are recorded.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3.5 px-4">Valuation Date</th>
                        <th className="py-3.5 px-4 text-right">NAV per Unit</th>
                        <th className="py-3.5 px-4 text-right">Account AUM</th>
                        <th className="py-3.5 px-4">Audit Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {accountValuations.map((v) => (
                        <tr key={v.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-200">
                            {safeFormatDate(v.date, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                            {formatCurrency(v.nav)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-white">
                            {formatCurrency(v.aum)}
                          </td>
                          <td className="py-3 px-4 text-slate-400 text-xs italic">
                            {v.notes || 'Automated valuation refresh'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: TRANSACTIONS LOG FOR THIS ACCOUNT */}
          {activeTab === 'transactions' && (
            <div className="space-y-6">
              {accountTransactions.length === 0 ? (
                <div className="text-center py-16 bg-slate-950/40 rounded-2xl border border-slate-800/80">
                  <ArrowRightLeft className="w-12 h-12 text-slate-600 mx-auto mb-3 opacity-50" />
                  <h3 className="text-lg font-bold text-white mb-1">No Transactions Recorded in {account.name}</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    All subscriptions and redemptions for this account will be logged here chronologically.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3.5 px-4">Date</th>
                        <th className="py-3.5 px-4">Type</th>
                        <th className="py-3.5 px-4">Investor</th>
                        <th className="py-3.5 px-4 text-right">Units</th>
                        <th className="py-3.5 px-4 text-right">Price/Unit</th>
                        <th className="py-3.5 px-4 text-right">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {accountTransactions.map((t) => {
                        const inv = investors.find(i => i.id === t.investorId);

                        return (
                          <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 font-mono text-slate-400">
                              {safeFormatDate(t.timestamp, { year: 'numeric', month: 'short', day: 'numeric' })}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                t.type === 'BUY' 
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                  : 'bg-red-500/10 text-red-400 border-red-500/20'
                              }`}>
                                {t.type}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-semibold text-white">
                              {inv ? inv.name : 'System Deposit'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-slate-200">
                              {t.units.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-300">
                              {formatCurrency(t.pricePerUnit)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                              {formatCurrency(t.totalAmount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ACCOUNT PARAMETERS / EDIT SETTINGS */}
          {activeTab === 'settings' && (
            <form onSubmit={handleSaveSettings} className="space-y-6 max-w-2xl mx-auto bg-slate-950/60 p-6 sm:p-8 rounded-3xl border border-slate-800">
              <h3 className="text-xl font-bold text-white mb-2">Account Parameters & Configuration</h3>
              <p className="text-xs text-slate-400 mb-6">
                Update account metadata, ticker, NAV valuation, AUM, and total unit counts independently for this account.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400">Account Name</label>
                  <input 
                    required
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400">Ticker Symbol</label>
                  <input 
                    required
                    type="text"
                    value={editForm.ticker}
                    onChange={(e) => setEditForm({ ...editForm, ticker: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400">Description</label>
                <textarea 
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none h-20 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400">NAV per Unit (GHS)</label>
                  <input 
                    required
                    type="number"
                    step="0.0001"
                    value={editForm.nav}
                    onChange={(e) => setEditForm({ ...editForm, nav: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400">AUM (GHS)</label>
                  <input 
                    required
                    type="number"
                    value={editForm.aum}
                    onChange={(e) => setEditForm({ ...editForm, aum: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400">Total Account Units</label>
                  <input 
                    required
                    type="number"
                    value={editForm.totalUnits}
                    onChange={(e) => setEditForm({ ...editForm, totalUnits: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400">Cash Reserve Balance (GHS)</label>
                  <input 
                    required
                    type="number"
                    value={editForm.cashBalance}
                    onChange={(e) => setEditForm({ ...editForm, cashBalance: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="py-3 px-8 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 text-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isSaving ? 'Saving Changes...' : 'Save Parameters'}
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
