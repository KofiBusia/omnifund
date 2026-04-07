import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, InvestmentAccount, Investor } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { 
  Search, 
  Filter, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar, 
  ArrowUpDown,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TransactionHistoryProps {
  transactions: Transaction[];
  accounts: InvestmentAccount[];
  investors: Investor[];
  filterByAccountId?: string;
  filterByInvestorId?: string;
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

  // Re-render every 10 seconds to update 'NEW' badges
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

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
      if (dateRange.start && new Date(t.timestamp) < new Date(dateRange.start)) return false;
      if (dateRange.end) {
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        if (new Date(t.timestamp) > endDate) return false;
      }

      // Search by investor name or account name
      const investor = investors.find(i => i.id === t.investorId);
      const account = accounts.find(a => a.id === t.accountId);
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
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [transactions, searchTerm, typeFilter, accountFilter, dateRange, sortField, sortOrder, investors, accounts, filterByAccountId, filterByInvestorId]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredAndSortedTransactions.map((t) => {
                const investor = investors.find(i => i.id === t.investorId);
                const account = accounts.find(a => a.id === t.accountId);
                const isNew = (Date.now() - new Date(t.timestamp).getTime()) < 30000; // 30 seconds
                
                return (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ 
                      opacity: 1, 
                      x: 0,
                      backgroundColor: isNew ? 'rgba(16, 185, 129, 0.05)' : 'transparent'
                    }}
                    key={t.id} 
                    className="hover:bg-slate-800/30 transition-colors relative overflow-hidden"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col relative">
                        {isNew && (
                          <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1 h-4 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                        )}
                        <span className="text-sm text-slate-300 font-medium flex items-center gap-2">
                          {new Date(t.timestamp).toLocaleDateString()}
                          {isNew && (
                            <span className="text-[8px] bg-emerald-500 text-white px-1 rounded font-bold animate-pulse">NEW</span>
                          )}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
    </div>
  );
}
