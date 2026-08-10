import React, { useState, useMemo, useRef } from 'react';
import { 
  Transaction, 
  InvestmentAccount, 
  Investor, 
  Valuation, 
  StagedTransactionRecord, 
  TransactionBatch,
  TransactionType 
} from '../types';
import { formatCurrency, cn, safeFormatDate, safeDate } from '../lib/utils';
import { 
  analyseAndStageBatch, 
  postTransactionBatch, 
  resolveHistoricalNavForDate 
} from '../services/transactionProcessingEngine';
import { reconcileFundState, roundMoney, roundUnits } from '../services/fundAccountingEngine';
import { downloadTransactionRegistryTemplate } from '../services/csvTemplateService';
import TransactionHistory from './TransactionHistory';
import BatchDeleteByDateModal from './BatchDeleteByDateModal';
import { 
  ArrowLeftRight, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Filter, 
  Search, 
  FileText, 
  Download, 
  Sparkles, 
  Loader2, 
  ShieldCheck, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Layers, 
  Check, 
  X, 
  ChevronRight,
  Database,
  RefreshCw,
  UserCheck,
  HelpCircle,
  Activity,
  History,
  Scale,
  CalendarX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface TransactionModuleProps {
  transactions: Transaction[];
  accounts: InvestmentAccount[];
  investors: Investor[];
  valuations: Valuation[];
  role?: string | null;
}

export default function TransactionModule({ 
  transactions, 
  accounts, 
  investors, 
  valuations, 
  role = 'admin' 
}: TransactionModuleProps) {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'register' | 'bulk_import' | 'unit_ledger' | 'batches'>('overview');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || 'all');

  // Bulk Import State
  const [stagedBatch, setStagedBatch] = useState<TransactionBatch | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postingProgress, setPostingProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Unit Movement Ledger State
  const [unitLedgerEntries, setUnitLedgerEntries] = useState<any[]>([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);

  // Batch Delete by Date Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const activeAccount = useMemo(() => 
    accounts.find(a => a.id === selectedAccountId) || accounts[0] || null,
    [accounts, selectedAccountId]
  );

  // Reconcile Fund State
  const reconciliation = useMemo(() => {
    if (!activeAccount) return null;
    const accountInvestors = investors.filter(i => i.accountId === activeAccount.id);
    return reconcileFundState(activeAccount, [], accountInvestors);
  }, [activeAccount, investors]);

  // Derived Dashboard Stats
  const dashboardStats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const filteredTx = selectedAccountId === 'all' 
      ? transactions 
      : transactions.filter(t => t.accountId === selectedAccountId);

    const todayTx = filteredTx.filter(t => {
      const d = t.timestamp ? new Date(t.timestamp).toISOString().split('T')[0] : '';
      return d === todayStr;
    });

    const totalSubs = todayTx
      .filter(t => t.type === 'BUY' || t.type === 'Subscription')
      .reduce((sum, t) => sum + t.totalAmount, 0);

    const totalReds = todayTx
      .filter(t => t.type === 'SELL' || t.type === 'Redemption')
      .reduce((sum, t) => sum + t.totalAmount, 0);

    const netFlows = totalSubs - totalReds;
    const pendingExceptions = filteredTx.filter(t => t.status === 'NAV_REQUIRED' || t.status === 'pending').length;

    return {
      todayCount: todayTx.length,
      totalSubs,
      totalReds,
      netFlows,
      pendingExceptions
    };
  }, [transactions, selectedAccountId]);

  // Load Unit Movement Ledger from Firestore
  const fetchUnitLedger = async () => {
    if (!activeAccount) return;
    setIsLoadingLedger(true);
    try {
      const q = query(
        collection(db, 'unit_ledger'),
        where('accountId', '==', activeAccount.id)
      );
      const snap = await getDocs(q);
      const entries = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      entries.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setUnitLedgerEntries(entries);
    } catch (err) {
      console.error('Failed to load unit ledger:', err);
    } finally {
      setIsLoadingLedger(false);
    }
  };

  React.useEffect(() => {
    if (activeSubTab === 'unit_ledger') {
      fetchUnitLedger();
    }
  }, [activeSubTab, selectedAccountId]);

  // Handle Bulk File Analysis (Stage 1)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeAccount) return;

    setIsAnalysing(true);
    const toastId = toast.loading(`Analysing bulk transaction file: ${file.name}...`);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const batch = analyseAndStageBatch(
            results.data,
            file.name,
            activeAccount.id,
            investors,
            transactions,
            valuations,
            activeAccount.nav
          );
          setStagedBatch(batch);
          setActiveSubTab('bulk_import');
          toast.success(`Analysed ${batch.totalRows} rows. ${batch.validRows} ready, ${batch.reviewRows} require review.`, { id: toastId });
        } catch (err: any) {
          toast.error(`Analysis failed: ${err.message}`, { id: toastId });
        } finally {
          setIsAnalysing(false);
        }
      },
      error: (err) => {
        toast.error(`CSV Parsing failed: ${err.message}`, { id: toastId });
        setIsAnalysing(false);
      }
    });
  };

  // Handle Investor Match Manual Override in Staged Batch
  const handleUpdateStagedInvestor = (recordId: string, newInvestorId: string) => {
    if (!stagedBatch) return;
    const inv = investors.find(i => i.id === newInvestorId);
    if (!inv) return;

    setStagedBatch(prev => {
      if (!prev) return null;
      const updatedRecords = prev.stagedRecords.map(r => {
        if (r.id !== recordId) return r;
        return {
          ...r,
          matchedInvestorId: inv.id,
          matchedInvestorName: inv.name,
          matchConfidence: 100,
          matchStatus: 'MATCHED' as const,
          status: r.status === 'ERROR' && r.warningOrError?.includes('Investor') ? 'READY' as const : r.status,
          warningOrError: r.warningOrError?.includes('Investor') ? undefined : r.warningOrError
        };
      });

      const validCount = updatedRecords.filter(r => r.status === 'READY').length;
      const reviewCount = updatedRecords.filter(r => r.status === 'WARNING' || r.status === 'NAV_REQUIRED' || r.matchStatus === 'REVIEW').length;
      const errorCount = updatedRecords.filter(r => r.status === 'ERROR').length;

      return {
        ...prev,
        validRows: validCount,
        reviewRows: reviewCount,
        errorRows: errorCount,
        stagedRecords: updatedRecords
      };
    });
  };

  // Execute Stage 2 Atomic Batch Posting
  const handleConfirmPosting = async () => {
    if (!stagedBatch || !activeAccount) return;

    const readyRecords = stagedBatch.stagedRecords.filter(r => r.status === 'READY');
    if (readyRecords.length === 0) {
      toast.error('No ready records to post. Please resolve warnings/errors.');
      return;
    }

    setIsPosting(true);
    setPostingProgress(10);
    const toastId = toast.loading(`Posting ${readyRecords.length} transactions to authoritative ledger...`);

    try {
      const res = await postTransactionBatch(stagedBatch, readyRecords, activeAccount, investors);
      setPostingProgress(100);
      toast.success(`Successfully posted ${res.successCount} transactions. ${res.failureCount} failed.`, { id: toastId });

      setStagedBatch(null);
      setActiveSubTab('register');
    } catch (err: any) {
      console.error('Batch post failed:', err);
      toast.error(`Posting failed: ${err.message}`, { id: toastId });
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Module Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
              <ArrowLeftRight className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-white">Transactions Module</h2>
              <p className="text-sm text-slate-400">Professional Fund Accounting, Processing & Unit Ledger Center</p>
            </div>
          </div>
        </div>

        {/* Target Fund Selector */}
        <div className="flex items-center gap-3">
          <select 
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm font-semibold text-white focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="all">All Accounts / Global View</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name} ({acc.ticker})</option>
            ))}
          </select>

          <input 
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button 
            onClick={downloadTransactionRegistryTemplate}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition-all border border-slate-700 flex items-center gap-2 text-sm"
            title="Download official CSV upload template for transaction registry"
          >
            <Download className="w-4 h-4 text-emerald-400" /> Download CSV Template
          </button>

          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalysing}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 text-sm"
          >
            {isAnalysing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Smart Bulk Upload
          </button>

          <button 
            onClick={() => setIsDeleteModalOpen(true)}
            className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold rounded-xl transition-all flex items-center gap-2 text-sm"
            title="Batch delete transactions by date with automatic atomic balance reconciliation"
          >
            <CalendarX className="w-4 h-4" /> Delete by Date
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-4 overflow-x-auto">
        <button 
          onClick={() => setActiveSubTab('overview')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
            activeSubTab === 'overview' ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          )}
        >
          <Activity className="w-4 h-4" /> Operations Overview
        </button>
        <button 
          onClick={() => setActiveSubTab('register')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
            activeSubTab === 'register' ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          )}
        >
          <FileText className="w-4 h-4" /> Transaction Register
        </button>
        <button 
          onClick={() => setActiveSubTab('bulk_import')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap relative",
            activeSubTab === 'bulk_import' ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          )}
        >
          <Sparkles className="w-4 h-4 text-amber-400" /> Smart Bulk Import Hub
          {stagedBatch && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>
        <button 
          onClick={() => setActiveSubTab('unit_ledger')}
          className={cn(
            "px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap",
            activeSubTab === 'unit_ledger' ? "bg-emerald-600 text-white shadow-lg" : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          )}
        >
          <Scale className="w-4 h-4" /> Unit Movement Ledger & Reconciliation
        </button>
      </div>

      {/* SUB-TAB 1: OPERATIONS OVERVIEW */}
      {activeSubTab === 'overview' && (
        <div className="space-y-8">
          {/* Unit Reconciliation Alert Header */}
          {reconciliation && !reconciliation.isBalanced && (
            <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-3xl flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-500/20 rounded-2xl flex items-center justify-center text-red-500">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">Unit Balance Reconciliation Discrepancy Detected</h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Fund Total Units ({reconciliation.fundTotalUnits.toLocaleString()}) does not match Investor Registry Sum ({reconciliation.totalInvestorUnits.toLocaleString()}).
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setActiveSubTab('unit_ledger')}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition-all shadow-md"
              >
                Inspect Ledger
              </button>
            </div>
          )}

          {/* Top Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Today Subscriptions</span>
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-white">{formatCurrency(dashboardStats.totalSubs)}</p>
              <p className="text-[10px] text-slate-500">{dashboardStats.todayCount} transactions logged today</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Today Redemptions</span>
                <TrendingDown className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-2xl font-bold text-white">{formatCurrency(dashboardStats.totalReds)}</p>
              <p className="text-[10px] text-slate-500">Capital outflow logged today</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Net Money Flows</span>
                <Layers className="w-4 h-4 text-blue-500" />
              </div>
              <p className={cn("text-2xl font-bold", dashboardStats.netFlows >= 0 ? "text-emerald-400" : "text-red-400")}>
                {dashboardStats.netFlows >= 0 ? '+' : ''}{formatCurrency(dashboardStats.netFlows)}
              </p>
              <p className="text-[10px] text-slate-500">Net capital growth impact</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Unit Reconciliation</span>
                <Scale className="w-4 h-4 text-amber-500" />
              </div>
              <div className="flex items-center gap-2">
                {reconciliation?.isBalanced ? (
                  <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full font-bold">
                    ✅ Balanced (0 Discrepancy)
                  </span>
                ) : (
                  <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1 rounded-full font-bold">
                    ⚠️ Discrepancy
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500">
                {reconciliation?.fundTotalUnits.toLocaleString()} Fund Units Total
              </p>
            </div>
          </div>

          {/* Quick Operations Guide */}
          <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-3xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              Global Standard Fund Transaction Processing Rules
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-400">
              <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800 space-y-2">
                <strong className="text-white block font-bold">1. Historical Date NAV Resolution</strong>
                <p>Transactions posted for historical dates use the authoritative NAV on or before that date. If no NAV exists, status is flagged as <span className="text-amber-400 font-mono">NAV_REQUIRED</span>.</p>
              </div>
              <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800 space-y-2">
                <strong className="text-white block font-bold">2. Pro-Rata Redemption Cost Basis</strong>
                <p>Redemptions calculate cost basis reduction as <span className="font-mono text-emerald-400">Total Investment × (Units Redeemed / Units Owned)</span>, maintaining cost basis integrity.</p>
              </div>
              <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-800 space-y-2">
                <strong className="text-white block font-bold">3. Two-Stage Atomic Batch Staging</strong>
                <p>Bulk imports are staged first in a staging review grid. Production ledgers are mutated only upon explicit user review and atomic commit.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: TRANSACTION REGISTER */}
      {activeSubTab === 'register' && (
        <TransactionHistory 
          transactions={selectedAccountId === 'all' ? transactions : transactions.filter(t => t.accountId === selectedAccountId)}
          accounts={accounts}
          investors={investors}
          title="Authoritative Transaction Register"
        />
      )}

      {/* SUB-TAB 3: SMART BULK IMPORT WIZARD */}
      {activeSubTab === 'bulk_import' && (
        <div className="space-y-6">
          {!stagedBatch ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-6">
              <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center justify-center mx-auto text-emerald-400 shadow-xl">
                <Upload className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">Smart Bulk Import Engine</h3>
                <p className="text-slate-400 text-sm mt-1 max-w-md mx-auto">
                  Upload transaction files (CSV). The system will automatically resolve dates, perform fuzzy investor matching, lookup historical NAVs, and stage for review.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                <button 
                  onClick={downloadTransactionRegistryTemplate}
                  className="px-6 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-2xl transition-all border border-slate-700 inline-flex items-center gap-3 text-base"
                >
                  <Download className="w-5 h-5 text-emerald-400" />
                  Download Official CSV Template
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnalysing}
                  className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-emerald-600/30 inline-flex items-center gap-3 text-base"
                >
                  {isAnalysing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                  Select File to Analyse
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Batch Summary Header */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-lg font-bold">
                      {stagedBatch.id}
                    </span>
                    <h3 className="text-xl font-bold text-white">{stagedBatch.filename}</h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Uploaded by {stagedBatch.uploadedBy} • Total Amount: <strong className="text-emerald-400">{formatCurrency(stagedBatch.totalAmount)}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">
                    Total: <strong className="text-white">{stagedBatch.totalRows}</strong> | 
                    Ready: <strong className="text-emerald-400">{stagedBatch.validRows}</strong> | 
                    Review: <strong className="text-amber-400">{stagedBatch.reviewRows}</strong> | 
                    Error: <strong className="text-red-400">{stagedBatch.errorRows}</strong>
                  </span>
                  <button 
                    onClick={() => setStagedBatch(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all"
                  >
                    Clear Batch
                  </button>
                  <button 
                    onClick={handleConfirmPosting}
                    disabled={isPosting || stagedBatch.validRows === 0}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                  >
                    {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Post {stagedBatch.validRows} Approved Records
                  </button>
                </div>
              </div>

              {/* Staged Records Review Grid */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                <div className="p-4 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">Staging & Pre-Post Review Grid</h4>
                  <span className="text-xs text-slate-400">Review investor matches and historical NAVs before committing</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Raw Uploaded Name</th>
                        <th className="px-4 py-3">Resolved Investor Profile</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-right">Historical NAV</th>
                        <th className="px-4 py-3 text-right">Units</th>
                        <th className="px-4 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-xs">
                      {stagedBatch.stagedRecords.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-slate-300">
                            {r.validatedDate || r.rawDate}
                          </td>
                          <td className="px-4 py-3 font-semibold text-white">
                            {r.rawInvestor}
                          </td>
                          <td className="px-4 py-3">
                            {r.matchedInvestorId ? (
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-emerald-400">{r.matchedInvestorName}</span>
                                <span className={cn(
                                  "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase",
                                  r.matchConfidence >= 90 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                                )}>
                                  {r.matchConfidence}%
                                </span>
                              </div>
                            ) : (
                              <select 
                                value=""
                                onChange={(e) => handleUpdateStagedInvestor(r.id, e.target.value)}
                                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-amber-400 outline-none"
                              >
                                <option value="">Select Investor...</option>
                                {investors.map(inv => (
                                  <option key={inv.id} value={inv.id}>{inv.name} ({inv.investorId})</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                              r.normalisedType === 'Subscription' || r.normalisedType === 'BUY' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                            )}>
                              {r.normalisedType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-white">
                            {formatCurrency(r.rawAmount)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-300">
                            {r.applicableNav ? `GH₵${r.applicableNav.toFixed(4)}` : <span className="text-red-400 font-bold">NAV_REQUIRED</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400 font-bold">
                            {r.calculatedUnits ? r.calculatedUnits.toLocaleString(undefined, { minimumFractionDigits: 4 }) : '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {r.status === 'READY' && <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-bold">READY</span>}
                            {r.status === 'WARNING' && <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-bold">REVIEW</span>}
                            {r.status === 'NAV_REQUIRED' && <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded text-[10px] font-bold">NAV_REQUIRED</span>}
                            {r.status === 'DUPLICATE' && <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-bold">DUPLICATE</span>}
                            {r.status === 'ERROR' && <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded text-[10px] font-bold" title={r.warningOrError}>ERROR</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 4: UNIT LEDGER & RECONCILIATION */}
      {activeSubTab === 'unit_ledger' && (
        <div className="space-y-6">
          {/* Live Unit Reconciliation Card */}
          {reconciliation && (
            <div className={cn(
              "p-6 rounded-3xl border flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl",
              reconciliation.isBalanced ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/30"
            )}>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Scale className={cn("w-5 h-5", reconciliation.isBalanced ? "text-emerald-400" : "text-red-400")} />
                  <h3 className="text-lg font-bold text-white">Live Fund Unit Reconciliation</h3>
                </div>
                <p className="text-xs text-slate-400">
                  Target Account: <strong className="text-white">{activeAccount?.name} ({activeAccount?.ticker})</strong>
                </p>
              </div>

              <div className="flex items-center gap-8 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block uppercase text-[10px]">Fund Total Units</span>
                  <strong className="text-lg text-white font-bold">{reconciliation.fundTotalUnits.toLocaleString()}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase text-[10px]">Investor Registry Sum</span>
                  <strong className="text-lg text-white font-bold">{reconciliation.totalInvestorUnits.toLocaleString()}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase text-[10px]">Status</span>
                  <span className={cn(
                    "text-xs px-3 py-1 rounded-full font-bold uppercase",
                    reconciliation.isBalanced ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                  )}>
                    {reconciliation.isBalanced ? ' balanced ' : ' discrepancy '}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Unit Movement Log Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-400" />
                Unit Movement History Log
              </h4>
              <button 
                onClick={fetchUnitLedger}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
                title="Refresh Ledger"
              >
                <RefreshCw className={cn("w-4 h-4", isLoadingLedger && "animate-spin")} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/50 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    <th className="px-6 py-4">Effective Date</th>
                    <th className="px-6 py-4">Investor</th>
                    <th className="px-6 py-4">Event Type</th>
                    <th className="px-6 py-4 text-right">Units Delta</th>
                    <th className="px-6 py-4 text-right">Applicable NAV</th>
                    <th className="px-6 py-4 text-right">Running Investor Units</th>
                    <th className="px-6 py-4 text-right">Running Fund Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {unitLedgerEntries.map((e) => {
                    const inv = investors.find(i => i.id === e.investorId);
                    return (
                      <tr key={e.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 font-mono text-slate-300">
                          {e.effectiveDate}
                        </td>
                        <td className="px-6 py-4 font-semibold text-white">
                          {inv?.name || e.investorId}
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            e.unitsDelta >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                          )}>
                            {e.transactionType}
                          </span>
                        </td>
                        <td className={cn("px-6 py-4 text-right font-mono font-bold", e.unitsDelta >= 0 ? "text-emerald-400" : "text-red-400")}>
                          {e.unitsDelta >= 0 ? '+' : ''}{e.unitsDelta.toLocaleString(undefined, { minimumFractionDigits: 4 })}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-slate-400">
                          GH₵{e.applicableNav?.toFixed(4)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-slate-200">
                          {e.runningInvestorUnits?.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-slate-200">
                          {e.runningFundUnits?.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {unitLedgerEntries.length === 0 && (
                <div className="py-16 text-center text-slate-500 text-sm">
                  No unit ledger entries recorded for this account yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Batch Delete by Date Modal */}
      <BatchDeleteByDateModal 
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        transactions={transactions}
        accounts={accounts}
        investors={investors}
        initialAccountId={selectedAccountId === 'all' ? 'ALL' : selectedAccountId}
      />
    </div>
  );
}
