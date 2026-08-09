import React, { useState, useMemo } from 'react';
import { Transaction, InvestmentAccount, Investor } from '../types';
import { isTransactionOnDate, deleteTransactionsOnDate } from '../services/transactionCleanup';
import { formatCurrency, safeDate, safeISODate } from '../lib/utils';
import { 
  AlertTriangle, 
  Calendar, 
  Trash2, 
  X, 
  Loader2, 
  Filter, 
  ArrowUpRight, 
  ArrowDownRight, 
  Users, 
  Building2,
  CheckCircle2,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface BatchDeleteByDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  accounts: InvestmentAccount[];
  investors: Investor[];
  initialDate?: string;
  initialAccountId?: string;
  onSuccess?: () => void;
}

export default function BatchDeleteByDateModal({
  isOpen,
  onClose,
  transactions,
  accounts,
  investors,
  initialDate,
  initialAccountId = 'ALL',
  onSuccess
}: BatchDeleteByDateModalProps) {
  // Find dates that have transactions to provide quick suggestion chips
  const dateCounts = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach(t => {
      const iso = safeISODate(t.timestamp) || (t.timestamp ? String(t.timestamp).split('T')[0] : '');
      if (iso && iso.length === 10) {
        map.set(iso, (map.get(iso) || 0) + 1);
      }
    });

    // Sort by transaction count descending
    return Array.from(map.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.count - a.count);
  }, [transactions]);

  // Pick default date: initialDate -> highest count date -> today
  const defaultDateStr = useMemo(() => {
    if (initialDate) return initialDate;
    if (dateCounts.length > 0) return dateCounts[0].date;
    return new Date().toISOString().split('T')[0];
  }, [initialDate, dateCounts]);

  const [selectedDate, setSelectedDate] = useState<string>(defaultDateStr);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(initialAccountId);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Compute matching transactions for live impact analysis
  const matchingTransactions = useMemo(() => {
    if (!selectedDate) return [];
    return transactions.filter(t => {
      const matchDate = isTransactionOnDate(t, selectedDate);
      if (!matchDate) return false;
      if (selectedAccountId !== 'ALL' && t.accountId !== selectedAccountId) return false;
      return true;
    });
  }, [transactions, selectedDate, selectedAccountId]);

  // Summary statistics of transactions on selected date
  const summary = useMemo(() => {
    let buyCount = 0;
    let buyAmount = 0;
    let buyUnits = 0;
    let sellCount = 0;
    let sellAmount = 0;
    let sellUnits = 0;
    const affectedInvestorIds = new Set<string>();
    const affectedAccountIds = new Set<string>();

    matchingTransactions.forEach(t => {
      const amount = Number(t.totalAmount) || 0;
      const units = Number(t.units) || 0;
      if (t.investorId) affectedInvestorIds.add(t.investorId);
      if (t.accountId) affectedAccountIds.add(t.accountId);

      if (t.type === 'BUY') {
        buyCount++;
        buyAmount += amount;
        buyUnits += units;
      } else {
        sellCount++;
        sellAmount += amount;
        sellUnits += units;
      }
    });

    return {
      totalCount: matchingTransactions.length,
      buyCount,
      buyAmount,
      buyUnits,
      sellCount,
      sellAmount,
      sellUnits,
      investorsCount: affectedInvestorIds.size,
      accountsCount: affectedAccountIds.size
    };
  }, [matchingTransactions]);

  const handleDelete = async () => {
    if (summary.totalCount === 0 || !selectedDate) return;

    setIsDeleting(true);
    const toastId = toast.loading(`Deleting ${summary.totalCount} transaction(s) recorded on ${selectedDate}...`);

    try {
      const res = await deleteTransactionsOnDate(
        selectedDate, 
        selectedAccountId === 'ALL' ? undefined : selectedAccountId, 
        transactions, 
        investors, 
        accounts
      );

      toast.success(
        `Successfully deleted ${res.count} transaction(s) on ${selectedDate} & updated fund balances!`, 
        { id: toastId }
      );

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Batch delete error:', err);
      toast.error(`Error deleting transactions: ${err?.message || 'Operation failed'}`, { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl relative"
        >
          {/* Header */}
          <div className="p-6 bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>Batch Delete Transactions by Date</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select a date to purge records and atomically reconcile balances
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              disabled={isDeleting}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Filters Row: Date Input & Account Picker */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  Target Transaction Date
                </label>
                <input 
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-red-500/80 transition-colors font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-blue-400" />
                  Filter by Fund Account
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-red-500/80 transition-colors"
                >
                  <option value="ALL">All Funds & Accounts</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.ticker})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Date Suggestion Chips */}
            {dateCounts.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Quick Select Dates with Recorded Transactions
                </span>
                <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto pr-1">
                  {dateCounts.slice(0, 6).map(({ date, count }) => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 border ${
                        selectedDate === date 
                          ? 'bg-red-500/20 border-red-500 text-white font-bold shadow-md shadow-red-950/30' 
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span>{date}</span>
                      <span className="bg-slate-800 px-1.5 py-0.2 rounded text-[10px] text-slate-300 font-sans">
                        {count} txs
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Impact Analysis Breakdown */}
            {summary.totalCount > 0 ? (
              <div className="space-y-3">
                <div className="p-4 bg-slate-950/80 border border-slate-800/90 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      Impact Breakdown for {selectedDate}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-red-500/20 border border-red-500/40 text-red-400 font-mono">
                      {summary.totalCount} Record{summary.totalCount > 1 ? 's' : ''} Target
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1">
                      <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Subscriptions (BUY)</span>
                      </div>
                      <p className="text-sm font-bold text-white font-mono">{formatCurrency(summary.buyAmount)}</p>
                      <p className="text-[10px] text-slate-400">{summary.buyCount} txs • {summary.buyUnits.toLocaleString()} units</p>
                    </div>

                    <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-1">
                      <div className="flex items-center gap-1.5 text-red-400 font-bold">
                        <ArrowDownRight className="w-3.5 h-3.5" />
                        <span>Redemptions (SELL)</span>
                      </div>
                      <p className="text-sm font-bold text-white font-mono">{formatCurrency(summary.sellAmount)}</p>
                      <p className="text-[10px] text-slate-400">{summary.sellCount} txs • {summary.sellUnits.toLocaleString()} units</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-400" />
                      <span>{summary.investorsCount} Affected Investor(s)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-teal-400" />
                      <span>{summary.accountsCount} Affected Fund Account(s)</span>
                    </div>
                  </div>
                </div>

                {/* Automated Reconciliation Promise */}
                <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1.5 text-xs text-slate-400">
                  <p className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Automated Atomic Balance Adjustments:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-400">
                    <li>Reverts investor unit holdings and total investment contributions.</li>
                    <li>Restores fund account cash balances and total units issued.</li>
                    <li>Automatically recalculates Fund AUM & daily NAV.</li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-950/60 border border-slate-800/80 rounded-2xl space-y-2">
                <Calendar className="w-10 h-10 text-slate-700 mx-auto" />
                <p className="text-sm font-semibold text-slate-300">No Transactions Found</p>
                <p className="text-xs text-slate-500">
                  There are no transaction records matching <span className="text-slate-300 font-mono">{selectedDate}</span>
                  {selectedAccountId !== 'ALL' && ' on the selected fund'}.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isDeleting}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 border border-slate-700 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting || summary.totalCount === 0}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white flex items-center gap-2 transition-all shadow-lg shadow-red-950/40"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deleting & Reconciling...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete {summary.totalCount > 0 ? `${summary.totalCount} Record${summary.totalCount > 1 ? 's' : ''}` : 'Records'}</span>
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
