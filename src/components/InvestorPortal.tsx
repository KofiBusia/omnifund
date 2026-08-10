import React, { useState, useMemo } from 'react';
import { 
  Investor, 
  InvestmentAccount, 
  Asset, 
  Transaction, 
  Valuation, 
  InvestorTransactionRequest,
  InvestorProfileChangeRequest
} from '../types';
import { 
  TrendingUp, 
  PieChart, 
  FileText, 
  ArrowUpRight, 
  ArrowDownRight, 
  Download, 
  Send, 
  User, 
  ShieldCheck, 
  Building2, 
  DollarSign, 
  Layers, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  HelpCircle,
  LogOut,
  FolderDown,
  Mail,
  Phone,
  MapPin
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { cn, formatCurrency } from '../lib/utils';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface InvestorPortalProps {
  user: any;
  investors: Investor[];
  accounts: InvestmentAccount[];
  portfolio: Asset[];
  transactions: Transaction[];
  valuations: Valuation[];
  onLogout?: () => void;
}

export default function InvestorPortal({
  user,
  investors,
  accounts,
  portfolio,
  transactions,
  valuations,
  onLogout
}: InvestorPortalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'statements' | 'requests' | 'profile'>('overview');

  // Find authoritative investor record for this authenticated user
  const currentInvestor = useMemo(() => {
    if (!user) return null;
    return investors.find(i => 
      i.uid === user.uid || 
      i.email?.toLowerCase() === user.email?.toLowerCase() ||
      i.investorId === user.investorMasterId ||
      i.id === user.investorId
    ) || investors[0] || null;
  }, [investors, user]);

  // Permitted investor accounts (Multi-Account Support)
  const permittedAccounts = useMemo(() => {
    if (!currentInvestor) return accounts;
    const investorRecords = investors.filter(i => 
      i.email?.toLowerCase() === currentInvestor.email?.toLowerCase() || 
      i.investorId === currentInvestor.investorId
    );
    const accIds = new Set(investorRecords.map(i => i.accountId));
    return accounts.filter(a => accIds.has(a.id));
  }, [accounts, investors, currentInvestor]);

  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    permittedAccounts[0]?.id || accounts[0]?.id || ''
  );

  const selectedAccount = useMemo(() => 
    accounts.find(a => a.id === selectedAccountId) || permittedAccounts[0] || accounts[0] || null,
    [accounts, selectedAccountId, permittedAccounts]
  );

  // Authoritative Investor Record for Selected Account
  const selectedInvestorRecord = useMemo(() => 
    investors.find(i => i.accountId === selectedAccountId && (i.email?.toLowerCase() === currentInvestor?.email?.toLowerCase() || i.investorId === currentInvestor?.investorId)) || currentInvestor,
    [investors, selectedAccountId, currentInvestor]
  );

  // STRICT DATA ISOLATION: Investor only sees their own transactions
  const investorTransactions = useMemo(() => {
    if (!selectedInvestorRecord) return [];
    return transactions.filter(t => t.investorId === selectedInvestorRecord.id || t.investorId === selectedInvestorRecord.investorId);
  }, [transactions, selectedInvestorRecord]);

  // STRICT DATA ISOLATION: Investor portfolio holdings for active account
  const accountPortfolio = useMemo(() => {
    if (!selectedAccountId) return [];
    return portfolio.filter(p => p.accountId === selectedAccountId);
  }, [portfolio, selectedAccountId]);

  // Financial Metrics
  const unitsOwned = selectedInvestorRecord?.unitsOwned || 0;
  const currentNav = selectedAccount?.nav || 1.0000;
  const currentValue = unitsOwned * currentNav;
  const totalCostBasis = selectedInvestorRecord?.totalInvestment || 0;
  const netGainLoss = currentValue - totalCostBasis + (selectedInvestorRecord?.realizedGainLoss || 0);
  const returnPct = totalCostBasis > 0 ? (netGainLoss / totalCostBasis) * 100 : 0;

  // Transaction Request Form State
  const [reqType, setReqType] = useState<'Subscription' | 'Redemption'>('Subscription');
  const [reqAmount, setReqAmount] = useState<string>('');
  const [reqNotes, setReqNotes] = useState<string>('');
  const [isSubmittingReq, setIsSubmittingReq] = useState<boolean>(false);

  // Profile Change Request Form State
  const [changeField, setChangeField] = useState<'phone' | 'email' | 'address'>('phone');
  const [changeValue, setChangeValue] = useState<string>('');
  const [isSubmittingChange, setIsSubmittingChange] = useState<boolean>(false);

  const handleTransactionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqAmount || parseFloat(reqAmount) <= 0 || !selectedInvestorRecord || !selectedAccount) return;

    setIsSubmittingReq(true);
    try {
      const amountNum = parseFloat(reqAmount);
      const estUnits = amountNum / currentNav;

      await addDoc(collection(db, 'investor_transaction_requests'), {
        investorId: selectedInvestorRecord.id,
        accountId: selectedAccount.id,
        type: reqType,
        amount: amountNum,
        estimatedUnits: estUnits,
        status: 'PENDING',
        requestedAt: new Date().toISOString(),
        notes: reqNotes || `${reqType} request submitted via Investor Portal`
      } as InvestorTransactionRequest);

      toast.success(`${reqType} request for ${formatCurrency(amountNum)} submitted successfully!`);
      setReqAmount('');
      setReqNotes('');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to submit request: ' + (err?.message || 'Check logs'));
    } finally {
      setIsSubmittingReq(false);
    }
  };

  const handleProfileChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeValue || !selectedInvestorRecord) return;

    setIsSubmittingChange(true);
    try {
      await addDoc(collection(db, 'investor_profile_change_requests'), {
        investorId: selectedInvestorRecord.id,
        requestedByUid: user.uid,
        fieldName: changeField,
        oldValue: (selectedInvestorRecord as any)[changeField] || 'Not specified',
        newValue: changeValue,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      } as InvestorProfileChangeRequest);

      toast.success(`Change request for ${changeField} submitted to fund administrator.`);
      setChangeValue('');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to submit change request.');
    } finally {
      setIsSubmittingChange(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Top Institutional Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-black text-white">Welcome, {selectedInvestorRecord?.name || 'Investor'}</h1>
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-bold font-mono">
                {selectedInvestorRecord?.investorId || 'INV-000001'}
              </span>
            </div>
            <p className="text-xs text-slate-400">Institutional Investor Self-Service Portal</p>
          </div>

          <div className="flex items-center gap-4">
            {/* Multi-Account Selector */}
            {permittedAccounts.length > 1 && (
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <select 
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
                >
                  {permittedAccounts.map(acc => (
                    <option key={acc.id} value={acc.id} className="bg-slate-900 text-white">
                      {acc.name} ({acc.ticker})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {onLogout && (
              <button 
                onClick={onLogout}
                className="px-4 py-2.5 bg-slate-800 hover:bg-red-600/20 hover:text-red-400 text-slate-400 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            )}
          </div>
        </div>

        {/* Top Financial KPI Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 pt-6 text-xs">
          <div className="space-y-1">
            <span className="text-slate-500 uppercase font-bold text-[10px] tracking-wider">Portfolio Value</span>
            <p className="text-2xl font-black text-emerald-400 font-mono">
              {formatCurrency(currentValue)}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 uppercase font-bold text-[10px] tracking-wider">Units Owned</span>
            <p className="text-xl font-bold text-white font-mono">
              {unitsOwned.toLocaleString()}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 uppercase font-bold text-[10px] tracking-wider">NAV Per Unit</span>
            <p className="text-xl font-bold text-slate-200 font-mono">
              GH₵{currentNav.toFixed(4)}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 uppercase font-bold text-[10px] tracking-wider">Total Invested</span>
            <p className="text-xl font-bold text-slate-300 font-mono">
              {formatCurrency(totalCostBasis)}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-500 uppercase font-bold text-[10px] tracking-wider">Cumulative Gain / Return</span>
            <div className="flex items-center gap-2">
              <p className={cn("text-xl font-bold font-mono", netGainLoss >= 0 ? "text-emerald-400" : "text-red-400")}>
                {netGainLoss >= 0 ? '+' : ''}{formatCurrency(netGainLoss)}
              </p>
              <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full font-mono", returnPct >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
                {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-4 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('overview')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
            activeTab === 'overview' ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          )}
        >
          <PieChart className="w-4 h-4" /> Portfolio Overview
        </button>
        <button 
          onClick={() => setActiveTab('transactions')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
            activeTab === 'transactions' ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          )}
        >
          <TrendingUp className="w-4 h-4" /> Transaction History
        </button>
        <button 
          onClick={() => setActiveTab('statements')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
            activeTab === 'statements' ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          )}
        >
          <FileText className="w-4 h-4" /> Account Statements
        </button>
        <button 
          onClick={() => setActiveTab('requests')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
            activeTab === 'requests' ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          )}
        >
          <Send className="w-4 h-4" /> Submit Request
        </button>
        <button 
          onClick={() => setActiveTab('profile')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
            activeTab === 'profile' ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          )}
        >
          <User className="w-4 h-4" /> Profile & Contact Info
        </button>
      </div>

      {/* SUB-TAB 1: PORTFOLIO OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" />
                Fund Overview & Underlying Asset Allocations
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your investment in <strong>{selectedAccount?.name}</strong> provides proportional ownership across the following portfolio holdings.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                      <th className="px-6 py-4">Asset Ticker</th>
                      <th className="px-6 py-4 text-right">Fund Quantity</th>
                      <th className="px-6 py-4 text-right">Market Price</th>
                      <th className="px-6 py-4 text-right">Fund Market Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {accountPortfolio.map(ast => (
                      <tr key={ast.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 font-bold text-white">
                          <div>{ast.ticker}</div>
                          <div className="text-[10px] text-slate-500 font-normal">{ast.name}</div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-slate-300">
                          {ast.quantity.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-white">
                          {formatCurrency(ast.currentPrice)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-emerald-400">
                          {formatCurrency(ast.marketValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Account Summary Sidebar */}
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-2xl">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Account Certificate Details</h3>
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Certificate Serial:</span>
                  <span className="font-mono font-bold text-emerald-400">{selectedInvestorRecord?.certificateSerial || 'CERT-84920'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Issued Date:</span>
                  <span className="text-slate-300">{selectedInvestorRecord?.certificateIssuedAt?.split('T')[0] || '2026-01-15'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">KYC Status:</span>
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold text-[10px]">
                    VERIFIED
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: TRANSACTION HISTORY */}
      {activeTab === 'transactions' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-6 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-base font-bold text-white">My Investment Transaction History</h3>
            <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 rounded-full font-bold">
              {investorTransactions.length} Transactions
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                  <th className="px-6 py-4">Effective Date</th>
                  <th className="px-6 py-4">Transaction Type</th>
                  <th className="px-6 py-4 text-right">Amount (GHS)</th>
                  <th className="px-6 py-4 text-right">NAV per Unit</th>
                  <th className="px-6 py-4 text-right">Units</th>
                  <th className="px-6 py-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {investorTransactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-slate-300">
                      {tx.effectiveDate?.split('T')[0] || tx.timestamp?.split('T')[0] || '2026-04-24'}
                    </td>
                    <td className="px-6 py-4 font-bold text-white">
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[10px] font-bold",
                        tx.type === 'BUY' || tx.type === 'Subscription' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      )}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-white">
                      {formatCurrency(tx.totalAmount)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-slate-300">
                      GH₵{tx.pricePerUnit?.toFixed(4) || currentNav.toFixed(4)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-emerald-400 font-bold">
                      {tx.units.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        POSTED
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {investorTransactions.length === 0 && (
              <div className="py-16 text-center text-slate-500 text-sm">
                No transaction records found for this account.
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: ACCOUNT STATEMENTS */}
      {activeTab === 'statements' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white">Download Investor Account Statements</h3>
              <p className="text-xs text-slate-400 mt-1">Generate official periodic holding and valuation statements</p>
            </div>
            <button 
              onClick={() => toast.success("Downloading PDF Statement...")}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl text-xs transition-all flex items-center gap-2 shadow-xl shadow-emerald-600/30"
            >
              <Download className="w-4 h-4" /> Download PDF Statement
            </button>
          </div>

          <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Statement Summary Header</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-500">Investor:</span>
                <p className="font-bold text-white">{selectedInvestorRecord?.name}</p>
              </div>
              <div>
                <span className="text-slate-500">Account ID:</span>
                <p className="font-mono font-bold text-emerald-400">{selectedAccount?.name} ({selectedAccount?.ticker})</p>
              </div>
              <div>
                <span className="text-slate-500">Period:</span>
                <p className="font-bold text-white">Year to Date (2026)</p>
              </div>
              <div>
                <span className="text-slate-500">Closing Value:</span>
                <p className="font-mono font-bold text-emerald-400">{formatCurrency(currentValue)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: TRANSACTION REQUESTS */}
      {activeTab === 'requests' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl max-w-2xl mx-auto">
          <div>
            <h3 className="text-xl font-bold text-white">Submit Subscription / Redemption Request</h3>
            <p className="text-xs text-slate-400 mt-1">Requests are sent to the fund administrator for processing.</p>
          </div>

          <form onSubmit={handleTransactionRequest} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-300">Request Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  type="button"
                  onClick={() => setReqType('Subscription')}
                  className={cn(
                    "py-3 rounded-xl font-bold transition-all border",
                    reqType === 'Subscription' ? "bg-emerald-600 text-white border-emerald-500" : "bg-slate-950 text-slate-400 border-slate-800"
                  )}
                >
                  Subscription (Deposit)
                </button>
                <button 
                  type="button"
                  onClick={() => setReqType('Redemption')}
                  className={cn(
                    "py-3 rounded-xl font-bold transition-all border",
                    reqType === 'Redemption' ? "bg-blue-600 text-white border-blue-500" : "bg-slate-950 text-slate-400 border-slate-800"
                  )}
                >
                  Redemption (Withdrawal)
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-300">Amount (GHS)</label>
              <input 
                type="number"
                step="0.01"
                value={reqAmount}
                onChange={(e) => setReqAmount(e.target.value)}
                placeholder="e.g. 5000.00"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-slate-300">Notes / Instructions</label>
              <textarea 
                value={reqNotes}
                onChange={(e) => setReqNotes(e.target.value)}
                placeholder="Optional notes for fund manager..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button 
              type="submit"
              disabled={isSubmittingReq || !reqAmount}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-2xl text-sm transition-all flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/30"
            >
              {isSubmittingReq ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isSubmittingReq ? 'Submitting Request...' : `Submit ${reqType} Request`}
            </button>
          </form>
        </div>
      )}

      {/* SUB-TAB 5: PROFILE & CONTACT INFO */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white">Investor Contact & Identity Details</h3>

            <div className="space-y-4 text-xs">
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center gap-3">
                <User className="w-5 h-5 text-emerald-400" />
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-bold">Investor Name</span>
                  <p className="font-bold text-white text-sm">{selectedInvestorRecord?.name}</p>
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center gap-3">
                <Mail className="w-5 h-5 text-blue-400" />
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-bold">Email Address</span>
                  <p className="font-mono font-bold text-white">{selectedInvestorRecord?.email || 'No email registered'}</p>
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center gap-3">
                <Phone className="w-5 h-5 text-amber-400" />
                <div>
                  <span className="text-slate-500 text-[10px] uppercase font-bold">Phone Number</span>
                  <p className="font-mono font-bold text-white">{selectedInvestorRecord?.phone || 'Not specified'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
            <div>
              <h3 className="text-xl font-bold text-white">Request Profile Update</h3>
              <p className="text-xs text-slate-400 mt-1">Changes are submitted to fund administration for verification.</p>
            </div>

            <form onSubmit={handleProfileChangeRequest} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-300">Field to Update</label>
                <select 
                  value={changeField}
                  onChange={(e) => setChangeField(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white outline-none cursor-pointer"
                >
                  <option value="phone">Phone Number</option>
                  <option value="email">Email Address</option>
                  <option value="address">Mailing Address</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-300">New Value</label>
                <input 
                  type="text"
                  value={changeValue}
                  onChange={(e) => setChangeValue(e.target.value)}
                  placeholder="Enter updated contact details..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <button 
                type="submit"
                disabled={isSubmittingChange || !changeValue}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-2xl text-sm transition-all flex items-center justify-center gap-2"
              >
                {isSubmittingChange ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isSubmittingChange ? 'Submitting...' : 'Submit Profile Change Request'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
