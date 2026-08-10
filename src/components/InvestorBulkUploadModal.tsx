import React, { useState, useRef } from 'react';
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
  commitInvestorBulkBatch 
} from '../services/investorBulkUploadService';
import { formatCurrency, cn } from '../lib/utils';
import { 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Loader2, 
  Users, 
  Building2, 
  Calendar, 
  DollarSign, 
  ShieldCheck, 
  Zap, 
  FileSpreadsheet, 
  Filter, 
  HelpCircle, 
  AlertCircle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { toast } from 'sonner';

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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeAccount = accounts.find(a => a.id === selectedAccountId) || accounts[0];

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalysing(true);
    const toastId = toast.loading(`Analysing CSV file: ${file.name}...`);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          // Auto-detect unit & financial headers
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
            toast.info('Auto-detected unit/financial columns in CSV. Enabled Master + Investment Mode.', { id: toastId });
          }

          const batch = analyseInvestorBulkCsv(
            results.data,
            file.name,
            activeMode,
            selectedAccountId,
            investors,
            accounts,
            valuations
          );

          setStagedBatch(batch);
          toast.success(
            `Parsed ${batch.totalRows} rows. ${batch.validRows} ready, ${batch.warningRows} warnings, ${batch.errorRows} errors.`, 
            { id: toastId }
          );
        } catch (err: any) {
          console.error('CSV Parsing Error:', err);
          toast.error(`Error analysing file: ${err?.message || 'Parse failed'}`, { id: toastId });
        } finally {
          setIsAnalysing(false);
        }
      },
      error: (err) => {
        toast.error(`CSV File read error: ${err.message}`, { id: toastId });
        setIsAnalysing(false);
      }
    });
  };

  const handleUpdateDiscrepancyAction = (rowNumber: number, action: 'USE_CALCULATED' | 'ACCEPT_IMPORTED') => {
    if (!stagedBatch) return;

    setStagedBatch(prev => {
      if (!prev) return null;
      const updatedRows = prev.stagedRows.map(r => {
        if (r.rowNumber !== rowNumber) return r;
        return {
          ...r,
          discrepancyAction: action
        };
      });
      return { ...prev, stagedRows: updatedRows };
    });
  };

  const handleCommitBatch = async () => {
    if (!stagedBatch || !activeAccount) return;

    const rowsToCommit = stagedBatch.stagedRows.filter(r => r.status === 'READY' || r.status === 'WARNING');
    if (rowsToCommit.length === 0) {
      toast.error('No ready rows to commit. Please resolve validation errors.');
      return;
    }

    setIsCommitting(true);
    const toastId = toast.loading(`Committing ${rowsToCommit.length} investor records to authoritative ledger...`);

    try {
      const res = await commitInvestorBulkBatch(
        stagedBatch,
        rowsToCommit,
        activeAccount,
        investors,
        enablePortalAccess
      );

      toast.success(
        `Successfully created ${res.createdInvestorsCount} investor(s) & posted ${res.postedTransactionsCount} subscription transaction(s)!`, 
        { id: toastId }
      );

      if (onSuccess) onSuccess();
      onClose();
      setStagedBatch(null);
    } catch (err: any) {
      console.error('Batch commit failed:', err);
      toast.error(`Error committing batch: ${err?.message || 'Operation failed'}`, { id: toastId });
    } finally {
      setIsCommitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative"
        >
          {/* Modal Header */}
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
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {/* Mode Selector & Download Templates */}
            <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Select Import Mode</span>
                <div className="flex items-center gap-2">
                  <button 
                    type="button"
                    onClick={() => {
                      setImportMode('MASTER_ONLY');
                      setStagedBatch(null);
                    }}
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
                    onClick={() => {
                      setImportMode('MASTER_AND_INVESTMENT');
                      setStagedBatch(null);
                    }}
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

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadInvestorCsvTemplate(importMode)}
                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-400 hover:text-emerald-300 text-xs font-bold rounded-xl transition-all flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download CSV Template
                </button>
              </div>
            </div>

            {/* Drag & Drop File Dropzone */}
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
                      : 'Upload investors + subscription records. Subscriptions will resolve historical NAV & unit movements.'}
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
                {/* Batch Analysis Summary KPIs */}
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
                    <span className="text-[10px] text-amber-400 font-bold uppercase">Warnings / Discrepancies</span>
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

                {/* Staging Review Table */}
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
                              <th className="px-4 py-2.5 font-mono text-right">NAV</th>
                              <th className="px-4 py-2.5 font-mono text-right">Calculated Units</th>
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
                            <td className="px-4 py-2.5 text-slate-300 font-mono">{r.email || '-'}</td>
                            {importMode === 'MASTER_AND_INVESTMENT' && (
                              <>
                                <td className="px-4 py-2.5 text-right font-mono text-slate-300">{r.transactionDate || '-'}</td>
                                <td className="px-4 py-2.5 text-right font-mono font-bold text-white">
                                  {r.amount ? formatCurrency(r.amount) : '-'}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono text-slate-400">
                                  {r.applicableNav ? `GH₵${r.applicableNav.toFixed(4)}` : <span className="text-red-400 font-bold">NAV_REQUIRED</span>}
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-400">
                                  {r.calculatedUnits ? r.calculatedUnits.toLocaleString(undefined, { minimumFractionDigits: 4 }) : '-'}
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
                                          className="bg-slate-900 border border-amber-500/40 text-[10px] text-amber-400 rounded px-1 py-0.5 outline-none font-sans"
                                        >
                                          <option value="USE_CALCULATED">Use Calculated</option>
                                          <option value="ACCEPT_IMPORTED">Accept Migration</option>
                                        </select>
                                      )}
                                    </div>
                                  ) : '-'}
                                </td>
                              </>
                            )}
                            <td className="px-4 py-2.5 text-center">
                              {r.status === 'READY' && <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-bold">READY</span>}
                              {r.status === 'WARNING' && <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[10px] font-bold" title={r.warningOrError}>WARNING</span>}
                              {r.status === 'NAV_REQUIRED' && <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded text-[10px] font-bold">NAV_REQUIRED</span>}
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

          {/* Footer Controls */}
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
                <span>Enable Investor Portal Access & Send Secure Activation Link</span>
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
                    <span>Committing & Posting...</span>
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
