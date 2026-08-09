import React, { useState, useEffect, useMemo } from 'react';
import { InvestmentAccount, Investor, Asset, Transaction, Valuation } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { 
  Plus, 
  PieChart, 
  TrendingUp, 
  Users, 
  Briefcase, 
  ArrowUpRight,
  ChevronRight,
  Info,
  Trash2,
  Lock,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Upload,
  X,
  Search,
  Download,
  FileText,
  Loader2,
  Sparkles,
  Wand2,
  CheckCircle2,
  Brain,
  Calendar,
  Copy,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { addDoc, collection, doc, updateDoc, deleteDoc, getDocs, query, where, writeBatch, serverTimestamp, increment, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import TransactionHistory from './TransactionHistory';
import BulkTransactionModal from './BulkTransactionModal';
import FundStatementModal from './FundStatementModal';
import AIAccountAuditor from './AIAccountAuditor';
import AIAccountChat from './AIAccountChat';
import AccountWorkspaceModal from './AccountWorkspaceModal';
import { toast } from 'sonner';
import Papa from 'papaparse';
import { IngestionEngine, IngestionResult } from '../services/ingestionService';
import { STPService } from '../services/stpService';

interface AccountManagementProps {
  accounts: InvestmentAccount[];
  investors: Investor[];
  portfolio: Asset[];
  transactions: Transaction[];
  valuations: Valuation[];
}

const AUTH_PIN = "1234"; // Default PIN for authorization

export default function AccountManagement({ accounts, investors, portfolio, transactions, valuations }: AccountManagementProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<InvestmentAccount | null>(null);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isAIAuditorOpen, setIsAIAuditorOpen] = useState(false);
  const [selectedAccountForAI, setSelectedAccountForAI] = useState<InvestmentAccount | null>(null);
  const [selectedAccountForWorkspace, setSelectedAccountForWorkspace] = useState<InvestmentAccount | null>(null);
  const [selectedAccountForHistory, setSelectedAccountForHistory] = useState<InvestmentAccount | null>(null);
  const [selectedAccountForStatement, setSelectedAccountForStatement] = useState<InvestmentAccount | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [highlightedTransactionId, setHighlightedTransactionId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditTransactionModalOpen, setIsEditTransactionModalOpen] = useState(false);
  const [editTransactionForm, setEditTransactionForm] = useState({
    type: 'BUY' as 'BUY' | 'SELL',
    amount: 0,
    units: 0,
    timestamp: ''
  });

  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestionResult, setIngestionResult] = useState<IngestionResult | null>(null);
  const [ingestionFiles, setIngestionFiles] = useState<{data: string, mimeType: string}[]>([]);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [stpLogs, setStpLogs] = useState<string[]>([]);
  
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [selectedAccountForChat, setSelectedAccountForChat] = useState<InvestmentAccount | null>(null);
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);
  
  const [newAccount, setNewAccount] = useState({
    name: '',
    ticker: '',
    description: '',
    aum: 0,
    nav: 1.0000,
    totalUnits: 0,
    cashBalance: 0
  });

  // Auto-calculate total units when AUM or NAV changes
  useEffect(() => {
    if (newAccount.nav > 0) {
      const calculatedUnits = newAccount.aum / newAccount.nav;
      if (newAccount.totalUnits !== calculatedUnits) {
        setNewAccount(prev => ({ ...prev, totalUnits: calculatedUnits }));
      }
    }
  }, [newAccount.aum, newAccount.nav]);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProvisioning(true);
    try {
      // 1. Create the Account Document
      const docRef = await addDoc(collection(db, 'accounts'), {
        ...newAccount,
        cashBalance: newAccount.aum, // Initial AUM is all cash
        lastValuationDate: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });

      const createdAccount: InvestmentAccount = {
        id: docRef.id,
        ...newAccount,
        cashBalance: newAccount.aum,
        lastValuationDate: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      // 2. If Smart Ingestion was used, Provision the data
      if (ingestionResult) {
        const stp = new STPService();
        // We include the newly created account in the context
        const stpResult = await stp.provision(ingestionResult, { 
          accounts: [...accounts, createdAccount], 
          investors 
        });
        setStpLogs(stpResult.logs);
        console.log("Ingestion Provisioning Result:", stpResult);
      }

      setIsAddModalOpen(false);
      setNewAccount({ name: '', ticker: '', description: '', aum: 0, nav: 1.0000, totalUnits: 0, cashBalance: 0 });
      setIngestionResult(null);
      setIngestionFiles([]);
      setStpLogs([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'accounts');
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleIngestionFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsIngesting(true);
    try {
      const filePromises = Array.from(files).map((file: File) => {
        return new Promise<{ data: string; mimeType: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64Data = (reader.result as string).split(',')[1];
            resolve({ data: base64Data, mimeType: file.type });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const processedFiles = await Promise.all(filePromises);
      setIngestionFiles(processedFiles);
      
      const engine = new IngestionEngine();
      const result = await engine.processCustodianExports(processedFiles, { accounts, investors });
      
      setIngestionResult(result);

      // SMART AUTO-FILL: If the AI found a fund that matches a ticker or name, suggest filling
      if (result.entities.funds.length > 0) {
        const primaryFund = result.entities.funds[0];
        
        // Advanced: Calculate AUM from extracted mappings
        const assetValue = result.mappings.fundToAsset
          .filter(m => m.fundTicker === primaryFund.ticker)
          .reduce((sum, m) => sum + m.value, 0);
          
        const subscriptionValue = result.mappings.investorToFund
          .filter(m => m.fundTicker === primaryFund.ticker)
          .reduce((sum, m) => {
            const fund = result.entities.funds.find(f => f.ticker === m.fundTicker);
            const nav = fund?.nav || primaryFund.nav || newAccount.nav || 1;
            return sum + (m.units * nav);
          }, 0);

        setNewAccount(prev => ({
          ...prev,
          name: primaryFund.name || prev.name,
          ticker: (primaryFund.ticker || prev.ticker).toUpperCase(),
          aum: assetValue || subscriptionValue || prev.aum,
          nav: primaryFund.nav || prev.nav || 1.0000
        }));
      }
    } catch (err) {
      console.error("Smart Ingestion Failed:", err);
    } finally {
      setIsIngesting(false);
    }
  };

  const filteredAccounts = useMemo(() => 
    accounts.filter(a => 
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      a.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.description && a.description.toLowerCase().includes(searchTerm.toLowerCase()))
    ),
    [accounts, searchTerm]
  );

  // Group investors and assets by accountId for O(1) access
  const groupedEntities = useMemo(() => {
    const investorMap = new Map<string, number>();
    const portfolioMap = new Map<string, number>();

    investors.forEach(i => {
      investorMap.set(i.accountId, (investorMap.get(i.accountId) || 0) + 1);
    });

    portfolio.forEach(p => {
      portfolioMap.set(p.accountId, (portfolioMap.get(p.accountId) || 0) + 1);
    });

    return { investorMap, portfolioMap };
  }, [investors, portfolio]);

  const handleExportCSV = () => {
    const accountsToExport = selectedAccountIds.size > 0 
      ? accounts.filter(a => selectedAccountIds.has(a.id))
      : filteredAccounts;

    const exportData = accountsToExport.map(account => ({
      'Account Name': account.name,
      'Ticker': account.ticker,
      'Description': account.description || 'N/A',
      'AUM (GHS)': account.aum.toFixed(2),
      'NAV (GHS)': account.nav.toFixed(4),
      'Total Units': account.totalUnits.toFixed(4),
      'Cash Balance (GHS)': account.cashBalance.toFixed(2),
      'Investors': investors.filter(i => i.accountId === account.id).length,
      'Assets': portfolio.filter(p => p.accountId === account.id).length,
      'Last Valuation': account.lastValuationDate ? new Date(account.lastValuationDate).toLocaleDateString() : 'N/A'
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `OmniFund_Accounts_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteAccount = async () => {
    if (pinInput !== AUTH_PIN) {
      setPinError(true);
      return;
    }

    const idsToDelete = accountToDelete ? [accountToDelete] : Array.from(selectedAccountIds);
    if (idsToDelete.length === 0) return;

    setIsDeleting(true);
    try {
      // 1. Parallelize fetching all associated document references for all accounts
      const allDeletions = await Promise.all(idsToDelete.map(async (accId) => {
        const [portfolioSnap, investorsSnap, transactionsSnap, valuationsSnap] = await Promise.all([
          getDocs(query(collection(db, 'portfolio'), where('accountId', '==', accId))),
          getDocs(query(collection(db, 'investors'), where('accountId', '==', accId))),
          getDocs(query(collection(db, 'transactions'), where('accountId', '==', accId))),
          getDocs(query(collection(db, 'valuations'), where('accountId', '==', accId)))
        ]);

        return [
          ...portfolioSnap.docs.map(d => d.ref),
          ...investorsSnap.docs.map(d => d.ref),
          ...transactionsSnap.docs.map(d => d.ref),
          ...valuationsSnap.docs.map(d => d.ref),
          doc(db, 'accounts', accId)
        ];
      }));

      const allRefs = allDeletions.flat();

      // 2. Chunk deletions into batches (Firestore limit is 500 ops per batch)
      const CHUNK_SIZE = 450;
      const batches = [];
      
      for (let i = 0; i < allRefs.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = allRefs.slice(i, i + CHUNK_SIZE);
        chunk.forEach(ref => batch.delete(ref));
        batches.push(batch.commit());
      }

      await Promise.all(batches);
      
      setIsDeleteModalOpen(false);
      setAccountToDelete(null);
      setSelectedAccountIds(new Set());
      setPinInput("");
      setPinError(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `accounts/${idsToDelete.join(',')}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleAccountSelection = (id: string) => {
    const next = new Set(selectedAccountIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedAccountIds(next);
  };

  const toggleAllSelection = () => {
    if (selectedAccountIds.size === filteredAccounts.length) {
      setSelectedAccountIds(new Set());
    } else {
      setSelectedAccountIds(new Set(filteredAccounts.map(a => a.id)));
    }
  };

  const handleEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;

    try {
      const accountRef = doc(db, 'accounts', editingAccount.id);
      await updateDoc(accountRef, {
        name: editingAccount.name,
        ticker: editingAccount.ticker,
        description: editingAccount.description,
        nav: editingAccount.nav,
        aum: editingAccount.aum,
        totalUnits: editingAccount.totalUnits
      });
      setIsEditModalOpen(false);
      setEditingAccount(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `accounts/${editingAccount.id}`);
    }
  };

  const handleDuplicateAccount = async (account: InvestmentAccount, e: React.MouseEvent) => {
    e.stopPropagation(); // Stop card selection toggle
    if (isDuplicating) return;
    
    setIsDuplicating(account.id);
    const toastId = toast.loading(`Duplicating account "${account.name}" and copying positions...`);

    try {
      // 1. Create duplicated account object
      const dupAccount = {
        name: `${account.name} (Copy)`,
        ticker: `${account.ticker}-DUP`,
        description: account.description ? `${account.description} (Duplicated copy)` : 'Duplicated account copy',
        nav: account.nav,
        cashBalance: account.cashBalance,
        totalUnits: account.totalUnits,
        aum: account.aum,
        lastValuationDate: account.lastValuationDate || new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      const newAccountDocRef = await addDoc(collection(db, 'accounts'), dupAccount);
      const newAccountId = newAccountDocRef.id;

      // 2. Duplicate active portfolio holdings
      const portfolioSnap = await getDocs(query(collection(db, 'portfolio'), where('accountId', '==', account.id)));
      const portfolioPromises = portfolioSnap.docs.map(docSnap => {
        const data = docSnap.data() || {};
        const cleanedData: any = {};
        Object.keys(data).forEach(key => {
          if (data[key] !== undefined) {
            cleanedData[key] = data[key];
          }
        });
        // Remove standard doc fields if they are embedded in data
        delete cleanedData.id;

        return addDoc(collection(db, 'portfolio'), {
          ...cleanedData,
          accountId: newAccountId,
          createdAt: new Date().toISOString()
        });
      });

      // 3. Duplicate investors
      const investorsSnap = await getDocs(query(collection(db, 'investors'), where('accountId', '==', account.id)));
      const investorMapping: Record<string, string> = {};
      const investorPromises = investorsSnap.docs.map(async (docSnap) => {
        const data = docSnap.data() || {};
        const cleanedData: any = {};
        Object.keys(data).forEach(key => {
          if (data[key] !== undefined) {
            cleanedData[key] = data[key];
          }
        });
        delete cleanedData.id;

        // Ensure critical fields are fallback-populated if missing or undefined
        if (!cleanedData.name) {
          cleanedData.name = cleanedData.investorId || 'Unnamed Investor';
        }

        const newInvRef = await addDoc(collection(db, 'investors'), {
          ...cleanedData,
          accountId: newAccountId,
          createdAt: new Date().toISOString()
        });
        investorMapping[docSnap.id] = newInvRef.id;
      });

      await Promise.all([...portfolioPromises, ...investorPromises]);

      // 4. Duplicate transactions matching the new investor IDs
      const transactionsSnap = await getDocs(query(collection(db, 'transactions'), where('accountId', '==', account.id)));
      const transactionPromises = transactionsSnap.docs.map(docSnap => {
        const data = docSnap.data() || {};
        const cleanedData: any = {};
        Object.keys(data).forEach(key => {
          if (data[key] !== undefined) {
            cleanedData[key] = data[key];
          }
        });
        delete cleanedData.id;

        const newInvestorId = investorMapping[data.investorId] || data.investorId || '';
        return addDoc(collection(db, 'transactions'), {
          ...cleanedData,
          accountId: newAccountId,
          investorId: newInvestorId,
          createdAt: new Date().toISOString()
        });
      });

      await Promise.all(transactionPromises);

      toast.success(`Successfully duplicated "${account.name}" into "${dupAccount.name}"!`, { id: toastId });
    } catch (error: any) {
      console.error(error);
      toast.error(`Failed to duplicate account: ${error.message || 'Unknown error'}`, { id: toastId });
    } finally {
      setIsDuplicating(null);
    }
  };

  const handleEditTransaction = (t: Transaction) => {
    setEditingTransaction(t);
    setEditTransactionForm({
      type: t.type,
      amount: t.totalAmount,
      units: t.units,
      timestamp: new Date(t.timestamp).toISOString().split('T')[0]
    });
    setIsEditTransactionModalOpen(true);
  };

  const handleUpdateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransaction) return;

    const investor = investors.find(i => i.id === editingTransaction.investorId);
    if (!investor) return;

    const account = accounts.find(a => a.id === editingTransaction.accountId);
    if (!account) return;

    try {
      await runTransaction(db, async (dbTransaction) => {
        const accountRef = doc(db, 'accounts', account.id);
        const investorRef = doc(db, 'investors', investor.id);
        const transRef = doc(db, 'transactions', editingTransaction.id);

        // 1. Calculate reversal of old transaction
        let oldUnitsDelta = 0;
        let oldAmountDelta = 0;

        if (editingTransaction.type === 'BUY') {
          oldUnitsDelta = -editingTransaction.units;
          oldAmountDelta = -editingTransaction.totalAmount;
        } else {
          oldUnitsDelta = editingTransaction.units;
          oldAmountDelta = editingTransaction.totalAmount;
        }

        // 2. Calculate impact of new transaction
        let newUnitsDelta = 0;
        let newAmountDelta = 0;

        if (editTransactionForm.type === 'BUY') {
          newUnitsDelta = editTransactionForm.units;
          newAmountDelta = editTransactionForm.amount;
        } else {
          newUnitsDelta = -editTransactionForm.units;
          newAmountDelta = -editTransactionForm.amount;
        }

        // Net change to apply
        const netUnitsChange = oldUnitsDelta + newUnitsDelta;
        const netAmountChange = oldAmountDelta + newAmountDelta;

        // Update Account
        dbTransaction.update(accountRef, {
          totalUnits: increment(netUnitsChange),
          cashBalance: increment(netAmountChange)
        });

        // Update Investor
        dbTransaction.update(investorRef, {
          unitsOwned: increment(netUnitsChange),
          totalInvestment: increment(netAmountChange)
        });

        // Update Transaction
        dbTransaction.update(transRef, {
          type: editTransactionForm.type,
          units: editTransactionForm.units,
          totalAmount: editTransactionForm.amount,
          pricePerUnit: editTransactionForm.units > 0 ? editTransactionForm.amount / editTransactionForm.units : 0,
          timestamp: new Date(editTransactionForm.timestamp).toISOString()
        });
      });

      setIsEditTransactionModalOpen(false);
      setEditingTransaction(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'transactions');
    }
  };

  const handleDeleteTransaction = async (t: Transaction) => {
    const investor = investors.find(i => i.id === t.investorId);
    const account = accounts.find(a => a.id === t.accountId);
    
    if (!investor || !account) {
      // If investor or account is missing, we still want to be able to delete the transaction
      // but we can't reconcile balances safely.
      try {
        await deleteDoc(doc(db, 'transactions', t.id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `transactions/${t.id}`);
      }
      return;
    }

    try {
      await runTransaction(db, async (dbTransaction) => {
        const accountRef = doc(db, 'accounts', account.id);
        const investorRef = doc(db, 'investors', investor.id);
        const transRef = doc(db, 'transactions', t.id);

        let unitsDelta = 0;
        let amountDelta = 0;

        if (t.type === 'BUY') {
          // Reversing a BUY: subtract units and subtract cash from fund
          unitsDelta = -t.units;
          amountDelta = -t.totalAmount;
        } else {
          // Reversing a SELL: add units back and add cash back to fund
          unitsDelta = t.units;
          amountDelta = t.totalAmount;
        }

        // Update Account
        dbTransaction.update(accountRef, {
          totalUnits: increment(unitsDelta),
          cashBalance: increment(amountDelta)
        });

        // Update Investor
        dbTransaction.update(investorRef, {
          unitsOwned: increment(unitsDelta),
          totalInvestment: increment(amountDelta)
        });

        // Delete Transaction
        dbTransaction.delete(transRef);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `transactions/${t.id}`);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleAllSelection}
            className={cn(
              "p-2 rounded-lg border transition-all",
              selectedAccountIds.size === filteredAccounts.length && filteredAccounts.length > 0
                ? "bg-emerald-500/10 border-emerald-500 text-emerald-500"
                : "bg-slate-800 border-slate-700 text-slate-500 hover:text-white"
            )}
            title="Select/Deselect All"
          >
            <CheckCircle2 className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-3xl font-bold text-white">Investment Accounts</h2>
            <p className="text-slate-400 mt-1">Manage fund products and investment portfolios</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {selectedAccountIds.size > 0 && (
            <motion.button 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={() => {
                setAccountToDelete(null);
                setIsDeleteModalOpen(true);
              }}
              className="bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg shadow-red-600/20"
            >
              <Trash2 className="w-5 h-5" />
              Delete {selectedAccountIds.size} Accounts
            </motion.button>
          )}
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
            Bulk Transactions
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-5 h-5" />
            Create New Account
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4 bg-slate-900/50 p-2 rounded-2xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search accounts by name or ticker..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent border-none focus:ring-0 pl-12 pr-4 py-3 text-slate-200 placeholder:text-slate-600"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredAccounts.map((account) => {
          const investorCount = groupedEntities.investorMap.get(account.id) || 0;
          const portfolioCount = groupedEntities.portfolioMap.get(account.id) || 0;
          
          return (
            <motion.div 
              layout
              key={account.id}
              onClick={() => toggleAccountSelection(account.id)}
              className={cn(
                "bg-slate-900 border rounded-3xl p-8 transition-all group relative overflow-hidden cursor-pointer",
                selectedAccountIds.has(account.id) 
                  ? "border-emerald-500 ring-2 ring-emerald-500/20" 
                  : "border-slate-800 hover:border-emerald-500/50"
              )}
            >
              {selectedAccountIds.has(account.id) && (
                <div className="absolute top-4 right-4 z-20">
                  <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-slate-900">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                </div>
              )}
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <PieChart className="w-32 h-32 text-emerald-500" />
              </div>

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                      <Briefcase className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{account.name}</h3>
                      <p className="text-sm text-slate-500 font-mono uppercase tracking-wider">{account.ticker}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-3 py-1 rounded-full border border-emerald-500/20 uppercase flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      Live
                    </div>
                    <div className="bg-blue-500/10 text-blue-500 text-[10px] font-bold px-3 py-1 rounded-full border border-blue-500/20 uppercase">
                      Active
                    </div>
                  </div>
                </div>

                <p className="text-slate-400 text-sm mb-8 line-clamp-2">
                  {account.description || "No description provided for this investment account."}
                </p>

                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-800">
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">AUM (Assets Under Management)</p>
                    <p className="text-lg font-bold text-white">{formatCurrency(account.aum)}</p>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-800">
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">NAV (Net Asset Value)</p>
                    <p className="text-lg font-bold text-emerald-500">{formatCurrency(account.nav)}</p>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-800">
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Units</p>
                    <p className="text-lg font-bold text-white">{account.totalUnits.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-slate-800">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-300">{investorCount} Investors</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-300">{portfolioCount} Assets</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => {
                        setSelectedAccountForStatement(account);
                        setIsFundModalOpen(true);
                      }}
                      className="p-2 hover:bg-blue-500/10 text-slate-500 hover:text-blue-500 rounded-lg transition-all"
                      title="Print Statement"
                    >
                      <FileText className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={(e) => handleDuplicateAccount(account, e)}
                      disabled={isDuplicating === account.id}
                      className="p-2 hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-500 rounded-lg transition-all disabled:opacity-50"
                      title="Duplicate Account"
                    >
                      {isDuplicating === account.id ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedAccountForChat(account);
                        setIsAIChatOpen(true);
                      }}
                      className="p-2 hover:bg-violet-500/10 text-slate-500 hover:text-violet-500 rounded-lg transition-all"
                      title="AI Account Copilot"
                    >
                      <MessageSquare className="w-5 h-5 text-violet-400" />
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedAccountForAI(account);
                        setIsAIAuditorOpen(true);
                      }}
                      className="p-2 hover:bg-blue-500/10 text-slate-500 hover:text-blue-500 rounded-lg transition-all"
                      title="AI Behavioral Audit"
                    >
                      <Brain className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedAccountForHistory(account);
                        setIsHistoryModalOpen(true);
                      }}
                      className="p-2 hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-500 rounded-lg transition-all"
                      title="Transaction History"
                    >
                      <ArrowRightLeft className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => {
                        setAccountToDelete(account.id);
                        setIsDeleteModalOpen(true);
                      }}
                      className="p-2 hover:bg-red-500/10 text-slate-500 hover:text-red-500 rounded-lg transition-all"
                      title="Delete Account"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAccountForWorkspace(account);
                      }}
                      className="flex items-center gap-2 text-emerald-500 text-sm font-bold hover:gap-3 transition-all"
                    >
                      View Details
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {isAIAuditorOpen && selectedAccountForAI && (
          <AIAccountAuditor
            isOpen={isAIAuditorOpen}
            onClose={() => {
              setIsAIAuditorOpen(false);
              setSelectedAccountForAI(null);
            }}
            onLocateTransaction={(txId) => {
              // Closer auditor, set selected account for history, open history, set highlight
              setIsAIAuditorOpen(false);
              setSelectedAccountForHistory(selectedAccountForAI);
              setIsHistoryModalOpen(true);
              setHighlightedTransactionId(txId);
              
              // Clear highlight after some time
              setTimeout(() => setHighlightedTransactionId(null), 5000);
            }}
            account={selectedAccountForAI}
            transactions={transactions.filter(t => t.accountId === selectedAccountForAI.id)}
            portfolio={portfolio.filter(p => p.accountId === selectedAccountForAI.id)}
            investors={investors.filter(i => i.accountId === selectedAccountForAI.id)}
          />
        )}
      </AnimatePresence>

      {/* Edit Account Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-white mb-6">Edit Investment Account</h3>
              <form onSubmit={handleEditAccount} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Account Name</label>
                    <input 
                      required
                      type="text" 
                      value={editingAccount.name}
                      onChange={(e) => setEditingAccount({...editingAccount, name: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Ticker Symbol</label>
                    <input 
                      required
                      type="text" 
                      value={editingAccount.ticker}
                      onChange={(e) => setEditingAccount({...editingAccount, ticker: e.target.value.toUpperCase()})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Description</label>
                  <textarea 
                    value={editingAccount.description}
                    onChange={(e) => setEditingAccount({...editingAccount, description: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all h-24 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">NAV per Unit (GH₵)</label>
                    <input 
                      required
                      type="number" 
                      step="0.0001"
                      value={editingAccount.nav}
                      onChange={(e) => setEditingAccount({...editingAccount, nav: Number(e.target.value)})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">AUM (GH₵)</label>
                    <input 
                      required
                      type="number" 
                      value={editingAccount.aum}
                      onChange={(e) => setEditingAccount({...editingAccount, aum: Number(e.target.value)})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Total Units</label>
                  <input 
                    required
                    type="number" 
                    value={editingAccount.totalUnits}
                    onChange={(e) => setEditingAccount({...editingAccount, totalUnits: Number(e.target.value)})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-600/20"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Account Modal */}
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
              <h3 className="text-2xl font-bold text-white mb-6">Create Investment Account</h3>
              <form onSubmit={handleAddAccount} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Account Name</label>
                    <input 
                      required
                      type="text" 
                      value={newAccount.name}
                      onChange={(e) => setNewAccount({...newAccount, name: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="e.g. Retirement Fund"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Ticker Symbol</label>
                    <input 
                      required
                      type="text" 
                      value={newAccount.ticker}
                      onChange={(e) => setNewAccount({...newAccount, ticker: e.target.value.toUpperCase()})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="e.g. RET-GHS"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Description</label>
                  <textarea 
                    value={newAccount.description}
                    onChange={(e) => setNewAccount({...newAccount, description: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all h-24 resize-none"
                    placeholder="Describe the purpose of this account..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Initial NAV per Unit (GH₵)</label>
                    <input 
                      required
                      type="number" 
                      step="0.0001"
                      value={newAccount.nav}
                      onChange={(e) => setNewAccount({...newAccount, nav: Number(e.target.value)})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Initial AUM (GH₵)</label>
                    <input 
                      required
                      type="number" 
                      value={newAccount.aum}
                      onChange={(e) => setNewAccount({...newAccount, aum: Number(e.target.value)})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Calculated Total Units</label>
                  <input 
                    readOnly
                    type="text" 
                    value={newAccount.totalUnits.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-400 cursor-not-allowed outline-none transition-all font-mono"
                  />
                  <p className="text-[10px] text-slate-500 italic">Total Units = Initial AUM ÷ Initial NAV per Unit</p>
                </div>
                         <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-2xl flex flex-col gap-4">
                  <div className="flex gap-3">
                    <Sparkles className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">Smart Ingestion (Optional)</h4>
                      <p className="text-xs text-slate-400">
                        Upload custodian files to automatically populate account data and bootstrap historical holdings.
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <input 
                      type="file" 
                      id="smart-ingestion"
                      className="hidden" 
                      onChange={handleIngestionFileSelect}
                      multiple
                      accept=".csv,.xlsx,.xls,.pdf,.json,.xml"
                    />
                    <label 
                      htmlFor="smart-ingestion"
                      className={cn(
                        "flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed rounded-xl cursor-pointer transition-all",
                        ingestionResult ? "border-emerald-500/50 bg-emerald-500/5 text-emerald-500" : "border-slate-700 bg-slate-800/50 text-slate-400 hover:border-blue-500/50 hover:bg-blue-500/5"
                      )}
                    >
                      {isIngesting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Analyzing Data Spectrum...</span>
                        </>
                      ) : ingestionResult ? (
                        <>
                          <Wand2 className="w-5 h-5" />
                          <span>
                            {ingestionResult.entities.investors.length} Investors | {ingestionResult.entities.assets.length} Assets Identified
                          </span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          <span>Bootstrap from Custodian Export</span>
                        </>
                      )}
                    </label>
                  </div>
                  
                  {ingestionResult && !isProvisioning && stpLogs.length === 0 && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2">
                      <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider flex items-center gap-2">
                        <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                         AI Ingestion Engines Active
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-900/50 p-2 rounded-lg border border-emerald-500/10">
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Holdings</p>
                          <p className="text-xs text-white font-mono">{ingestionResult.entities.assets.length} Lines</p>
                        </div>
                        <div className="bg-slate-900/50 p-2 rounded-lg border border-emerald-500/10">
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Ledger</p>
                          <p className="text-xs text-white font-mono">{ingestionResult.mappings.investorToFund.length} Subscriptions</p>
                        </div>
                      </div>

                      {ingestionResult.entities.investors.length > 0 && (
                        <div className="pt-2 border-t border-emerald-500/10">
                          <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Identified Entities</p>
                          <div className="flex flex-wrap gap-1">
                            {ingestionResult.entities.investors.slice(0, 5).map((inv, i) => (
                              <span key={i} className="text-[9px] bg-slate-900 text-slate-300 px-1.5 py-0.5 rounded border border-slate-800">
                                {inv.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {(isProvisioning || stpLogs.length > 0) && (
                    <div className="max-h-40 overflow-y-auto space-y-1 bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[10px]">
                      <div className="flex items-center gap-2 text-emerald-500 mb-2 border-b border-emerald-500/10 pb-1">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        SYSTEM PROVISIONING LOG
                      </div>
                      {stpLogs.map((log, i) => (
                        <div key={i} className={cn(
                          "flex items-start gap-2",
                          log.startsWith('FAILED') ? "text-red-400" : log.startsWith('ERROR') ? "text-amber-400" : "text-slate-400"
                        )}>
                          <span className="text-slate-600">[{new Date().toLocaleTimeString()}]</span>
                          <span>{log}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    disabled={isProvisioning}
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isIngesting || isProvisioning}
                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                  >
                    {isProvisioning ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Provisioning...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        Create & Provision
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 border border-red-500/20">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <button 
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setAccountToDelete(null);
                    setPinInput("");
                    setPinError(false);
                  }}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <h3 className="text-2xl font-bold text-white mb-2">
                {accountToDelete ? "Delete Account?" : `Delete ${selectedAccountIds.size} Accounts?`}
              </h3>
              <p className="text-slate-400 mb-6">
                {accountToDelete 
                  ? "This action is permanent and will delete all associated assets, investors, and transaction history for this account."
                  : `This action is permanent and will delete all assets, investors, and transaction history for these ${selectedAccountIds.size} accounts.`
                }
              </p>

              <div className="space-y-4 mb-8">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Enter Admin PIN to Authorize
                  </label>
                  <input 
                    type="password" 
                    maxLength={4}
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value);
                      setPinError(false);
                    }}
                    className={cn(
                      "w-full bg-slate-800 border rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[1em] focus:ring-2 outline-none transition-all",
                      pinError ? "border-red-500 focus:ring-red-500" : "border-slate-700 focus:ring-emerald-500"
                    )}
                    placeholder="****"
                  />
                  {pinError && (
                    <p className="text-red-500 text-xs font-medium">Incorrect PIN. Please try again.</p>
                  )}
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setAccountToDelete(null);
                    setPinInput("");
                    setPinError(false);
                  }}
                  className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || pinInput.length < 4}
                  className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-600/20"
                >
                  {isDeleting ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transaction History Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && selectedAccountForHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-5xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-white">Account History</h3>
                  <p className="text-slate-400">{selectedAccountForHistory.name} ({selectedAccountForHistory.ticker})</p>
                </div>
                <button 
                  onClick={() => {
                    setIsHistoryModalOpen(false);
                    setSelectedAccountForHistory(null);
                  }}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <TransactionHistory 
                transactions={transactions} 
                accounts={accounts} 
                investors={investors} 
                filterByAccountId={selectedAccountForHistory.id}
                highlightedId={highlightedTransactionId}
                onEditTransaction={handleEditTransaction}
                onDeleteTransaction={handleDeleteTransaction}
                title="Account Transactions"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Transaction History */}
      <div className="pt-8 border-t border-slate-800">
        <TransactionHistory 
          transactions={transactions} 
          accounts={accounts} 
          investors={investors} 
          highlightedId={highlightedTransactionId}
          onEditTransaction={handleEditTransaction}
          onDeleteTransaction={handleDeleteTransaction}
          title="All Account Transactions"
        />
      </div>

      <BulkTransactionModal 
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        investors={investors}
        accounts={accounts}
        valuations={valuations}
      />

      <FundStatementModal 
        isOpen={isFundModalOpen}
        onClose={() => {
          setIsFundModalOpen(false);
          setSelectedAccountForStatement(null);
        }}
        fund={selectedAccountForStatement}
        portfolio={portfolio}
        transactions={transactions}
      />

      <AnimatePresence>
        {isAIChatOpen && selectedAccountForChat && (
          <AIAccountChat
            isOpen={isAIChatOpen}
            onClose={() => {
              setIsAIChatOpen(false);
              setSelectedAccountForChat(null);
            }}
            account={selectedAccountForChat}
            portfolio={portfolio.filter(p => p.accountId === selectedAccountForChat.id)}
            investors={investors.filter(i => i.accountId === selectedAccountForChat.id)}
            transactions={transactions.filter(t => t.accountId === selectedAccountForChat.id)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditTransactionModalOpen && editingTransaction && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsEditTransactionModalOpen(false);
                setEditingTransaction(null);
              }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-white">Edit Transaction</h3>
                  <p className="text-slate-400 text-sm">
                    Investor: {investors.find(i => i.id === editingTransaction.investorId)?.name}
                  </p>
                </div>
                <button 
                  onClick={() => setIsEditTransactionModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateTransaction} className="space-y-6">
                <div className="flex p-1 bg-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setEditTransactionForm({ ...editTransactionForm, type: 'BUY' })}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                      editTransactionForm.type === 'BUY' ? "bg-emerald-600 text-white" : "text-slate-400"
                    )}
                  >
                    Subscription
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTransactionForm({ ...editTransactionForm, type: 'SELL' })}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                      editTransactionForm.type === 'SELL' ? "bg-red-600 text-white" : "text-slate-400"
                    )}
                  >
                    Redemption
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Units</label>
                    <input 
                      required
                      type="number" 
                      step="0.000001"
                      value={editTransactionForm.units}
                      onChange={(e) => setEditTransactionForm({...editTransactionForm, units: Number(e.target.value)})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Amount (GH₵)</label>
                    <input 
                      required
                      type="number" 
                      step="0.01"
                      value={editTransactionForm.amount}
                      onChange={(e) => setEditTransactionForm({...editTransactionForm, amount: Number(e.target.value)})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Effective Price Per Unit</label>
                  <div className="bg-slate-900 border border-slate-800 px-4 py-3 rounded-xl text-emerald-400 font-mono font-bold">
                    {formatCurrency(editTransactionForm.units > 0 ? editTransactionForm.amount / editTransactionForm.units : 0)}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Transaction Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      required
                      type="date" 
                      value={editTransactionForm.timestamp}
                      onChange={(e) => setEditTransactionForm({...editTransactionForm, timestamp: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsEditTransactionModalOpen(false)}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all shadow-lg"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedAccountForWorkspace && (
          <AccountWorkspaceModal
            isOpen={!!selectedAccountForWorkspace}
            onClose={() => setSelectedAccountForWorkspace(null)}
            account={selectedAccountForWorkspace}
            investors={investors}
            portfolio={portfolio}
            valuations={valuations}
            transactions={transactions}
            onUpdateAccount={async (updatedAccount) => {
              try {
                const accountRef = doc(db, 'accounts', updatedAccount.id);
                const calculatedAum = updatedAccount.totalUnits > 0 ? updatedAccount.totalUnits * updatedAccount.nav : updatedAccount.aum;
                
                await updateDoc(accountRef, {
                  name: updatedAccount.name,
                  ticker: updatedAccount.ticker,
                  description: updatedAccount.description,
                  nav: updatedAccount.nav,
                  aum: calculatedAum,
                  totalUnits: updatedAccount.totalUnits,
                  cashBalance: updatedAccount.cashBalance,
                  lastValuationDate: new Date().toISOString()
                });

                // Update all investors belonging to this account with new NAV
                const invQuery = query(collection(db, 'investors'), where('accountId', '==', updatedAccount.id));
                const invSnap = await getDocs(invQuery);
                const invUpdates = invSnap.docs.map(d => {
                  const invData = d.data();
                  return updateDoc(doc(db, 'investors', d.id), {
                    currentValue: (invData.unitsOwned || 0) * updatedAccount.nav
                  });
                });
                await Promise.all(invUpdates);

                // Add valuation log entry
                await addDoc(collection(db, 'valuations'), {
                  accountId: updatedAccount.id,
                  date: serverTimestamp(),
                  nav: updatedAccount.nav,
                  aum: calculatedAum,
                  notes: 'Price per Unit (NAV) updated via Account Parameters'
                });

                setSelectedAccountForWorkspace({ ...updatedAccount, aum: calculatedAum });
                toast.success(`Parameters for "${updatedAccount.name}" updated successfully! Price per unit: GH₵${updatedAccount.nav.toFixed(4)}`);
              } catch (err: any) {
                toast.error(`Error updating account: ${err.message}`);
              }
            }}
            onOpenStatement={(acc) => {
              setSelectedAccountForStatement(acc);
              setIsFundModalOpen(true);
            }}
            onOpenHistory={(acc) => {
              setSelectedAccountForHistory(acc);
              setIsHistoryModalOpen(true);
            }}
            onOpenAI={(acc) => {
              setSelectedAccountForAI(acc);
              setIsAIAuditorOpen(true);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
