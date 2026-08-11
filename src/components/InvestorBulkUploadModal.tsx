import React, { useState, useRef, useEffect } from 'react';
import { 
  Investor, 
  InvestmentAccount, 
  Valuation, 
  InvestorImportMode, 
  StagedInvestorBatch, 
  StagedInvestorRow 
} from '../types';
import { 
  downloadInvestorCsvTemplate, 
  analyseInvestorBulkCsv, 
  commitInvestorBulkBatch,
  BulkCommitProgress
} from '../services/investorBulkUploadService';
import { formatCurrency, cn } from '../lib/utils';
import { 
  Upload, 
  Download, 
  CheckCircle2, 
  X, 
  Loader2, 
  Users, 
  Zap, 
  FileSpreadsheet, 
  ShieldCheck,
  Activity,
  Clock,
  TrendingUp,
  BarChart3,
  Mail
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { toast } from 'sonner';

interface ActivityItem {
  name: string;
  amount: number;
  units: number;
  nav: number;
  txDate: string;
  ts: number;
}

interface InvestorBulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  investors: Investor[];
  accounts: InvestmentAccount[];
  valuations: Valuation[];
  onSuccess?: () => void;
}

export default function InvestorBulkUploadModal({
  isOpen,
  onClose,
  investors,
  accounts,
  valuations,
  onSuccess
}: InvestorBulkUploadModalProps) {
  const [importMode, setImportMode] = useState<InvestorImportMode>('MASTER_AND_INVESTMENT');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || 'acc1');
  const [stagedBatch, setStagedBatch] = useState<StagedInvestorBatch | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [enablePortalAccess, setEnablePortalAccess] = useState(true);

  // ── Progress tracking ────────────────────────────────────────────────────────
  const [commitProgress, setCommitProgress] = useState<BulkCommitProgress | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [elapsedTick, setElapsedTick] = useState(0);
  const commitStartTimeRef = useRef<number>(0);

  // Tick timer: refresh elapsed/ETA every 500ms while committing
  useEffect(() => {
    if (!isCommitting) return;
    const iv = setInterval(() => setElapsedTick(t => t + 1), 500);
    return () => clearInterval(iv);
  }, [isCommitting]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeAccount = accounts.find(a => a.id === selectedAccountId) || accounts[0];

  // ── Computed progress metrics ────────────────────────────────────────────────
  const elapsedSecs = isCommitting && commitStartTimeRef.current > 0
    ? Math.max(0.1, (Date.now() - commitStartTimeRef.current) / 1000)
    : 0;
  const totalDone = commitProgress ? commitProgress.phase2Done : 0;
  const totalTarget = commitProgress ? Math.max(commitProgress.phase2Total, 1) : 1;
  const overallPct = Math.min(100, Math.round((totalDone / totalTarget) * 100));
  const rps = elapsedSecs > 0 && totalDone > 0 ? (totalDone / elapsedSecs) : 0;
  const etaSecs = rps > 0 ? Math.max(0, (totalTarget - totalDone) / rps) : 0;

  const fmtTime = (s: number) => {
    if (s < 1) return '< 1s';
    if (s < 60) return `${Math.ceil(s)}s`;
    return `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;
  };

  // ── File parsing ─────────────────────────────────────────────────────────────
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalysing(true);
    const toastId = toast.loading(`Analysing ${file.name}...`);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const sampleRow = (results.data[0] as Record<string, any>) || {};
          const headers = Object.keys(sampleRow).map(h => h.trim().toLowerCase());
          const hasFinancialHeaders = headers.some(h =>
            h.includes('amount') || h.includes('unit') || h.includes('contribution') ||
            h.includes('deposit') || h.includes('subscription') || h.includes('investment') ||
            h.includes('share') || h.includes('balance') || h.includes('capital')
          );

          let activeMode = importMode;
          if (hasFinancialHeaders && importMode === 'MASTER_ONLY') {
            activeMode = 'MASTER_AND_INVESTMENT';
            setImportMode('MASTER_AND_INVESTMENT');
            toast.info('Auto-detected financial columns — enabled Master + Investment Mode.', { id: toastId });
          }

          const batch = analyseInvestorBulkCsv(
            results.data, file.name, activeMode, selectedAccountId,
            investors, accounts, valuations
          );

          setStagedBatch(batch);
          toast.success(
            `Parsed ${batch.totalRows} rows — ${batch.validRows} ready, ${batch.warningRows} warnings, ${batch.errorRows} errors.`,
            { id: toastId }
          );
        } catch (err: any) {
          toast.error(`Parse error: ${err?.message || 'Failed'}`, { id: toastId });
        } finally {
          setIsAnalysing(false);
        }
      },
      error: (err) => {
        toast.error(`CSV read error: ${err.message}`, { id: toastId });
        setIsAnalysing(false);
      }
    });
  };

  const handleUpdateDiscrepancyAction = (rowNumber: number, action: 'USE_CALCULATED' | 'ACCEPT_IMPORTED') => {
    if (!stagedBatch) return;
    setStagedBatch(prev => {
      if (!prev) return null;
      return {
        ...prev,
        stagedRows: prev.stagedRows.map(r =>
          r.rowNumber !== rowNumber ? r : { ...r, discrepancyAction: action }
        )
      };
    });
  };

  // ── Commit handler ───────────────────────────────────────────────────────────
  const handleCommitBatch = async () => {
    if (!stagedBatch || !activeAccount) return;

    const rowsToCommit = stagedBatch.stagedRows.filter(r => r.status === 'READY' || r.status === 'WARNING');
    if (rowsToCommit.length === 0) {
      toast.error('No ready rows to commit. Please resolve errors first.');
      return;
    }

    setIsCommitting(true);
    setCommitProgress(null);
    setActivityFeed([]);
    commitStartTimeRef.current = Date.now();

    try {
      const res = await commitInvestorBulkBatch(
        stagedBatch,
        rowsToCommit,
        activeAccount,
        investors,
        enablePortalAccess,
        (progress) => {
          setCommitProgress(progress);
          if (progress.lastItem) {
            setActivityFeed(prev => [{
              name: progress.lastItem!.name,
              amount: progress.lastItem!.amount,
              units: progress.lastItem!.units,
              nav: progress.lastItem!.nav,
              txDate: progress.lastItem!.txDate,
              ts: Date.now()
            }, ...prev].slice(0, 8));
          }
        }
      );

      toast.success(
        `✅ ${res.createdInvestorsCount} investor(s) created · ${res.postedTransactionsCount} transaction(s) posted!`
      );
      if (onSuccess) onSuccess();
      onClose();
      setStagedBatch(null);
      setCommitProgress(null);
      setActivityFeed([]);
    } catch (err: any) {
      console.error('Batch commit failed:', err);
      toast.error(`Commit error: ${err?.message || 'Operation failed'}`);
    } finally {
      setIsCommitting(false);
    }
  };

  if (!isOpen) return null;

  const phases = [
    { id: 1, label: 'Investor Resolution', icon: Users, done: commitProgress ? commitProgress.phase1Done : 0, total: commitProgress ? commitProgress.phase1Total : 0 },
    { id: 2, label: 'Transaction Posting', icon: BarChart3, done: commitProgress ? commitProgress.phase2Done : 0, total: commitProgress ? commitProgress.phase2Total : 0 },
    { id: 3, label: 'Portal Provisioning', icon: Mail, done: commitProgress ? commitProgress.phase3Done : 0, total: commitProgress ? commitProgress.phase3Total : 0 },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative"
        >

          {/* ── Commit Progress Overlay ──────────────────────────────────────── */}
          <AnimatePresence>
            {isCommitting && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-slate-950/97 backdrop-blur-sm rounded-3xl flex flex-col overflow-y-auto"
              >
                <div className="flex flex-col items-center justify-start p-8 min-h-full">

                  {/* Header */}
                  <div className="text-center mb-8 mt-2">
                    <div className="relative inline-flex">
                      <div className="w-20 h-20 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-3xl flex items-center justify-center">
                        <Zap className="w-10 h-10 text-emerald-400" />
                      </div>
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full animate-ping opacity-70" />
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-400 rounded-full" />
                    </div>
                    <h2 className="text-2xl font-black text-white mt-4 tracking-tight">Bulk Commit Engine</h2>
                    <p className="text-slate-400 text-sm mt-1">Authoritative Financial Ledger Posting in Progress</p>
                  </div>

                  {/* Phase Steps */}
                  <div className="w-full max-w-xl space-y-3 mb-6">
                    {phases.map((ph) => {
                      const Icon = ph.icon;
                      const isCurrent = commitProgress?.phase === ph.id;
                      const isDone = commitProgress ? commitProgress.phase > ph.id || (commitProgress.phase === ph.id && ph.done >= ph.total && ph.total > 0) : false;
                      const isPending = commitProgress ? commitProgress.phase < ph.id : true;
                      const pct = ph.total > 0 ? Math.min(100, Math.round((ph.done / ph.total) * 100)) : 0;

                      return (
                        <div key={ph.id} className={cn(
                          'flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300',
                          isCurrent ? 'bg-emerald-500/8 border-emerald-500/30' : isDone ? 'bg-slate-800/40 border-slate-700/40' : 'bg-slate-900/30 border-slate-800/30 opacity-50'
                        )}>
                          {/* Status icon */}
                          <div className={cn(
                            'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                            isDone ? 'bg-emerald-500/20 text-emerald-400' : isCurrent ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-500'
                          )}>
                            {isDone
                              ? <CheckCircle2 className="w-5 h-5" />
                              : isCurrent
                                ? <Loader2 className="w-5 h-5 animate-spin" />
                                : <Icon className="w-5 h-5" />
                            }
                          </div>

                          {/* Label + mini progress */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={cn(
                                'text-sm font-bold',
                                isDone ? 'text-emerald-400' : isCurrent ? 'text-white' : 'text-slate-500'
                              )}>
                                Phase {ph.id}: {ph.label}
                              </span>
                              <span className={cn(
                                'text-xs font-mono font-bold tabular-nums',
                                isDone ? 'text-emerald-400' : isCurrent ? 'text-slate-300' : 'text-slate-600'
                              )}>
                                {ph.total > 0 ? `${ph.done.toLocaleString()} / ${ph.total.toLocaleString()}` : (isDone ? '✓' : '—')}
                              </span>
                            </div>
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <motion.div
                                className={cn(
                                  'h-full rounded-full',
                                  isDone ? 'bg-emerald-500' : isCurrent ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-slate-700'
                                )}
                                initial={{ width: 0 }}
                                animate={{ width: `${isDone ? 100 : pct}%` }}
                                transition={{ duration: 0.4, ease: 'easeOut' }}
                              />
                            </div>
                          </div>

                          {/* Badge */}
                          <div className={cn(
                            'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0',
                            isDone ? 'bg-emerald-500/15 text-emerald-400' : isCurrent ? 'bg-amber-500/15 text-amber-400 animate-pulse' : 'bg-slate-800 text-slate-600'
                          )}>
                            {isDone ? 'DONE' : isCurrent ? 'LIVE' : 'WAIT'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Main Overall Progress Bar */}
                  <div className="w-full max-w-xl mb-5">
                    <div className="flex items-center justify-between text-xs font-bold mb-2">
                      <span className="text-slate-400">
                        <span className="text-white text-base font-black tabular-nums">{totalDone.toLocaleString()}</span>
                        <span className="text-slate-500"> / {totalTarget.toLocaleString()} transactions posted</span>
                      </span>
                      <span className={cn('text-lg font-black tabular-nums', overallPct >= 100 ? 'text-emerald-400' : 'text-white')}>
                        {overallPct}%
                      </span>
                    </div>
                    <div className="h-4 bg-slate-800 rounded-full overflow-hidden shadow-inner">
                      <motion.div
                        className="h-full rounded-full relative overflow-hidden"
                        style={{
                          background: 'linear-gradient(90deg, #059669, #34d399, #6ee7b7)',
                          backgroundSize: '200% 100%'
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${overallPct}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                      >
                        {/* Shimmer effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite] bg-[length:200%_100%]" />
                      </motion.div>
                    </div>
                  </div>

                  {/* Speed Metrics */}
                  <div className="flex items-center gap-4 mb-6 w-full max-w-xl justify-center flex-wrap">
                    {[
                      { Icon: TrendingUp, label: 'records/sec', value: rps > 0 ? rps.toFixed(1) : '—', color: 'text-emerald-400' },
                      { Icon: Clock, label: 'remaining', value: commitProgress && totalDone < totalTarget ? fmtTime(etaSecs) : '—', color: 'text-amber-400' },
                      { Icon: Activity, label: 'elapsed', value: fmtTime(elapsedSecs), color: 'text-blue-400' },
                      { Icon: ShieldCheck, label: 'posted', value: (commitProgress?.successCount || 0).toLocaleString(), color: 'text-purple-400' },
                    ].map(({ Icon, label, value, color }) => (
                      <div key={label} className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2">
                        <Icon className={cn('w-3.5 h-3.5', color)} />
                        <span className={cn('text-sm font-black tabular-nums', color)}>{value}</span>
                        <span className="text-[10px] text-slate-500 font-semibold uppercase">{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Live Activity Feed */}
                  {activityFeed.length > 0 && (
                    <div className="w-full max-w-xl bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-slate-800 flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Activity Feed</span>
                        <span className="ml-auto text-[10px] text-emerald-400 font-bold animate-pulse">● LIVE</span>
                      </div>
                      <div className="divide-y divide-slate-800/50">
                        {activityFeed.map((item, i) => (
                          <motion.div
                            key={item.ts}
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25 }}
                            className={cn(
                              'flex items-center gap-3 px-4 py-2.5 text-xs',
                              i === 0 ? 'bg-emerald-500/5' : ''
                            )}
                          >
                            <CheckCircle2 className={cn('w-3.5 h-3.5 flex-shrink-0', i === 0 ? 'text-emerald-400' : 'text-slate-600')} />
                            <span className={cn('font-semibold truncate flex-1 max-w-[140px]', i === 0 ? 'text-white' : 'text-slate-400')} title={item.name}>
                              {item.name}
                            </span>
                            <span className="font-mono text-emerald-400 font-bold flex-shrink-0">
                              {formatCurrency(item.amount)}
                            </span>
                            <span className="text-slate-500 flex-shrink-0">→</span>
                            <span className="font-mono text-amber-400 font-bold flex-shrink-0">
                              {item.units.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} units
                            </span>
                            <span className="text-slate-600 font-mono text-[10px] flex-shrink-0 ml-auto">
                              NAV {item.nav.toFixed(4)} · {item.txDate}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Waiting state (before first progress) */}
                  {!commitProgress && (
                    <div className="flex flex-col items-center gap-3 mt-4">
                      <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                      <span className="text-slate-400 text-sm">Initialising commit engine...</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Normal Modal Header ──────────────────────────────────────────── */}
          <div className="p-6 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>Investor Bulk Upload & Import Engine</span>
                  <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-mono">
                    Global Standard
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Import investor master profiles and stage subscription transactions through the authoritative engine
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isCommitting}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-30"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {/* Mode Selector & Download */}
            <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Select Import Mode</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setImportMode('MASTER_ONLY'); setStagedBatch(null); }}
                    className={cn(
                      "px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border",
                      importMode === 'MASTER_ONLY'
                        ? "bg-emerald-600 border-emerald-500 text-white shadow-lg"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                    )}
                  >
                    <Users className="w-4 h-4" /> Mode A: Investor Master Data Only
                  </button>
                  <button
                    type="button"
                    onClick={() => { setImportMode('MASTER_AND_INVESTMENT'); setStagedBatch(null); }}
                    className={cn(
                      "px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border",
                      importMode === 'MASTER_AND_INVESTMENT'
                        ? "bg-emerald-600 border-emerald-500 text-white shadow-lg"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                    )}
                  >
                    <Zap className="w-4 h-4 text-amber-400" /> Mode B: Master + Initial Investment
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => downloadInvestorCsvTemplate(importMode)}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-400 hover:text-emerald-300 text-xs font-bold rounded-xl transition-all flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Download CSV Template
              </button>
            </div>

            {/* Drag & Drop Dropzone */}
            {!stagedBatch ? (
              <div className="border-2 border-dashed border-slate-800 hover:border-emerald-500/50 bg-slate-950/40 rounded-3xl p-10 text-center space-y-4 transition-all">
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">Upload Investor CSV Import File</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    {importMode === 'MASTER_ONLY'
                      ? 'Upload investor identity records. No financial balances will be created.'
                      : 'Upload investors + subscriptions. NAV is resolved per-transaction-date from full history.'}
                  </p>
                </div>

                <input
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleFileSelected}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnalysing}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 inline-flex items-center gap-2 text-xs"
                >
                  {isAnalysing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Select CSV File to Analyse
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Batch KPI Summary */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Total Rows</span>
                    <p className="text-xl font-bold text-white">{stagedBatch.totalRows}</p>
                  </div>
                  <div className="p-3.5 bg-slate-950 border border-emerald-500/30 rounded-2xl space-y-1">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase">Ready</span>
                    <p className="text-xl font-bold text-emerald-400">{stagedBatch.validRows}</p>
                  </div>
                  <div className="p-3.5 bg-slate-950 border border-amber-500/30 rounded-2xl space-y-1">
                    <span className="text-[10px] text-amber-400 font-bold uppercase">Warnings</span>
                    <p className="text-xl font-bold text-amber-400">{stagedBatch.warningRows}</p>
                  </div>
                  <div className="p-3.5 bg-slate-950 border border-red-500/30 rounded-2xl space-y-1">
                    <span className="text-[10px] text-red-400 font-bold uppercase">Errors</span>
                    <p className="text-xl font-bold text-red-400">{stagedBatch.errorRows}</p>
                  </div>
                  {importMode === 'MASTER_AND_INVESTMENT' && (
                    <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Total Subscription</span>
                      <p className="text-sm font-bold text-white font-mono">{formatCurrency(stagedBatch.totalSubscriptionAmount)}</p>
                    </div>
                  )}
                </div>

                {/* Staging Inspection Table */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" /> Staging Pre-Commit Inspection Grid
                    </h4>
                    <button
                      type="button"
                      onClick={() => setStagedBatch(null)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Clear & Upload Another File
                    </button>
                  </div>

                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900/80 border-b border-slate-800 text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                          <th className="px-4 py-2.5">Row #</th>
                          <th className="px-4 py-2.5">Investor ID / Match</th>
                          <th className="px-4 py-2.5">Full Name</th>
                          <th className="px-4 py-2.5">Email</th>
                          {importMode === 'MASTER_AND_INVESTMENT' && (
                            <>
                              <th className="px-4 py-2.5 font-mono text-right">Date</th>
                              <th className="px-4 py-2.5 font-mono text-right">Amount (GHS)</th>
                              <th className="px-4 py-2.5 font-mono text-right">NAV @ Date</th>
                              <th className="px-4 py-2.5 font-mono text-right">Calc. Units</th>
                              <th className="px-4 py-2.5 font-mono text-right">Imported Units</th>
                            </>
                          )}
                          <th className="px-4 py-2.5 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {stagedBatch.stagedRows.map((r) => (
                          <tr key={r.rowNumber} className="hover:bg-slate-900/40 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-slate-400">#{r.rowNumber}</td>
                            <td className="px-4 py-2.5">
                              {r.matchedInvestorId ? (
                                <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[10px] font-bold">
                                  {r.matchedInvestorName} ({r.matchConfidence}%)
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono">{r.investorId || 'Auto-Generate'}</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-semibold text-white">{r.fullName}</td>
                            <td className="px-4 py-2.5 text-slate-300 font-mono">{r.email || '—'}</td>
                            {importMode === 'MASTER_AND_INVESTMENT' && (
                              <>
                                <td className="px-4 py-2.5 text-right font-mono text-slate-300">{r.transactionDate || '—'}</td>
                                <td className="px-4 py-2.5 text-right font-mono font-bold text-white">
                                  {r.amount ? formatCurrency(r.amount) : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono text-slate-400">
                                  {r.applicableNav
                                    ? <span title={`NAV resolved for ${r.transactionDate}`}>GH₵{r.applicableNav.toFixed(4)}</span>
                                    : <span className="text-red-400 font-bold">NAV_REQUIRED</span>}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">
                                  {r.calculatedUnits ? r.calculatedUnits.toLocaleString(undefined, { minimumFractionDigits: 4 }) : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono">
                                  {r.importedUnits !== undefined ? (
                                    <div className="flex items-center justify-end gap-1">
                                      <span className={cn("font-bold", r.hasUnitDiscrepancy ? "text-amber-400" : "text-slate-300")}>
                                        {r.importedUnits.toLocaleString(undefined, { minimumFractionDigits: 4 })}
                                      </span>
                                      {r.hasUnitDiscrepancy && (
                                        <select
                                          value={r.discrepancyAction || 'USE_CALCULATED'}
                                          onChange={(e) => handleUpdateDiscrepancyAction(r.rowNumber, e.target.value as any)}
                                          className="bg-slate-900 border border-amber-500/40 text-[10px] text-amber-400 rounded px-1 py-0.5 outline-none"
                                        >
                                          <option value="USE_CALCULATED">Use Calculated</option>
                                          <option value="ACCEPT_IMPORTED">Accept Imported</option>
                                        </select>
                                      )}
                                    </div>
                                  ) : '—'}
                                </td>
                              </>
                            )}
                            <td className="px-4 py-2.5 text-center">
                              {r.status === 'READY' && <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-bold">READY</span>}
                              {r.status === 'WARNING' && <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[10px] font-bold" title={r.warningOrError}>WARN</span>}
                              {r.status === 'NAV_REQUIRED' && <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded text-[10px] font-bold">NAV?</span>}
                              {r.status === 'ERROR' && <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-[10px] font-bold" title={r.warningOrError}>ERROR</span>}
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

          {/* ── Footer Controls ──────────────────────────────────────────────── */}
          <div className="p-6 bg-slate-950 border-t border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Target Fund Account</label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-xs font-semibold text-white rounded-xl px-3 py-1.5 outline-none"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.ticker})</option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer pt-4">
                <input
                  type="checkbox"
                  checked={enablePortalAccess}
                  onChange={(e) => setEnablePortalAccess(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <span>Enable Portal Access & Send Activation Link</span>
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isCommitting}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 border border-slate-700 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommitBatch}
                disabled={isCommitting || !stagedBatch || stagedBatch.validRows + stagedBatch.warningRows === 0}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/30"
              >
                {isCommitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Committing...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Commit Approved Import Batch</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
