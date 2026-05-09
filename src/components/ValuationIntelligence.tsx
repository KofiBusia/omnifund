import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2, BrainCircuit, MessageSquare, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getGeminiResponse } from '../lib/gemini';
import { InvestmentAccount, Investor, Asset, Valuation } from '../types';
import { cn, formatCurrency } from '../lib/utils';

interface ValuationIntelligenceProps {
  fund: InvestmentAccount | null;
  portfolio: Asset[];
  investors: Investor[];
  valuations: Valuation[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ValuationIntelligence({ fund, portfolio, investors, valuations }: ValuationIntelligenceProps) {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: "I'm your Valuation Intelligence assistant. I can help you analyze the impact of market changes, understand NAV fluctuations, or simulate valuation scenarios. What would you like to know about the current fund status?" 
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
        FUND STATE:
        Name: ${fund?.name || 'N/A'}
        Current NAV: ${fund?.nav.toFixed(4) || '1.0000'}
        Total AUM: ${formatCurrency(fund?.aum || 0)}
        Cash Balance: ${formatCurrency(fund?.cashBalance || 0)}
        Total Units: ${investors.reduce((sum, i) => sum + i.unitsOwned, 0)}
        
        PORTFOLIO ASSETS:
        ${portfolio.map(a => {
          const gainLossPct = a.totalCostBasis > 0 ? ((a.marketValue - a.totalCostBasis) / a.totalCostBasis) * 100 : 0;
          return `- ${a.ticker}: ${a.quantity} units @ ${formatCurrency(a.currentPrice)} (Market Value: ${formatCurrency(a.marketValue)}, Gain/Loss: ${gainLossPct.toFixed(2)}%)`;
        }).join('\n')}
        
        HISTORY:
        ${valuations.slice(0, 5).map(v => `Date: ${v.date?.seconds ? new Date(v.date.seconds * 1000).toLocaleDateString() : 'Pending'}, NAV: ${v.nav.toFixed(4)}, AUM: ${formatCurrency(v.aum)}`).join('\n')}
        
        GOAL:
        Analyze the valuation situation. Explain high-level impacts of market movements on NAV or AUM. Help the user understand if a manual adjustment or automated valuation is more appropriate given the context.
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

  const suggestions = [
    "Analyze NAV impact of market dip",
    "Explain current AUM distribution",
    "What's causing the latest gain/loss?",
    "Simulate 5% market growth"
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex flex-col h-[600px] shadow-2xl">
      <header className="p-5 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <BrainCircuit className="text-white w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Valuation Intelligence</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Advanced Analysis Ready</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full text-[10px] font-bold border border-indigo-500/20 flex items-center gap-1.5">
             <Sparkles className="w-3 h-3" />
             GEMINI AI
          </div>
        </div>
      </header>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar"
      >
        {messages.map((msg, i) => (
          <div 
            key={i} 
            className={cn(
              "flex gap-3",
              msg.role === 'user' ? "flex-row-reverse" : ""
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center",
              msg.role === 'assistant' ? "bg-indigo-500/10 text-indigo-500" : "bg-slate-800 text-slate-500"
            )}>
              {msg.role === 'assistant' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>
            <div className={cn(
              "max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed",
              msg.role === 'assistant' 
                ? "bg-slate-800/30 text-slate-300 border border-slate-800/50" 
                : "bg-indigo-600 text-white shadow-lg shadow-indigo-600/10"
            )}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
            <div className="p-4 rounded-2xl bg-slate-800/30 text-slate-400 border border-slate-800/50 text-sm flex items-center gap-2">
              Processing intelligence...
            </div>
          </div>
        )}
      </div>

      <div className="px-6 py-2 flex flex-wrap gap-2">
        {messages.length === 1 && suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => setInput(s)}
            className="text-[10px] font-bold text-slate-500 hover:text-indigo-400 bg-slate-800/50 hover:bg-indigo-500/10 border border-slate-800 hover:border-indigo-500/30 px-3 py-1.5 rounded-full transition-all"
          >
            {s}
          </button>
        ))}
      </div>

      <footer className="p-6 border-t border-slate-800 bg-slate-900/50">
        <form onSubmit={handleSend} className="relative">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Analyze valuation situation..."
            className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-5 pr-14 py-4 text-sm text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-700"
          />
          <button 
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl flex items-center justify-center transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>
    </div>
  );
}
