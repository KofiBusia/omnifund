import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Loader2, CheckCircle2, Mail, Send, AlertCircle, Users } from 'lucide-react';
import { Investor, InvestmentAccount, Transaction, Valuation } from '../types';
import { cn } from '../lib/utils';
import { generateStatementPDF } from '../lib/pdfGenerator';

interface BulkStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  investors: Investor[];
  accounts: InvestmentAccount[];
  transactions: Transaction[];
  valuations: Valuation[];
  isGmailConnected: boolean;
}

export default function BulkStatementModal({ 
  isOpen, 
  onClose, 
  investors, 
  accounts, 
  transactions, 
  valuations,
  isGmailConnected
}: BulkStatementModalProps) {
  const [startDate, setStartDate] = useState(
    new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const handleSendAll = async () => {
    if (investors.length === 0) return;
    
    setStatus('sending');
    setResults(null);
    setProgress({ current: 0, total: investors.length });

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < investors.length; i++) {
      const investor = investors[i];
      setProgress({ current: i + 1, total: investors.length });

      try {
        const fund = accounts.find(a => a.id === investor.accountId) || accounts[0];
        if (!fund) throw new Error('No fund account found for investor');

        const doc = await generateStatementPDF(investor, fund, transactions, startDate, endDate);
        const pdfBase64 = doc.output('datauristring').split(',')[1];
        
        const response = await fetch('/api/send-statement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            investorEmail: investor.email,
            investorName: investor.name,
            pdfBase64,
            startDate,
            endDate,
            fundName: fund.name
          })
        });

        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || `Failed to send to ${investor.name}`);
        }

        successCount++;
      } catch (error) {
        console.error(`Error sending to ${investor.name}:`, error);
        failedCount++;
        errors.push(`${investor.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    setResults({ success: successCount, failed: failedCount, errors });
    setStatus('success');
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
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                  <Mail className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Bulk Statements</h3>
                  <p className="text-slate-400 text-xs">Send to {investors.length} investors</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {status === 'success' && results ? (
              <div className="space-y-6">
                <div className="p-6 bg-slate-800/50 rounded-2xl text-center">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h4 className="text-xl font-bold text-white">Processing Complete</h4>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                      <p className="text-xs text-slate-500 uppercase font-bold">Success</p>
                      <p className="text-2xl font-bold text-emerald-500">{results.success}</p>
                    </div>
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                      <p className="text-xs text-slate-500 uppercase font-bold">Failed</p>
                      <p className="text-2xl font-bold text-red-500">{results.failed}</p>
                    </div>
                  </div>
                </div>

                {results.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {results.errors.map((err, i) => (
                      <div key={i} className="p-2 bg-red-500/5 border border-red-500/10 rounded-lg flex items-start gap-2">
                        <AlertCircle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                        <p className="text-[10px] text-red-400">{err}</p>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={onClose}
                  className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Start Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">End Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input 
                        type="date" 
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>

                {status === 'sending' && (
                  <div className="space-y-4">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Processing statements...</span>
                      <span className="text-emerald-500 font-bold">{progress.current} / {progress.total}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                        className="h-full bg-emerald-500"
                      />
                    </div>
                  </div>
                )}

                <button 
                  onClick={handleSendAll}
                  disabled={status === 'sending' || !isGmailConnected || investors.length === 0}
                  className={cn(
                    "w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg",
                    !isGmailConnected ? "bg-slate-800/50 text-slate-600 cursor-not-allowed border border-slate-800" :
                    "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
                  )}
                >
                  {status === 'sending' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sending...
                    </>
                  ) : !isGmailConnected ? (
                    <>
                      <Mail className="w-5 h-5" />
                      Connect Gmail to Send
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Send to {investors.length} Investors
                    </>
                  )}
                </button>

                <p className="text-[10px] text-slate-500 text-center leading-relaxed">
                  This will generate a personalized PDF statement for each selected investor for the chosen period and send it to their registered email address.
                </p>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
