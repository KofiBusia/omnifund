import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Loader2, CheckCircle2, AlertCircle, Users, Mail } from 'lucide-react';
import { Investor, InvestmentAccount } from '../types';
import { cn } from '../lib/utils';

interface BulkEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  investors: Investor[];
  accounts: InvestmentAccount[];
  isGmailConnected: boolean;
}

export default function BulkEmailModal({ isOpen, onClose, investors, accounts, isGmailConnected }: BulkEmailModalProps) {
  const [subject, setSubject] = useState('Investment Update');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (investors.length === 0) return;

    setStatus('sending');
    setResults(null);

    try {
      const response = await fetch('/api/send-bulk-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investors: investors.map(i => ({ 
            name: i.name, 
            email: i.email,
            fundName: accounts.find(a => a.id === i.accountId)?.name || 'OmniFund'
          })),
          subject,
          body
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send bulk emails');
      }

      setResults(data);
      setStatus('success');
    } catch (error) {
      console.error('Bulk email error:', error);
      setStatus('error');
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
            className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl"
          >
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Bulk Notification</h3>
                  <p className="text-slate-400 text-xs">Sending to {investors.length} investors</p>
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
              <div className="p-12 text-center space-y-6">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 mx-auto">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <h4 className="text-2xl font-bold text-white">Emails Processed</h4>
                  <p className="text-slate-400 mt-2">
                    Successfully sent: <span className="text-emerald-500 font-bold">{results.success}</span>
                    {results.failed > 0 && (
                      <> | Failed: <span className="text-red-500 font-bold">{results.failed}</span></>
                    )}
                  </p>
                </div>
                {results.errors.length > 0 && (
                  <div className="text-left bg-slate-950/50 border border-slate-800 rounded-2xl p-4 max-h-40 overflow-y-auto">
                    <p className="text-xs font-bold text-red-500 mb-2 uppercase">Errors:</p>
                    <ul className="space-y-1">
                      {results.errors.map((err, i) => (
                        <li key={i} className="text-[10px] text-slate-500">• {err}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  onClick={onClose}
                  className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl transition-all"
                >
                  Done
                </button>
              </div>
            ) : (
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all h-48 resize-none"
                    placeholder="Type your message to all investors here..."
                  />
                </div>

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
                    disabled={status === 'sending' || !isGmailConnected}
                    className={cn(
                      "flex-[2] py-4 px-4 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg",
                      !isGmailConnected ? "bg-slate-800/50 text-slate-600 cursor-not-allowed border border-slate-800" :
                      "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20"
                    )}
                  >
                    {status === 'sending' ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Sending to {investors.length} Investors...
                      </>
                    ) : !isGmailConnected ? (
                      <>
                        <Mail className="w-5 h-5" />
                        Connect Gmail
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        Send to All
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            <div className="p-4 bg-slate-950/50 border-t border-slate-800">
              <p className="text-[10px] text-slate-500 text-center">
                Emails will be sent individually to each investor via your connected Gmail account.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
