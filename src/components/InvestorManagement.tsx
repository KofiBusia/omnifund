import React, { useState } from 'react';
import { Investor, InvestmentAccount } from '../types';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  UserPlus, 
  FileText, 
  Mail, 
  ExternalLink, 
  ChevronRight, 
  ArrowUpRight, 
  ArrowDownRight,
  Users,
  Briefcase
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';

import { cn, formatCurrency } from '../lib/utils';

interface InvestorManagementProps {
  investors: Investor[];
  fund: InvestmentAccount | null;
  accounts: InvestmentAccount[];
}

export default function InvestorManagement({ investors, fund, accounts }: InvestorManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newInvestor, setNewInvestor] = useState({ 
    name: '', 
    email: '', 
    units: 0,
    accountId: fund?.id || (accounts.length > 0 ? accounts[0].id : '')
  });

  const filteredInvestors = investors.filter(i => 
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    i.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedAccount = accounts.find(a => a.id === newInvestor.accountId) || fund;
    try {
      await addDoc(collection(db, 'investors'), {
        name: newInvestor.name,
        email: newInvestor.email,
        accountId: newInvestor.accountId,
        unitsOwned: Number(newInvestor.units),
        totalInvestment: Number(newInvestor.units) * (selectedAccount?.nav || 1),
        currentValue: Number(newInvestor.units) * (selectedAccount?.nav || 1),
        uid: `manual_${Date.now()}` // Mock UID for manual entry
      });
      setIsAddModalOpen(false);
      setNewInvestor({ ...newInvestor, name: '', email: '', units: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'investors');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Investor Registry</h2>
          <p className="text-slate-400 mt-1">Manage {investors.length} active fund participants</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
        >
          <UserPlus className="w-5 h-5" />
          Add Investor
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4 bg-slate-900/50 p-2 rounded-2xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input 
            type="text" 
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent border-none focus:ring-0 pl-12 pr-4 py-3 text-slate-200 placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Investors Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800/50 border-b border-slate-800">
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Investor</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Units Owned</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Value</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Performance</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredInvestors.map((investor) => {
              const currentValue = investor.unitsOwned * (fund?.nav || 0);
              const gainLoss = currentValue - investor.totalInvestment;
              const gainLossPct = (gainLoss / investor.totalInvestment) * 100;

              return (
                <motion.tr 
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={investor.id} 
                  className="hover:bg-slate-800/30 transition-colors group"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-emerald-500 font-bold">
                        {investor.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{investor.name}</p>
                        <p className="text-xs text-slate-500">{investor.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-300 font-medium">{investor.unitsOwned.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">Units</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-white font-bold">{formatCurrency(currentValue)}</p>
                    <p className="text-xs text-slate-500">Market Value</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className={cn(
                      "flex items-center gap-1 text-sm font-medium",
                      gainLoss >= 0 ? "text-emerald-500" : "text-red-500"
                    )}>
                      {gainLoss >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                      <span>{Math.abs(gainLossPct).toFixed(2)}%</span>
                    </div>
                    <p className="text-xs text-slate-500">Total Return</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors" title="View Statement">
                        <FileText className="w-5 h-5" />
                      </button>
                      <button className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors" title="Send Email">
                        <Mail className="w-5 h-5" />
                      </button>
                      <button className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        {filteredInvestors.length === 0 && (
          <div className="py-20 text-center">
            <Users className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500">No investors found matching your search.</p>
          </div>
        )}
      </div>

      {/* Add Investor Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-white mb-6">Register New Investor</h3>
              <form onSubmit={handleAddInvestor} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Full Name</label>
                  <input 
                    required
                    type="text" 
                    value={newInvestor.name}
                    onChange={(e) => setNewInvestor({...newInvestor, name: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Email Address</label>
                  <input 
                    required
                    type="email" 
                    value={newInvestor.email}
                    onChange={(e) => setNewInvestor({...newInvestor, email: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Investment Account</label>
                  <select 
                    required
                    value={newInvestor.accountId}
                    onChange={(e) => setNewInvestor({...newInvestor, accountId: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.ticker})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Initial Units</label>
                  <input 
                    required
                    type="number" 
                    value={newInvestor.units}
                    onChange={(e) => setNewInvestor({...newInvestor, units: Number(e.target.value)})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    placeholder="0"
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-600/20"
                  >
                    Register Investor
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
