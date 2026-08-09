import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Calendar, 
  Download, 
  Loader2, 
  FileText, 
  CheckCircle2, 
  Mail, 
  Send, 
  AlertCircle, 
  Plus, 
  Trash2, 
  Edit2, 
  RotateCcw, 
  Check, 
  User, 
  Hash, 
  Coins, 
  HelpCircle,
  Award,
  BookOpen,
  Sliders
} from 'lucide-react';
import { Investor, InvestmentAccount, Transaction, Valuation } from '../types';
import { formatCurrency, cn, safeDate, safeISODate, safeFormatDate, safeTimestamp } from '../lib/utils';
import { generateStatementPDF } from '../lib/pdfGenerator';

interface StatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  investor: Investor | null;
  fund: InvestmentAccount | null;
  accounts: InvestmentAccount[];
  transactions: Transaction[];
  valuations: Valuation[];
  isGmailConnected: boolean;
}

export default function StatementModal({ 
  isOpen, 
  onClose, 
  investor, 
  fund, 
  accounts, 
  transactions, 
  valuations,
  isGmailConnected
}: StatementModalProps) {
  // Base Dates
  const [startDate, setStartDate] = useState(
    new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Operational States
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active View Panel for Responsive Screens
  const [activePanel, setActivePanel] = useState<'editor' | 'preview'>('editor');

  // Interactive Editable Copied States
  const [customInvestorName, setCustomInvestorName] = useState('');
  const [customInvestorId, setCustomInvestorId] = useState('');
  const [customInvestorEmail, setCustomInvestorEmail] = useState('');
  const [customFundName, setCustomFundName] = useState('');
  const [customNav, setCustomNav] = useState<number>(1.0000);
  const [customUnitsOwned, setCustomUnitsOwned] = useState<number>(0);
  const [isAutoCalc, setIsAutoCalc] = useState(true);

  // Manual values (overrides when isAutoCalc === false)
  const [manualPurchaseAmount, setManualPurchaseAmount] = useState<string>('');
  const [manualYtd, setManualYtd] = useState<string>('');
  const [manualClosingValue, setManualClosingValue] = useState<string>('');

  // Local Transactions list copied for safe mockup edits
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>([]);

  // Transaction Adding / Editing Inlines
  const [isAddingTx, setIsAddingTx] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);

  // Temp inline form fields
  const [txForm, setTxForm] = useState({
    type: 'BUY' as 'BUY' | 'SELL',
    timestamp: new Date().toISOString().split('T')[0],
    totalAmount: 1000,
    pricePerUnit: 1.0000,
    units: 1000
  });

  // Re-synchronize when modal is opened
  useEffect(() => {
    if (isOpen && investor) {
      setCustomInvestorName(investor.name);
      setCustomInvestorId(investor.investorId || '');
      setCustomInvestorEmail(investor.email || '');
      setCustomFundName(fund?.name || (accounts.find(a => a.id === investor.accountId)?.name || 'UMB stockbrokers Fund'));
      setCustomNav(fund?.nav || (accounts.find(a => a.id === investor.accountId)?.nav || 1.0000));
      setCustomUnitsOwned(investor.unitsOwned || 0);

      // Clone transaction logs matching this investor for secure playground editing
      const investorTxs = transactions.filter(t => t.investorId === investor.id);
      setLocalTransactions(investorTxs);

      // Defaults
      setIsAutoCalc(true);
      setManualPurchaseAmount('');
      setManualYtd('');
      setManualClosingValue('');
      setIsAddingTx(false);
      setEditingTxId(null);
      setActivePanel('editor');
    }
  }, [isOpen, investor, fund, transactions, accounts]);

  // Handle auto-sync customNav from selected date / valuation engines
  const handleSmartNavLookup = () => {
    if (!fund && !investor) return;
    const activeAccountId = investor?.accountId || fund?.id || '';
    if (!activeAccountId) return;

    const targetDate = safeISODate(endDate);
    const sortedVals = [...valuations]
      .filter(v => v.accountId === activeAccountId)
      .sort((a, b) => safeTimestamp(b.date) - safeTimestamp(a.date));

    const match = sortedVals.find(v => {
      return safeISODate(v.date) <= targetDate;
    });

    const fetchedNav = match?.nav || fund?.nav || 1.0000;
    setCustomNav(fetchedNav);
  };

  // Filter localTransactions between selected dates for presentation
  const filteredTxs = useMemo(() => {
    const start = safeDate(startDate) || new Date(0);
    const end = safeDate(endDate) || new Date();
    end.setHours(23, 59, 59, 999);

    return [...localTransactions]
      .filter(t => {
        const tDate = safeDate(t.timestamp);
        return tDate ? (tDate >= start && tDate <= end) : false;
      })
      .sort((a, b) => safeTimestamp(a.timestamp) - safeTimestamp(b.timestamp));
  }, [localTransactions, startDate, endDate]);

  // Calculate standard calculated totals based on the local editable transaction list
  const calculatedTotals = useMemo(() => {
    const periodTxs = filteredTxs;

    const totalPurchaseAmt = localTransactions
      .filter(t => t.type === 'BUY')
      .reduce((acc, t) => acc + t.totalAmount, 0);

    const totalRedeemAmt = localTransactions
      .filter(t => t.type === 'SELL')
      .reduce((acc, t) => acc + t.totalAmount, 0);

    // Dynamic running calculated units
    const unitsOwned = localTransactions.reduce((acc, t) => {
      if (t.type === 'BUY') return acc + t.units;
      if (t.type === 'SELL') return acc - t.units;
      return acc;
    }, 0);

    const netBasis = totalPurchaseAmt - totalRedeemAmt;
    const closingVal = unitsOwned * customNav;
    const ytd = netBasis > 0 ? ((closingVal - netBasis) / netBasis) * 100 : 0;

    return {
      unitsOwned: Math.max(0, unitsOwned),
      totalPurchaseAmount: totalPurchaseAmt,
      closingValue: closingVal,
      ytdPct: ytd
    };
  }, [localTransactions, filteredTxs, customNav]);

  // Determine final preview and generation items taking overrides into account
  const finalUnitsOwned = isAutoCalc ? calculatedTotals.unitsOwned : customUnitsOwned;
  const finalTotalPurchaseAmount = isAutoCalc ? calculatedTotals.totalPurchaseAmount : (Number(manualPurchaseAmount) || 0);
  const finalClosingValue = isAutoCalc ? calculatedTotals.closingValue : (Number(manualClosingValue) || 0);
  const finalYtd = isAutoCalc ? calculatedTotals.ytdPct : (Number(manualYtd) || 0);

  // Sync edits inside mock forms
  const handleFormAmountChange = (val: number) => {
    setTxForm(prev => {
      const units = prev.pricePerUnit > 0 ? val / prev.pricePerUnit : 0;
      return { ...prev, totalAmount: val, units };
    });
  };

  const handleFormPriceChange = (val: number) => {
    setTxForm(prev => {
      const units = val > 0 ? prev.totalAmount / val : 0;
      return { ...prev, pricePerUnit: val, units };
    });
  };

  const handleFormUnitsChange = (val: number) => {
    setTxForm(prev => {
      const amount = val * prev.pricePerUnit;
      return { ...prev, units: val, totalAmount: amount };
    });
  };

  // Trigger Adding a Custom Row
  const startAddTx = () => {
    setTxForm({
      type: 'BUY',
      timestamp: new Date().toISOString().split('T')[0],
      totalAmount: 5000,
      pricePerUnit: customNav,
      units: 5000 / customNav
    });
    setIsAddingTx(true);
    setEditingTxId(null);
  };

  const saveNewTx = () => {
    const tempId = `temp_tx_${Math.floor(Math.random() * 900000) + 100000}`;
    const freshTx: Transaction = {
      id: tempId,
      investorId: investor?.id || 'guest',
      accountId: investor?.accountId || fund?.id || '',
      type: txForm.type,
      totalAmount: txForm.totalAmount,
      pricePerUnit: txForm.pricePerUnit,
      units: txForm.units,
      timestamp: new Date(txForm.timestamp).toISOString()
    };
    setLocalTransactions(prev => [...prev, freshTx]);
    setIsAddingTx(false);
  };

  // Trigger Editing an Existing Row
  const startEditTx = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setTxForm({
      type: tx.type,
      timestamp: new Date(tx.timestamp).toISOString().split('T')[0],
      totalAmount: tx.totalAmount,
      pricePerUnit: tx.pricePerUnit,
      units: tx.units
    });
    setIsAddingTx(false);
  };

  const saveEditedTx = (id: string) => {
    setLocalTransactions(prev => prev.map(t => {
      if (t.id === id) {
        return {
          ...t,
          type: txForm.type,
          timestamp: new Date(txForm.timestamp).toISOString(),
          totalAmount: txForm.totalAmount,
          pricePerUnit: txForm.pricePerUnit,
          units: txForm.units
        };
      }
      return t;
    }));
    setEditingTxId(null);
  };

  // Remove transaction row
  const deleteTx = (id: string) => {
    setLocalTransactions(prev => prev.filter(t => t.id !== id));
  };

  // Restore to database default logs
  const handleReset = () => {
    if (!investor) return;
    const investorTxs = transactions.filter(t => t.investorId === investor.id);
    setLocalTransactions(investorTxs);
    setCustomInvestorName(investor.name);
    setCustomInvestorId(investor.investorId || '');
    setCustomInvestorEmail(investor.email || '');
    setCustomFundName(fund?.name || (accounts.find(a => a.id === investor.accountId)?.name || 'UMB stockbrokers Fund'));
    setCustomNav(fund?.nav || (accounts.find(a => a.id === investor.accountId)?.nav || 1.0000));
    setCustomUnitsOwned(investor.unitsOwned || 0);
    setIsAutoCalc(true);
    setManualPurchaseAmount('');
    setManualYtd('');
    setManualClosingValue('');
    setIsAddingTx(false);
    setEditingTxId(null);
  };

  // Master PDF Download (passes edits without database sync)
  const handleDownload = async () => {
    if (!investor || !fund) return;
    setIsGenerating(true);
    try {
      // Mock objects representing overridden variables
      const customInvestor: Investor = {
        ...investor,
        name: customInvestorName,
        investorId: customInvestorId,
        unitsOwned: finalUnitsOwned,
        email: customInvestorEmail
      };

      const customFund: InvestmentAccount = {
        ...fund,
        name: customFundName,
        nav: customNav
      };

      // Compile Document using edits
      const doc = await generateStatementPDF(
        customInvestor,
        customFund,
        localTransactions,
        startDate,
        endDate,
        {
          totalPurchaseAmount: finalTotalPurchaseAmount,
          closingValue: finalClosingValue,
          ytdPct: finalYtd
        }
      );

      if (doc) {
        const titleSafe = customInvestorName.replace(/\s+/g, '_');
        doc.save(`${titleSafe}_Statement_${startDate}_to_${endDate}.pdf`);
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
        }, 2000);
      }
    } catch (error) {
      console.error('Download error:', error);
      setErrorMessage('Could not compile PDF statement: ' + (error instanceof Error ? error.message : 'Unknown compilation failure'));
    } finally {
      setIsGenerating(false);
    }
  };

  // Master Email Sender (Sends the exact customized statement without mutating actual accounts)
  const handleSendEmail = async () => {
    if (!investor || !fund) return;
    setEmailStatus('sending');
    try {
      const customInvestor: Investor = {
        ...investor,
        name: customInvestorName,
        investorId: customInvestorId,
        unitsOwned: finalUnitsOwned,
        email: customInvestorEmail
      };

      const customFund: InvestmentAccount = {
        ...fund,
        name: customFundName,
        nav: customNav
      };

      const doc = await generateStatementPDF(
        customInvestor,
        customFund,
        localTransactions,
        startDate,
        endDate,
        {
          totalPurchaseAmount: finalTotalPurchaseAmount,
          closingValue: finalClosingValue,
          ytdPct: finalYtd
        }
      );

      if (doc) {
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        
        const response = await fetch('/api/send-statement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            investorEmail: customInvestorEmail, // customized email
            investorName: customInvestorName,   // customized name
            pdfBase64,
            startDate,
            endDate,
            fundName: customFundName            // customized fund name
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to send email');
        }
        
        setEmailStatus('success');
        setTimeout(() => {
          setEmailStatus('idle');
        }, 2000);
      }
    } catch (error) {
      console.error('Email error:', error);
      setEmailStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send email');
      setTimeout(() => {
        setEmailStatus('idle');
        setErrorMessage(null);
      }, 5000);
    }
  };

  const getInitials = (name: string) => {
    return name ? name.split(' ').map(n => n[0]).slice(0, 2).join('') : 'U';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.98, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 15 }}
            className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col md:flex-row h-[90vh] max-h-[850px] overflow-hidden"
          >
            {/* LEFT WORKSPACE PANELS: Controls, overriding options, and local transaction catalog */}
            <div className={cn(
              "w-full md:w-[44%] flex flex-col h-full border-r border-slate-800 bg-slate-900",
              activePanel === 'preview' ? "hidden md:flex" : "flex"
            )}>
              {/* Workspace Header */}
              <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                    <FileText className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Statement Workspace</h3>
                    <p className="text-slate-500 text-[10px] uppercase font-black tracking-tight">Interactive Override Mode</p>
                  </div>
                </div>
                
                {/* Control Action Header */}
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleReset}
                    title="Restore database values"
                    className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all text-xs flex items-center gap-1 border border-slate-800"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold">Reset</span>
                  </button>

                  <button 
                    onClick={onClose}
                    className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all md:hidden"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Sub-Header Tabs for Mobile Screens Only */}
              <div className="flex md:hidden border-b border-slate-800 p-2 bg-slate-950/20 gap-2">
                <button 
                  onClick={() => setActivePanel('editor')}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all",
                    activePanel === 'editor' ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  Configure Form
                </button>
                <button 
                  onClick={() => setActivePanel('preview')}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all",
                    activePanel === 'preview' ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  Live Statement View
                </button>
              </div>

              {/* Left Panel Workspace Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                
                {/* 1. DATE SELECTION CONTROLS */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    1. Chronology Period
                  </h4>
                  <div className="grid grid-cols-2 gap-3 bg-slate-950/30 p-3 rounded-2xl border border-slate-800/60">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
                      <input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-slate-850 border border-slate-750 rounded-xl px-2.5 py-1.5 text-xs text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End Date</label>
                      <input 
                        type="date" 
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        onBlur={handleSmartNavLookup}
                        className="w-full bg-slate-850 border border-slate-750 rounded-xl px-2.5 py-1.5 text-xs text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. DEMOGRAPHICS AND CORE METADATA */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    2. Document Inscriptions
                  </h4>
                  <div className="space-y-3 bg-slate-950/30 p-3.5 rounded-2xl border border-slate-800/60 text-xs">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mutual Fund Name</label>
                      <input 
                        type="text" 
                        value={customFundName}
                        onChange={(e) => setCustomFundName(e.target.value)}
                        className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-1.5 text-xs text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                        placeholder="Fund Title placeholder"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Client Inscription Name</label>
                      <input 
                        type="text" 
                        value={customInvestorName}
                        onChange={(e) => setCustomInvestorName(e.target.value)}
                        className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-1.5 text-xs text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                        placeholder="Client Name"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account ID</label>
                        <input 
                          type="text" 
                          value={customInvestorId}
                          onChange={(e) => setCustomInvestorId(e.target.value)}
                          className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-1.5 text-xs text-white focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                          placeholder="Account #"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Target Email</label>
                        <input 
                          type="email" 
                          value={customInvestorEmail}
                          onChange={(e) => setCustomInvestorEmail(e.target.value)}
                          className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-1.5 text-xs text-white focus:ring-1 focus:ring-emerald-500 outline-none"
                          placeholder="Email address"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. COMPUTATIONS AND BALANCES - AUTO & FORCED MANUAL */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-slate-500" />
                      3. Valuation & Summaries
                    </h4>
                    
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={isAutoCalc}
                        onChange={(e) => {
                          setIsAutoCalc(e.target.checked);
                          if (!e.target.checked) {
                            // Populate manual states from calculated to facilitate starting edits
                            setManualPurchaseAmount(calculatedTotals.totalPurchaseAmount.toString());
                            setManualYtd(calculatedTotals.ytdPct.toFixed(2));
                            setManualClosingValue(calculatedTotals.closingValue.toString());
                          }
                        }}
                        className="w-3.5 h-3.5 rounded border-slate-750 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                      />
                      <span className="text-[10px] text-slate-500 font-bold uppercase select-none">Auto calculate</span>
                    </label>
                  </div>

                  <div className="bg-slate-950/30 p-3.5 rounded-2xl border border-slate-800/60 text-xs space-y-4">
                    {/* Unit NAV override */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Unit Price (NAV override)</label>
                        <button 
                          onClick={handleSmartNavLookup}
                          className="text-[9px] text-blue-400 hover:text-blue-300 transition"
                          title="Fetch nearest matched historical valuation for end date"
                        >
                          Smart Date Lookup
                        </button>
                      </div>
                      <input 
                        type="number" 
                        step="0.0001"
                        value={customNav}
                        onChange={(e) => setCustomNav(Number(e.target.value))}
                        className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-1.5 text-xs text-white focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                      />
                    </div>

                    {isAutoCalc ? (
                      <div className="space-y-2 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/50 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Calculated Closing Units:</span>
                          <span className="text-slate-300 font-bold">{calculatedTotals.unitsOwned.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Calculated Purchase Principal:</span>
                          <span className="text-slate-300 font-bold">{formatCurrency(calculatedTotals.totalPurchaseAmount)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Calculated Valuation:</span>
                          <span className="text-emerald-500 font-bold">{formatCurrency(calculatedTotals.closingValue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Calculated YTD return:</span>
                          <span className={cn("font-bold", calculatedTotals.ytdPct >= 0 ? "text-emerald-500" : "text-red-400")}>
                            {calculatedTotals.ytdPct.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 pt-1 border-t border-slate-850">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Manual Units</label>
                            <input 
                              type="number" 
                              value={customUnitsOwned}
                              onChange={(e) => setCustomUnitsOwned(Number(e.target.value))}
                              className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-1.5 text-xs text-white focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Manual Purchase</label>
                            <input 
                              type="number" 
                              value={manualPurchaseAmount}
                              onChange={(e) => setManualPurchaseAmount(e.target.value)}
                              className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-1.5 text-xs text-white focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Manual Total Value</label>
                            <input 
                              type="number" 
                              value={manualClosingValue}
                              onChange={(e) => setManualClosingValue(e.target.value)}
                              className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-1.5 text-xs text-white focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Manual YTD %</label>
                            <input 
                              type="number" 
                              value={manualYtd}
                              onChange={(e) => setManualYtd(e.target.value)}
                              className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-1.5 text-xs text-white focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. TRANSACTION LOGS FORWARD PLAYGROUND */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-slate-500" />
                      4. Ledger Override
                    </h4>
                    
                    {!isAddingTx && !editingTxId && (
                      <button 
                        onClick={startAddTx}
                        className="text-[9px] font-bold bg-blue-500 text-white px-2 py-1 rounded inline-flex items-center gap-1 hover:bg-blue-600 transition"
                      >
                        <Plus className="w-3 h-3" /> Insert Row
                      </button>
                    )}
                  </div>

                  {/* Inline Form for Adding / Editing Row */}
                  {(isAddingTx || editingTxId) && (
                    <div className="bg-slate-950 p-4 rounded-2xl border border-blue-500/30 text-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="font-bold text-blue-400">
                          {isAddingTx ? 'Insert Temporary Row' : 'Edit Row'}
                        </span>
                        <div className="flex h-5 items-stretch bg-slate-800 rounded overflow-hidden">
                          <button 
                            type="button"
                            onClick={() => setTxForm(prev => ({ ...prev, type: 'BUY' }))}
                            className={cn("px-2.5 text-[10px] font-bold transition-all", txForm.type === 'BUY' ? "bg-emerald-600 text-white animate-pulse" : "text-slate-400 hover:text-white")}
                          >
                            Buy
                          </button>
                          <button 
                            type="button"
                            onClick={() => setTxForm(prev => ({ ...prev, type: 'SELL' }))}
                            className={cn("px-2.5 text-[10px] font-bold transition-all", txForm.type === 'SELL' ? "bg-red-600 text-white animate-pulse" : "text-slate-400 hover:text-white")}
                          >
                            Sell
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Date</label>
                          <input 
                            type="date" 
                            value={txForm.timestamp}
                            onChange={(e) => setTxForm(p => ({ ...p, timestamp: e.target.value }))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Price (NAV)</label>
                          <input 
                            type="number" 
                            step="0.0001"
                            value={txForm.pricePerUnit}
                            onChange={(e) => handleFormPriceChange(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Amount (GHS)</label>
                          <input 
                            type="number" 
                            value={txForm.totalAmount}
                            onChange={(e) => handleFormAmountChange(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Units</label>
                          <input 
                            type="number" 
                            value={txForm.units}
                            onChange={(e) => handleFormUnitsChange(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end pt-2">
                        <button 
                          onClick={() => {
                            setIsAddingTx(false);
                            setEditingTxId(null);
                          }}
                          className="px-2.5 py-1 text-[10px] text-slate-400 hover:text-white transition"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={isAddingTx ? saveNewTx : () => saveEditedTx(editingTxId!)}
                          className="px-3 py-1 bg-blue-500 rounded text-white text-[10px] font-bold hover:bg-blue-600 transition flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" /> Save Row
                        </button>
                      </div>
                    </div>
                  )}

                  {/* List of playground transaction logs */}
                  <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/20 max-h-[220px] overflow-y-auto">
                    <table className="w-full text-left text-[10px] leading-tight">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-800 text-slate-500 sticky top-0 font-bold uppercase tracking-wider">
                          <th className="p-2">Date</th>
                          <th className="p-2">Type</th>
                          <th className="p-2 text-right">Amount</th>
                          <th className="p-2 text-right">Price</th>
                          <th className="p-2 text-center">Settings</th>
                        </tr>
                      </thead>
                      <tbody>
                        {localTransactions.length > 0 ? (
                          [...localTransactions]
                            .sort((a,b) => safeTimestamp(b.timestamp) - safeTimestamp(a.timestamp))
                            .map((t, idx) => {
                              const tDate = safeDate(t.timestamp);
                              const sDate = safeDate(startDate);
                              const eDate = safeDate(endDate);
                              const isOutOfPeriod = !tDate || !sDate || !eDate || tDate < sDate || tDate > eDate;
                              return (
                                <tr 
                                  key={t.id || idx} 
                                  className={cn(
                                    "border-b border-slate-800/40 hover:bg-slate-900/60 transition-colors",
                                    isOutOfPeriod ? "opacity-40" : ""
                                  )}
                                  title={isOutOfPeriod ? "Out of selected date range - won't show in pdf table" : "Active Statement Transaction"}
                                >
                                  <td className="p-2 font-mono whitespace-nowrap">
                                    {safeFormatDate(t.timestamp, {month:'short', day:'numeric'})}
                                  </td>
                                  <td className="p-2">
                                    <span className={cn(
                                      "px-1 rounded text-[9px] font-bold uppercase",
                                      t.type === 'BUY' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                                    )}>
                                      {t.type}
                                    </span>
                                  </td>
                                  <td className="p-2 text-right font-mono font-medium">
                                    {t.totalAmount.toLocaleString(undefined, {maximumFractionDigits:0})}
                                  </td>
                                  <td className="p-2 text-right font-mono text-slate-400">
                                    {t.pricePerUnit.toFixed(2)}
                                  </td>
                                  <td className="p-2 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <button 
                                        onClick={() => startEditTx(t)}
                                        className="p-1 text-slate-400 hover:text-blue-400 transition"
                                        title="Configure row details"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </button>
                                      <button 
                                        onClick={() => deleteTx(t.id)}
                                        className="p-1 text-slate-400 hover:text-red-400 transition"
                                        title="Remove row"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                        ) : (
                          <tr>
                            <td colSpan={5} className="p-4 text-center text-slate-500 italic">No transactions tracked</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              {/* Left Workspace Footer (Actions Toolbar) */}
              <div className="p-5 border-t border-slate-800 bg-slate-950/40 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={handleDownload}
                    disabled={isGenerating || isSuccess || emailStatus === 'sending'}
                    className={cn(
                      "py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg select-none",
                      isSuccess 
                        ? "bg-emerald-500 text-white" 
                        : "bg-emerald-600 hover:bg-emerald-500 text-white"
                    )}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Rendering...
                      </>
                    ) : isSuccess ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Ready!
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        Download
                      </>
                    )}
                  </button>

                  <button 
                    onClick={handleSendEmail}
                    disabled={emailStatus === 'sending' || isGenerating || isSuccess || !isGmailConnected}
                    className={cn(
                      "py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg select-none",
                      emailStatus === 'success' ? "bg-emerald-500 text-white" :
                      emailStatus === 'error' ? "bg-red-500 text-white" :
                      !isGmailConnected ? "bg-slate-800/40 text-slate-600 cursor-not-allowed border border-slate-800/60" :
                      "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                    )}
                    title={!isGmailConnected ? "Connect Gmail first" : ""}
                  >
                    {emailStatus === 'sending' ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Mailing...
                      </>
                    ) : emailStatus === 'success' ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Dispatched!
                      </>
                    ) : emailStatus === 'error' ? (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        Error
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Mail Document
                      </>
                    )}
                  </button>
                </div>

                {errorMessage && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2.5"
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-red-400 leading-normal">{errorMessage}</p>
                  </motion.div>
                )}
              </div>
            </div>

            {/* RIGHT PANEL: Live PDF mock representation rendering in real-time */}
            <div className={cn(
              "w-full md:w-[56%] bg-slate-950/70 p-5 md:p-6 flex flex-col h-full justify-start overflow-y-auto relative border-l border-slate-800/80",
              activePanel === 'preview' ? "flex" : "hidden md:flex"
            )}>
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                  Live Document Render View
                </h4>
                <div className="flex items-center gap-3">
                  <div className="text-[9px] text-slate-500 font-mono font-medium border border-slate-800 px-2 py-0.5 rounded bg-slate-900 shadow">
                    PDF WYSIWYG
                  </div>
                  <button 
                    onClick={onClose}
                    className="p-1 hover:bg-slate-805 rounded text-slate-400 hover:text-white transition hidden md:block"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Physical A4 Sheet Imitation Container */}
              <div className="flex-1 w-full flex items-center justify-center p-1 overflow-x-auto min-h-[420px]">
                <div className="bg-white text-slate-900 shadow-2xl rounded-2xl w-full max-w-[21cm] min-h-[580px] p-6 md:p-8 flex flex-col text-[10px] leading-relaxed relative border border-slate-200 select-none">
                  
                  {/* --- Header & Title --- */}
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h1 className="text-xs font-black tracking-widest uppercase text-slate-900 max-w-[220px] leading-tight">
                        {customFundName || 'UMB STOCKBROKERS MUTUAL FUND'}
                      </h1>
                      <h2 className="text-[10px] font-black tracking-wide text-slate-400 uppercase mt-0.5">Asset Statement</h2>
                    </div>
                    
                    {/* Realistic UMB Stockbrokers Logo Replica */}
                    <div className="flex h-7 items-stretch font-sans text-[10px] tracking-wider uppercase font-black">
                      <div className="bg-[#e0aa14] text-white flex items-center justify-center px-2.5 rounded-l select-none">
                        umb
                      </div>
                      <div className="bg-[#1e1e1e] text-white text-[7px] font-medium flex items-center justify-center px-2 rounded-r select-none tracking-tight">
                        stockbrokers
                      </div>
                    </div>
                  </div>

                  {/* --- Demographics Panel --- */}
                  <div className="grid grid-cols-12 gap-y-1 py-3 border-t border-b border-slate-200 text-[10px] text-slate-800">
                    <div className="col-span-4 text-slate-400 uppercase font-black text-[8px] tracking-wider">Client Name</div>
                    <div className="col-span-8 font-bold text-slate-950 pr-4 truncate">{customInvestorName}</div>
                    
                    <div className="col-span-4 text-slate-400 uppercase font-black text-[8px] tracking-wider">Account Number</div>
                    <div className="col-span-8 font-bold text-slate-950 font-mono">{customInvestorId}</div>
                    
                    <div className="col-span-4 text-slate-400 uppercase font-black text-[8px] tracking-wider">Statement Period</div>
                    <div className="col-span-8 font-bold text-slate-900 font-mono">
                      {safeFormatDate(startDate, { day: 'numeric', month: 'short', year: 'numeric' })} to{' '}
                      {safeFormatDate(endDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>

                  {/* --- Table of Playground Transactions --- */}
                  <div className="mt-4 flex-1">
                    <table className="w-full text-left text-[9px] leading-relaxed border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-950 font-black tracking-wider uppercase text-[8px]">
                          <th className="pb-1">Valuation Date</th>
                          <th className="pb-1">Transaction</th>
                          <th className="pb-1 text-right">Amount (GHS)</th>
                          <th className="pb-1 text-right">Price</th>
                          <th className="pb-1 text-right">Units</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTxs.length > 0 ? (
                          filteredTxs.map((t, index) => (
                            <tr key={t.id || index} className="border-b border-slate-100 text-slate-800">
                              <td className="py-1 px-0.5 font-mono">
                                {safeFormatDate(t.timestamp, {day: '2-digit', month: '2-digit', year: 'numeric'})}
                              </td>
                              <td className="py-1">
                                <span className={cn(
                                  "font-bold text-[8px] tracking-wide px-1.5 py-0.5 rounded uppercase",
                                  t.type === 'BUY' ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"
                                )}>
                                  {t.type === 'BUY' ? 'Buy' : 'Sell'}
                                </span>
                              </td>
                              <td className="py-1 text-right font-mono font-medium">
                                {t.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-1 text-right font-mono text-slate-500">
                                {t.pricePerUnit.toFixed(4)}
                              </td>
                              <td className="py-1 text-right font-mono font-medium">
                                {t.units.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                              No statement records found for this period
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* --- Ledger Totals Sheet Box --- */}
                  <div className="mt-6 border-t border-slate-200 pt-3 flex justify-end">
                    <div className="w-56 space-y-1 text-[9px] text-slate-700">
                      <div className="flex justify-between">
                        <span className="text-slate-400 uppercase tracking-wider text-[8px] font-black">Closing Units Owned</span>
                        <span className="font-bold text-slate-900">{finalUnitsOwned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 uppercase tracking-wider text-[8px] font-black">Total Principal Buys</span>
                        <span className="font-bold text-slate-900">GHS {finalTotalPurchaseAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 uppercase tracking-wider text-[8px] font-black">Closing Unit Price</span>
                        <span className="font-bold text-slate-900">GHS {customNav.toFixed(4)}</span>
                      </div>

                      <div className="border-t border-slate-350 my-1 pb-1" />

                      <div className="flex justify-between font-black text-slate-950 text-[10px]">
                        <span className="text-slate-900 uppercase tracking-wider text-[8px]">Closing Account Value</span>
                        <span className="text-emerald-700">GHS {finalClosingValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 uppercase tracking-wider text-[8px] font-black">YTD Performance Indicator</span>
                        <span className={cn(
                          "font-bold",
                          finalYtd >= 0 ? "text-emerald-700" : "text-red-700"
                        )}>
                          {finalYtd >= 0 ? '+' : ''}{finalYtd.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* --- Fine Print Footer --- */}
                  <div className="mt-auto pt-6 text-[7px] text-slate-400 leading-normal border-t border-dashed border-slate-100 italic">
                    <div>Questo è un rendiconto informatico - non è richiesta firma manuale.</div>
                    <div className="flex items-center justify-between">
                      <span>This is a computer-generated statement and requires no physical signature.</span>
                      <span className="font-bold text-slate-350">Page 1 of 1</span>
                    </div>
                    <div>For any discrepancies, please contact our support desk within 7 working days.</div>
                  </div>

                </div>
              </div>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
