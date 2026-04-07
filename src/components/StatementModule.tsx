import React, { useState, useEffect } from 'react';
import { Investor, InvestmentAccount, Transaction, Valuation } from '../types';
import { FileText, Search, Download, Calendar, User, TrendingUp, CheckCircle2, Mail } from 'lucide-react';
import { motion } from 'motion/react';
import StatementModal from './StatementModal';
import { cn } from '../lib/utils';

interface StatementModuleProps {
  investors: Investor[];
  accounts: InvestmentAccount[];
  transactions: Transaction[];
  valuations: Valuation[];
}

export default function StatementModule({ investors, accounts, transactions, valuations }: StatementModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInvestor, setSelectedInvestor] = useState<Investor | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGmailConnected, setIsGmailConnected] = useState(false);

  useEffect(() => {
    checkGmailStatus();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setIsGmailConnected(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkGmailStatus = async () => {
    try {
      const res = await fetch('/api/auth/google/status');
      const data = await res.json();
      setIsGmailConnected(data.connected);
    } catch (error) {
      console.error('Failed to check Gmail status');
    }
  };

  const handleConnectGmail = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const { url } = await res.json();
      window.open(url, 'google_auth', 'width=600,height=700');
    } catch (error) {
      console.error('Failed to get auth URL');
    }
  };

  const filteredInvestors = investors.filter(i => 
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.investorId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Investor Statements</h2>
          <p className="text-slate-400 mt-1">Generate and download formal investment reports</p>
        </div>
        <button 
          onClick={handleConnectGmail}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border",
            isGmailConnected 
              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
              : "bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20"
          )}
        >
          <Mail className="w-4 h-4" />
          {isGmailConnected ? 'Gmail Connected' : 'Connect Gmail'}
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-xl font-bold text-white">Select Investor</h3>
            <p className="text-sm text-slate-500">Search for an investor to generate their periodic statement</p>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-inner"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {filteredInvestors.map((investor) => (
              <button
                key={investor.id}
                onClick={() => {
                  setSelectedInvestor(investor);
                  setIsModalOpen(true);
                }}
                className="flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-blue-500/50 rounded-2xl transition-all group text-left"
              >
                <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-blue-500 font-bold group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  {investor.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{investor.name}</p>
                  <p className="text-xs text-slate-500 truncate">{investor.investorId}</p>
                </div>
                <Download className="w-4 h-4 text-slate-600 group-hover:text-blue-500 transition-colors" />
              </button>
            ))}
            {filteredInvestors.length === 0 && (
              <div className="col-span-2 py-10 text-center text-slate-500">
                No investors found.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex items-start gap-4">
          <div className="p-3 bg-emerald-500/10 rounded-xl">
            <Calendar className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <h4 className="text-white font-bold mb-1">Custom Periods</h4>
            <p className="text-xs text-slate-500">Generate statements for any date range since inception.</p>
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex items-start gap-4">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <TrendingUp className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h4 className="text-white font-bold mb-1">Performance Tracking</h4>
            <p className="text-xs text-slate-500">Includes detailed gain/loss and NAV performance metrics.</p>
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex items-start gap-4">
          <div className="p-3 bg-purple-500/10 rounded-xl">
            <CheckCircle2 className="w-6 h-6 text-purple-500" />
          </div>
          <div>
            <h4 className="text-white font-bold mb-1">Audit Ready</h4>
            <p className="text-xs text-slate-500">Formal PDF format suitable for investor reporting and audits.</p>
          </div>
        </div>
      </div>

      <StatementModal 
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedInvestor(null);
        }}
        investor={selectedInvestor}
        fund={accounts.find(a => a.id === selectedInvestor?.accountId) || accounts[0] || null}
        accounts={accounts}
        transactions={transactions}
        valuations={valuations}
        isGmailConnected={isGmailConnected}
      />
    </div>
  );
}
