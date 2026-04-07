import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Loader2, CheckCircle2, AlertCircle, Mail } from 'lucide-react';
import { Investor, InvestmentAccount } from '../types';
import { cn } from '../lib/utils';

interface EmailInvestorModalProps {
  isOpen: boolean;
  onClose: () => void;
  investor: Investor | null;
  fund: InvestmentAccount | null;
  isGmailConnected: boolean;
}

export default function EmailInvestorModal({ isOpen, onClose, investor, fund, isGmailConnected }: EmailInvestorModalProps) {
  const [subject, setSubject] = useState('Investment Update');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!investor) return;

    setStatus('sending');
    setErrorMessage(null);

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: investor.email,
          subject,
          body,
          investorName: investor.name,
          fundName: fund?.name || 'OmniFund'
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send email');
      }

      setStatus('success');
      setTimeout(() => {
        setStatus('idle');
        setBody('');
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Email error:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send email');
      setTimeout(() => setStatus('idle'), 5000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
            className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Send Notification</h3>
                  <p className="text-slate-400 text-xs">{investor?.name} ({investor?.email})</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSend} className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Subject</label>
                <input 
                  required
                  type="text" 
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Enter email subject..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Message</label>
                <textarea 
                  required
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all h-40 resize-none"
                  placeholder="Type your message to the investor here..."
                />
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{errorMessage}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-4 px-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={status === 'sending' || status === 'success' || !isGmailConnected}
                  className={cn(
                    "flex-[2] py-4 px-4 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg",
                    status === 'success' ? "bg-emerald-500 text-white" :
                    status === 'error' ? "bg-red-500 text-white" :
                    !isGmailConnected ? "bg-slate-800/50 text-slate-600 cursor-not-allowed border border-slate-800" :
                    "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20"
                  )}
                >
                  {status === 'sending' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sending...
                    </>
                  ) : status === 'success' ? (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Email Sent!
                    </>
                  ) : !isGmailConnected ? (
                    <>
                      <Mail className="w-5 h-5" />
                      Connect Gmail
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Send Email
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="p-4 bg-slate-950/50 border-t border-slate-800">
              <p className="text-[10px] text-slate-500 text-center">
                This email will be sent via {fund?.name || 'OmniFund'}'s secure delivery system. 
                <br/>Recipients will see "{fund?.name || 'OmniFund'}" as the sender.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
