import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getGeminiResponse } from '../lib/gemini';
import { InvestmentAccount, Investor, Asset } from '../types';

interface GeminiAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  context: {
    fund: InvestmentAccount | null;
    investors: Investor[];
    portfolio: Asset[];
  };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function GeminiAssistant({ isOpen, onClose, context }: GeminiAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I'm OmniFund AI. I can help you analyze fund performance, investor trends, and portfolio metrics. How can I assist you today?" }
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
        Fund Name: ${context.fund?.name || 'N/A'}
        AUM: GH₵${context.fund?.aum.toLocaleString() || '0'}
        NAV: GH₵${context.fund?.nav.toFixed(4) || '0'}
        Total Investors: ${context.investors.length}
        Portfolio Assets: ${context.portfolio.map(a => `${a.ticker} (${a.marketValue})`).join(', ')}
      `;
      
      const response = await getGeminiResponse(userMessage, contextStr);
      setMessages(prev => [...prev, { role: 'assistant', content: response || "I'm sorry, I couldn't process that request." }]);
    } catch (error) {
      console.error("Gemini Error", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "I encountered an error while processing your request. Please try again later." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[60]"
          />
          <motion.aside 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl z-[70] flex flex-col"
          >
            <header className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Sparkles className="text-white w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">OmniFund AI</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Online</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </header>

            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
            >
              {messages.map((msg, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={i} 
                  className={cn(
                    "flex gap-4 max-w-[85%]",
                    msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center",
                    msg.role === 'assistant' ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-800 text-slate-400"
                  )}>
                    {msg.role === 'assistant' ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
                  </div>
                  <div className={cn(
                    "p-4 rounded-2xl text-sm leading-relaxed",
                    msg.role === 'assistant' 
                      ? "bg-slate-800/50 text-slate-200 border border-slate-800" 
                      : "bg-emerald-600 text-white shadow-lg shadow-emerald-600/10"
                  )}>
                    {msg.content}
                  </div>
                </motion.div>
              ))}
              {isLoading && (
                <div className="flex gap-4 max-w-[85%]">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-800/50 text-slate-400 border border-slate-800 text-sm italic">
                    Analyzing fund data...
                  </div>
                </div>
              )}
            </div>

            <footer className="p-6 border-t border-slate-800 bg-slate-900/50">
              <form onSubmit={handleSend} className="relative">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about AUM, NAV, or trends..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-2xl pl-6 pr-14 py-4 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all placeholder:text-slate-600"
                />
                <button 
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white rounded-xl flex items-center justify-center transition-all shadow-lg shadow-emerald-600/20"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
              <p className="text-[10px] text-slate-600 text-center mt-4 uppercase tracking-widest font-bold">
                Powered by Gemini AI Engine
              </p>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
