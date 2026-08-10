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
  MessageSquare,
  Eye,
  EyeOff,
  Building2,
  HelpCircle,
  ShieldCheck,
  Scale,
  Layers,
  ChevronDown,
  Globe,
  Sliders,
  Zap
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
  const [showHidden, setShowHidden] = useState(false);

  const hiddenCount = useMemo(() => accounts.filter(a => a.isHidden).length, [accounts]);

  const handleToggleHideAccount = async (account: InvestmentAccount, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const accountRef = doc(db, 'accounts', account.id);
      const newHiddenState = !account.isHidden;
      await updateDoc(accountRef, {
        isHidden: newHiddenState
      });
      toast.success(newHiddenState ? `"${account.name}" hidden from account list` : `"${account.name}" is now visible`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `accounts/${account.id}`);
    }
  };
  
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
  
  const [newFund, setNewFund] = useState({
    // Section 1: Fund Identity
    name: '', // Fund Legal Name *
    code: '', // Fund Code * (e.g. OGEF) - uppercase, unique, no spaces
    ticker: '', // Optional Ticker Symbol (e.g. OGEF)
    fundType: 'Equity Fund', // Fund Type *
    fundStructure: 'Open-ended', // Fund Structure *
    baseCurrency: 'GHS', // Base Currency *
    domicile: 'Ghana', // Domicile / Jurisdiction *
    inceptionDate: new Date().toISOString().split('T')[0], // Inception Date *
    description: '', // Investment Objective

    // Section 2: Regulatory & Administration
    regulator: 'Securities and Exchange Commission — Ghana',
    registrationNumber: '', // e.g. SEC/FUND/XXXX
    lei: '', // Legal Entity Identifier (20 characters, optional)
    fundManager: 'OmniFund Capital Ltd', // Fund Manager *
    administrator: 'OmniFund Administration Services', // Fund Administrator
    custodian: 'Standard Chartered Bank Ghana', // Custodian
    auditor: 'KPMG Ghana', // Auditor

    // Section 3: Valuation & Unit Setup
    navFrequency: 'Daily', // NAV Calculation Frequency *
    valuationFrequency: 'Daily', // Valuation Frequency *
    pricingMethod: 'Forward Pricing', // Pricing Method
    nav: 1.0000, // NAV per Unit * (default 1.0000, up to 6 decimal places)
    totalUnits: 0, // Opening Units *
    aum: 0, // Opening Net Assets = NAV * Units (Read-only calculated)
    initializeZeroBalance: true, // Default to zero opening balance

    // Setup Mode Toggle (Quick vs Full Institutional)
    setupMode: 'QUICK' as 'QUICK' | 'FULL',

    // Progressive Disclosure Toggles
    showAdvancedIdentity: false,
    showAdvancedRegulatory: false,
    showAdvancedValuation: false
  });

  const [createdFundConfirmation, setCreatedFundConfirmation] = useState<InvestmentAccount | null>(null);
  const [showShareClassModal, setShowShareClassModal] = useState(false);
  const [shareClassForm, setShareClassForm] = useState({
    name: 'Class A (Retail)',
    type: 'Retail',
    currency: 'GHS',
    nav: 1.0000
  });

  // Calculate Opening Net Assets = NAV * Opening Units (or 0 if zero balance)
  useEffect(() => {
    if (newFund.initializeZeroBalance) {
      setNewFund(prev => ({
        ...prev,
        totalUnits: 0,
        aum: 0
      }));
    } else {
      const calculatedAum = Number((newFund.nav * newFund.totalUnits).toFixed(2));
      setNewFund(prev => ({
        ...prev,
        aum: calculatedAum
      }));
    }
  }, [newFund.nav, newFund.totalUnits, newFund.initializeZeroBalance]);

  // Code Uniqueness Check
  const isCodeDuplicate = useMemo(() => {
    if (!newFund.code.trim()) return false;
    const c = newFund.code.trim().toUpperCase();
    return accounts.some(a => (a.code && a.code.toUpperCase() === c) || a.ticker.toUpperCase() === c);
  }, [newFund.code, accounts]);

  // LEI 20-character Validation
  const isLeiInvalid = useMemo(() => {
    if (!newFund.lei.trim()) return false;
    return newFund.lei.trim().length !== 20;
  }, [newFund.lei]);

  const handleAddFund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCodeDuplicate) {
      toast.error(`Fund Code '${newFund.code}' is already in use by an existing fund.`);
      return;
    }
    if (isLeiInvalid) {
      toast.error('Legal Entity Identifier (LEI) must be exactly 20 characters.');
      return;
    }

    setIsProvisioning(true);
    try {
      const fundPayload = {
        name: newFund.name.trim(),
        code: newFund.code.trim().toUpperCase(),
        ticker: (newFund.ticker.trim() || newFund.code.trim()).toUpperCase(),
        description: newFund.description.trim(),
        fundType: newFund.fundType,
        fundStructure: newFund.fundStructure,
        baseCurrency: newFund.baseCurrency,
        domicile: newFund.domicile,
        inceptionDate: newFund.inceptionDate,
        regulator: newFund.regulator,
        registrationNumber: newFund.registrationNumber.trim(),
        lei: newFund.lei.trim().toUpperCase(),
        fundManager: newFund.fundManager,
        administrator: newFund.administrator,
        custodian: newFund.custodian,
        auditor: newFund.auditor,
        navFrequency: newFund.navFrequency,
        valuationFrequency: newFund.valuationFrequency,
        pricingMethod: newFund.pricingMethod,
        nav: Number(newFund.nav) || 1.0000,
        totalUnits: Number(newFund.totalUnits) || 0,
        aum: Number(newFund.aum) || 0,
        cashBalance: Number(newFund.aum) || 0,
        lastValuationDate: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'accounts'), fundPayload);

      const createdAccount: InvestmentAccount = {
        id: docRef.id,
        ...fundPayload
      };

      if (ingestionResult) {
        const stp = new STPService();
        const stpResult = await stp.provision(ingestionResult, { 
          accounts: [...accounts, createdAccount], 
          investors 
        });
        setStpLogs(stpResult.logs);
      }

      setCreatedFundConfirmation(createdAccount);
      toast.success(`Fund '${createdAccount.name}' created successfully!`);
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
            const nav = fund?.nav || primaryFund.nav || newFund.nav || 1;
            return sum + (m.units * nav);
          }, 0);

        setNewFund(prev => ({
          ...prev,
          name: primaryFund.name || prev.name,
          code: (primaryFund.ticker || prev.code || prev.ticker).toUpperCase(),
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
    accounts.filter(a => {
      if (!showHidden && a.isHidden) return false;
      return a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        a.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (a.description && a.description.toLowerCase().includes(searchTerm.toLowerCase()));
    }),
    [accounts, searchTerm, showHidden]
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
      // 1. Parallelize fetching all associated document references safely
      const allDeletions = await Promise.all(idsToDelete.map(async (accId) => {
        const refs = [doc(db, 'accounts', accId)];

        const safeGetDocRefs = async (collectionName: string) => {
          try {
            const snap = await getDocs(query(collection(db, collectionName), where('accountId', '==', accId)));
            return snap.docs.map(d => d.ref);
          } catch (e) {
            console.warn(`Could not query ${collectionName} for account ${accId}:`, e);
            return [];
          }
        };

        const [pRefs, iRefs, tRefs, vRefs] = await Promise.all([
          safeGetDocRefs('portfolio'),
          safeGetDocRefs('investors'),
          safeGetDocRefs('transactions'),
          safeGetDocRefs('valuations')
        ]);

        return [...refs, ...pRefs, ...iRefs, ...tRefs, ...vRefs];
      }));

      const allRefs = allDeletions.flat();

      // 2. Chunk deletions into sequential batches (Firestore limit is 500 ops per batch)
      const CHUNK_SIZE = 400;
      for (let i = 0; i < allRefs.length; i += CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunk = allRefs.slice(i, i + CHUNK_SIZE);
        chunk.forEach(ref => batch.delete(ref));
        await batch.commit();
      }

      setIsDeleteModalOpen(false);
      setAccountToDelete(null);
      setSelectedAccountIds(new Set());
      setPinInput("");
      setPinError(false);
      toast.success(idsToDelete.length === 1 ? 'Fund deleted successfully.' : `${idsToDelete.length} funds deleted successfully.`);
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
      
      const accountAssets = portfolio.filter(p => p.accountId === editingAccount.id);
      const portfolioValue = accountAssets.reduce((sum, a) => sum + (a.marketValue || 0), 0);
      const totalAum = editingAccount.aum || (editingAccount.totalUnits * editingAccount.nav);
      const manualNavAdjustment = totalAum - (portfolioValue + (editingAccount.cashBalance || 0));

      await updateDoc(accountRef, {
        name: editingAccount.name,
        ticker: editingAccount.ticker,
        description: editingAccount.description,
        nav: editingAccount.nav,
        aum: totalAum,
        totalUnits: editingAccount.totalUnits,
        manualNavAdjustment,
        isManualNav: true,
        isHidden: editingAccount.isHidden || false,
        lastValuationDate: new Date().toISOString()
      });

      const accountInvestors = investors.filter(i => i.accountId === editingAccount.id);
      const invUpdates = accountInvestors.map(i => {
        return updateDoc(doc(db, 'investors', i.id), {
          currentValue: (i.unitsOwned || 0) * editingAccount.nav
        });
      });
      await Promise.all(invUpdates);

      await addDoc(collection(db, 'valuations'), {
        accountId: editingAccount.id,
        date: serverTimestamp(),
        nav: editingAccount.nav,
        aum: totalAum,
        notes: `Manual Account Edit (NAV set to GH₵${editingAccount.nav.toFixed(4)})`
      });

      toast.success(`Account details updated. Published NAV: GH₵${editingAccount.nav.toFixed(4)}`);
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
        <button
          onClick={() => setShowHidden(!showHidden)}
          className={cn(
            "px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all shrink-0 cursor-pointer mr-1",
            showHidden 
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20" 
              : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
          )}
          title={showHidden ? "Hide accounts marked as hidden" : "Show accounts marked as hidden"}
        >
          {showHidden ? <Eye className="w-4 h-4 text-amber-400" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
          <span>{showHidden ? "Showing Hidden" : `Show Hidden (${hiddenCount})`}</span>
        </button>
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
                    {account.isHidden ? (
                      <div className="bg-amber-500/10 text-amber-400 text-[10px] font-bold px-3 py-1 rounded-full border border-amber-500/20 uppercase flex items-center gap-1.5">
                        <EyeOff className="w-3 h-3" />
                        Hidden
                      </div>
                    ) : (
                      <>
                        <div className="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-3 py-1 rounded-full border border-emerald-500/20 uppercase flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          Live
                        </div>
                        <div className="bg-blue-500/10 text-blue-500 text-[10px] font-bold px-3 py-1 rounded-full border border-blue-500/20 uppercase">
                          Active
                        </div>
                      </>
                    )}
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
                      onClick={(e) => handleToggleHideAccount(account, e)}
                      className={cn(
                        "p-2 rounded-lg transition-all",
                        account.isHidden 
                          ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20" 
                          : "hover:bg-slate-800 text-slate-500 hover:text-slate-200"
                      )}
                      title={account.isHidden ? "Unhide Account" : "Hide Account"}
                    >
                      {account.isHidden ? <Eye className="w-5 h-5 text-amber-400" /> : <EyeOff className="w-5 h-5" />}
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

                <div className="flex items-center gap-3 pt-2">
                  <input 
                    type="checkbox"
                    id="editAccountIsHidden"
                    checked={editingAccount.isHidden || false}
                    onChange={(e) => setEditingAccount({...editingAccount, isHidden: e.target.checked})}
                    className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-800 cursor-pointer"
                  />
                  <label htmlFor="editAccountIsHidden" className="text-sm font-medium text-slate-300 cursor-pointer flex items-center gap-2">
                    <EyeOff className="w-4 h-4 text-amber-400" />
                    <span>Hide this investment account from general lists and dropdowns</span>
                  </label>
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

      {/* Redesigned Create New Fund Workflow Modal — Institutional Standard */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className={cn(
                "relative w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col transition-all duration-300",
                newFund.setupMode === 'QUICK' ? "max-w-2xl" : "max-w-6xl"
              )}
            >
              {/* Modal Header */}
              <div className="p-6 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border-b border-slate-800 flex items-center justify-between flex-shrink-0 gap-4 flex-wrap sm:flex-nowrap">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-white">Create New Fund</h3>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {newFund.setupMode === 'QUICK' 
                        ? 'Quick setup: fill in 5 core fields to initialize fund immediately'
                        : 'Full setup: legal entity, regulatory registration, service providers & initial capitalization'
                      }
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* SETUP MODE SWITCHER */}
                  <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setNewFund(prev => ({ ...prev, setupMode: 'QUICK' }))}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                        newFund.setupMode === 'QUICK' ? "bg-emerald-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
                      )}
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-300" />
                      Quick Setup (5 Fields)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewFund(prev => ({ ...prev, setupMode: 'FULL' }))}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                        newFund.setupMode === 'FULL' ? "bg-emerald-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
                      )}
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      Full Setup
                    </button>
                  </div>

                  <button 
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setCreatedFundConfirmation(null);
                    }}
                    disabled={isProvisioning}
                    className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* POST-CREATION CONFIRMATION DIALOG */}
              {createdFundConfirmation ? (
                <div className="p-8 overflow-y-auto space-y-6 flex-1 text-center">
                  <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center justify-center mx-auto text-emerald-400 shadow-xl">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-white">Fund Created Successfully</h3>
                    <p className="text-sm text-slate-400 max-w-md mx-auto">
                      <strong className="text-white">{createdFundConfirmation.name}</strong> ({createdFundConfirmation.code || createdFundConfirmation.ticker}) has been provisioned on the authoritative ledger.
                    </p>
                  </div>

                  {/* Created Fund Parameters KPI */}
                  <div className="max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-3 text-left p-4 bg-slate-950/80 border border-slate-800 rounded-2xl">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Fund Code</span>
                      <p className="text-sm font-bold text-white font-mono">{createdFundConfirmation.code || createdFundConfirmation.ticker}</p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Structure</span>
                      <p className="text-xs font-semibold text-slate-300">{createdFundConfirmation.fundStructure || 'Open-ended'}</p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Opening NAV</span>
                      <p className="text-xs font-mono font-bold text-emerald-400">GH₵{createdFundConfirmation.nav.toFixed(4)}</p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-500 uppercase font-bold">Opening Net Assets</span>
                      <p className="text-xs font-mono font-bold text-white">{formatCurrency(createdFundConfirmation.aum)}</p>
                    </div>
                  </div>

                  {/* Next Workflow Recommendations */}
                  <div className="max-w-2xl mx-auto text-left space-y-3 pt-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Next Recommended Fund Setup Steps</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-start gap-3 hover:border-emerald-500/40 transition-all cursor-pointer" onClick={() => setShowShareClassModal(true)}>
                        <Layers className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <h5 className="text-xs font-bold text-white">Add Share Classes</h5>
                          <p className="text-[11px] text-slate-400 mt-0.5">Configure Class A (Retail), Class I (Institutional) or Multi-Currency tranches</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-start gap-3 hover:border-blue-500/40 transition-all cursor-pointer">
                        <Sliders className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <h5 className="text-xs font-bold text-white">Valuation & Fee Rules</h5>
                          <p className="text-[11px] text-slate-400 mt-0.5">Set management fees, performance fees, custody rates & accrual frequencies</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-center gap-4">
                    <button 
                      onClick={() => {
                        setIsAddModalOpen(false);
                        setCreatedFundConfirmation(null);
                      }}
                      className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20"
                    >
                      Continue to Fund Dashboard
                    </button>
                  </div>
                </div>
              ) : newFund.setupMode === 'QUICK' ? (
                /* QUICK SETUP FORM (COMPACT 5 ESSENTIAL FIELDS) */
                <form onSubmit={handleAddFund} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                  <div className="p-5 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-4">
                    <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-400" />
                          Core Fund Parameters
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">Enter core identity parameters to launch fund immediately.</p>
                      </div>
                      <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                        5 Essential Inputs
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Field 1: Fund Legal Name */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fund Legal Name *</label>
                        <input 
                          required
                          type="text" 
                          value={newFund.name}
                          onChange={(e) => setNewFund({...newFund, name: e.target.value})}
                          placeholder="e.g. Omni Ghana Equity Fund"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-semibold focus:border-emerald-500 outline-none"
                          autoFocus
                        />
                      </div>

                      {/* Field 2: Fund Code */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fund Code *</label>
                        <input 
                          required
                          type="text" 
                          value={newFund.code}
                          onChange={(e) => setNewFund({...newFund, code: e.target.value.toUpperCase().replace(/\s+/g, '')})}
                          placeholder="e.g. OGEF"
                          className={cn(
                            "w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-white font-mono font-bold tracking-wider outline-none",
                            isCodeDuplicate ? "border-red-500 focus:ring-1 focus:ring-red-500" : "border-slate-800 focus:border-emerald-500"
                          )}
                        />
                        {isCodeDuplicate && (
                          <p className="text-[10px] text-red-400 font-medium flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Fund Code '{newFund.code}' is already in use.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Field 3: Fund Type */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fund Type *</label>
                        <select 
                          required
                          value={newFund.fundType}
                          onChange={(e) => setNewFund({...newFund, fundType: e.target.value})}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-medium focus:border-emerald-500 outline-none"
                        >
                          <option value="Equity Fund">Equity Fund</option>
                          <option value="Fixed Income Fund">Fixed Income Fund</option>
                          <option value="Money Market Fund">Money Market Fund</option>
                          <option value="Balanced Fund">Balanced Fund</option>
                          <option value="Index Fund">Index Fund</option>
                          <option value="ETF">ETF</option>
                          <option value="Real Estate Fund">Real Estate Fund</option>
                          <option value="Private Equity Fund">Private Equity Fund</option>
                          <option value="Venture Capital Fund">Venture Capital Fund</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      {/* Field 4: Base Currency */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Base Currency *</label>
                        <select 
                          required
                          value={newFund.baseCurrency}
                          onChange={(e) => setNewFund({...newFund, baseCurrency: e.target.value})}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono font-bold focus:border-emerald-500 outline-none"
                        >
                          <option value="GHS">GHS — Ghanaian Cedi</option>
                          <option value="USD">USD — US Dollar</option>
                          <option value="EUR">EUR — Euro</option>
                          <option value="GBP">GBP — British Pound</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      {/* Field 5: Initial NAV */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Initial NAV ({newFund.baseCurrency}) *</label>
                        <input 
                          required
                          type="number"
                          step="0.000001"
                          min="0.000001"
                          value={newFund.nav}
                          onChange={(e) => setNewFund({...newFund, nav: Number(e.target.value)})}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-emerald-400 font-mono font-bold focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ADVANCED SETUP EXPAND TRIGGER */}
                  <div className="p-4 bg-slate-950/40 border border-slate-800/80 rounded-2xl flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-white">Need Regulatory or Service Provider Configuration?</h5>
                      <p className="text-[11px] text-slate-400 mt-0.5">Switch to full setup mode to add Regulator, Custodian, Administrator & Opening Balances.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewFund(prev => ({ ...prev, setupMode: 'FULL' }))}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 flex-shrink-0"
                    >
                      <Sliders className="w-3.5 h-3.5 text-blue-400" />
                      Expand Full Setup
                    </button>
                  </div>

                  {/* BOTTOM ACTION BAR */}
                  <div className="pt-2 flex items-center justify-end gap-3">
                    <button 
                      type="button"
                      disabled={isProvisioning}
                      onClick={() => setIsAddModalOpen(false)}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={isProvisioning || isCodeDuplicate || !newFund.name.trim() || !newFund.code.trim()}
                      className="px-7 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 text-sm"
                    >
                      {isProvisioning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Provisioning...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Create Fund</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                /* FULL INSTITUTIONAL FORM CONTENT (2 COLUMNS) */
                <form onSubmit={handleAddFund} className="flex-1 overflow-y-auto">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 text-xs">
                    {/* LEFT COLUMN: 4 SECTION FORM (2/3 WIDTH) */}
                    <div className="lg:col-span-2 space-y-6">
                      
                      {/* SECTION 1: FUND IDENTITY */}
                      <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
                        <div className="border-b border-slate-800/80 pb-3">
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-emerald-400" />
                            1. Fund Identity
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">Define the fund's core legal and operational identity.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fund Legal Name *</label>
                            <input 
                              required
                              type="text" 
                              value={newFund.name}
                              onChange={(e) => setNewFund({...newFund, name: e.target.value})}
                              placeholder="e.g. Omni Ghana Equity Fund"
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-semibold focus:border-emerald-500 outline-none"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fund Code *</label>
                            <input 
                              required
                              type="text" 
                              value={newFund.code}
                              onChange={(e) => setNewFund({...newFund, code: e.target.value.toUpperCase().replace(/\s+/g, '')})}
                              placeholder="e.g. OGEF"
                              className={cn(
                                "w-full bg-slate-900 border rounded-xl px-3.5 py-2.5 text-white font-mono font-bold tracking-wider outline-none",
                                isCodeDuplicate ? "border-red-500 focus:ring-1 focus:ring-red-500" : "border-slate-800 focus:border-emerald-500"
                              )}
                            />
                            {isCodeDuplicate && (
                              <p className="text-[10px] text-red-400 font-medium flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Fund Code '{newFund.code}' is already in use.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fund Type *</label>
                            <select 
                              required
                              value={newFund.fundType}
                              onChange={(e) => setNewFund({...newFund, fundType: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-medium focus:border-emerald-500 outline-none"
                            >
                              <option value="Equity Fund">Equity Fund</option>
                              <option value="Fixed Income Fund">Fixed Income Fund</option>
                              <option value="Money Market Fund">Money Market Fund</option>
                              <option value="Balanced Fund">Balanced Fund</option>
                              <option value="Index Fund">Index Fund</option>
                              <option value="ETF">ETF (Exchange Traded Fund)</option>
                              <option value="Real Estate Fund">Real Estate Fund</option>
                              <option value="Private Equity Fund">Private Equity Fund</option>
                              <option value="Venture Capital Fund">Venture Capital Fund</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fund Structure *</label>
                            <select 
                              required
                              value={newFund.fundStructure}
                              onChange={(e) => setNewFund({...newFund, fundStructure: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-medium focus:border-emerald-500 outline-none"
                            >
                              <option value="Open-ended">Open-ended</option>
                              <option value="Closed-ended">Closed-ended</option>
                              <option value="Umbrella">Umbrella</option>
                              <option value="Sub-fund / Compartment">Sub-fund / Compartment</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Base Currency *</label>
                            <select 
                              required
                              value={newFund.baseCurrency}
                              onChange={(e) => setNewFund({...newFund, baseCurrency: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono font-bold focus:border-emerald-500 outline-none"
                            >
                              <option value="GHS">GHS — Ghanaian Cedi</option>
                              <option value="USD">USD — US Dollar</option>
                              <option value="EUR">EUR — Euro</option>
                              <option value="GBP">GBP — British Pound</option>
                              <option value="Other">Other Currency</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Domicile / Jurisdiction *</label>
                            <select 
                              required
                              value={newFund.domicile}
                              onChange={(e) => setNewFund({...newFund, domicile: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-medium focus:border-emerald-500 outline-none"
                            >
                              <option value="Ghana">Ghana</option>
                              <option value="United States">United States</option>
                              <option value="United Kingdom">United Kingdom</option>
                              <option value="Luxembourg">Luxembourg</option>
                              <option value="Ireland">Ireland</option>
                              <option value="Other">Other Jurisdiction</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inception Date *</label>
                            <input 
                              required
                              type="date"
                              value={newFund.inceptionDate}
                              onChange={(e) => setNewFund({...newFund, inceptionDate: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono focus:border-emerald-500 outline-none"
                            />
                          </div>
                        </div>

                        {/* Progressive Disclosure for Ticker Symbol */}
                        {!newFund.showAdvancedIdentity ? (
                          <button 
                            type="button"
                            onClick={() => setNewFund({...newFund, showAdvancedIdentity: true})}
                            className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-colors pt-1"
                          >
                            + Show Advanced Identity Options (Ticker Symbol)
                          </button>
                        ) : (
                          <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                              <span>Ticker Symbol (Optional)</span>
                              <span className="text-[9px] text-slate-500 font-normal">For publicly traded or exchange-listed funds</span>
                            </label>
                            <input 
                              type="text" 
                              value={newFund.ticker}
                              onChange={(e) => setNewFund({...newFund, ticker: e.target.value.toUpperCase()})}
                              placeholder="e.g. OGEF"
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono"
                            />
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Investment Objective</label>
                          <textarea 
                            value={newFund.description}
                            onChange={(e) => setNewFund({...newFund, description: e.target.value})}
                            rows={2}
                            placeholder="Describe investment objective, benchmark index, and asset allocation strategy..."
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:border-emerald-500 outline-none resize-none"
                          />
                        </div>
                      </div>

                      {/* SECTION 2: REGULATORY & ADMINISTRATION */}
                      <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
                        <div className="border-b border-slate-800/80 pb-3">
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-blue-400" />
                            2. Regulatory & Administration
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">Capture regulatory registration and key service-provider relationships.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Regulator</label>
                            <select 
                              value={newFund.regulator}
                              onChange={(e) => setNewFund({...newFund, regulator: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-medium focus:border-emerald-500 outline-none"
                            >
                              <option value="Securities and Exchange Commission — Ghana">Securities and Exchange Commission — Ghana (SEC)</option>
                              <option value="Securities and Exchange Commission — US">Securities and Exchange Commission — US (SEC)</option>
                              <option value="Financial Conduct Authority — UK">Financial Conduct Authority — UK (FCA)</option>
                              <option value="CSSF — Luxembourg">CSSF — Luxembourg</option>
                              <option value="Central Bank of Ireland">Central Bank of Ireland</option>
                              <option value="Other">Other Regulatory Authority</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Registration / Fund Number</label>
                            <input 
                              type="text" 
                              value={newFund.registrationNumber}
                              onChange={(e) => setNewFund({...newFund, registrationNumber: e.target.value})}
                              placeholder="e.g. SEC/FUND/2026/04"
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono focus:border-emerald-500 outline-none"
                            />
                          </div>
                        </div>

                        {/* Progressive Disclosure for LEI */}
                        {!newFund.showAdvancedRegulatory ? (
                          <button 
                            type="button"
                            onClick={() => setNewFund({...newFund, showAdvancedRegulatory: true})}
                            className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-colors pt-1"
                          >
                            + Show Advanced Regulatory Identifiers (LEI)
                          </button>
                        ) : (
                          <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <span>Legal Entity Identifier (LEI)</span>
                                <HelpCircle className="w-3.5 h-3.5 text-slate-500" title="Optional global identifier used to uniquely identify legal entities." />
                              </label>
                              <span className="text-[9px] text-slate-500">20-Character Standard</span>
                            </div>
                            <input 
                              type="text" 
                              maxLength={20}
                              value={newFund.lei}
                              onChange={(e) => setNewFund({...newFund, lei: e.target.value.toUpperCase().replace(/\s+/g, '')})}
                              placeholder="20-character Legal Entity Identifier"
                              className={cn(
                                "w-full bg-slate-900 border rounded-xl px-3.5 py-2 text-white font-mono tracking-wider outline-none",
                                isLeiInvalid ? "border-amber-500" : "border-slate-800 focus:border-emerald-500"
                              )}
                            />
                            {isLeiInvalid && (
                              <p className="text-[10px] text-amber-400">LEI must be exactly 20 characters.</p>
                            )}
                          </div>
                        )}

                        {/* Service Providers Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fund Manager *</label>
                            <select 
                              value={newFund.fundManager}
                              onChange={(e) => setNewFund({...newFund, fundManager: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-medium focus:border-emerald-500 outline-none"
                            >
                              <option value="OmniFund Capital Ltd">OmniFund Capital Ltd</option>
                              <option value="Datagroup Asset Management">Datagroup Asset Management</option>
                              <option value="IC Asset Managers">IC Asset Managers</option>
                              <option value="Custom">Custom Fund Manager</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fund Administrator</label>
                            <select 
                              value={newFund.administrator}
                              onChange={(e) => setNewFund({...newFund, administrator: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-medium focus:border-emerald-500 outline-none"
                            >
                              <option value="OmniFund Administration Services">OmniFund Admin Services</option>
                              <option value="Apex Group">Apex Group</option>
                              <option value="Citco Fund Services">Citco Fund Services</option>
                              <option value="State Street Fund Admin">State Street</option>
                              <option value="Custom">Custom Administrator</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Custodian</label>
                            <select 
                              value={newFund.custodian}
                              onChange={(e) => setNewFund({...newFund, custodian: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-medium focus:border-emerald-500 outline-none"
                            >
                              <option value="Standard Chartered Bank Ghana">Standard Chartered</option>
                              <option value="Stanbic Bank Ghana Custody">Stanbic Bank Custody</option>
                              <option value="GCB Bank Custody">GCB Bank Custody</option>
                              <option value="Zenith Bank Custody">Zenith Bank Custody</option>
                              <option value="Custom">Custom Custodian</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Auditor</label>
                            <select 
                              value={newFund.auditor}
                              onChange={(e) => setNewFund({...newFund, auditor: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-white font-medium focus:border-emerald-500 outline-none"
                            >
                              <option value="KPMG Ghana">KPMG Ghana</option>
                              <option value="PwC Ghana">PwC Ghana</option>
                              <option value="Deloitte Ghana">Deloitte Ghana</option>
                              <option value="EY Ghana">EY Ghana</option>
                              <option value="Custom">Custom Auditor</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* SECTION 3: VALUATION & UNIT SETUP */}
                      <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
                        <div className="border-b border-slate-800/80 pb-3">
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <Scale className="w-4 h-4 text-amber-400" />
                            3. Valuation & Unit Setup
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">Configure how the fund is valued and establish its opening capitalization.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">NAV Calculation Frequency *</label>
                            <select 
                              required
                              value={newFund.navFrequency}
                              onChange={(e) => setNewFund({...newFund, navFrequency: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-medium focus:border-emerald-500 outline-none"
                            >
                              <option value="Daily">Daily</option>
                              <option value="Weekly">Weekly</option>
                              <option value="Monthly">Monthly</option>
                              <option value="Quarterly">Quarterly</option>
                              <option value="Other">Other Frequency</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valuation Frequency *</label>
                            <select 
                              required
                              value={newFund.valuationFrequency}
                              onChange={(e) => setNewFund({...newFund, valuationFrequency: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-medium focus:border-emerald-500 outline-none"
                            >
                              <option value="Daily">Daily</option>
                              <option value="Weekly">Weekly</option>
                              <option value="Monthly">Monthly</option>
                              <option value="Quarterly">Quarterly</option>
                              <option value="Other">Other Frequency</option>
                            </select>
                          </div>
                        </div>

                        {/* Progressive Disclosure for Pricing Method */}
                        {!newFund.showAdvancedValuation ? (
                          <button 
                            type="button"
                            onClick={() => setNewFund({...newFund, showAdvancedValuation: true})}
                            className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-colors pt-1"
                          >
                            + Show Advanced Valuation Rules (Pricing Method)
                          </button>
                        ) : (
                          <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pricing Method</label>
                            <select 
                              value={newFund.pricingMethod}
                              onChange={(e) => setNewFund({...newFund, pricingMethod: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:border-emerald-500 outline-none"
                            >
                              <option value="Forward Pricing">Forward Pricing (Standard)</option>
                              <option value="Previous NAV">Previous NAV</option>
                              <option value="Other">Other Valuation Method</option>
                            </select>
                          </div>
                        )}

                        {/* Capitalization Box */}
                        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="checkbox"
                              checked={newFund.initializeZeroBalance}
                              onChange={(e) => setNewFund({...newFund, initializeZeroBalance: e.target.checked})}
                              className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                            />
                            <span className="text-xs font-bold text-slate-200">Initialize fund with zero balance (Empty Fund Setup)</span>
                          </label>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">NAV per Unit ({newFund.baseCurrency}) *</label>
                              <input 
                                required
                                type="number"
                                step="0.000001"
                                min="0.000001"
                                value={newFund.nav}
                                onChange={(e) => setNewFund({...newFund, nav: Number(e.target.value)})}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold text-sm focus:border-emerald-500 outline-none"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opening Units *</label>
                              <input 
                                required
                                disabled={newFund.initializeZeroBalance}
                                type="number"
                                min="0"
                                step="0.000001"
                                value={newFund.initializeZeroBalance ? 0 : newFund.totalUnits || ''}
                                onChange={(e) => setNewFund({...newFund, totalUnits: Number(e.target.value)})}
                                placeholder="0"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold text-sm focus:border-emerald-500 outline-none disabled:opacity-50"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Opening Net Assets</label>
                              <div className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold text-sm">
                                {newFund.baseCurrency} {formatCurrency(newFund.aum)}
                              </div>
                            </div>
                          </div>

                          <p className="text-[10px] text-slate-400 italic">
                            💡 Calculated from Opening Units × NAV per Unit.
                          </p>
                        </div>
                      </div>

                      {/* SECTION 4: DATA IMPORT & INITIALIZATION */}
                      <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                          <div>
                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-blue-400" />
                              4. Data Import & Initialization
                            </h4>
                            <p className="text-[11px] text-slate-400 mt-0.5">Optionally import existing fund data from a custodian, administrator or accounting system.</p>
                          </div>
                          <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold">
                            Optional
                          </span>
                        </div>

                        {/* AI / SMART INGESTION CARD */}
                        <div className="p-4 bg-blue-950/10 border border-blue-500/20 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400 flex-shrink-0 mt-0.5">
                              <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                              <h5 className="text-xs font-bold text-white">Smart Fund Data Import</h5>
                              <p className="text-[11px] text-slate-400 mt-0.5 max-w-lg">
                                Upload a custodian, administrator or accounting-system export (CSV, XLSX, PDF) to automatically map and populate fund setup information and opening balances.
                              </p>
                            </div>
                          </div>

                          <div className="flex-shrink-0">
                            <input 
                              type="file" 
                              id="smart-ingestion-input"
                              className="hidden" 
                              onChange={handleIngestionFileSelect}
                              multiple
                              accept=".csv,.xlsx,.xls,.pdf,.json,.xml"
                            />
                            <label 
                              htmlFor="smart-ingestion-input"
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl cursor-pointer transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
                            >
                              {isIngesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                              Upload Fund Data
                            </label>
                          </div>
                        </div>

                        {ingestionResult && (
                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1">
                            <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              AI Data Extraction Complete: {ingestionResult.entities.investors.length} Investors & {ingestionResult.entities.assets.length} Assets Mapped
                            </div>
                          </div>
                        )}
                      </div>

                    </div>

                    {/* RIGHT COLUMN: STICKY SUMMARY / REVIEW PANEL (1/3 WIDTH) */}
                    <div className="lg:col-span-1">
                      <div className="sticky top-0 p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
                        <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                            <FileText className="w-4 h-4 text-emerald-400" />
                            Fund Setup Summary
                          </h4>
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        </div>

                        <div className="space-y-3 font-mono text-[11px]">
                          <div className="p-2.5 bg-slate-900 border border-slate-800/80 rounded-xl space-y-0.5">
                            <span className="text-[9px] text-slate-500 uppercase font-sans font-bold">Fund Legal Name</span>
                            <p className="text-xs font-bold text-white font-sans line-clamp-1">{newFund.name || 'Not configured'}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="p-2 bg-slate-900 border border-slate-800/80 rounded-xl space-y-0.5">
                              <span className="text-[9px] text-slate-500 uppercase font-sans font-bold">Fund Code</span>
                              <p className="text-xs font-bold text-emerald-400">{newFund.code || 'Not configured'}</p>
                            </div>
                            <div className="p-2 bg-slate-900 border border-slate-800/80 rounded-xl space-y-0.5">
                              <span className="text-[9px] text-slate-500 uppercase font-sans font-bold">Currency</span>
                              <p className="text-xs font-bold text-white">{newFund.baseCurrency}</p>
                            </div>
                          </div>

                          <div className="p-2.5 bg-slate-900 border border-slate-800/80 rounded-xl space-y-0.5">
                            <span className="text-[9px] text-slate-500 uppercase font-sans font-bold">Fund Type & Structure</span>
                            <p className="text-xs text-slate-300 font-sans font-semibold">{newFund.fundType} • {newFund.fundStructure}</p>
                          </div>

                          <div className="p-2.5 bg-slate-900 border border-slate-800/80 rounded-xl space-y-0.5">
                            <span className="text-[9px] text-slate-500 uppercase font-sans font-bold">Jurisdiction / Regulator</span>
                            <p className="text-xs text-slate-300 font-sans">{newFund.domicile} ({newFund.regulator.split('—')[0].trim()})</p>
                          </div>

                          <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl space-y-2">
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span>NAV per Unit:</span>
                              <span className="text-emerald-400 font-bold">{newFund.baseCurrency} {Number(newFund.nav).toFixed(4)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span>Opening Units:</span>
                              <span className="text-white font-bold">{Number(newFund.totalUnits).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20 text-xs">
                              <span className="font-bold text-white font-sans">Opening Net Assets:</span>
                              <span className="font-bold text-emerald-400">{newFund.baseCurrency} {formatCurrency(newFund.aum)}</span>
                            </div>
                          </div>

                          <div className="p-2 bg-slate-900 border border-slate-800/80 rounded-xl text-[10px] text-slate-400 flex items-center justify-between font-sans">
                            <span>NAV Frequency:</span>
                            <span className="font-bold text-white">{newFund.navFrequency}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BOTTOM ACTION BAR */}
                  <div className="p-5 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-3 flex-shrink-0">
                    <button 
                      type="button"
                      disabled={isProvisioning}
                      onClick={() => setIsAddModalOpen(false)}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={isProvisioning || isCodeDuplicate || !newFund.name.trim() || !newFund.code.trim()}
                      className="px-7 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 text-sm"
                    >
                      {isProvisioning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Provisioning Fund...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Create Fund</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Share Class Setup Modal */}
      <AnimatePresence>
        {showShareClassModal && createdFundConfirmation && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Add Share Class</h3>
                    <p className="text-xs text-slate-400">{createdFundConfirmation.name} ({createdFundConfirmation.code || createdFundConfirmation.ticker})</p>
                  </div>
                </div>
                <button onClick={() => setShowShareClassModal(false)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const newShareClass = {
                    id: `SC-${Date.now()}`,
                    ...shareClassForm
                  };
                  const currentClasses = createdFundConfirmation.shareClasses || [];
                  const updatedClasses = [...currentClasses, newShareClass];
                  await updateDoc(doc(db, 'accounts', createdFundConfirmation.id), {
                    shareClasses: updatedClasses
                  });
                  setCreatedFundConfirmation({
                    ...createdFundConfirmation,
                    shareClasses: updatedClasses
                  });
                  toast.success(`Share Class '${shareClassForm.name}' added successfully!`);
                  setShowShareClassModal(false);
                } catch (err) {
                  handleFirestoreError(err, OperationType.WRITE, 'accounts');
                }
              }} className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Share Class Name *</label>
                  <input 
                    required
                    type="text" 
                    value={shareClassForm.name}
                    onChange={(e) => setShareClassForm({...shareClassForm, name: e.target.value})}
                    placeholder="e.g. Class A (Retail) Accumulation"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-semibold outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Investor Type *</label>
                    <select 
                      value={shareClassForm.type}
                      onChange={(e) => setShareClassForm({...shareClassForm, type: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white outline-none focus:border-emerald-500"
                    >
                      <option value="Retail">Retail</option>
                      <option value="Institutional">Institutional</option>
                      <option value="HNWI">High Net Worth (HNWI)</option>
                      <option value="Founders">Founders / Seed Class</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Share Class Currency *</label>
                    <select 
                      value={shareClassForm.currency}
                      onChange={(e) => setShareClassForm({...shareClassForm, currency: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-mono font-bold outline-none focus:border-emerald-500"
                    >
                      <option value="GHS">GHS — Ghanaian Cedi</option>
                      <option value="USD">USD — US Dollar</option>
                      <option value="EUR">EUR — Euro</option>
                      <option value="GBP">GBP — British Pound</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Initial Share Class NAV *</label>
                  <input 
                    required
                    type="number" 
                    step="0.000001"
                    value={shareClassForm.nav}
                    onChange={(e) => setShareClassForm({...shareClassForm, nav: Number(e.target.value)})}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-emerald-400 font-mono font-bold text-sm outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="pt-3 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setShowShareClassModal(false)}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20"
                  >
                    Save Share Class
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
                {accountToDelete ? "Delete Fund?" : `Delete ${selectedAccountIds.size} Funds?`}
              </h3>
              <p className="text-slate-400 text-sm mb-6">
                {accountToDelete 
                  ? "This action is permanent and will delete all associated assets, investors, valuations, and transaction history for this fund."
                  : `This action is permanent and will delete all assets, investors, valuations, and transaction history for these ${selectedAccountIds.size} funds.`
                }
              </p>

              <form onSubmit={(e) => { e.preventDefault(); handleDeleteAccount(); }}>
                <div className="space-y-4 mb-8">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-400" />
                        Enter Admin PIN to Authorize
                      </span>
                      <span className="text-xs font-mono text-slate-500">PIN: 1234</span>
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
                        "w-full bg-slate-800 border rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[1em] focus:ring-2 outline-none transition-all font-mono",
                        pinError ? "border-red-500 focus:ring-red-500" : "border-slate-700 focus:ring-emerald-500"
                      )}
                      placeholder="****"
                      autoFocus
                    />
                    {pinError && (
                      <p className="text-red-400 text-xs font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Incorrect PIN. Enter default Admin PIN (1234).
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsDeleteModalOpen(false);
                      setAccountToDelete(null);
                      setPinInput("");
                      setPinError(false);
                    }}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isDeleting || pinInput.length < 4}
                    className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-600/20 text-sm flex items-center justify-center gap-2"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Confirm Delete"
                    )}
                  </button>
                </div>
              </form>
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
                
                const accountAssets = portfolio.filter(p => p.accountId === updatedAccount.id);
                const portfolioValue = accountAssets.reduce((sum, p) => sum + (p.marketValue || 0), 0);
                const manualNavAdjustment = calculatedAum - (portfolioValue + (updatedAccount.cashBalance || 0));

                await updateDoc(accountRef, {
                  name: updatedAccount.name,
                  ticker: updatedAccount.ticker,
                  description: updatedAccount.description,
                  nav: updatedAccount.nav,
                  aum: calculatedAum,
                  totalUnits: updatedAccount.totalUnits,
                  cashBalance: updatedAccount.cashBalance,
                  manualNavAdjustment,
                  isManualNav: true,
                  isHidden: updatedAccount.isHidden || false,
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
