import React, { useState, useRef } from 'react';
import { Investor, InvestmentAccount } from '../types';
import { 
  X, 
  Upload, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  FileText,
  ArrowRight,
  Calendar,
  DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import { db } from '../firebase';
import { collection, doc, increment, runTransaction, getDocs, query, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType, cn, formatCurrency } from '../lib/utils';
import { processTransactionDocument, ExtractedTransaction } from '../services/geminiService';

interface BulkTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  investors: Investor[];
  accounts: InvestmentAccount[];
  valuations: any[];
}

interface BulkRow {
  name: string;
  type: 'BUY' | 'SELL';
  amount: number;
  email?: string;
  phone?: string;
}

interface ProcessedRow extends BulkRow {
  investor?: Investor;
  isNew: boolean;
  error?: string;
  status: 'pending' | 'valid' | 'invalid' | 'processing' | 'success' | 'error';
}

export default function BulkTransactionModal({ isOpen, onClose, investors, accounts, valuations }: BulkTransactionModalProps) {
  const [processedRows, setProcessedRows] = useState<ProcessedRow[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || '');
  const [bulkDate, setBulkDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [useCustomNav, setUseCustomNav] = useState(false);
  const [manualNav, setManualNav] = useState(1.0000);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSmartProcessing, setIsSmartProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  // Smart NAV Lookup
  React.useEffect(() => {
    if (!useCustomNav && selectedAccountId) {
      const targetDate = new Date(bulkDate).toISOString().split('T')[0];
      const sortedVals = [...valuations]
        .filter(v => v.accountId === selectedAccountId)
        .sort((a, b) => {
          const dateA = a.date?.seconds ? a.date.seconds * 1000 : new Date(a.date).getTime();
          const dateB = b.date?.seconds ? b.date.seconds * 1000 : new Date(b.date).getTime();
          return dateB - dateA;
        });

      const match = sortedVals.find(v => {
        const vDate = v.date?.seconds ? new Date(v.date.seconds * 1000) : new Date(v.date);
        return vDate.toISOString().split('T')[0] <= targetDate;
      });

      const historicalNav = match?.nav || accounts.find(a => a.id === selectedAccountId)?.nav || 1.0000;
      setManualNav(historicalNav);
    }
  }, [bulkDate, selectedAccountId, useCustomNav, valuations, accounts]);

  const downloadTemplate = () => {
    const headers = ['name', 'type', 'amount', 'email', 'phone'];
    const sampleRows = [
      ['John Doe', 'BUY', '5000', 'john@example.com', '0244123456'],
      ['Jane Smith', 'SELL', '1000', '', ''],
      ['New Investor', 'BUY', '2500', 'new@investor.com', '0555987654']
    ];
    const csvContent = [headers, ...sampleRows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk_fund_transactions.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as any[];
          const validated = rows.map(row => {
            // Flexible header mapping
            const name = (row['FULL NAME'] || row.name || row['Investor Name'] || row.Investor)?.trim();
            const typeRaw = (row.TYPE || row.type || row['Transaction Type'])?.trim().toUpperCase();
            const type = (typeRaw === 'BUY' || typeRaw === 'SELL' || typeRaw === 'SUBSCRIPTION' || typeRaw === 'REDEMPTION') 
              ? (typeRaw === 'REDEMPTION' ? 'SELL' : (typeRaw === 'SUBSCRIPTION' ? 'BUY' : typeRaw)) 
              : 'BUY';
            const amount = Number(String(row['CONTRIBUTION AMOUNT'] || row.amount || row.Amount || row.Value).replace(/[^0-9.-]+/g,""));
            const email = (row['Email Address'] || row.email || row.Email)?.trim();
            const phone = (row['Phone Number'] || row.phone || row.Phone || row.Contact)?.trim();

            return validateRow({ name, type, amount, email, phone });
          });
          setProcessedRows(validated);
        }
      });
    } else {
      // Smart Processing for PDF/Images
      setIsSmartProcessing(true);
      try {
        const base64 = await fileToBase64(file);
        const extracted = await processTransactionDocument(base64, file.type);
        
        const validated = extracted.map(row => validateRow({
          name: row.name,
          type: row.type,
          amount: row.amount,
          email: row.email,
          phone: row.phone
        }));
        
        setProcessedRows(validated);
      } catch (error) {
        console.error('Smart processing failed:', error);
        alert('Failed to process document. Please try a CSV file or a clearer image.');
      } finally {
        setIsSmartProcessing(false);
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const validateRow = (row: BulkRow): ProcessedRow => {
    const investor = investors.find(i => i.name.toLowerCase() === row.name?.toLowerCase());
    const isNew = !investor;

    let error = '';
    if (!row.name) error = 'Name is required';
    else if (isNaN(row.amount) || row.amount <= 0) error = 'Invalid amount';
    else if (row.type !== 'BUY' && row.type !== 'SELL') error = 'Invalid type (use BUY or SELL)';
    else if (investor && row.type === 'SELL') {
      const currentNav = manualNav;
      const unitsToSell = row.amount / currentNav;
      if (investor.unitsOwned < unitsToSell) error = 'Insufficient units';
    }

    return {
      ...row,
      investor,
      isNew,
      error,
      status: error ? 'invalid' : 'valid'
    };
  };

  const processTransactions = async () => {
    const validRows = processedRows.filter(r => r.status === 'valid');
    if (validRows.length === 0 || !selectedAccount) return;

    setIsProcessing(true);
    let completed = 0;

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      const rowIndex = processedRows.indexOf(row);
      
      setProcessedRows(prev => prev.map((r, idx) => idx === rowIndex ? { ...r, status: 'processing' } : r));

      try {
        const currentNav = manualNav;

        await runTransaction(db, async (dbTransaction) => {
          const accountRef = doc(db, 'accounts', selectedAccount.id);
          let investorRef;
          let investorId;
          let unitsOwned = 0;
          let totalInvestment = 0;

          if (row.isNew) {
            investorRef = doc(collection(db, 'investors'));
            investorId = `INV-${Math.floor(100000 + Math.random() * 900000)}`;
            const defaultEmail = `${row.name.toLowerCase().replace(/\s+/g, '.')}@fund.local`;
            
            dbTransaction.set(investorRef, {
              investorId,
              name: row.name,
              email: row.email || defaultEmail,
              phone: row.phone || '',
              accountId: selectedAccount.id,
              unitsOwned: 0,
              totalInvestment: 0,
              currentValue: 0,
              onboardDate: bulkDate,
              uid: `bulk_${Date.now()}_${i}`,
              kycStatus: 'pending'
            });
          } else {
            investorRef = doc(db, 'investors', row.investor!.id);
            unitsOwned = row.investor!.unitsOwned;
            totalInvestment = row.investor!.totalInvestment;

            // Optionally update contact info if provided in bulk but missing in profile
            const updateData: any = {};
            if (row.email && !row.investor!.email) updateData.email = row.email;
            if (row.phone && !row.investor!.phone) updateData.phone = row.phone;
            if (Object.keys(updateData).length > 0) {
              dbTransaction.update(investorRef, updateData);
            }
          }
          
          let unitsToChange = 0;
          let amountToChange = row.amount;

          if (row.type === 'BUY') {
            unitsToChange = amountToChange / currentNav;
          } else {
            unitsToChange = -(amountToChange / currentNav);
          }

          // 1. Update investor
          dbTransaction.update(investorRef, {
            unitsOwned: increment(unitsToChange),
            totalInvestment: increment(row.type === 'BUY' ? amountToChange : 0)
          });

          // 2. Update account
          dbTransaction.update(accountRef, {
            totalUnits: increment(unitsToChange),
            cashBalance: increment(row.type === 'BUY' ? amountToChange : -amountToChange)
          });

          // 3. Record transaction
          const transRef = doc(collection(db, 'transactions'));
          dbTransaction.set(transRef, {
            investorId: investorRef.id,
            accountId: selectedAccount.id,
            type: row.type,
            units: Math.abs(unitsToChange),
            pricePerUnit: currentNav,
            totalAmount: amountToChange,
            timestamp: new Date(bulkDate).toISOString()
          });
        });

        setProcessedRows(prev => prev.map((r, idx) => idx === rowIndex ? { ...r, status: 'success' } : r));
      } catch (error) {
        console.error('Bulk processing error:', error);
        setProcessedRows(prev => prev.map((r, idx) => idx === rowIndex ? { ...r, status: 'error', error: 'Transaction failed' } : r));
      }

      completed++;
      setProgress(Math.round((completed / validRows.length) * 100));
    }

    setIsProcessing(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 border border-emerald-500/20">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">Bulk Transactions</h3>
              <p className="text-slate-400 text-sm">Upload CSV to process multiple subscriptions/redemptions</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={downloadTemplate}
              className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Template
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {processedRows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-800 rounded-3xl bg-slate-800/20">
            <FileText className="w-16 h-16 text-slate-700 mb-4" />
            <div className="flex items-center gap-2 mb-6">
              <div className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20">
                Supports CSV, PDF & Images
              </div>
              <div className="bg-blue-500/10 text-blue-500 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border border-blue-500/20">
                AI Powered Extraction
              </div>
            </div>

            <p className="text-slate-400 mb-6 text-center max-w-xs">
              Upload a CSV, PDF, or image of a transaction receipt. Our AI will automatically extract the details.
            </p>
            
            <div className="grid grid-cols-3 gap-4 w-full max-w-2xl mb-8">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">
                  Investment Date
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"><Calendar className="w-4 h-4" /></span>
                  <input 
                    type="date"
                    value={bulkDate}
                    onChange={(e) => setBulkDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">
                  Target Fund
                </label>
                <select 
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.ticker})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">
                  Unit Price (NAV)
                </label>
                <div className="p-1 bg-slate-800 border border-slate-700 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-[10px] text-slate-500">Manual Price</span>
                    <input 
                      type="checkbox"
                      checked={useCustomNav}
                      onChange={(e) => {
                        setUseCustomNav(e.target.checked);
                        if (e.target.checked) setManualNav(selectedAccount?.nav || 1.0000);
                      }}
                      className="w-3 h-3 rounded border-slate-600 bg-slate-700 text-emerald-500 focus:ring-emerald-500"
                    />
                  </div>
                  {useCustomNav ? (
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input 
                        type="number"
                        step="0.0001"
                        value={manualNav}
                        onChange={(e) => setManualNav(Number(e.target.value))}
                        className="w-full bg-slate-900 border-none rounded-lg pl-9 pr-3 py-1.5 text-white focus:ring-1 focus:ring-emerald-500 outline-none text-xs"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5 px-2 py-1">
                      <div className="text-xs text-white font-bold">{formatCurrency(manualNav)}</div>
                      <div className="flex items-center gap-1">
                        <span className="text-[7px] text-slate-500 uppercase font-black tracking-tighter">
                          {new Date(bulkDate).toISOString().split('T')[0] === new Date().toISOString().split('T')[0] 
                            ? 'Market Price' 
                            : 'Historical Price'}
                        </span>
                        {new Date(bulkDate).toISOString().split('T')[0] !== new Date().toISOString().split('T')[0] && (
                          <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <input 
              type="file" 
              accept=".csv, .pdf, image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isSmartProcessing}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
            >
              {isSmartProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analyzing Document...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Select File
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-500">
                  Total: <span className="text-white font-bold">{processedRows.length}</span>
                </span>
                <span className="text-emerald-500">
                  Valid: <span className="font-bold">{processedRows.filter(r => r.status === 'valid').length}</span>
                </span>
                <span className="text-blue-500">
                  New: <span className="font-bold">{processedRows.filter(r => r.isNew).length}</span>
                </span>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-xs text-slate-500">
                  Target: <span className="text-slate-300 font-medium">{selectedAccount?.ticker}</span>
                </p>
                <button 
                  onClick={() => setProcessedRows([])}
                  className="text-xs text-slate-500 hover:text-white transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-800 rounded-2xl bg-slate-950/50 mb-6">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="border-b border-slate-800">
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Investor Details</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Amount</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {processedRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-white font-medium">{row.name}</p>
                          {row.isNew && (
                            <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30 font-bold">NEW</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {row.investor && (
                            <span className="text-[9px] font-mono text-emerald-500 bg-emerald-500/10 px-1 rounded border border-emerald-500/20">
                              {row.investor.investorId}
                            </span>
                          )}
                          {(row.email || row.phone) && (
                            <span className="text-[9px] text-slate-500 italic">
                              {[row.email, row.phone].filter(Boolean).join(' • ')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                          row.type === 'BUY' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                        )}>
                          {row.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm text-white font-bold">
                          {formatCurrency(row.amount)}
                        </p>
                      </td>
                      <td className="px-4 py-3 flex justify-center">
                        {row.status === 'valid' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                        {row.status === 'invalid' && (
                          <div className="flex items-center gap-2 text-red-500" title={row.error}>
                            <AlertCircle className="w-5 h-5" />
                            <span className="text-[10px] font-medium truncate max-w-[100px]">{row.error}</span>
                          </div>
                        )}
                        {row.status === 'processing' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                        {row.status === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-500/20" />}
                        {row.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isProcessing && (
              <div className="mb-6">
                <div className="flex justify-between text-xs text-slate-400 mb-2">
                  <span>Processing Transactions...</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-emerald-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button 
                onClick={onClose}
                className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
              >
                Close
              </button>
              <button 
                onClick={processTransactions}
                disabled={isProcessing || processedRows.filter(r => r.status === 'valid').length === 0}
                className="flex-[2] py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Process {processedRows.filter(r => r.status === 'valid').length} Transactions
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
