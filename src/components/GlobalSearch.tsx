import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Users, 
  PieChart, 
  ArrowRightLeft, 
  X, 
  Command,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Investor, InvestmentAccount, Transaction } from '../types';
import { formatCurrency, cn } from '../lib/utils';

interface GlobalSearchProps {
  investors: Investor[];
  accounts: InvestmentAccount[];
  transactions: Transaction[];
  onSelectInvestor: (investor: Investor) => void;
  onSelectAccount: (account: InvestmentAccount) => void;
  onSelectTab: (tab: string) => void;
}

export default function GlobalSearch({ 
  investors, 
  accounts, 
  transactions,
  onSelectInvestor,
  onSelectAccount,
  onSelectTab
}: GlobalSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{
    investors: Investor[];
    accounts: InvestmentAccount[];
    transactions: (Transaction & { investorName?: string })[];
  }>({ investors: [], accounts: [], transactions: [] });
  
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults({ investors: [], accounts: [], transactions: [] });
      return;
    }

    const q = query.toLowerCase();

    const filteredInvestors = investors.filter(i => 
      i.name.toLowerCase().includes(q) || 
      i.investorId.toLowerCase().includes(q) ||
      i.email.toLowerCase().includes(q)
    ).slice(0, 5);

    const filteredAccounts = accounts.filter(a => 
      a.name.toLowerCase().includes(q) || 
      a.ticker.toLowerCase().includes(q)
    ).slice(0, 3);

    const filteredTransactions = transactions.filter(t => {
      const investor = investors.find(i => i.id === t.investorId);
      const investorName = investor?.name || '';
      return (
        t.type.toLowerCase().includes(q) ||
        investorName.toLowerCase().includes(q) ||
        t.totalAmount.toString().includes(q)
      );
    }).map(t => ({
      ...t,
      investorName: investors.find(i => i.id === t.investorId)?.name
    })).slice(0, 5);

    setResults({
      investors: filteredInvestors,
      accounts: filteredAccounts,
      transactions: filteredTransactions
    });
  }, [query, investors, accounts, transactions]);

  const handleSelect = (type: 'investor' | 'account' | 'transaction', item: any) => {
    setIsOpen(false);
    setQuery('');
    
    if (type === 'investor') {
      onSelectTab('investors');
      onSelectInvestor(item);
    } else if (type === 'account') {
      onSelectTab('accounts');
      onSelectAccount(item);
    } else if (type === 'transaction') {
      onSelectTab('investors'); // Transactions are usually viewed in investor history
      const investor = investors.find(i => i.id === item.investorId);
      if (investor) onSelectInvestor(investor);
    }
  };

  return (
    <>
      {/* Trigger Button */}
      <button 
        onClick={() => setIsOpen(true)}
        className="hidden md:flex items-center gap-3 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-all w-64 group"
      >
        <Search className="w-4 h-4 group-hover:text-emerald-500 transition-colors" />
        <span className="text-sm flex-1 text-left">Search...</span>
        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-[10px] font-bold">
          <Command className="w-2.5 h-2.5" />
          <span>K</span>
        </div>
      </button>

      {/* Search Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-slate-800 flex items-center gap-3">
                <Search className="w-5 h-5 text-emerald-500" />
                <input 
                  ref={inputRef}
                  type="text" 
                  placeholder="Search investors, accounts, transactions..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-white placeholder-slate-500 text-lg"
                />
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto p-2 custom-scrollbar">
                {!query && (
                  <div className="p-8 text-center space-y-4">
                    <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto">
                      <Search className="w-6 h-6 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-slate-300 font-medium">Search OmniFund</p>
                      <p className="text-slate-500 text-sm">Find anything across your fund management system</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 pt-4">
                      {['Investors', 'NAV History', 'Transactions', 'Accounts'].map(tag => (
                        <button 
                          key={tag}
                          onClick={() => setQuery(tag)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs transition-all"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {query && (
                  <div className="space-y-4 p-2">
                    {/* Investors */}
                    {results.investors.length > 0 && (
                      <div className="space-y-1">
                        <h4 className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                          <Users className="w-3 h-3" />
                          Investors
                        </h4>
                        {results.investors.map(investor => (
                          <button
                            key={investor.id}
                            onClick={() => handleSelect('investor', investor)}
                            className="w-full flex items-center gap-3 p-3 hover:bg-slate-800 rounded-xl transition-all group text-left"
                          >
                            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold">
                              {investor.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{investor.name}</p>
                              <p className="text-xs text-slate-500 truncate">{investor.investorId} • {investor.email}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-500 transition-all transform group-hover:translate-x-1" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Accounts */}
                    {results.accounts.length > 0 && (
                      <div className="space-y-1">
                        <h4 className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                          <PieChart className="w-3 h-3" />
                          Accounts
                        </h4>
                        {results.accounts.map(account => (
                          <button
                            key={account.id}
                            onClick={() => handleSelect('account', account)}
                            className="w-full flex items-center gap-3 p-3 hover:bg-slate-800 rounded-xl transition-all group text-left"
                          >
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 font-bold">
                              {account.ticker}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{account.name}</p>
                              <p className="text-xs text-slate-500 truncate">NAV: {formatCurrency(account.nav)}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-blue-500 transition-all transform group-hover:translate-x-1" />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Transactions */}
                    {results.transactions.length > 0 && (
                      <div className="space-y-1">
                        <h4 className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                          <ArrowRightLeft className="w-3 h-3" />
                          Transactions
                        </h4>
                        {results.transactions.map(transaction => (
                          <button
                            key={transaction.id}
                            onClick={() => handleSelect('transaction', transaction)}
                            className="w-full flex items-center gap-3 p-3 hover:bg-slate-800 rounded-xl transition-all group text-left"
                          >
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs",
                              transaction.type === 'BUY' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                            )}>
                              {transaction.type}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white truncate">{transaction.investorName}</p>
                              <p className="text-xs text-slate-500 truncate">
                                {formatCurrency(transaction.totalAmount)} • {new Date(transaction.timestamp).toLocaleDateString()}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-200 transition-all transform group-hover:translate-x-1" />
                          </button>
                        ))}
                      </div>
                    )}

                    {results.investors.length === 0 && results.accounts.length === 0 && results.transactions.length === 0 && (
                      <div className="p-12 text-center text-slate-500">
                        No results found for "{query}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-3 bg-slate-950/50 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300">ESC</kbd>
                    to close
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300">↑↓</kbd>
                    to navigate
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  Powered by <span className="text-emerald-500 font-bold">OmniSearch</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
