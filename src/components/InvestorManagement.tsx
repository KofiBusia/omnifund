import React, { useState, useMemo, useEffect } from 'react';
import { Investor, InvestmentAccount, Transaction, Valuation } from '../types';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  UserPlus, 
  FileText, 
  Mail, 
  ExternalLink, 
  ChevronRight, 
  ArrowUpRight, 
  ArrowDownRight,
  Users,
  Briefcase,
  ArrowRightLeft,
  X,
  TrendingUp,
  DollarSign,
  Upload,
  Loader2,
  AlertTriangle,
  Activity,
  BarChart3,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { addDoc, collection, serverTimestamp, doc, updateDoc, increment, runTransaction, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import Papa from 'papaparse';

import { cn, formatCurrency } from '../lib/utils';
import TransactionHistory from './TransactionHistory';
import BulkTransactionModal from './BulkTransactionModal';
import StatementModal from './StatementModal';
import EmailInvestorModal from './EmailInvestorModal';
import BulkEmailModal from './BulkEmailModal';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Legend
} from 'recharts';

interface InvestorManagementProps {
  investors: Investor[];
  fund: InvestmentAccount | null;
  accounts: InvestmentAccount[];
  transactions: Transaction[];
  valuations: Valuation[];
  initialSearchTerm?: string;
}

