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
  Download,
  Calendar,
  CheckCircle2,
  Edit3,
  ShieldCheck,
  Award,
  Building2,
  Filter,
  Trash2,
  Sparkles,
  CalendarX
} from 'lucide-react';
import { calculateSmartNavForDate, SmartNavResult } from '../services/smartNavEngine';
import { motion, AnimatePresence } from 'motion/react';
import { addDoc, collection, serverTimestamp, doc, updateDoc, deleteDoc, increment, runTransaction, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import Papa from 'papaparse';
import { toast } from 'sonner';

import { cn, formatCurrency, safeDate, safeISODate, safeFormatDate, safeTimestamp } from '../lib/utils';
import { isJuly21Transaction } from '../services/transactionCleanup';
import BatchDeleteByDateModal from './BatchDeleteByDateModal';
import TransactionHistory from './TransactionHistory';
import BulkTransactionModal from './BulkTransactionModal';
import StatementModal from './StatementModal';
import EmailInvestorModal from './EmailInvestorModal';
import BulkEmailModal from './BulkEmailModal';
import BulkStatementModal from './BulkStatementModal';
import MembershipCertificateModal from './MembershipCertificateModal';
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
  portfolio?: any[];
  initialSearchTerm?: string;
}

export default function InvestorManagement({ 
  investors, 
  fund, 
  accounts, 
  transactions, 
  valuations,
  portfolio = [],
  initialSearchTerm = ''
}: InvestorManagementProps) {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');

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
      if (res.ok) {
        const data = await res.json();
        setIsGmailConnected(!!data.connected);
      } else {
        setIsGmailConnected(false);
      }
    } catch {
      setIsGmailConnected(false);
    }
  };

  const handleConnectGmail = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const { url } = await res.json();
      window.open(url, 'google_auth', 'width=600,height=700');
    } catch {
      toast.error('Failed to initiate Gmail connection');
    }
  };

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isBulkEmailModalOpen, setIsBulkEmailModalOpen] = useState(false);
  const [isBulkStatementModalOpen, setIsBulkStatementModalOpen] = useState(false);
  const [isCertificateModalOpen, setIsCertificateModalOpen] = useState(false);
  const [selectedInvestorForCertificate, setSelectedInvestorForCertificate] = useState<Investor | null>(null);
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [selectedInvestor, setSelectedInvestor] = useState<Investor | null>(null);
  const [editingInvestor, setEditingInvestor] = useState<Investor | null>(null);
  const [isEditInvestorModalOpen, setIsEditInvestorModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [isMerging, setIsMerging] = useState(false);
  
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);

  const july21Transactions = useMemo(() => {
    return transactions.filter(isJuly21Transaction);
  }, [transactions]);
  const [editingInvestorForm, setEditingInvestorForm] = useState({
    name: '',
    email: '',
    phone: '',
    investorId: '',
    accountId: '',
    kycStatus: 'pending' as 'verified' | 'pending' | 'rejected',
    kycDetails: {
      idVerified: false,
      addressVerified: false,
      sourceOfFundsVerified: false
    }
  });
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [isEditTransactionModalOpen, setIsEditTransactionModalOpen] = useState(false);
  const [editTransactionForm, setEditTransactionForm] = useState({
    type: 'BUY' as 'BUY' | 'SELL',
    amount: 0,
    units: 0,
    pricePerUnit: 0,
    timestamp: ''
  });
  const [selectedInvestorForStatement, setSelectedInvestorForStatement] = useState<Investor | null>(null);
  const [selectedInvestorForEmail, setSelectedInvestorForEmail] = useState<Investor | null>(null);
  const [selectedInvestorIds, setSelectedInvestorIds] = useState<Set<string>>(new Set());
  
  const [newInvestor, setNewInvestor] = useState({ 
    name: '', 
    email: '', 
    phone: '',
    investmentAmount: 0,
    accountId: fund?.id || (accounts.length > 0 ? accounts[0].id : ''),
    onboardDate: new Date().toISOString().split('T')[0],
    kycStatus: 'pending' as 'verified' | 'pending' | 'rejected',
    useCustomNav: false,
    manualNav: 1.0000
  });

  const [transaction, setTransaction] = useState({
    type: 'BUY' as 'BUY' | 'SELL',
    amount: 0,
    units: 0,
    timestamp: new Date().toISOString().split('T')[0],
    useCustomNav: false,
    manualNav: 1.0000
  });

  const [smartNavData, setSmartNavData] = useState<SmartNavResult | null>(null);
  const [isCalculatingSmartNav, setIsCalculatingSmartNav] = useState(false);
  const [showSmartNavDetails, setShowSmartNavDetails] = useState(false);

  const getNavForDate = (dateStr: string, accountId: string) => {
    const targetDate = safeISODate(dateStr);
    
    // Sort valuations by date descending to find the closest one
    const sortedVals = [...valuations]
      .filter(v => v.accountId === accountId)
      .sort((a, b) => safeTimestamp(b.date) - safeTimestamp(a.date));

    // Find exact match or the closest previous valuation
    const match = sortedVals.find(v => {
      return safeISODate(v.date) <= targetDate;
    });

    return match?.nav || accounts.find(a => a.id === accountId)?.nav || 1.0000;
  };

  // Watch for date changes in Add Investor modal
  useEffect(() => {
    if (isAddModalOpen && !newInvestor.useCustomNav) {
      const historicalNav = getNavForDate(newInvestor.onboardDate, newInvestor.accountId);
      setNewInvestor(prev => ({
        ...prev,
        manualNav: historicalNav
      }));
    }
  }, [newInvestor.onboardDate, newInvestor.accountId, isAddModalOpen, newInvestor.useCustomNav]);

  // Watch for date changes in Transaction modal and dynamically evaluate portfolio assets as at that date
  useEffect(() => {
    if (isTransactionModalOpen && selectedInvestor) {
      const accId = selectedInvestor.accountId || fund?.id || '';
      if (!accId) return;

      setIsCalculatingSmartNav(true);
      calculateSmartNavForDate(accId, transaction.timestamp, {
        account: accounts.find(a => a.id === accId) || fund,
        assets: portfolio,
        transactions,
        valuations
      }).then(res => {
        setSmartNavData(res);
        if (!transaction.useCustomNav) {
          setTransaction(prev => ({
            ...prev,
            manualNav: res.nav
          }));
        }
      }).catch(err => {
        console.warn('Smart NAV calculation failed, falling back:', err);
      }).finally(() => {
        setIsCalculatingSmartNav(false);
      });
    }
  }, [transaction.timestamp, isTransactionModalOpen, selectedInvestor?.id, selectedInvestor?.accountId, portfolio, transactions, valuations]);

  // Ensure accountId is set when accounts load
  useEffect(() => {
    if (!newInvestor.accountId && (fund?.id || accounts.length > 0)) {
      setNewInvestor(prev => ({
        ...prev,
        accountId: fund?.id || accounts[0].id
      }));
    }
  }, [fund, accounts, newInvestor.accountId]);

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

  const filteredInvestors = useMemo(() => {
    return investors.filter(i => {
      if (selectedAccountId !== 'ALL' && i.accountId !== selectedAccountId) {
        return false;
      }
      if (!searchTerm) return true;

      const term = searchTerm.toLowerCase();
      const investorAccount = accounts.find(a => a.id === i.accountId);
      
      const matchesName = i.name.toLowerCase().includes(term);
      const matchesEmail = i.email ? i.email.toLowerCase().includes(term) : false;
      const matchesId = i.investorId ? i.investorId.toLowerCase().includes(term) : false;
      const matchesPhone = i.phone ? i.phone.toLowerCase().includes(term) : false;
      const matchesAccountName = investorAccount ? investorAccount.name.toLowerCase().includes(term) : false;
      const matchesAccountTicker = investorAccount ? investorAccount.ticker.toLowerCase().includes(term) : false;

      return matchesName || matchesEmail || matchesId || matchesPhone || matchesAccountName || matchesAccountTicker;
    });
  }, [investors, selectedAccountId, searchTerm, accounts]);

  const registryStats = useMemo(() => {
    let totalUnits = 0;
    let totalMarketValue = 0;
    let totalInvestment = 0;

    filteredInvestors.forEach(i => {
      const acc = accounts.find(a => a.id === i.accountId) || fund;
      const nav = acc?.nav || 0;
      totalUnits += i.unitsOwned || 0;
      totalMarketValue += (i.unitsOwned || 0) * nav;
      totalInvestment += i.totalInvestment || 0;
    });

    const totalGain = totalMarketValue - totalInvestment;
    const totalGainPct = totalInvestment > 0 ? (totalGain / totalInvestment) * 100 : 0;

    return {
      count: filteredInvestors.length,
      totalUnits,
      totalMarketValue,
      totalInvestment,
      totalGain,
      totalGainPct
    };
  }, [filteredInvestors, accounts, fund]);

  const selectedInvestors = useMemo(() => {
    return investors.filter(i => selectedInvestorIds.has(i.id));
  }, [investors, selectedInvestorIds]);

  const toggleSelectAll = () => {
    if (selectedInvestorIds.size === filteredInvestors.length) {
      setSelectedInvestorIds(new Set());
    } else {
      setSelectedInvestorIds(new Set(filteredInvestors.map(i => i.id)));
    }
  };

  const toggleSelectInvestor = (id: string) => {
    const newSelected = new Set(selectedInvestorIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedInvestorIds(newSelected);
  };

  const handleExportCSV = () => {
    const exportData = filteredInvestors.map(investor => {
      const investorAccount = accounts.find(a => a.id === investor.accountId) || fund;
      const currentNav = investorAccount?.nav || 0;
      const currentValue = investor.unitsOwned * currentNav;
      const gainLoss = currentValue - investor.totalInvestment;
      const gainLossPct = investor.totalInvestment > 0 
        ? (((currentValue - investor.totalInvestment) / investor.totalInvestment) * 100).toFixed(2) + '%'
        : '0.00%';

      return {
        'Investor ID': investor.investorId || 'N/A',
        'Name': investor.name,
        'Email': investor.email || 'N/A',
        'Phone': investor.phone || 'N/A',
        'Investment Account': investorAccount ? `${investorAccount.name} (${investorAccount.ticker})` : investor.accountId,
        'Units Owned': investor.unitsOwned.toFixed(4),
        'Current NAV per Unit (GHS)': currentNav.toFixed(4),
        'Total Investment (GHS)': investor.totalInvestment.toFixed(2),
        'Current Value (GHS)': currentValue.toFixed(2),
        'Gain/Loss (GHS)': gainLoss.toFixed(2),
        'Gain/Loss (%)': gainLossPct,
        'KYC Status': investor.kycStatus || 'pending'
      };
    });

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

    const currentNav = newInvestor.manualNav;
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
          phone: newInvestor.phone,
          accountId: newInvestor.accountId,
          unitsOwned: unitsToAllocate,
          totalInvestment: newInvestor.investmentAmount,
          currentValue: newInvestor.investmentAmount,
          onboardDate: newInvestor.onboardDate,
          kycStatus: newInvestor.kycStatus,
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
          timestamp: new Date(newInvestor.onboardDate).toISOString()
        });
      });

      setIsAddModalOpen(false);
      setNewInvestor({ ...newInvestor, name: '', email: '', phone: '', investmentAmount: 0, onboardDate: new Date().toISOString().split('T')[0] });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'investors');
    }
  };

  const handleEditInvestor = (investor: Investor) => {
    setEditingInvestor(investor);
    setEditingInvestorForm({
      name: investor.name,
      email: investor.email || '',
      phone: investor.phone || '',
      investorId: investor.investorId || '',
      accountId: investor.accountId || (fund?.id || accounts[0]?.id || ''),
      kycStatus: investor.kycStatus || 'pending',
      kycDetails: {
        idVerified: investor.kycDetails?.idVerified || false,
        addressVerified: investor.kycDetails?.addressVerified || false,
        sourceOfFundsVerified: investor.kycDetails?.sourceOfFundsVerified || false
      }
    });
    setIsEditInvestorModalOpen(true);
  };

  const handleUpdateInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvestor) return;

    try {
      const investorRef = doc(db, 'investors', editingInvestor.id);
      await updateDoc(investorRef, {
        name: editingInvestorForm.name,
        email: editingInvestorForm.email,
        phone: editingInvestorForm.phone,
        investorId: editingInvestorForm.investorId,
        accountId: editingInvestorForm.accountId,
        kycStatus: editingInvestorForm.kycStatus,
        kycDetails: editingInvestorForm.kycDetails
      });
      setIsEditInvestorModalOpen(false);
      setEditingInvestor(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `investors/${editingInvestor.id}`);
    }
  };

  const handleMergeInvestors = async () => {
    if (!selectedInvestor || !mergeTargetId || isMerging) return;
    if (selectedInvestor.id === mergeTargetId) {
      console.error("Cannot merge an investor with themselves");
      return;
    }

    setIsMerging(true);
    try {
      const sourceId = selectedInvestor.id;
      const targetId = mergeTargetId;
      const targetInvestor = investors.find(i => i.id === targetId);
      
      if (!targetInvestor) throw new Error("Target investor not found");

      // 1. Get all transactions for source investor
      const transQuery = query(collection(db, 'transactions'), where('investorId', '==', sourceId));
      const transSnap = await getDocs(transQuery);
      
      await runTransaction(db, async (dbTransaction) => {
        const sourceRef = doc(db, 'investors', sourceId);
        const targetRef = doc(db, 'investors', targetId);

        // 2. Update target investor totals
        dbTransaction.update(targetRef, {
          unitsOwned: increment(selectedInvestor.unitsOwned),
          totalInvestment: increment(selectedInvestor.totalInvestment),
          currentValue: increment(selectedInvestor.currentValue)
        });

        // 3. Update all transactions to use target investor ID
        transSnap.docs.forEach(transDoc => {
          dbTransaction.update(transDoc.ref, { investorId: targetId });
        });

        // 4. Delete source investor
        dbTransaction.delete(sourceRef);
      });

      setIsMergeModalOpen(false);
      setSelectedInvestor(null);
      setMergeTargetId('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'investor_merge');
    } finally {
      setIsMerging(false);
    }
  };

  const handleVerifyInvestor = async (investor: Investor) => {
    const toastId = toast.loading(`Verifying ${investor.name}...`);
    try {
      const ref = doc(db, 'investors', investor.id);
      await updateDoc(ref, {
        kycStatus: 'verified',
        kycDetails: {
          idVerified: true,
          addressVerified: true,
          sourceOfFundsVerified: true
        }
      });
      toast.success(`${investor.name} verified successfully`, { id: toastId });
    } catch (error: any) {
      console.error("Single verify error:", error);
      toast.error(`Verification failed: ${error.message}`, { id: toastId });
    }
  };

  const handleBulkVerify = async () => {
    console.log("Bulk verify triggered for IDs:", Array.from(selectedInvestorIds));
    if (selectedInvestorIds.size === 0) {
      toast.error("No investors selected");
      return;
    }
    
    if (!window.confirm(`Are you sure you want to verify all ${selectedInvestorIds.size} selected investors? This will set their KYC status to 'verified' and check all KYC steps.`)) {
      return;
    }

    const toastId = toast.loading(`Verifying ${selectedInvestorIds.size} investors...`);
    try {
      console.log("Committing batch verify...");
      const batch = writeBatch(db);
      
      selectedInvestorIds.forEach(id => {
        const ref = doc(db, 'investors', id);
        batch.update(ref, {
          kycStatus: 'verified',
          kycDetails: {
            idVerified: true,
            addressVerified: true,
            sourceOfFundsVerified: true
          }
        });
      });

      await batch.commit();
      console.log("Batch verify commit successful");
      setSelectedInvestorIds(new Set());
      toast.success("Investors verified successfully", { id: toastId });
    } catch (error: any) {
      console.error("Bulk verify error:", error);
      toast.error(`Bulk verification failed: ${error.message}`, { id: toastId });
    }
  };

  const handleProcessTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvestor) return;
    
    const selectedAccount = accounts.find(a => a.id === selectedInvestor.accountId);
    if (!selectedAccount) return;

    const currentNav = transaction.manualNav;
    
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
          timestamp: new Date(transaction.timestamp).toISOString()
        });
      });

      setIsTransactionModalOpen(false);
      setTransaction({ type: 'BUY', amount: 0, units: 0, timestamp: new Date().toISOString().split('T')[0] });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'transactions');
    }
  };

  const handleEditTransaction = (t: Transaction) => {
    setEditingTransaction(t);
    setEditTransactionForm({
      type: t.type,
      amount: t.totalAmount,
      units: t.units,
      pricePerUnit: t.pricePerUnit,
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
          oldAmountDelta = editingTransaction.totalAmount; // Reversing a SELL adds back the cash flow impact
        }

        // 2. Calculate impact of new transaction
        let newUnitsDelta = 0;
        let newAmountDelta = 0;

        if (editTransactionForm.type === 'BUY') {
          newUnitsDelta = editTransactionForm.units;
          newAmountDelta = editTransactionForm.amount;
        } else {
          newUnitsDelta = -editTransactionForm.units;
          newAmountDelta = -editTransactionForm.amount; // SELL is negative impact on net investment
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
          pricePerUnit: editTransactionForm.pricePerUnit,
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
          unitsDelta = -t.units;
          amountDelta = -t.totalAmount;
        } else {
          unitsDelta = t.units;
          amountDelta = t.totalAmount;
        }

        dbTransaction.update(accountRef, {
          totalUnits: increment(unitsDelta),
          cashBalance: increment(amountDelta)
        });

        dbTransaction.update(investorRef, {
          unitsOwned: increment(unitsDelta),
          totalInvestment: increment(amountDelta)
        });

        dbTransaction.delete(transRef);
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `transactions/${t.id}`);
    }
  };

  const investorPerformanceData = useMemo(() => {
    if (!selectedInvestor) return [];

    const investorTransactions = transactions
      .filter(t => t.investorId === selectedInvestor.id)
      .sort((a, b) => safeTimestamp(a.timestamp) - safeTimestamp(b.timestamp));

    const fundValuations = valuations
      .filter(v => v.accountId === selectedInvestor.accountId)
      .sort((a, b) => safeTimestamp(a.date) - safeTimestamp(b.date));

    // Combine all relevant dates
    const allDates = new Set<string>();
    investorTransactions.forEach(t => allDates.add(safeISODate(t.timestamp)));
    fundValuations.forEach(v => {
      allDates.add(safeISODate(v.date));
    });

    const sortedDates = Array.from(allDates).sort();
    
    let currentUnits = 0;
    let currentCostBasis = 0;
    let lastNav = accounts.find(a => a.id === selectedInvestor.accountId)?.nav || 1.0;

    return sortedDates.map(dateStr => {
      const date = safeDate(dateStr) || new Date();
      
      // Update units and cost basis based on transactions up to this date
      const dayTransactions = investorTransactions.filter(t => safeISODate(t.timestamp) === dateStr);
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
      const dayValuation = fundValuations.find(v => safeISODate(v.date) === dateStr);
      
      if (dayValuation) {
        lastNav = dayValuation.nav;
      } else {
        // If no valuation on this exact day, find the most recent one before this date
        const previousValuations = fundValuations.filter(v => safeTimestamp(v.date) < date.getTime());
        if (previousValuations.length > 0) {
          lastNav = previousValuations[previousValuations.length - 1].nav;
        }
      }

      const currentValue = currentUnits * lastNav;
      const gainLoss = currentValue - currentCostBasis;
      const gainLossPct = currentCostBasis > 0 ? (gainLoss / currentCostBasis) * 100 : 0;

      return {
        date: safeFormatDate(date, { month: 'short', day: 'numeric' }),
        totalInvestment: currentCostBasis,
        currentValue: currentValue,
        gainLossPct: gainLossPct,
        timestamp: date.getTime()
      };
    });
  }, [selectedInvestor, transactions, valuations, accounts]);

  return (
    <div className="space-y-8">
      {/* Header & Metric Cards */}
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              Investor Registry
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {registryStats.count} {selectedAccountId === 'ALL' ? 'Total' : 'Fund'} Participants
              </span>
            </h2>
            <p className="text-slate-400 mt-1 text-sm">
              Manage investor accounts, unit holdings, KYC verifications, and statements per investment account
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {investors.some(i => !i.investorId) && (
              <button 
                onClick={handleBackfillIds}
                disabled={isBackfilling}
                className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all border border-amber-500/20"
              >
                {isBackfilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                Generate Missing IDs
              </button>
            )}
            <button 
              onClick={handleConnectGmail}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border",
                isGmailConnected 
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                  : "bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20"
              )}
            >
              <Mail className="w-4 h-4" />
              {isGmailConnected ? 'Gmail Connected' : 'Connect Gmail'}
            </button>
            <button 
              onClick={() => setIsBulkEmailModalOpen(true)}
              disabled={!isGmailConnected || (selectedInvestorIds.size === 0 && filteredInvestors.length === 0)}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all border border-slate-700"
            >
              <Users className="w-4 h-4" />
              {selectedInvestorIds.size > 0 ? `Email (${selectedInvestorIds.size})` : 'Email All'}
            </button>
            <button 
              onClick={() => setIsBulkStatementModalOpen(true)}
              disabled={!isGmailConnected || (selectedInvestorIds.size === 0 && filteredInvestors.length === 0)}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all border border-slate-700"
            >
              <FileText className="w-4 h-4" />
              {selectedInvestorIds.size > 0 ? `Statements (${selectedInvestorIds.size})` : 'Statements'}
            </button>
            <button 
              onClick={() => {
                setSelectedInvestorForCertificate(selectedInvestorIds.size === 1 ? (selectedInvestors[0] || null) : null);
                setIsCertificateModalOpen(true);
              }}
              className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-amber-500/10"
              title="Design and issue official one-time membership certificates"
            >
              <Award className="w-4 h-4 text-amber-400" />
              {selectedInvestorIds.size > 0 ? `Certificates (${selectedInvestorIds.size})` : 'Certificates'}
            </button>
            <button 
              onClick={handleExportCSV}
              className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all border border-slate-700"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            {selectedInvestorIds.size === 2 && (
              <button 
                onClick={() => setIsMergeModalOpen(true)}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-purple-600/20"
              >
                <ArrowRightLeft className="w-4 h-4" />
                Merge
              </button>
            )}
            {selectedInvestorIds.size > 0 && (
              <button 
                onClick={handleBulkVerify}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
              >
                <ShieldCheck className="w-4 h-4" />
                Verify ({selectedInvestorIds.size})
              </button>
            )}
            <button 
              onClick={() => setIsBulkModalOpen(true)}
              className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all border border-slate-700"
            >
              <Upload className="w-4 h-4" />
              Bulk
            </button>
            <button 
              onClick={() => setIsBatchDeleteModalOpen(true)}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-red-500/10"
              title="Batch delete transactions recorded on a specific date"
            >
              <CalendarX className="w-4 h-4 text-red-400" />
              <span>Delete by Date</span>
              {july21Transactions.length > 0 && (
                <span className="bg-red-500/30 text-red-300 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  07/21 ({july21Transactions.length})
                </span>
              )}
            </button>
            <button 
              onClick={() => {
                setNewInvestor(prev => ({
                  ...prev,
                  accountId: selectedAccountId !== 'ALL' ? selectedAccountId : (fund?.id || accounts[0]?.id || '')
                }));
                setIsAddModalOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
            >
              <UserPlus className="w-4 h-4" />
              Add Investor
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Filtered Participants</span>
              <Users className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-white">{registryStats.count}</p>
            <p className="text-xs text-slate-500 mt-1">Across {selectedAccountId === 'ALL' ? `${accounts.length} investment accounts` : 'selected fund'}</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Units Outstanding</span>
              <Activity className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-white">{registryStats.totalUnits.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            <p className="text-xs text-slate-500 mt-1">Allocated participant units</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Market Value</span>
              <DollarSign className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-white">{formatCurrency(registryStats.totalMarketValue)}</p>
            <p className="text-xs text-slate-500 mt-1">Evaluated at fund NAVs</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Capital Invested</span>
              <TrendingUp className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-2xl font-bold text-white">{formatCurrency(registryStats.totalInvestment)}</p>
            <div className={cn("flex items-center gap-1 text-xs mt-1 font-medium", registryStats.totalGain >= 0 ? "text-emerald-500" : "text-red-500")}>
              <span>{registryStats.totalGain >= 0 ? '+' : ''}{registryStats.totalGainPct.toFixed(2)}% overall return</span>
            </div>
          </div>
        </div>

        {/* Search and Account Filter */}
        <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-900/80 p-3 rounded-2xl border border-slate-800 shadow-sm">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search by investor name, email, phone, ID, or fund ticker..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-transparent border-none focus:ring-0 pl-12 pr-4 py-2.5 text-slate-200 placeholder:text-slate-600 text-sm"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto border-t sm:border-t-0 sm:border-l border-slate-800 pt-3 sm:pt-0 sm:pl-4">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-slate-800 text-slate-200 border border-slate-700 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-colors w-full sm:w-auto font-medium"
            >
              <option value="ALL">All Investment Accounts ({accounts.length})</option>
              {accounts.map(acc => {
                const count = investors.filter(i => i.accountId === acc.id).length;
                return (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.ticker}) — {count} investor{count === 1 ? '' : 's'}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Investors Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800/50 border-b border-slate-800">
              <th className="px-6 py-4 w-10">
                <input 
                  type="checkbox"
                  checked={filteredInvestors.length > 0 && selectedInvestorIds.size === filteredInvestors.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                />
              </th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">ID</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Investor</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Investment Account</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Units Owned</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Value</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Performance</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredInvestors.map((investor) => {
              const investorAccount = accounts.find(a => a.id === investor.accountId) || fund;
              const currentNav = investorAccount?.nav || 0;
              const currentValue = investor.unitsOwned * currentNav;
              const gainLoss = currentValue - investor.totalInvestment;
              const gainLossPct = investor.totalInvestment > 0 ? (gainLoss / investor.totalInvestment) * 100 : 0;

              return (
                <motion.tr 
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={investor.id} 
                  className={cn(
                    "hover:bg-slate-800/30 transition-colors group",
                    selectedInvestorIds.has(investor.id) && "bg-emerald-500/5"
                  )}
                >
                  <td className="px-6 py-4">
                    <input 
                      type="checkbox"
                      checked={selectedInvestorIds.has(investor.id)}
                      onChange={() => toggleSelectInvestor(investor.id)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-mono text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
                      {investor.investorId || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-emerald-500 font-bold shrink-0">
                        {investor.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
                          {investor.name}
                          {investor.kycStatus === 'verified' && (
                            <span className="bg-emerald-500/10 text-emerald-500 text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-500/20">Verified</span>
                          )}
                          {investor.kycStatus === 'rejected' && (
                            <span className="bg-red-500/10 text-red-500 text-[10px] px-1.5 py-0.5 rounded-full border border-red-500/20">Rejected</span>
                          )}
                          {(!investor.kycStatus || investor.kycStatus === 'pending') && (
                            <span className="bg-amber-500/10 text-amber-500 text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/20">Pending</span>
                          )}
                          {investor.certificateIssuedAt && (
                            <span className="bg-amber-500/10 text-amber-400 text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/20 flex items-center gap-1 font-bold" title={`Serial: ${investor.certificateSerial}`}>
                              <Award className="w-2.5 h-2.5" /> Certified
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">
                          {investor.email || 'No email'} {investor.phone ? `• ${investor.phone}` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1.5 w-fit">
                      <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span>{investorAccount?.name || 'Unassigned'}</span>
                      {investorAccount?.ticker && (
                        <span className="text-[10px] text-blue-300/60 font-mono">({investorAccount.ticker})</span>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-300 font-medium">{investor.unitsOwned.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">Units</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-white font-bold">{formatCurrency(currentValue)}</p>
                    <p className="text-xs text-slate-500 font-mono">NAV: GH₵{(currentNav).toFixed(4)}</p>
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
                          setTransaction(prev => ({ 
                            ...prev, 
                            type: 'BUY', 
                            amount: 0, 
                            units: 0, 
                            useCustomNav: false,
                            manualNav: accounts.find(a => a.id === investor.accountId)?.nav || 1.0000 
                          }));
                          setIsTransactionModalOpen(true);
                        }}
                        className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-[10px] font-bold rounded uppercase transition-all border border-emerald-500/20" 
                        title="Quick Buy"
                      >
                        Buy
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedInvestor(investor);
                          setTransaction(prev => ({ 
                            ...prev, 
                            type: 'SELL', 
                            amount: 0, 
                            units: 0, 
                            useCustomNav: false,
                            manualNav: accounts.find(a => a.id === investor.accountId)?.nav || 1.0000
                          }));
                          setIsTransactionModalOpen(true);
                        }}
                        className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[10px] font-bold rounded uppercase transition-all border border-red-500/20" 
                        title="Quick Sell"
                      >
                        Sell
                      </button>
                      <div className="w-px h-4 bg-slate-800 mx-1" />
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
                          setSelectedInvestorForCertificate(investor);
                          setIsCertificateModalOpen(true);
                        }}
                        className={cn(
                          "p-2 hover:bg-slate-700 rounded-lg transition-colors",
                          investor.certificateIssuedAt ? "text-amber-400 hover:text-amber-300" : "text-slate-400 hover:text-amber-400"
                        )}
                        title={investor.certificateIssuedAt ? `Certificate Issued (${investor.certificateSerial})` : "Issue Membership Certificate"}
                      >
                        <Award className="w-5 h-5" />
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
                        onClick={() => handleEditInvestor(investor)}
                        className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-emerald-500 transition-colors" 
                        title="Edit Investor"
                      >
                        <Edit3 className="w-5 h-5" />
                      </button>
                      {investor.kycStatus !== 'verified' && (
                        <button 
                          onClick={() => handleVerifyInvestor(investor)}
                          className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-emerald-500 transition-colors" 
                          title="Verify KYC"
                        >
                          <ShieldCheck className="w-5 h-5" />
                        </button>
                      )}
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

      <AnimatePresence>
        {isMergeModalOpen && selectedInvestors.length === 2 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMergeModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500">
                    <ArrowRightLeft className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Merge Investors</h3>
                    <p className="text-slate-400 text-sm">Combine two accounts into one single entity</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsMergeModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl flex gap-4">
                  <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-amber-500">Irreversible Action</p>
                    <p className="text-xs text-amber-500/80 mt-1">
                      Merging will move all transaction history from the Source to the Target investor. 
                      The Source investor profile will be permanently deleted.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Source Investor (To be deleted)</label>
                    <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                      <p className="text-white font-bold">{selectedInvestors[0].name}</p>
                      <p className="text-xs text-slate-500 mt-1">{selectedInvestors[0].investorId}</p>
                      <div className="mt-4 pt-4 border-t border-slate-700/50">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Units to move</p>
                        <p className="text-sm text-slate-300">{selectedInvestors[0].unitsOwned.toLocaleString()}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        // Swap source and target for selection
                        const source = selectedInvestors[0];
                        const target = selectedInvestors[1];
                        setSelectedInvestor(source);
                        setMergeTargetId(target.id);
                      }}
                      className={cn(
                        "w-full py-2 px-3 rounded-lg text-xs font-bold transition-all border",
                        selectedInvestor?.id === selectedInvestors[0].id 
                          ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/20" 
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                      )}
                    >
                      Set as Source
                    </button>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Target Investor (Data remains)</label>
                    <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                      <p className="text-white font-bold">{selectedInvestors[1].name}</p>
                      <p className="text-xs text-slate-500 mt-1">{selectedInvestors[1].investorId}</p>
                      <div className="mt-4 pt-4 border-t border-slate-700/50">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Destination</p>
                        <p className="text-sm text-slate-300">{selectedInvestors[1].unitsOwned.toLocaleString()} units initial</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        // Swap source and target for selection
                        const source = selectedInvestors[1];
                        const target = selectedInvestors[0];
                        setSelectedInvestor(source);
                        setMergeTargetId(target.id);
                      }}
                      className={cn(
                        "w-full py-2 px-3 rounded-lg text-xs font-bold transition-all border",
                        selectedInvestor?.id === selectedInvestors[1].id 
                          ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-600/20" 
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                      )}
                    >
                      Set as Source
                    </button>
                  </div>
                </div>

                {!selectedInvestor && (
                  <p className="text-center text-sm text-slate-500 italic">Please select which investor will be the <b>Source</b> (the one being merged away).</p>
                )}

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsMergeModalOpen(false)}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleMergeInvestors}
                    disabled={!selectedInvestor || isMerging}
                    className="flex-1 py-3 px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2"
                  >
                    {isMerging ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRightLeft className="w-5 h-5" />}
                    {isMerging ? 'Merging Account...' : 'Confirm Merge'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BulkEmailModal 
        isOpen={isBulkEmailModalOpen}
        onClose={() => setIsBulkEmailModalOpen(false)}
        investors={selectedInvestorIds.size > 0 ? selectedInvestors : filteredInvestors}
        accounts={accounts}
        isGmailConnected={isGmailConnected}
      />

      <BulkStatementModal 
        isOpen={isBulkStatementModalOpen}
        onClose={() => setIsBulkStatementModalOpen(false)}
        investors={selectedInvestorIds.size > 0 ? selectedInvestors : filteredInvestors}
        accounts={accounts}
        transactions={transactions}
        valuations={valuations}
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

      <AnimatePresence>
        {isEditInvestorModalOpen && editingInvestor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditInvestorModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-white">Edit Investor Details</h3>
                <button 
                  onClick={() => setIsEditInvestorModalOpen(false)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleUpdateInvestor} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Full Name</label>
                  <input 
                    required
                    type="text" 
                    value={editingInvestorForm.name}
                    onChange={(e) => setEditingInvestorForm({...editingInvestorForm, name: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Investor ID</label>
                  <input 
                    required
                    type="text" 
                    value={editingInvestorForm.investorId}
                    onChange={(e) => setEditingInvestorForm({...editingInvestorForm, investorId: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Investment Account</label>
                  <select 
                    required
                    value={editingInvestorForm.accountId}
                    onChange={(e) => setEditingInvestorForm({...editingInvestorForm, accountId: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.ticker})</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Email Address</label>
                    <input 
                      type="email" 
                      value={editingInvestorForm.email}
                      onChange={(e) => setEditingInvestorForm({...editingInvestorForm, email: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Phone Number</label>
                    <input 
                      type="tel" 
                      value={editingInvestorForm.phone}
                      onChange={(e) => setEditingInvestorForm({...editingInvestorForm, phone: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-4 p-4 bg-slate-800/50 rounded-2xl border border-slate-700">
                  <label className="text-sm font-medium text-slate-400 block mb-2">Multi-Step KYC Verification</label>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input 
                          type="checkbox"
                          checked={editingInvestorForm.kycDetails.idVerified}
                          onChange={(e) => setEditingInvestorForm({
                            ...editingInvestorForm, 
                            kycDetails: { ...editingInvestorForm.kycDetails, idVerified: e.target.checked }
                          })}
                          className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                        />
                      </div>
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Identity Document Verified (Passport/ID)</span>
                    </label>
                    
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input 
                          type="checkbox"
                          checked={editingInvestorForm.kycDetails.addressVerified}
                          onChange={(e) => setEditingInvestorForm({
                            ...editingInvestorForm, 
                            kycDetails: { ...editingInvestorForm.kycDetails, addressVerified: e.target.checked }
                          })}
                          className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                        />
                      </div>
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Residential Address Verified</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input 
                          type="checkbox"
                          checked={editingInvestorForm.kycDetails.sourceOfFundsVerified}
                          onChange={(e) => setEditingInvestorForm({
                            ...editingInvestorForm, 
                            kycDetails: { ...editingInvestorForm.kycDetails, sourceOfFundsVerified: e.target.checked }
                          })}
                          className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                        />
                      </div>
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Source of Funds Verified</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Final KYC Approval Status</label>
                  <select 
                    value={editingInvestorForm.kycStatus}
                    onChange={(e) => setEditingInvestorForm({...editingInvestorForm, kycStatus: e.target.value as any})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  >
                    <option value="pending">Pending</option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsEditInvestorModalOpen(false)}
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
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Email Address (Optional)</label>
                    <input 
                      type="email" 
                      value={newInvestor.email}
                      onChange={(e) => setNewInvestor({...newInvestor, email: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="john@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Phone Number (Optional)</label>
                    <input 
                      type="tel" 
                      value={newInvestor.phone}
                      onChange={(e) => setNewInvestor({...newInvestor, phone: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="e.g. 0244123456"
                    />
                  </div>
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
                  
                  <div className="mt-4 p-4 bg-slate-800/50 rounded-2xl border border-slate-700 space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-400">Transaction Price (NAV)</label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs text-slate-500">Override NAV</span>
                        <input 
                          type="checkbox"
                          checked={newInvestor.useCustomNav}
                          onChange={(e) => setNewInvestor({
                            ...newInvestor, 
                            useCustomNav: e.target.checked,
                            manualNav: e.target.checked ? (accounts.find(a => a.id === newInvestor.accountId)?.nav || 1.0000) : 1.0000
                          })}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500"
                        />
                      </label>
                    </div>

                    {newInvestor.useCustomNav ? (
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input 
                          type="number"
                          step="0.0001"
                          value={newInvestor.manualNav}
                          onChange={(e) => setNewInvestor({...newInvestor, manualNav: Number(e.target.value)})}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-slate-500 italic">
                          {safeISODate(newInvestor.onboardDate) === safeISODate(new Date()) 
                            ? 'Current NAV will be used:' 
                            : 'Historical NAV for this date:'} {formatCurrency(newInvestor.manualNav)}
                        </p>
                        {safeISODate(newInvestor.onboardDate) !== safeISODate(new Date()) && (
                          <span className="text-[8px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded border border-blue-500/20 font-bold uppercase tracking-widest">
                            Smart Date Applied
                          </span>
                        )}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-700/50 flex justify-between items-center text-xs">
                      <span className="text-slate-500">Units to be allocated:</span>
                      <span className="text-emerald-500 font-bold">
                        {(newInvestor.investmentAmount / newInvestor.manualNav).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Onboarding Date (Optional)</label>
                  <input 
                    type="date" 
                    value={newInvestor.onboardDate}
                    onChange={(e) => setNewInvestor({...newInvestor, onboardDate: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                  <p className="text-[10px] text-slate-500 italic">Used as a reference for starting investment statements.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">KYC Status</label>
                  <select 
                    value={newInvestor.kycStatus}
                    onChange={(e) => setNewInvestor({...newInvestor, kycStatus: e.target.value as any})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  >
                    <option value="pending">Pending</option>
                    <option value="verified">Verified</option>
                    <option value="rejected">Rejected</option>
                  </select>
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
                      Estimated Units: {(transaction.amount / (transaction.useCustomNav ? transaction.manualNav : (accounts.find(a => a.id === selectedInvestor.accountId)?.nav || 1))).toLocaleString(undefined, { maximumFractionDigits: 4 })}
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
                      Available Units: {selectedInvestor.unitsOwned.toLocaleString()} | Estimated Payout: {formatCurrency(transaction.units * (transaction.useCustomNav ? transaction.manualNav : (accounts.find(a => a.id === selectedInvestor.accountId)?.nav || 1)))}
                    </p>
                  </div>
                )}

                {/* Smart Portfolio Valuation & NAV Lookup Card */}
                <div className="bg-slate-950/70 border border-emerald-500/30 rounded-2xl p-4 space-y-3 shadow-inner">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        Smart Portfolio Asset Valuation
                      </span>
                    </div>
                    {isCalculatingSmartNav ? (
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Calculating...
                      </div>
                    ) : (
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                        {smartNavData?.confidence === 'high' ? '⚡ Asset-Level Precision' : 'Historical Log'}
                      </span>
                    )}
                  </div>

                  {smartNavData && (
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                        <div>
                          <p className="text-[10px] text-slate-400 font-medium">NAV as at {safeFormatDate(transaction.timestamp)}</p>
                          <p className="text-xl font-black text-emerald-400 font-mono tracking-tight">
                            {formatCurrency(smartNavData.nav)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setTransaction(prev => ({ ...prev, manualNav: smartNavData.nav }));
                            toast.success(`Applied Smart NAV: ${formatCurrency(smartNavData.nav)}`);
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" /> Apply NAV
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-400 leading-relaxed italic">
                        {smartNavData.valuationSource}
                      </p>

                      {smartNavData.assetBreakdown.length > 0 && (
                        <div className="pt-2 border-t border-slate-800/80">
                          <button
                            type="button"
                            onClick={() => setShowSmartNavDetails(!showSmartNavDetails)}
                            className="text-[10px] text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 transition-colors"
                          >
                            {showSmartNavDetails ? '▼ Hide Asset Breakdown' : `► View Account Portfolio Asset Breakdown (${smartNavData.assetBreakdown.length} Assets)`}
                          </button>

                          {showSmartNavDetails && (
                            <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                              {smartNavData.assetBreakdown.map((ast, idx) => (
                                <div key={idx} className="flex justify-between items-center text-[10px] bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                                  <div>
                                    <span className="font-bold text-white">{ast.ticker}</span> <span className="text-slate-400">- {ast.name}</span>
                                    <span className="text-[9px] text-slate-500 block">Holdings: {ast.quantity.toLocaleString()} units | {ast.source}</span>
                                  </div>
                                  <div className="text-right font-mono">
                                    <span className="text-emerald-400 block font-bold">{formatCurrency(ast.marketValueAtDate)}</span>
                                    <span className="text-[9px] text-slate-500">@{formatCurrency(ast.priceAtDate)}/unit</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Transaction Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      required
                      type="date" 
                      value={transaction.timestamp}
                      onChange={(e) => setTransaction({...transaction, timestamp: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="bg-slate-800/50 border border-slate-800 p-4 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-400">Unit Price (NAV)</label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-slate-500">Override NAV</span>
                      <input 
                        type="checkbox"
                        checked={transaction.useCustomNav}
                        onChange={(e) => setTransaction({
                          ...transaction, 
                          useCustomNav: e.target.checked,
                          manualNav: e.target.checked ? (accounts.find(a => a.id === selectedInvestor.accountId)?.nav || 1.0000) : 1.0000
                        })}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500"
                      />
                    </label>
                  </div>

                  {transaction.useCustomNav ? (
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input 
                        type="number"
                        step="0.0001"
                        value={transaction.manualNav}
                        onChange={(e) => setTransaction({...transaction, manualNav: Number(e.target.value)})}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs items-center">
                        <span className="text-slate-500">
                          {safeISODate(transaction.timestamp) === safeISODate(new Date()) 
                            ? 'System NAV' 
                            : 'Historical NAV'}
                        </span>
                        <span className="text-white font-bold">{formatCurrency(transaction.manualNav)}</span>
                      </div>
                      {safeISODate(transaction.timestamp) !== safeISODate(new Date()) && (
                        <div className="flex justify-end">
                          <span className="text-[8px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded border border-blue-500/20 font-bold uppercase tracking-widest">
                            Smart Date Applied
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-700/50 flex justify-between items-center text-xs">
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
                onEditTransaction={handleEditTransaction}
                onDeleteTransaction={handleDeleteTransaction}
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
          onEditTransaction={handleEditTransaction}
          onDeleteTransaction={handleDeleteTransaction}
          title="Recent Fund Transactions"
        />
      </div>

      <BulkTransactionModal 
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        investors={investors}
        accounts={accounts}
        valuations={valuations}
        portfolio={portfolio}
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
        investors={investors}
        transactions={transactions}
        valuations={valuations}
        isGmailConnected={isGmailConnected}
      />

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
                      onChange={(e) => {
                        const newUnits = Number(e.target.value);
                        setEditTransactionForm({
                          ...editTransactionForm, 
                          units: newUnits,
                          amount: newUnits * editTransactionForm.pricePerUnit
                        });
                      }}
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
                      onChange={(e) => {
                        const newAmount = Number(e.target.value);
                        setEditTransactionForm({
                          ...editTransactionForm, 
                          amount: newAmount,
                          units: editTransactionForm.pricePerUnit > 0 ? newAmount / editTransactionForm.pricePerUnit : 0
                        });
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Transaction Price (NAV)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      required
                      type="number" 
                      step="0.0001"
                      value={editTransactionForm.pricePerUnit}
                      onChange={(e) => {
                        const newPrice = Number(e.target.value);
                        // If we change price, we might want to keep amount fixed and adjust units, or vice versa.
                        // Common behavior: keep amount fixed, update units.
                        setEditTransactionForm({
                          ...editTransactionForm, 
                          pricePerUnit: newPrice,
                          units: newPrice > 0 ? editTransactionForm.amount / newPrice : 0
                        });
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
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

      {/* Membership Certificate Modal */}
      <MembershipCertificateModal
        isOpen={isCertificateModalOpen}
        onClose={() => setIsCertificateModalOpen(false)}
        investor={selectedInvestorForCertificate}
        investorsList={selectedInvestorIds.size > 0 ? selectedInvestors : filteredInvestors}
        fund={fund}
        isGmailConnected={isGmailConnected}
      />

      {/* Batch Delete By Date Modal */}
      <BatchDeleteByDateModal 
        isOpen={isBatchDeleteModalOpen}
        onClose={() => setIsBatchDeleteModalOpen(false)}
        transactions={transactions}
        accounts={accounts}
        investors={investors}
        initialAccountId={selectedAccountId}
      />
    </div>
  );
}
