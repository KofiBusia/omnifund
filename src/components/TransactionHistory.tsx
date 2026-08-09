import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, InvestmentAccount, Investor } from '../types';
import { formatCurrency, cn, safeDate, safeFormatDate, safeTimestamp } from '../lib/utils';
import { 
  Search, 
  Filter, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar, 
  ArrowUpDown,
  X,
  Download,
  Trash2,
  Edit3,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { toast } from 'sonner';

interface TransactionHistoryProps {
  transactions: Transaction[];
  accounts: InvestmentAccount[];
  investors: Investor[];
  filterByAccountId?: string;
  filterByInvestorId?: string;
  highlightedId?: string | null;
  onEditTransaction?: (transaction: Transaction) => void;
  onDeleteTransaction?: (transaction: Transaction) => void;
  title?: string;
}

type SortField = 'timestamp' | 'totalAmount' | 'units';
type SortOrder = 'asc' | 'desc';

export default function TransactionHistory({ 
  transactions, 
  accounts, 
  investors,
  filterByAccountId,
  filterByInvestorId,
  highlightedId,
  onEditTransaction,
  onDeleteTransaction,
  title = "Transaction History"
}: TransactionHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [accountFilter, setAccountFilter] = useState<string>(filterByAccountId || 'ALL');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [, setTick] = useState(0);
  
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Handle highlighting
  useEffect(() => {
    if (highlightedId) {
      const element = document.getElementById(`tx-${highlightedId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedId]);

  // Re-render every 10 seconds to update 'NEW' badges
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  // Pre-calculate lookups for O(1) access mapping during render
  const lookups = useMemo(() => {
    const investorMap = new Map<string, Investor>();
    const accountMap = new Map<string, InvestmentAccount>();
    
    investors.forEach(i => investorMap.set(i.id, i));
    accounts.forEach(a => accountMap.set(a.id, a));
    
    return { investorMap, accountMap };
  }, [investors, accounts]);

  const filteredAndSortedTransactions = useMemo(() => {
    let result = transactions.filter(t => {
      // Filter by account
      if (filterByAccountId && t.accountId !== filterByAccountId) return false;
      if (accountFilter !== 'ALL' && t.accountId !== accountFilter) return false;

      // Filter by investor
      if (filterByInvestorId && t.investorId !== filterByInvestorId) return false;

      // Filter by type
      if (typeFilter !== 'ALL' && t.type !== typeFilter) return false;

      // Filter by date range
      const tDate = safeDate(t.timestamp);
      if (dateRange.start) {
        const startDate = safeDate(dateRange.start);
        if (startDate && (!tDate || tDate < startDate)) return false;
      }
      if (dateRange.end) {
        const endDate = safeDate(dateRange.end);
        if (endDate) {
          endDate.setHours(23, 59, 59, 999);
          if (!tDate || tDate > endDate) return false;
        }
      }

      // Search by investor name or account name
      const investor = lookups.investorMap.get(t.investorId);
      const account = lookups.accountMap.get(t.accountId);
      const searchMatch = 
        investor?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        account?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.type.toLowerCase().includes(searchTerm.toLowerCase());
      
      return searchMatch;
    });

    // Sort
    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'timestamp') {
        valA = safeTimestamp(valA);
        valB = safeTimestamp(valB);
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [transactions, searchTerm, typeFilter, accountFilter, dateRange, sortField, sortOrder, lookups, filterByAccountId, filterByInvestorId]);

  const handleExportCSV = () => {
    const exportData = filteredAndSortedTransactions.map(t => {
      const investor = lookups.investorMap.get(t.investorId);
      const account = lookups.accountMap.get(t.accountId);
      return {
        'Date': new Date(t.timestamp).toLocaleDateString(),
        'Time': new Date(t.timestamp).toLocaleTimeString(),
        'Investor': investor?.name || 'N/A',
        'Account': account?.name || 'N/A',
        'Type': t.type,
        'Units': t.units.toFixed(4),
        'Price per Unit (GHS)': t.pricePerUnit.toFixed(4),
        'Total Amount (GHS)': t.totalAmount.toFixed(2),
        'Transaction ID': t.id
      };
    });

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `OmniFund_Transactions_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!transactionToDelete || !onDeleteTransaction) return;
    
    setIsDeleting(true);
    const toastId = toast.loading("Deleting transaction and reconciling balances...");
    
    try {
      await onDeleteTransaction(transactionToDelete);
      toast.success("Transaction deleted successfully", { id: toastId });
      setTransactionToDelete(null);
    } catch (error: any) {
      toast.error(`Deletion failed: ${error.message}`, { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Live Updates</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>
          <button 
            onClick={handleExportCSV}
            className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition-all flex items-center gap-2 text-sm font-medium"
            title="Export CSV"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button 
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={cn(
              "p-2 rounded-lg border transition-all flex items-center gap-2 text-sm font-medium",
              isFilterOpen ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500" : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
            )}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filters</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isFilterOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 bg-slate-900/50 border border-slate-800 rounded-xl mb-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Transaction Type</label>
                <select 
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="ALL">All Types</option>
                  <option value="BUY">Subscription (Buy)</option>
                  <option value="SELL">Redemption (Sell)</option>
                </select>
              </div>

              {!filterByAccountId && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account</label>
                  <select 
                    value={accountFilter}
                    onChange={(e) => setAccountFilter(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="ALL">All Accounts</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
                <input 
                  type="date" 
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End Date</label>
                <input 
                  type="date" 
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="md:col-span-3 lg:col-span-4 flex justify-end">
                <button 
                  onClick={() => {
                    setTypeFilter('ALL');
                    setAccountFilter('ALL');
                    setDateRange({ start: '', end: '' });
                    setSearchTerm('');
                  }}
                  className="text-xs text-slate-500 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Reset Filters
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50 border-b border-slate-800">
                <th 
                  className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleSort('timestamp')}
                >
                  <div className="flex items-center gap-2">
                    Date
                    {sortField === 'timestamp' && <ArrowUpDown className={cn("w-3 h-3", sortOrder === 'asc' ? "rotate-180" : "")} />}
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Investor</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
                <th 
                  className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleSort('units')}
                >
                  <div className="flex items-center gap-2">
                    Units
                    {sortField === 'units' && <ArrowUpDown className={cn("w-3 h-3", sortOrder === 'asc' ? "rotate-180" : "")} />}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => toggleSort('totalAmount')}
                >
                  <div className="flex items-center gap-2">
                    Amount
                    {sortField === 'totalAmount' && <ArrowUpDown className={cn("w-3 h-3", sortOrder === 'asc' ? "rotate-180" : "")} />}
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Price/Unit</th>
                {(onEditTransaction || onDeleteTransaction) && <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredAndSortedTransactions.map((t) => {
                const investor = lookups.investorMap.get(t.investorId);
                const account = lookups.accountMap.get(t.accountId);
                const tDate = safeDate(t.timestamp);
                const isNew = tDate ? (Date.now() - tDate.getTime() < 30000) : false;
                
                return (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ 
                      opacity: 1, 
                      x: 0,
                      backgroundColor: highlightedId === t.id ? 'rgba(59, 130, 246, 0.1)' : (isNew ? 'rgba(16, 185, 129, 0.05)' : 'transparent'),
                      outline: highlightedId === t.id ? '2px solid rgba(59, 130, 246, 0.5)' : 'none'
                    }}
                    key={t.id} 
                    id={`tx-${t.id}`}
                    className={cn(
                      "hover:bg-slate-800/30 transition-colors relative overflow-hidden",
                      highlightedId === t.id ? "z-10 shadow-lg" : ""
                    )}
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col relative">
                        {isNew && (
                          <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1 h-4 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                        )}
                        <span className="text-sm text-slate-300 font-medium flex items-baseline gap-2">
                          {safeFormatDate(t.timestamp)}
                          <span className="text-[10px] text-emerald-500 font-mono font-bold">@{formatCurrency(t.pricePerUnit)}</span>
                          {isNew && (
                            <span className="text-[8px] bg-emerald-500 text-white px-1 rounded font-bold animate-pulse">NEW</span>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {tDate ? tDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-white">{investor?.name || 'Unknown'}</span>
                        <span className="text-xs text-slate-500">{account?.ticker || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        t.type === 'BUY' ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
                      )}>
                        {t.type === 'BUY' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {t.type === 'BUY' ? 'Subscription' : 'Redemption'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-300 font-mono">{t.units.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-white font-bold">{formatCurrency(t.totalAmount)}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-xs text-slate-500 font-medium">{formatCurrency(t.pricePerUnit)}</span>
                    </td>
                    {(onEditTransaction || onDeleteTransaction) && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {onEditTransaction && (
                            <button 
                              onClick={() => onEditTransaction(t)}
                              className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-emerald-500 transition-colors"
                              title="Edit Transaction"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {onDeleteTransaction && (
                            <button 
                              onClick={() => setTransactionToDelete(t)}
                              className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                              title="Delete Transaction"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          {filteredAndSortedTransactions.length === 0 && (
            <div className="py-20 text-center">
              <Calendar className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500">No transactions found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>
      <AnimatePresence>
        {transactionToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeleting && setTransactionToDelete(null)}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-2xl font-bold text-white text-center mb-2">Delete Transaction?</h3>
              <p className="text-slate-400 text-center mb-8">
                Are you sure you want to delete this {transactionToDelete.type === 'BUY' ? 'Subscription' : 'Redemption'} of {formatCurrency(transactionToDelete.totalAmount)}?
                <br /><br />
                <span className="text-xs text-red-500/80">This will automatically reverse the impact on investor units and fund cash.</span>
              </p>

              <div className="flex gap-4">
                <button 
                  disabled={isDeleting}
                  onClick={() => setTransactionToDelete(null)}
                  className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  disabled={isDeleting}
                  onClick={handleDeleteConfirm}
                  className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