export default function InvestorManagement({ 
  investors, 
  fund, 
  accounts, 
  transactions, 
  valuations,
  initialSearchTerm = ''
}: InvestorManagementProps) {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);

  useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
    }
  }, [initialSearchTerm]);
  useEffect(() => {
    checkGmailStatus();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setIsGmailConnected(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkGmailStatus = async () => {
    try {
      const res = await fetch('/api/auth/google/status');
      const data = await res.json();
      setIsGmailConnected(data.connected);
    } catch (error) {
      console.error('Failed to check Gmail status');
    }
  };

  const handleConnectGmail = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const { url } = await res.json();
      window.open(url, 'google_auth', 'width=600,height=700');
    } catch (error) {
      console.error('Failed to get auth URL');
    }
  };

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isBulkEmailModalOpen, setIsBulkEmailModalOpen] = useState(false);
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [selectedInvestor, setSelectedInvestor] = useState<Investor | null>(null);
  const [selectedInvestorForStatement, setSelectedInvestorForStatement] = useState<Investor | null>(null);
  const [selectedInvestorForEmail, setSelectedInvestorForEmail] = useState<Investor | null>(null);
  
  const [newInvestor, setNewInvestor] = useState({ 
    name: '', 
    email: '', 
    investmentAmount: 0,
    accountId: fund?.id || (accounts.length > 0 ? accounts[0].id : '')
  });

  const [transaction, setTransaction] = useState({
    type: 'BUY' as 'BUY' | 'SELL',
    amount: 0,
    units: 0
  });

  const handleBackfillIds = async () => {
    const missingIds = investors.filter(i => !i.investorId);
    if (missingIds.length === 0) return;

    setIsBackfilling(true);
    try {
      const batch = writeBatch(db);
      missingIds.forEach(investor => {
        const newId = `INV-${Math.floor(100000 + Math.random() * 900000)}`;
        const ref = doc(db, 'investors', investor.id);
        batch.update(ref, { investorId: newId });
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'investors');
    } finally {
      setIsBackfilling(false);
    }
  };

  const filteredInvestors = investors.filter(i => 
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (i.investorId && i.investorId.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleExportCSV = () => {
    const exportData = filteredInvestors.map(investor => ({
      'Investor ID': investor.investorId || 'N/A',
      'Name': investor.name,
      'Email': investor.email,
      'Account ID': investor.accountId,
      'Units Owned': investor.unitsOwned.toFixed(4),
      'Total Investment (GHS)': investor.totalInvestment.toFixed(2),
      'Current Value (GHS)': investor.currentValue.toFixed(2),
      'Gain/Loss (GHS)': (investor.currentValue - investor.totalInvestment).toFixed(2),
      'Gain/Loss (%)': investor.totalInvestment > 0 
        ? (((investor.currentValue - investor.totalInvestment) / investor.totalInvestment) * 100).toFixed(2) + '%'
        : '0.00%'
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `OmniFund_Investors_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedAccount = accounts.find(a => a.id === newInvestor.accountId) || fund;
    if (!selectedAccount) return;

    const currentNav = selectedAccount.nav || 1.0000;
    const unitsToAllocate = newInvestor.investmentAmount / currentNav;
    const investorId = `INV-${Math.floor(100000 + Math.random() * 900000)}`;

    try {
      await runTransaction(db, async (dbTransaction) => {
        const accountRef = doc(db, 'accounts', selectedAccount.id);
        
        // 1. Create investor
        const investorRef = doc(collection(db, 'investors'));
        dbTransaction.set(investorRef, {
          investorId,
          name: newInvestor.name,
          email: newInvestor.email,
          accountId: newInvestor.accountId,
          unitsOwned: unitsToAllocate,
          totalInvestment: newInvestor.investmentAmount,
          currentValue: newInvestor.investmentAmount,
          uid: `manual_${Date.now()}`
        });

        // 2. Update account total units and cash balance
        dbTransaction.update(accountRef, {
          totalUnits: increment(unitsToAllocate),
          cashBalance: increment(newInvestor.investmentAmount)
        });

        // 3. Record transaction
        const transRef = doc(collection(db, 'transactions'));
        dbTransaction.set(transRef, {
          investorId: investorRef.id,
          accountId: newInvestor.accountId,
          type: 'BUY',
          units: unitsToAllocate,
          pricePerUnit: currentNav,
          totalAmount: newInvestor.investmentAmount,
          timestamp: new Date().toISOString()
        });
      });

      setIsAddModalOpen(false);
      setNewInvestor({ ...newInvestor, name: '', email: '', investmentAmount: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'investors');
    }
  };

  const handleProcessTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvestor) return;
    
    const selectedAccount = accounts.find(a => a.id === selectedInvestor.accountId);
    if (!selectedAccount) return;

    const currentNav = selectedAccount.nav || 1.0000;
    
    try {
      await runTransaction(db, async (dbTransaction) => {
        const accountRef = doc(db, 'accounts', selectedAccount.id);
        const investorRef = doc(db, 'investors', selectedInvestor.id);
        
        let unitsToChange = 0;
        let amountToChange = 0;

        if (transaction.type === 'BUY') {
          unitsToChange = transaction.amount / currentNav;
          amountToChange = transaction.amount;
        } else {
          unitsToChange = -transaction.units;
          amountToChange = transaction.units * currentNav;
        }

        // 1. Update investor
        dbTransaction.update(investorRef, {
          unitsOwned: increment(unitsToChange),
          totalInvestment: increment(transaction.type === 'BUY' ? amountToChange : -amountToChange)
        });

        // 2. Update account total units and cash balance
        dbTransaction.update(accountRef, {
          totalUnits: increment(unitsToChange),
          cashBalance: increment(transaction.type === 'BUY' ? amountToChange : -amountToChange)
        });

        // 3. Record transaction
        const transRef = doc(collection(db, 'transactions'));
        dbTransaction.set(transRef, {
          investorId: selectedInvestor.id,
          accountId: selectedAccount.id,
          type: transaction.type,
          units: Math.abs(unitsToChange),
          pricePerUnit: currentNav,
          totalAmount: amountToChange,
          timestamp: new Date().toISOString()
        });
      });

      setIsTransactionModalOpen(false);
      setTransaction({ type: 'BUY', amount: 0, units: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'transactions');
    }
  };

  const investorPerformanceData = useMemo(() => {
    if (!selectedInvestor) return [];

    const investorTransactions = transactions
      .filter(t => t.investorId === selectedInvestor.id)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const fundValuations = valuations
      .filter(v => v.accountId === selectedInvestor.accountId)
      .sort((a, b) => {
        const dateA = a.date?.seconds ? a.date.seconds * 1000 : new Date(a.date).getTime();
        const dateB = b.date?.seconds ? b.date.seconds * 1000 : new Date(b.date).getTime();
        return dateA - dateB;
      });

    // Combine all relevant dates
    const allDates = new Set<string>();
    investorTransactions.forEach(t => allDates.add(new Date(t.timestamp).toISOString().split('T')[0]));
    fundValuations.forEach(v => {
      const date = v.date?.seconds ? new Date(v.date.seconds * 1000) : new Date(v.date);
      allDates.add(date.toISOString().split('T')[0]);
    });

    const sortedDates = Array.from(allDates).sort();
    
    let currentUnits = 0;
    let currentCostBasis = 0;
    let lastNav = accounts.find(a => a.id === selectedInvestor.accountId)?.nav || 1.0;

    return sortedDates.map(dateStr => {
      const date = new Date(dateStr);
      
      // Update units and cost basis based on transactions up to this date
      const dayTransactions = investorTransactions.filter(t => new Date(t.timestamp).toISOString().split('T')[0] === dateStr);
      dayTransactions.forEach(t => {
        if (t.type === 'BUY') {
          currentUnits += t.units;
          currentCostBasis += t.totalAmount;
        } else {
          currentUnits -= t.units;
          currentCostBasis -= t.totalAmount;
        }
      });

      // Find the NAV at this date (or the latest one before it)
      const dayValuation = fundValuations.find(v => {
        const vDate = v.date?.seconds ? new Date(v.date.seconds * 1000) : new Date(v.date);
        return vDate.toISOString().split('T')[0] === dateStr;
      });
      
      if (dayValuation) {
        lastNav = dayValuation.nav;
      } else {
        // If no valuation on this exact day, find the most recent one before this date
        const previousValuations = fundValuations.filter(v => {
          const vDate = v.date?.seconds ? new Date(v.date.seconds * 1000) : new Date(v.date);
          return vDate.getTime() < date.getTime();
        });
        if (previousValuations.length > 0) {
          lastNav = previousValuations[previousValuations.length - 1].nav;
        }
      }

      const currentValue = currentUnits * lastNav;
      const gainLoss = currentValue - currentCostBasis;
      const gainLossPct = currentCostBasis > 0 ? (gainLoss / currentCostBasis) * 100 : 0;

      return {
        date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        totalInvestment: currentCostBasis,
        currentValue: currentValue,
        gainLossPct: gainLossPct,
        timestamp: date.getTime()
      };
    });
  }, [selectedInvestor, transactions, valuations, accounts]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Investor Registry</h2>
          <p className="text-slate-400 mt-1">Manage {investors.length} active fund participants</p>
        </div>
        <div className="flex items-center gap-4">
          {investors.some(i => !i.investorId) && (
            <button 
              onClick={handleBackfillIds}
              disabled={isBackfilling}
              className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 px-4 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all border border-amber-500/20"
            >
              {isBackfilling ? <Loader2 className="w-5 h-5 animate-spin" /> : <AlertTriangle className="w-5 h-5" />}
              Generate Missing IDs
            </button>
          )}
          <button 
            onClick={handleConnectGmail}
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all border",
              isGmailConnected 
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                : "bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20"
            )}
          >
            <Mail className="w-5 h-4" />
            {isGmailConnected ? 'Gmail Connected' : 'Connect Gmail'}
          </button>
          <button 
            onClick={() => setIsBulkEmailModalOpen(true)}
            disabled={!isGmailConnected || filteredInvestors.length === 0}
            className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white px-4 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all border border-slate-700"
          >
            <Users className="w-5 h-5" />
            Send to All
          </button>
          <button 
            onClick={handleExportCSV}
            className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all border border-slate-700"
          >
            <Download className="w-5 h-5" />
            Export CSV
          </button>
          <button 
            onClick={() => setIsBulkModalOpen(true)}
            className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all border border-slate-700"
          >
            <Upload className="w-5 h-5" />
            Bulk Actions
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
          >
            <UserPlus className="w-5 h-5" />
            Add Investor
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4 bg-slate-900/50 p-2 rounded-2xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent border-none focus:ring-0 pl-12 pr-4 py-3 text-slate-200 placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Investors Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800/50 border-b border-slate-800">
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">ID</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Investor</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Units Owned</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Value</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Performance</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredInvestors.map((investor) => {
              const currentValue = investor.unitsOwned * (fund?.nav || 0);
              const gainLoss = currentValue - investor.totalInvestment;
              const gainLossPct = (gainLoss / investor.totalInvestment) * 100;

              return (
                <motion.tr 
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={investor.id} 
                  className="hover:bg-slate-800/30 transition-colors group"
                >
                  <td className="px-6 py-4">
                    <span className="text-xs font-mono text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                      {investor.investorId || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-emerald-500 font-bold">
                        {investor.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{investor.name}</p>
                        <p className="text-xs text-slate-500">{investor.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-300 font-medium">{investor.unitsOwned.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">Units</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-white font-bold">{formatCurrency(currentValue)}</p>
                    <p className="text-xs text-slate-500">Market Value</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className={cn(
                      "flex items-center gap-1 text-sm font-medium",
                      gainLoss >= 0 ? "text-emerald-500" : "text-red-500"
                    )}>
                      {gainLoss >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      <span>{Math.abs(gainLossPct).toFixed(2)}%</span>
                    </div>
                    <p className="text-xs text-slate-500">Total Return</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => {
                          setSelectedInvestor(investor);
                          setIsTransactionModalOpen(true);
                        }}
                        className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-emerald-500 transition-colors" 
                        title="New Transaction"
                      >
                        <ArrowRightLeft className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedInvestorForStatement(investor);
                          setIsStatementModalOpen(true);
                        }}
                        className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-blue-500 transition-colors" 
                        title="Generate Statement"
                      >
                        <FileText className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedInvestor(investor);
                          setIsHistoryModalOpen(true);
                        }}
                        className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors" 
                        title="View History"
                      >
                        <BarChart3 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedInvestorForEmail(investor);
                          setIsEmailModalOpen(true);
                        }}
                        disabled={!isGmailConnected}
                        className={cn(
                          "p-2 rounded-lg transition-colors",
                          isGmailConnected 
                            ? "hover:bg-slate-700 text-slate-400 hover:text-blue-400" 
                            : "opacity-30 cursor-not-allowed text-slate-600"
                        )}
                        title={isGmailConnected ? "Send Email" : "Connect Gmail to send emails"}
                      >
                        <Mail className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        {filteredInvestors.length === 0 && (
          <div className="py-20 text-center">
            <Users className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500">No investors found matching your search.</p>
          </div>
        )}
      </div>

      <BulkEmailModal 
        isOpen={isBulkEmailModalOpen}
        onClose={() => setIsBulkEmailModalOpen(false)}
        investors={filteredInvestors}
        accounts={accounts}
        isGmailConnected={isGmailConnected}
      />

      <EmailInvestorModal 
        isOpen={isEmailModalOpen}
        onClose={() => {
          setIsEmailModalOpen(false);
          setSelectedInvestorForEmail(null);
        }}
        investor={selectedInvestorForEmail}
        fund={accounts.find(a => a.id === selectedInvestorForEmail?.accountId) || null}
        isGmailConnected={isGmailConnected}
      />

      {/* Add Investor Modal */}
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
              <h3 className="text-2xl font-bold text-white mb-6">Register New Investor</h3>
              <form onSubmit={handleAddInvestor} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Full Name</label>
                  <input 
                    required
                    type="text" 
                    value={newInvestor.name}
                    onChange={(e) => setNewInvestor({...newInvestor, name: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Email Address</label>
                  <input 
                    required
                    type="email" 
                    value={newInvestor.email}
                    onChange={(e) => setNewInvestor({...newInvestor, email: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Investment Account</label>
                  <select 
                    required
                    value={newInvestor.accountId}
                    onChange={(e) => setNewInvestor({...newInvestor, accountId: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.ticker})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Initial Investment (GH₵)</label>
                  <input 
                    required
                    type="number" 
                    value={newInvestor.investmentAmount}
                    onChange={(e) => setNewInvestor({...newInvestor, investmentAmount: Number(e.target.value)})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="0.00"
                  />
                  <p className="text-[10px] text-slate-500 italic">
                    Units will be allocated based on current NAV: {formatCurrency(accounts.find(a => a.id === newInvestor.accountId)?.nav || 1.0000)}
                  </p>
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
                    Register Investor
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction Modal */}
      <AnimatePresence>
        {isTransactionModalOpen && selectedInvestor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTransactionModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-white">Fund Transaction</h3>
                  <p className="text-slate-400 text-sm">Investor: {selectedInvestor.name}</p>
                </div>
                <button 
                  onClick={() => setIsTransactionModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleProcessTransaction} className="space-y-6">
                <div className="flex p-1 bg-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setTransaction({ ...transaction, type: 'BUY' })}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                      transaction.type === 'BUY' ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    Subscription (Buy)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransaction({ ...transaction, type: 'SELL' })}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                      transaction.type === 'SELL' ? "bg-red-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    Redemption (Sell)
                  </button>
                </div>

                {transaction.type === 'BUY' ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Investment Amount (GH₵)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                      <input 
                        required
                        type="number" 
                        value={transaction.amount}
                        onChange={(e) => setTransaction({...transaction, amount: Number(e.target.value)})}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 italic">
                      Estimated Units: {(transaction.amount / (accounts.find(a => a.id === selectedInvestor.accountId)?.nav || 1)).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Units to Redeem</label>
                    <div className="relative">
                      <TrendingUp className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                      <input 
                        required
                        type="number" 
                        max={selectedInvestor.unitsOwned}
                        value={transaction.units}
                        onChange={(e) => setTransaction({...transaction, units: Number(e.target.value)})}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white focus:ring-2 focus:ring-red-500 outline-none transition-all"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 italic">
                      Available Units: {selectedInvestor.unitsOwned.toLocaleString()} | Estimated Payout: {formatCurrency(transaction.units * (accounts.find(a => a.id === selectedInvestor.accountId)?.nav || 1))}
                    </p>
                  </div>
                )}

                <div className="bg-slate-800/50 border border-slate-800 p-4 rounded-2xl">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">Current NAV</span>
                    <span className="text-white font-bold">{formatCurrency(accounts.find(a => a.id === selectedInvestor.accountId)?.nav || 1.0000)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Account</span>
                    <span className="text-white font-bold">{accounts.find(a => a.id === selectedInvestor.accountId)?.name}</span>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsTransactionModalOpen(false)}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className={cn(
                      "flex-1 py-3 px-4 text-white font-semibold rounded-xl transition-all shadow-lg",
                      transaction.type === 'BUY' ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20" : "bg-red-600 hover:bg-red-500 shadow-red-600/20"
                    )}
                  >
                    Process {transaction.type === 'BUY' ? 'Subscription' : 'Redemption'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Investor History Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && selectedInvestor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-5xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-white">Investor Performance & History</h3>
                  <p className="text-slate-400">{selectedInvestor.name} ({selectedInvestor.email})</p>
                </div>
                <button 
                  onClick={() => {
                    setIsHistoryModalOpen(false);
                    setSelectedInvestor(null);
                  }}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Performance Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Investment Growth Chart */}
                <div className="bg-slate-800/50 border border-slate-800 p-6 rounded-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      Investment Value vs Cost
                    </h4>
                    <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-slate-400">Current Value</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-slate-500" />
                        <span className="text-slate-400">Total Cost</span>
                      </div>
                    </div>
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={investorPerformanceData}>
                        <defs>
                          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          stroke="#64748b" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false}
                        />
                        <YAxis 
                          stroke="#64748b" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false}
                          tickFormatter={(value) => `GH₵${(value / 1000).toFixed(0)}k`}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                          formatter={(value: number) => [formatCurrency(value), '']}
                        />
                        <Area type="monotone" dataKey="currentValue" stroke="#10b981" fillOpacity={1} fill="url(#colorValue)" strokeWidth={2} name="Current Value" />
                        <Area type="monotone" dataKey="totalInvestment" stroke="#64748b" fill="transparent" strokeWidth={2} strokeDasharray="5 5" name="Total Cost" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Percentage Return Chart */}
                <div className="bg-slate-800/50 border border-slate-800 p-6 rounded-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-500" />
                      Return Percentage (%)
                    </h4>
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={investorPerformanceData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          stroke="#64748b" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false}
                        />
                        <YAxis 
                          stroke="#64748b" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false}
                          tickFormatter={(value) => `${value.toFixed(1)}%`}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                          formatter={(value: number) => [`${value.toFixed(2)}%`, 'Return']}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="gainLossPct" 
                          stroke="#3b82f6" 
                          strokeWidth={3} 
                          dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#0f172a' }}
                          activeDot={{ r: 6, strokeWidth: 0 }}
                          name="Return %"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-slate-800/30 border border-slate-800 p-4 rounded-2xl">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Total Invested</p>
                  <p className="text-xl font-bold text-white">{formatCurrency(selectedInvestor.totalInvestment)}</p>
                </div>
                <div className="bg-slate-800/30 border border-slate-800 p-4 rounded-2xl">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Current Value</p>
                  <p className="text-xl font-bold text-emerald-500">{formatCurrency(selectedInvestor.unitsOwned * (accounts.find(a => a.id === selectedInvestor.accountId)?.nav || 0))}</p>
                </div>
                <div className="bg-slate-800/30 border border-slate-800 p-4 rounded-2xl">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Total Gain/Loss</p>
                  <p className={cn(
                    "text-xl font-bold",
                    (selectedInvestor.unitsOwned * (accounts.find(a => a.id === selectedInvestor.accountId)?.nav || 0) - selectedInvestor.totalInvestment) >= 0 ? "text-emerald-500" : "text-red-500"
                  )}>
                    {formatCurrency(selectedInvestor.unitsOwned * (accounts.find(a => a.id === selectedInvestor.accountId)?.nav || 0) - selectedInvestor.totalInvestment)}
                  </p>
                </div>
              </div>

              <TransactionHistory 
                transactions={transactions} 
                accounts={accounts} 
                investors={investors} 
                filterByInvestorId={selectedInvestor.id}
                title="Investor Transactions"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction History */}
      <div className="pt-8 border-t border-slate-800">
        <TransactionHistory 
          transactions={transactions} 
          accounts={accounts} 
          investors={investors} 
          title="Recent Fund Transactions"
        />
      </div>

      <BulkTransactionModal 
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        investors={investors}
        accounts={accounts}
      />

      <StatementModal 
        isOpen={isStatementModalOpen}
        onClose={() => {
          setIsStatementModalOpen(false);
          setSelectedInvestorForStatement(null);
        }}
        investor={selectedInvestorForStatement}
        fund={fund}
        accounts={accounts}
        transactions={transactions}
        valuations={valuations}
        isGmailConnected={isGmailConnected}
      />
    </div>
  );
}
