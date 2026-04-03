import React, { useState } from 'react';
import { InvestmentAccount, Investor, Asset } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { 
  Plus, 
  PieChart, 
  TrendingUp, 
  Users, 
  Briefcase, 
  ArrowUpRight,
  ChevronRight,
  Info,
  Trash2,
  Lock,
  AlertTriangle,
  ArrowRight,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { addDoc, collection, doc, updateDoc, deleteDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';

interface AccountManagementProps {
  accounts: InvestmentAccount[];
  investors: Investor[];
  portfolio: Asset[];
}

const AUTH_PIN = "1234"; // Default PIN for authorization

export default function AccountManagement({ accounts, investors, portfolio }: AccountManagementProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<InvestmentAccount | null>(null);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [newAccount, setNewAccount] = useState({
    name: '',
    ticker: '',
    description: '',
    aum: 0,
    nav: 1.0000,
    totalUnits: 0
  });

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'accounts'), {
        ...newAccount,
        lastValuationDate: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
      setIsAddModalOpen(false);
      setNewAccount({ name: '', ticker: '', description: '', aum: 0, nav: 1.0000, totalUnits: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'accounts');
    }
  };

  const handleDeleteAccount = async () => {
    if (pinInput !== AUTH_PIN) {
      setPinError(true);
      return;
    }

    if (!accountToDelete) return;

    setIsDeleting(true);
    try {
      const batch = writeBatch(db);

      // 1. Delete associated portfolio assets
      const portfolioQuery = query(collection(db, 'portfolio'), where('accountId', '==', accountToDelete));
      const portfolioSnapshot = await getDocs(portfolioQuery);
      portfolioSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // 2. Delete associated investors
      const investorsQuery = query(collection(db, 'investors'), where('accountId', '==', accountToDelete));
      const investorsSnapshot = await getDocs(investorsQuery);
      investorsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // 3. Delete associated transactions
      const transactionsQuery = query(collection(db, 'transactions'), where('accountId', '==', accountToDelete));
      const transactionsSnapshot = await getDocs(transactionsQuery);
      transactionsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // 4. Delete associated valuations
      const valuationsQuery = query(collection(db, 'valuations'), where('accountId', '==', accountToDelete));
      const valuationsSnapshot = await getDocs(valuationsQuery);
      valuationsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // 5. Delete the account itself
      batch.delete(doc(db, 'accounts', accountToDelete));

      await batch.commit();
      
      setIsDeleteModalOpen(false);
      setAccountToDelete(null);
      setPinInput("");
      setPinError(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'accounts');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;

    try {
      const accountRef = doc(db, 'accounts', editingAccount.id);
      await updateDoc(accountRef, {
        name: editingAccount.name,
        ticker: editingAccount.ticker,
        description: editingAccount.description,
        nav: editingAccount.nav,
        aum: editingAccount.aum,
        totalUnits: editingAccount.totalUnits
      });
      setIsEditModalOpen(false);
      setEditingAccount(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `accounts/${editingAccount.id}`);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Investment Accounts</h2>
          <p className="text-slate-400 mt-1">Manage fund products and investment portfolios</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg shadow-emerald-600/20"
        >
          <Plus className="w-5 h-5" />
          Create New Account
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {accounts.map((account) => {
          const accountInvestors = investors.filter(i => i.accountId === account.id);
          const accountPortfolio = portfolio.filter(p => p.accountId === account.id);
          
          return (
            <motion.div 
              layout
              key={account.id}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-8 hover:border-emerald-500/50 transition-all group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <PieChart className="w-32 h-32 text-emerald-500" />
              </div>

              <div className="relative z-10">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                      <Briefcase className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{account.name}</h3>
                      <p className="text-sm text-slate-500 font-mono uppercase tracking-wider">{account.ticker}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="bg-emerald-500/10 text-emerald-500 text-[10px] font-bold px-3 py-1 rounded-full border border-emerald-500/20 uppercase flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      Live
                    </div>
                    <div className="bg-blue-500/10 text-blue-500 text-[10px] font-bold px-3 py-1 rounded-full border border-blue-500/20 uppercase">
                      Active
                    </div>
                  </div>
                </div>

                <p className="text-slate-400 text-sm mb-8 line-clamp-2">
                  {account.description || "No description provided for this investment account."}
                </p>

                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-800">
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">AUM (Assets Under Management)</p>
                    <p className="text-lg font-bold text-white">{formatCurrency(account.aum)}</p>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-800">
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">NAV (Net Asset Value)</p>
                    <p className="text-lg font-bold text-emerald-500">{formatCurrency(account.nav)}</p>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-800">
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Units</p>
                    <p className="text-lg font-bold text-white">{account.totalUnits.toLocaleString()}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-slate-800">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-300">{accountInvestors.length} Investors</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-300">{accountPortfolio.length} Assets</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => {
                        setAccountToDelete(account.id);
                        setIsDeleteModalOpen(true);
                      }}
                      className="p-2 hover:bg-red-500/10 text-slate-500 hover:text-red-500 rounded-lg transition-all"
                      title="Delete Account"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => {
                        setEditingAccount(account);
                        setIsEditModalOpen(true);
                      }}
                      className="flex items-center gap-2 text-emerald-500 text-sm font-bold hover:gap-3 transition-all"
                    >
                      View Details
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Edit Account Modal */}
      <AnimatePresence>
        {isEditModalOpen && editingAccount && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-bold text-white mb-6">Edit Investment Account</h3>
              <form onSubmit={handleEditAccount} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Account Name</label>
                    <input 
                      required
                      type="text" 
                      value={editingAccount.name}
                      onChange={(e) => setEditingAccount({...editingAccount, name: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Ticker Symbol</label>
                    <input 
                      required
                      type="text" 
                      value={editingAccount.ticker}
                      onChange={(e) => setEditingAccount({...editingAccount, ticker: e.target.value.toUpperCase()})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Description</label>
                  <textarea 
                    value={editingAccount.description}
                    onChange={(e) => setEditingAccount({...editingAccount, description: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all h-24 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">NAV (GH₵)</label>
                    <input 
                      required
                      type="number" 
                      step="0.0001"
                      value={editingAccount.nav}
                      onChange={(e) => setEditingAccount({...editingAccount, nav: Number(e.target.value)})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">AUM (GH₵)</label>
                    <input 
                      required
                      type="number" 
                      value={editingAccount.aum}
                      onChange={(e) => setEditingAccount({...editingAccount, aum: Number(e.target.value)})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Total Units</label>
                  <input 
                    required
                    type="number" 
                    value={editingAccount.totalUnits}
                    onChange={(e) => setEditingAccount({...editingAccount, totalUnits: Number(e.target.value)})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-600/20"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Account Modal */}
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
              <h3 className="text-2xl font-bold text-white mb-6">Create Investment Account</h3>
              <form onSubmit={handleAddAccount} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Account Name</label>
                    <input 
                      required
                      type="text" 
                      value={newAccount.name}
                      onChange={(e) => setNewAccount({...newAccount, name: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="e.g. Retirement Fund"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Ticker Symbol</label>
                    <input 
                      required
                      type="text" 
                      value={newAccount.ticker}
                      onChange={(e) => setNewAccount({...newAccount, ticker: e.target.value.toUpperCase()})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      placeholder="e.g. RET-GHS"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Description</label>
                  <textarea 
                    value={newAccount.description}
                    onChange={(e) => setNewAccount({...newAccount, description: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all h-24 resize-none"
                    placeholder="Describe the purpose of this account..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Initial NAV (GH₵)</label>
                    <input 
                      required
                      type="number" 
                      step="0.0001"
                      value={newAccount.nav}
                      onChange={(e) => setNewAccount({...newAccount, nav: Number(e.target.value)})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-400">Initial AUM (GH₵)</label>
                    <input 
                      required
                      type="number" 
                      value={newAccount.aum}
                      onChange={(e) => setNewAccount({...newAccount, aum: Number(e.target.value)})}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>
                
                <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-2xl flex gap-3">
                  <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />
                  <p className="text-xs text-slate-400">
                    Creating an account establishes a new portfolio. You can add assets and investors to this account once created.
                  </p>
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
                    Create Account
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 border border-red-500/20">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <button 
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setPinInput("");
                    setPinError(false);
                  }}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <h3 className="text-2xl font-bold text-white mb-2">Delete Account?</h3>
              <p className="text-slate-400 mb-6">
                This action is permanent and will delete all associated assets, investors, and transaction history.
              </p>

              <div className="space-y-4 mb-8">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Enter Admin PIN to Authorize
                  </label>
                  <input 
                    type="password" 
                    maxLength={4}
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value);
                      setPinError(false);
                    }}
                    className={cn(
                      "w-full bg-slate-800 border rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[1em] focus:ring-2 outline-none transition-all",
                      pinError ? "border-red-500 focus:ring-red-500" : "border-slate-700 focus:ring-emerald-500"
                    )}
                    placeholder="****"
                  />
                  {pinError && (
                    <p className="text-red-500 text-xs font-medium">Incorrect PIN. Please try again.</p>
                  )}
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setPinInput("");
                    setPinError(false);
                  }}
                  className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || pinInput.length < 4}
                  className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-red-600/20"
                >
                  {isDeleting ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
