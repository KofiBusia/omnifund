import React, { useState, useEffect } from 'react';
import { Investor, InvestmentAccount, Transaction, Valuation, Asset } from '../types';
import { FileText, Search, Download, Calendar, User, TrendingUp, CheckCircle2, Mail, Send, Briefcase } from 'lucide-react';
import { motion } from 'motion/react';
import StatementModal from './StatementModal';
import BulkStatementModal from './BulkStatementModal';
import FundStatementModal from './FundStatementModal';
import { cn } from '../lib/utils';

interface StatementModuleProps {
  investors: Investor[];
  accounts: InvestmentAccount[];
  transactions: Transaction[];
  valuations: Valuation[];
  portfolio: Asset[];
}

export default function StatementModule({ investors, accounts, transactions, valuations, portfolio }: StatementModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statementType, setStatementType] = useState<'investor' | 'account'>('investor');
  const [selectedInvestor, setSelectedInvestor] = useState<Investor | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<InvestmentAccount | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFundModalOpen, setIsFundModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
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

  const filteredAccounts = accounts.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    a.ticker.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white">Investment Statements</h2>
          <p className="text-slate-400 mt-1">Generate and download formal investment reports</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsBulkModalOpen(true)}
            disabled={!isGmailConnected || investors.length === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border",
              "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/20 disabled:opacity-50"
            )}
          >
            <Send className="w-4 h-4" />
            Send to All
          </button>
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
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="flex items-center justify-center gap-2 p-1 bg-slate-800 rounded-2xl w-fit mx-auto mb-8">
            <button
              onClick={() => setStatementType('investor')}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                statementType === 'investor' 
                  ? "bg-emerald-500 text-white shadow-lg" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <User className="w-4 h-4" />
              Investor Statements
            </button>
            <button
              onClick={() => setStatementType('account')}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                statementType === 'account' 
                  ? "bg-blue-500 text-white shadow-lg" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Briefcase className="w-4 h-4" />
              Account Statements
            </button>
          </div>

          <div className="text-center space-y-2">
            <div className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4",
              statementType === 'investor' ? "bg-emerald-500/10" : "bg-blue-500/10"
            )}>
              <FileText className={cn("w-8 h-8", statementType === 'investor' ? "text-emerald-500" : "text-blue-500")} />
            </div>
            <h3 className="text-xl font-bold text-white">
              {statementType === 'investor' ? 'Select Investor' : 'Select Account'}
            </h3>
            <p className="text-sm text-slate-500">
              {statementType === 'investor' 
                ? 'Search for an investor to generate their periodic statement' 
                : 'Generate a comprehensive statement for a main investment account'}
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input 
              type="text" 
              placeholder={statementType === 'investor' ? "Search by name or ID..." : "Search by account name or ticker..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-2xl pl-12 pr-4 py-4 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-inner"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {statementType === 'investor' ? (
              filteredInvestors.map((investor) => (
                <button
                  key={investor.id}
                  onClick={() => {
                    setSelectedInvestor(investor);
                    setIsModalOpen(true);
                  }}
                  className="flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/50 rounded-2xl transition-all group text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-emerald-500 font-bold group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                    {investor.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{investor.name}</p>
                    <p className="text-xs text-slate-500 truncate">{investor.investorId}</p>
                  </div>
                  <Download className="w-4 h-4 text-slate-600 group-hover:text-emerald-500 transition-colors" />
                </button>
              ))
            ) : (
              filteredAccounts.map((account) => (
                <button
                  key={account.id}
                  onClick={() => {
                    setSelectedAccount(account);
                    setIsFundModalOpen(true);
                  }}
                  className="flex items-center gap-4 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-blue-500/50 rounded-2xl transition-all group text-left"
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-700 flex items-center justify-center text-blue-500 font-bold group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    {account.ticker.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{account.name}</p>
                    <p className="text-xs text-slate-500 truncate font-mono">{account.ticker}</p>
                  </div>
                  <Download className="w-4 h-4 text-slate-600 group-hover:text-blue-500 transition-colors" />
                </button>
              ))
            )}
            {((statementType === 'investor' && filteredInvestors.length === 0) || (statementType === 'account' && filteredAccounts.length === 0)) && (
              <div className="col-span-2 py-10 text-center text-slate-500">
                No items found matching your search.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex items-start gap-4 hover:border-emerald-500/30 transition-all cursor-default group">
          <div className="p-3 bg-emerald-500/10 rounded-xl group-hover:bg-emerald-500 group-hover:text-white transition-all text-emerald-500">
            <Calendar className="w-6 h-6 " />
          </div>
          <div>
            <h4 className="text-white font-bold mb-1">Custom Periods</h4>
            <p className="text-xs text-slate-500">Generate statements for any date range since inception.</p>
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex items-start gap-4 hover:border-blue-500/30 transition-all cursor-default group">
          <div className="p-3 bg-blue-500/10 rounded-xl group-hover:bg-blue-500 group-hover:text-white transition-all text-blue-500">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-white font-bold mb-1">Performance Tracking</h4>
            <p className="text-xs text-slate-500">Includes detailed gain/loss and NAV performance metrics.</p>
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex items-start gap-4 hover:border-purple-500/30 transition-all cursor-default group">
          <div className="p-3 bg-purple-500/10 rounded-xl group-hover:bg-purple-500 group-hover:text-white transition-all text-purple-500">
            <CheckCircle2 className="w-6 h-6" />
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

      <FundStatementModal 
        isOpen={isFundModalOpen}
        onClose={() => {
          setIsFundModalOpen(false);
          setSelectedAccount(null);
        }}
        fund={selectedAccount}
        portfolio={portfolio}
        transactions={transactions}
      />

      <BulkStatementModal 
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        investors={filteredInvestors}
        accounts={accounts}
        transactions={transactions}
        valuations={valuations}
        isGmailConnected={isGmailConnected}
      />
    </div>
  );
}
