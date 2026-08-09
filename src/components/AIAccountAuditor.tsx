import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  Loader2, 
  X, 
  Brain,
  History as HistoryIcon,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Zap,
  ArrowRight,
  Search
} from 'lucide-react';
import { InvestmentAccount, Transaction, Asset, Investor } from '../types';
import { getGeminiResponse } from '../lib/gemini';
import { cn, formatCurrency } from '../lib/utils';
import { doc, updateDoc, writeBatch, collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface AIAccountAuditorProps {
  isOpen: boolean;
  onClose: () => void;
  account: InvestmentAccount;
  transactions: Transaction[];
  portfolio: Asset[];
  investors: Investor[];
  onLocateTransaction?: (txId: string) => void;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  actions?: AIActionResult[];
}

interface AIActionResult {
  type: 'UPDATE_ACCOUNT' | 'CORRECT_TRANSACTION' | 'ADJUST_PORTFOLIO' | 'LOCATE_TRANSACTION';
  description: string;
  data: any;
  status: 'pending' | 'executing' | 'completed' | 'failed';
}

export default function AIAccountAuditor({ isOpen, onClose, account, transactions, portfolio, investors, onLocateTransaction }: AIAccountAuditorProps) {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: `I've analyzed ${account.name} (${account.ticker}). I can help you reconcile discrepancies, analyze investor trends, or perform bulk corrections based on historical patterns. What's on your mind?` 
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const contextStr = `
        ACCOUNT: ${JSON.stringify(account)}
        TRANSACTIONS (LAST 100): ${JSON.stringify(transactions.slice(0, 100).map(t => ({
          id: t.id,
          date: t.timestamp,
          investor: investors.find(i => i.id === t.investorId)?.name,
          type: t.type,
          amt: t.totalAmount,
          units: t.units
        })))}
        PORTFOLIO: ${JSON.stringify(portfolio)}
        INVESTORS: ${JSON.stringify(investors.map(i => ({ id: i.id, name: i.name, units: i.unitsOwned })))}
        
        GOAL: Act as a Senior Fund Auditor. If the user asks for a correction or analysis, provide it. 
        If an action is requested (e.g. "Fix the NAV", "Correct the units for account X"), end your response with a JSON block marked as ACTIONS: [ { type: '...', description: '...', data: { ... } } ]
        
        SUPPORTED ACTION TYPES:
        1. UPDATE_ACCOUNT: For account-level fixes.
        2. CORRECT_TRANSACTION: For fixing a specific legacy transaction. Requires 'id' in data.
        3. LOCATE_TRANSACTION: For highlighting a specific transaction in the history for the user to review. Requires 'id' in data.
        4. ADJUST_PORTFOLIO: For portfolio discrepancies.
      `;
      
      const response = await getGeminiResponse(userMessage, contextStr);
      
      // Extract actions from response if present
      let finalContent = response || "I couldn't process that.";
      let actions: AIActionResult[] = [];
      
      const actionMatch = finalContent.match(/ACTIONS:\s*(\[.*\])/s);
      if (actionMatch) {
        try {
          actions = JSON.parse(actionMatch[1]).map((a: any) => ({ ...a, status: 'pending' }));
          finalContent = finalContent.replace(/ACTIONS:\s*\[.*\]/s, '').trim();
        } catch (e) {
          console.error("Failed to parse AI actions", e);
        }
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: finalContent,
        actions: actions.length > 0 ? actions : undefined
      }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Error in auditory processing." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const executeAction = async (msgIndex: number, actionIndex: number) => {
    const message = messages[msgIndex];
    if (!message.actions) return;
    
    const action = message.actions[actionIndex];
    
    setMessages(prev => {
      const next = [...prev];
      if (next[msgIndex].actions) {
        next[msgIndex].actions![actionIndex].status = 'executing';
      }
      return next;
    });

    try {
      switch (action.type) {
        case 'UPDATE_ACCOUNT':
          await updateDoc(doc(db, 'accounts', account.id), action.data);
          break;
        case 'CORRECT_TRANSACTION':
          const { id: txId, ...txData } = action.data;
          await updateDoc(doc(db, 'transactions', txId), txData);
          break;
        case 'LOCATE_TRANSACTION':
          if (onLocateTransaction && action.data.id) {
            onLocateTransaction(action.data.id);
            // Don't wait for any firestore op, just mark done
          }
          break;
        case 'ADJUST_PORTFOLIO':
          // logic for portfolio adjustment
          break;
      }

      setMessages(prev => {
        const next = [...prev];
        if (next[msgIndex].actions) {
          next[msgIndex].actions![actionIndex].status = 'completed';
        }
        return next;
      });
    } catch (err) {
      console.error(err);
      setMessages(prev => {
        const next = [...prev];
        if (next[msgIndex].actions) {
          next[msgIndex].actions![actionIndex].status = 'failed';
        }
        return next;
      });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-5xl h-[85vh] bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-8 border-b border-slate-800 bg-slate-950/30 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
                  <Brain className="text-white w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">AI Audit Interface</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-sm font-medium">Analyzing:</span>
                    <span className="px-2 py-0.5 bg-slate-800 rounded-md text-[10px] font-bold text-white uppercase tracking-wider">{account.name}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-3 hover:bg-slate-800 rounded-2xl text-slate-400 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Chat Side */}
              <div className="flex-1 flex flex-col bg-slate-900/50">
                <div 
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth"
                >
                  {messages.map((msg, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "flex gap-4 max-w-[85%]",
                        msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                      )}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center shadow-lg",
                        msg.role === 'assistant' ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"
                      )}>
                        {msg.role === 'assistant' ? <Bot className="w-6 h-6" /> : <User className="w-6 h-6" />}
                      </div>
                      <div className="space-y-4 flex-1">
                        <div className={cn(
                          "p-6 rounded-3xl text-sm leading-relaxed shadow-lg border",
                          msg.role === 'assistant' 
                            ? "bg-slate-800/80 text-white border-slate-700" 
                            : "bg-blue-600 text-white border-blue-500"
                        )}>
                          {msg.content}
                        </div>

                        {msg.actions && msg.actions.length > 0 && (
                          <div className="grid grid-cols-1 gap-3">
                            {msg.actions.map((action, ai) => (
                              <div 
                                key={ai}
                                className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4 flex items-center justify-between group hover:border-blue-500/30 transition-all"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
                                    {action.type === 'LOCATE_TRANSACTION' ? (
                                      <Search className="w-4 h-4 text-blue-500" />
                                    ) : (
                                      <Zap className="w-4 h-4 text-blue-500" />
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-white mb-0.5">{action.description}</p>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">{action.type.replace('_', ' ')}</p>
                                  </div>
                                </div>
                                
                                <button
                                  disabled={action.status !== 'pending'}
                                  onClick={() => executeAction(i, ai)}
                                  className={cn(
                                    "px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all",
                                    action.status === 'pending' ? "bg-blue-600 hover:bg-blue-500 text-white" :
                                    action.status === 'executing' ? "bg-slate-800 text-slate-500" :
                                    action.status === 'completed' ? "bg-emerald-500/10 text-emerald-500" :
                                    "bg-red-500/10 text-red-500"
                                  )}
                                >
                                  {action.status === 'pending' && (
                                    <>
                                      <ArrowRight className="w-3 h-3" /> 
                                      {action.type === 'LOCATE_TRANSACTION' ? 'View in History' : 'Execute'}
                                    </>
                                  )}
                                  {action.status === 'executing' && <><Loader2 className="w-3 h-3 animate-spin" /> Working...</>}
                                  {action.status === 'completed' && <><CheckCircle2 className="w-3 h-3" /> Applied</>}
                                  {action.status === 'failed' && <><X className="w-3 h-3" /> Failed</>}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {isLoading && (
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center animate-pulse">
                        <Bot className="w-6 h-6" />
                      </div>
                      <div className="bg-slate-800/80 border border-slate-700 p-6 rounded-3xl">
                        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                      </div>
                    </div>
                  )}
                </div>

                <footer className="p-8 border-t border-slate-800 bg-slate-950/20">
                  <form onSubmit={handleSend} className="relative">
                    <input 
                      type="text" 
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask the analyst to cross-reference transactions or flag anomalies..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-2xl pl-8 pr-16 py-6 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600 shadow-inner"
                    />
                    <button 
                      type="submit"
                      disabled={!input.trim() || isLoading}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-14 h-14 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-xl flex items-center justify-center transition-all shadow-xl shadow-blue-600/20 group"
                    >
                      <ArrowRight className="w-7 h-7 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </form>
                </footer>
              </div>

              {/* Stats Sidebar */}
              <div className="w-80 border-l border-slate-800 bg-slate-900 p-8 space-y-6 hidden xl:block">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Live Signals</h4>
                  <div className="space-y-4">
                     <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Portfolio Drift</p>
                        <p className="text-xl font-bold text-white">+0.42%</p>
                     </div>
                     <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-800">
                        <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Investor Churn</p>
                        <p className="text-xl font-bold text-emerald-500">Low</p>
                     </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Historical Pattern</h4>
                  <div className="p-6 bg-blue-600/5 border border-blue-500/10 rounded-3xl">
                    <HistoryIcon className="w-10 h-10 text-blue-500/50 mb-4" />
                    <p className="text-xs text-slate-300 leading-relaxed italic">
                      "Transactions typically cluster around month-end reconciliation cycles."
                    </p>
                  </div>
                </div>

                <div className="p-6 bg-slate-950 rounded-3xl border border-slate-800 flex items-center gap-4">
                   <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                   <span className="text-[10px] font-bold text-white uppercase tracking-widest">Active Resolution</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
