import React, { useState, useEffect, useRef } from 'react';
import { InvestmentAccount, Investor, Asset, Transaction } from '../types';
import { db } from '../firebase';
import { 
  addDoc, 
  collection, 
  doc, 
  updateDoc, 
  deleteDoc, 
  runTransaction, 
  increment, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Send, 
  Sparkles, 
  Brain, 
  Bot, 
  User, 
  Check, 
  Loader2, 
  X, 
  AlertTriangle, 
  ArrowRight, 
  CornerDownRight,
  RefreshCw,
  TrendingUp,
  FileText,
  UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../lib/utils';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  operations?: StagedOperation[];
}

interface StagedOperation {
  type: 'UPDATE_ACCOUNT' | 'ADD_PORTFOLIO_ASSET' | 'UPDATE_PORTFOLIO_ASSET' | 'DELETE_PORTFOLIO_ASSET' | 'ADD_TRANSACTION' | 'ADD_INVESTOR' | 'UPDATE_INVESTOR';
  data: any;
  description: string;
}

interface AIAccountChatProps {
  isOpen: boolean;
  onClose: () => void;
  account: InvestmentAccount;
  portfolio: Asset[];
  investors: Investor[];
  transactions: Transaction[];
  onDataChanged?: () => void;
}

export default function AIAccountChat({ 
  isOpen, 
  onClose, 
  account, 
  portfolio, 
  investors, 
  transactions,
  onDataChanged 
}: AIAccountChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      content: `Hi! I'm your **OmniFund AI Account Copilot** for **${account.name}**. 
      
I have deep semantic understanding of this account's details, portfolio holdings, registered investors, and transaction history. 

**How I can assist you:**
- 📈 **Modify holdings**: *"Add MSFT with 50 units at 420 GHS, tech sector"*
- 👤 **Manage investors**: *"Update John Doe's phone number to 0551234567"*
- 💸 **Log transactions**: *"Record a subscription of 10,000 GHS for Jane Smith"*
- ⚙️ **Update account**: *"Change the account ticker to RET-P and update NAV to 1.1500"*`
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [executingOps, setExecutingOps] = useState<Record<number, 'pending' | 'success' | 'error'>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/account-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          chatHistory: messages.map(m => ({ role: m.role, content: m.content })),
          account,
          portfolio,
          investors,
          transactions
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response from AI Copilot');
      }

      const data = await response.json();
      const validTypes = [
        'UPDATE_ACCOUNT',
        'ADD_PORTFOLIO_ASSET',
        'UPDATE_PORTFOLIO_ASSET',
        'DELETE_PORTFOLIO_ASSET',
        'ADD_TRANSACTION',
        'ADD_INVESTOR',
        'UPDATE_INVESTOR'
      ];
      const filteredOps = (data.operations || []).filter((op: any) => op && op.type && validTypes.includes(op.type));

      setMessages(prev => [...prev, { 
        role: 'model', 
        content: data.text || "I have analyzed your request.", 
        operations: filteredOps 
      }]);
    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, { 
        role: 'model', 
        content: `⚠️ Sorry, I encountered an error while processing that request: ${error.message || 'Unknown network error'}` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteOperations = async (ops: StagedOperation[], messageIndex: number) => {
    if (isExecuting) return;
    setIsExecuting(true);
    setExecutionError(null);
    
    const initialStatuses: Record<number, 'pending' | 'success' | 'error'> = {};
    ops.forEach((_, idx) => {
      initialStatuses[idx] = 'pending';
    });
    setExecutingOps(initialStatuses);

    try {
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        
         // Helper to safely filter undefined properties
         const cleanData = (obj: any) => {
           if (!obj || typeof obj !== 'object') return obj;
           const cleaned: any = {};
           Object.keys(obj).forEach(key => {
             if (obj[key] !== undefined) {
               cleaned[key] = obj[key];
             }
           });
           return cleaned;
         };

         const opDataCleaned = cleanData(op.data);

         switch (op.type) {
           case 'UPDATE_ACCOUNT': {
             const accountRef = doc(db, 'accounts', account.id);
             await updateDoc(accountRef, opDataCleaned);
             break;
           }
           case 'ADD_PORTFOLIO_ASSET': {
             await addDoc(collection(db, 'portfolio'), {
               ...opDataCleaned,
               accountId: account.id,
               createdAt: new Date().toISOString()
             });
             break;
           }
           case 'UPDATE_PORTFOLIO_ASSET': {
             const { id, ...updateData } = opDataCleaned;
             if (!id) throw new Error('Asset ID is required for update operation');
             const assetRef = doc(db, 'portfolio', id);
             await updateDoc(assetRef, updateData);
             break;
           }
           case 'DELETE_PORTFOLIO_ASSET': {
             if (!opDataCleaned.id) throw new Error('Asset ID is required for delete operation');
             const assetRef = doc(db, 'portfolio', opDataCleaned.id);
             await deleteDoc(assetRef);
             break;
           }
           case 'ADD_TRANSACTION': {
             let investorId = opDataCleaned.investorId;
             
             // If investor doesn't exist, create them first!
             if (!investorId) {
               const existing = investors.find(inv => inv.name.toLowerCase() === opDataCleaned.investorName?.toLowerCase());
               if (existing) {
                 investorId = existing.id;
               } else {
                 const newInvRef = await addDoc(collection(db, 'investors'), {
                   name: opDataCleaned.investorName || 'Unnamed Investor',
                   email: opDataCleaned.investorEmail || '',
                   phone: opDataCleaned.phone || '',
                   unitsOwned: 0,
                   totalInvestment: 0,
                   accountId: account.id,
                   createdAt: new Date().toISOString()
                 });
                 investorId = newInvRef.id;
               }
             }

             // Execute actual transaction
             await runTransaction(db, async (dbTx) => {
               const accountRef = doc(db, 'accounts', account.id);
               const investorRef = doc(db, 'investors', investorId);
               const transRef = doc(collection(db, 'transactions'));

               const amount = Number(opDataCleaned.totalAmount || opDataCleaned.amount || 0);
               const units = Number(opDataCleaned.units || 0);
               const type = opDataCleaned.type || opDataCleaned.transactionType || 'BUY';

               let unitsDelta = 0;
               let amountDelta = 0;

               if (type === 'BUY') {
                 unitsDelta = units;
                 amountDelta = amount;
               } else {
                 unitsDelta = -units;
                 amountDelta = -amount;
               }

               dbTx.update(accountRef, {
                 totalUnits: increment(unitsDelta),
                 cashBalance: increment(amountDelta),
                 aum: increment(amountDelta) // initial update
               });

               dbTx.update(investorRef, {
                 unitsOwned: increment(unitsDelta),
                 totalInvestment: increment(amountDelta)
               });

               dbTx.set(transRef, {
                 accountId: account.id,
                 investorId: investorId,
                 type: type,
                 units: units,
                 totalAmount: amount,
                 pricePerUnit: units > 0 ? amount / units : account.nav || 1.0,
                 timestamp: new Date().toISOString(),
                 createdAt: new Date().toISOString()
               });
             });
             break;
           }
           case 'ADD_INVESTOR': {
             await addDoc(collection(db, 'investors'), {
               name: opDataCleaned.name || 'Unnamed Investor',
               email: opDataCleaned.email || '',
               phone: opDataCleaned.phone || '',
               unitsOwned: Number(opDataCleaned.unitsOwned || 0),
               totalInvestment: Number(opDataCleaned.totalInvestment || 0),
               accountId: account.id,
               createdAt: new Date().toISOString()
             });
             break;
           }
           case 'UPDATE_INVESTOR': {
             const { id, ...updateData } = opDataCleaned;
             if (!id) throw new Error('Investor ID is required for update operation');
             const investorRef = doc(db, 'investors', id);
             await updateDoc(investorRef, updateData);
             break;
           }
           default:
             throw new Error(`Unsupported operation type: ${op.type}`);
         }

        setExecutingOps(prev => ({ ...prev, [i]: 'success' }));
      }

      // Complete operations list
      setMessages(prev => {
        const next = [...prev];
        next[messageIndex] = {
          ...next[messageIndex],
          operations: [] // clear operations so they can't be executed again
        };
        return next;
      });

      // Show final success system message
      setMessages(prev => [...prev, {
        role: 'model',
        content: `✅ **Success!** All staged modifications have been successfully written to Firestore and the ledger has been reconciled.`
      }]);

      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      console.error(err);
      setExecutionError(err.message || 'An error occurred during execution');
    } finally {
      setIsExecuting(false);
    }
  };

  const getOpIcon = (type: string) => {
    switch(type) {
      case 'UPDATE_ACCOUNT': return <RefreshCw className="w-4 h-4 text-amber-500" />;
      case 'ADD_PORTFOLIO_ASSET': return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      case 'UPDATE_PORTFOLIO_ASSET': return <TrendingUp className="w-4 h-4 text-blue-500" />;
      case 'DELETE_PORTFOLIO_ASSET': return <X className="w-4 h-4 text-red-500" />;
      case 'ADD_TRANSACTION': return <FileText className="w-4 h-4 text-emerald-500" />;
      case 'ADD_INVESTOR': return <UserCheck className="w-4 h-4 text-purple-400" />;
      case 'UPDATE_INVESTOR': return <UserCheck className="w-4 h-4 text-amber-500" />;
      default: return <Sparkles className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      />

      {/* Slide-out Panel */}
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-xl h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col z-10"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center border border-blue-500/20">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Account Copilot
                <span className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  v3.5
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-medium">{account.name} ({account.ticker})</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Panel */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg, index) => (
            <div key={index} className="space-y-3">
              <div className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role !== 'user' && (
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                
                <div className={`p-4 rounded-2xl max-w-[85%] text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none shadow-md shadow-blue-600/10' 
                    : 'bg-slate-800 text-slate-300 rounded-tl-none border border-slate-800'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>

              {/* Staged Operations Action Card */}
              {msg.role === 'model' && msg.operations && msg.operations.length > 0 && (
                <div className="ml-12 p-4 bg-slate-950/60 border border-emerald-500/20 rounded-2xl space-y-4 shadow-xl">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    Staged Operations Ready
                  </div>
                  
                  <div className="space-y-2">
                    {msg.operations.map((op, opIdx) => (
                      <div key={opIdx} className="flex items-start gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-300">
                        <div className="mt-0.5 p-1 bg-slate-800 border border-slate-700 rounded-lg flex-shrink-0">
                          {getOpIcon(op.type)}
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-white">{op.description}</p>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">Payload: {JSON.stringify(op.data)}</p>
                        </div>
                        {executingOps[opIdx] === 'success' && (
                          <div className="p-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                        {executingOps[opIdx] === 'pending' && (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                        )}
                      </div>
                    ))}
                  </div>

                  {executionError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>{executionError}</span>
                    </div>
                  )}

                  <button
                    onClick={() => handleExecuteOperations(msg.operations!, index)}
                    disabled={isExecuting}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 text-xs"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Executing modifications...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Reconcile & Apply {msg.operations.length} Changes
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-slate-800 text-slate-400 p-4 rounded-2xl rounded-tl-none border border-slate-800 text-sm flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span>AI Copilot is indexing database...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input form */}
        <form onSubmit={handleSendMessage} className="p-6 border-t border-slate-800 bg-slate-950/20">
          <div className="relative flex items-center">
            <input 
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading || isExecuting}
              placeholder="Prompt AI Copilot to edit account info..."
              className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 text-sm text-white rounded-xl pl-4 pr-12 py-3.5 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all placeholder:text-slate-500 disabled:opacity-50"
            />
            <button 
              type="submit"
              disabled={!input.trim() || isLoading || isExecuting}
              className="absolute right-2.5 p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-slate-700 text-white rounded-lg transition-all flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
