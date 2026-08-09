import { useState, useEffect, useMemo } from 'react';
import { Toaster, toast } from 'sonner';
import { 
  LayoutDashboard, 
  Users, 
  PieChart, 
  TrendingUp, 
  LogOut, 
  Menu, 
  X, 
  MessageSquare,
  ChevronRight,
  DollarSign,
  Briefcase,
  FileText,
  Activity,
  RefreshCcw,
  Cpu,
  Download,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { InvestmentAccount, Investor, Asset, Transaction, Valuation } from './types';
import { runGlobalValuation } from './services/valuationService';

import { cn, handleFirestoreError, OperationType } from './lib/utils';

// Components
import Dashboard from './components/Dashboard';
import AccountManagement from './components/AccountManagement';
import InvestorManagement from './components/InvestorManagement';
import PortfolioManagement from './components/PortfolioManagement';
import ValuationEngine from './components/ValuationEngine';
import GeminiAssistant from './components/GeminiAssistant';
import StatementModule from './components/StatementModule';
import AnalyticsSuite from './components/AnalyticsSuite';
import IngestionEngineUI from './components/IngestionEngineUI';
import GlobalSearch from './components/GlobalSearch';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'investor' | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');

  // Global Data State
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [portfolio, setPortfolio] = useState<Asset[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [revertedValuations, setRevertedValuations] = useState<any[]>([]);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const handleDownloadBackup = () => {
    setIsBackingUp(true);
    const toastId = toast.loading("Preparing comprehensive system backup...");

    setTimeout(() => {
      try {
        const backupData = {
          version: "1.0.0",
          exportedAt: new Date().toISOString(),
          accounts: accounts,
          portfolio: portfolio,
          investors: investors,
          transactions: transactions,
          valuations: valuations,
          revertedValuations: revertedValuations
        };

        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
          JSON.stringify(backupData, null, 2)
        )}`;
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", jsonString);
        downloadAnchor.setAttribute("download", `OmniFund_System_Backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();

        toast.success("Database backup downloaded successfully", { id: toastId });
      } catch (err: any) {
        toast.error(`Backup extraction failed: ${err.message}`, { id: toastId });
      } finally {
        setIsBackingUp(false);
      }
    }, 1500);
  };

  // Derived active account (for simplicity, use the first one if none selected)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const activeAccount = accounts.find(a => a.id === selectedAccountId) || accounts[0] || null;

  // Memoized Data for Active Account
  const activeInvestors = useMemo(() => 
    investors.filter(i => i.accountId === activeAccount?.id),
    [investors, activeAccount?.id]
  );

  const activePortfolio = useMemo(() => 
    portfolio.filter(p => p.accountId === activeAccount?.id),
    [portfolio, activeAccount?.id]
  );

  const activeValuations = useMemo(() => 
    valuations.filter(v => v.accountId === activeAccount?.id),
    [valuations, activeAccount?.id]
  );

  // Background Valuation Service
  useEffect(() => {
    if (role !== 'admin') return;

    // Initial run after a short delay to ensure data is loaded
    const timeout = setTimeout(() => {
      runGlobalValuation();
    }, 5000);

    // Run every 10 minutes (to avoid hitting Gemini/GSE limits too hard)
    const interval = setInterval(() => {
      runGlobalValuation();
    }, 10 * 60 * 1000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [role]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Check role
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setRole(userDoc.data().role);
        } else {
          // Default role for new users (if not admin email)
          const newRole = user.email === 'emmanuelagbanyo8@gmail.com' ? 'admin' : 'investor';
          await setDoc(doc(db, 'users', user.uid), { role: newRole, email: user.email });
          setRole(newRole);
        }
      } else {
        setRole(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Real-time Data Listeners
  useEffect(() => {
    if (!user) return;

    const accountsUnsub = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as InvestmentAccount));
      setAccounts(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'accounts'));

    const investorsUnsub = onSnapshot(collection(db, 'investors'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Investor));
      setInvestors(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'investors'));

    const portfolioUnsub = onSnapshot(collection(db, 'portfolio'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Asset));
      setPortfolio(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'portfolio'));

    const transactionsUnsub = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
      setTransactions(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'transactions'));

    const valuationsUnsub = onSnapshot(collection(db, 'valuations'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Valuation));
      // Sort: treat null dates (pending writes) as "now" (putting them at the top)
      setValuations(data.sort((a, b) => {
        const timeA = a.date?.seconds || Date.now() / 1000 + 1000; // Use future for pending
        const timeB = b.date?.seconds || Date.now() / 1000 + 1000;
        return timeB - timeA;
      }));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'valuations'));

    const revertedUnsub = onSnapshot(collection(db, 'reverted_valuations'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setRevertedValuations(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'reverted_valuations'));

    return () => {
      accountsUnsub();
      investorsUnsub();
      portfolioUnsub();
      transactionsUnsub();
      valuationsUnsub();
      revertedUnsub();
    };
  }, [user, role]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl"
        >
          <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <TrendingUp className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">OmniFund Pro</h1>
          <p className="text-slate-400 mb-8">Enterprise Mutual Fund Administration</p>
          <button 
            onClick={handleLogin}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <img src="https://www.gstatic.com/firebase/anonymous-scan.png" className="w-5 h-5 invert" alt="" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'investor'] },
    { id: 'accounts', label: 'Accounts', icon: PieChart, roles: ['admin'] },
    { id: 'investors', label: 'Investors', icon: Users, roles: ['admin'] },
    { id: 'portfolio', label: 'Portfolio', icon: Briefcase, roles: ['admin', 'investor'] },
    { id: 'analytics', label: 'Analytics', icon: Activity, roles: ['admin', 'investor'] },
    { id: 'ingestion', label: 'Ingestion', icon: Cpu, roles: ['admin'] },
    { id: 'valuation', label: 'Valuation', icon: TrendingUp, roles: ['admin'] },
    { id: 'statements', label: 'Statements', icon: FileText, roles: ['admin', 'investor'] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(role || ''));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex">
      <Toaster position="top-right" theme="dark" richColors />
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        className="bg-slate-900 border-r border-slate-800 flex flex-col sticky top-0 h-screen z-40"
      >
        <div className="p-6 flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 bg-emerald-500 rounded-lg flex-shrink-0 flex items-center justify-center">
            <TrendingUp className="text-white w-6 h-6" />
          </div>
          {isSidebarOpen && <span className="text-xl font-bold text-white whitespace-nowrap">OmniFund</span>}
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {filteredNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group",
                activeTab === item.id 
                  ? "bg-emerald-500/10 text-emerald-500" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              )}
            >
              <item.icon className="w-5 h-5" />
              {isSidebarOpen && <span className="font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          {role === 'admin' && (
            <button 
              onClick={handleDownloadBackup}
              disabled={isBackingUp}
              className="w-full flex items-center gap-3 px-4 py-3 text-amber-400 hover:text-amber-300 hover:bg-amber-400/5 rounded-xl transition-all font-medium disabled:opacity-50"
            >
              {isBackingUp ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full"
                />
              ) : (
                <Database className="w-5 h-5 text-amber-500" />
              )}
              {isSidebarOpen && <span>System Backup</span>}
            </button>
          )}
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all"
          >
            <LogOut className="w-5 h-5" />
            {isSidebarOpen && <span className="font-medium">Sign Out</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-800 bg-slate-950/50 backdrop-blur-md sticky top-0 z-30 px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <GlobalSearch 
              investors={investors}
              accounts={accounts}
              transactions={transactions}
              onSelectInvestor={(investor) => {
                setGlobalSearchTerm(investor.name);
                setActiveTab('investors');
              }}
              onSelectAccount={(account) => {
                setSelectedAccountId(account.id);
                setActiveTab('accounts');
              }}
              onSelectTab={setActiveTab}
            />

            {accounts.length > 1 && (
              <select 
                value={selectedAccountId || ''} 
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:ring-emerald-500 outline-none"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-white">{user.displayName}</p>
              <p className="text-xs text-slate-500 capitalize">{role}</p>
            </div>
            <img 
              src={user.photoURL || ''} 
              className="w-10 h-10 rounded-full border border-slate-800"
              alt={user.displayName || ''}
            />
          </div>
        </header>

        <div className="p-8 overflow-y-auto flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && (
                <Dashboard 
                  fund={activeAccount} 
                  investors={activeInvestors} 
                  portfolio={activePortfolio}
                  valuations={activeValuations}
                  onDownloadBackup={handleDownloadBackup}
                  isBackingUp={isBackingUp}
                  role={role}
                />
              )}
              {activeTab === 'accounts' && <AccountManagement accounts={accounts} investors={investors} portfolio={portfolio} transactions={transactions} valuations={valuations} />}
              {activeTab === 'investors' && (
                <InvestorManagement 
                  investors={investors} 
                  fund={activeAccount} 
                  accounts={accounts} 
                  transactions={transactions} 
                  valuations={valuations}
                  portfolio={portfolio}
                  initialSearchTerm={globalSearchTerm}
                />
              )}
              {activeTab === 'portfolio' && (
                <PortfolioManagement 
                  portfolio={portfolio} 
                  fund={activeAccount} 
                  accounts={accounts} 
                  role={role}
                />
              )}
              {activeTab === 'analytics' && (
                <AnalyticsSuite 
                  fund={activeAccount} 
                  portfolio={activePortfolio}
                  valuations={activeValuations}
                />
              )}
              {activeTab === 'ingestion' && (
                <IngestionEngineUI 
                  accounts={accounts} 
                  investors={investors} 
                  onComplete={() => setActiveTab('dashboard')} 
                />
              )}
              {activeTab === 'valuation' && (
                <ValuationEngine 
                  fund={activeAccount} 
                  portfolio={activePortfolio} 
                  investors={activeInvestors} 
                  valuations={activeValuations}
                  revertedCount={revertedValuations.filter(rv => rv.accountId === activeAccount?.id).length}
                />
              )}
              {activeTab === 'statements' && (
                <StatementModule 
                  investors={investors} 
                  accounts={accounts} 
                  transactions={transactions} 
                  valuations={valuations} 
                  portfolio={portfolio}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* AI Assistant Toggle */}
      <button 
        onClick={() => setIsAssistantOpen(true)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-lg shadow-emerald-600/20 flex items-center justify-center transition-all hover:scale-110 z-50"
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      <GeminiAssistant 
        isOpen={isAssistantOpen} 
        onClose={() => setIsAssistantOpen(false)} 
        context={{ fund: activeAccount, investors, portfolio, valuations }}
      />
    </div>
  );
}
