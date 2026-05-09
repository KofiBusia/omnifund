import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Download, Loader2, FileText, CheckCircle2, Mail, Send, AlertCircle } from 'lucide-react';
import { Investor, InvestmentAccount, Transaction, Valuation } from '../types';
import { formatCurrency, cn } from '../lib/utils';
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
  const [startDate, setStartDate] = useState(
    new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!investor || !fund) return;
    setIsGenerating(true);
    try {
      const doc = await generateStatementPDF(investor, fund, transactions, startDate, endDate);
      if (doc) {
        doc.save(`${investor.name.replace(/\s+/g, '_')}_Statement_${startDate}_to_${endDate}.pdf`);
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
          onClose();
        }, 2000);
      }
    } catch (error) {
      console.error('Download error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    if (!investor || !fund) return;
    setEmailStatus('sending');
    try {
      const doc = await generateStatementPDF(investor, fund, transactions, startDate, endDate);
      if (doc) {
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
            fundName: fund?.name
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to send email');
        }
        
        setEmailStatus('success');
        setTimeout(() => {
          setEmailStatus('idle');
          onClose();
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
                <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Generate Statement</h3>
                  <p className="text-slate-400 text-xs">{investor?.name || 'Select Investor'}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

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

              <div className="bg-slate-800/50 border border-slate-800 p-4 rounded-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                    {investor?.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{investor?.name}</p>
                    <p className="text-[10px] text-slate-500">{investor?.investorId}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Total Units</span>
                    <span className="text-slate-200 font-medium">{(investor?.unitsOwned || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Current Unit Price</span>
                    <span className="text-slate-200 font-medium">{formatCurrency(fund?.nav || 1.0000)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] pt-1 border-t border-slate-700/50">
                    <span className="text-slate-400 font-semibold uppercase tracking-tighter">Current Value</span>
                    <span className="text-emerald-400 font-bold">{formatCurrency((investor?.unitsOwned || 0) * (fund?.nav || 1.0000))}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={handleDownload}
                  disabled={isGenerating || isSuccess || emailStatus === 'sending'}
                  className={cn(
                    "w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg",
                    isSuccess 
                      ? "bg-emerald-500 text-white" 
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
                  )}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating...
                    </>
                  ) : isSuccess ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Downloaded
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      Download
                    </>
                  )}
                </button>

                <button 
                  onClick={handleSendEmail}
                  disabled={emailStatus === 'sending' || isGenerating || isSuccess || !isGmailConnected}
                  className={cn(
                    "w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg",
                    emailStatus === 'success' ? "bg-emerald-500 text-white" :
                    emailStatus === 'error' ? "bg-red-500 text-white" :
                    !isGmailConnected ? "bg-slate-800/50 text-slate-600 cursor-not-allowed border border-slate-800" :
                    "bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                  )}
                  title={!isGmailConnected ? "Connect Gmail first" : ""}
                >
                  {emailStatus === 'sending' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sending...
                    </>
                  ) : emailStatus === 'success' ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Sent!
                    </>
                  ) : emailStatus === 'error' ? (
                    <>
                      <AlertCircle className="w-5 h-5" />
                      Error
                    </>
                  ) : !isGmailConnected ? (
                    <>
                      <Mail className="w-5 h-5" />
                      Connect Gmail
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Email
                    </>
                  )}
                </button>
              </div>

              {errorMessage && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3"
                >
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] text-red-400 leading-relaxed">{errorMessage}</p>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
