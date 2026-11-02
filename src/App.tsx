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
  Database,
  Sparkles,
  Settings,
  Sun,
  Moon,
  ChevronLeft,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Headphones,
  ArrowLeftRight
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
import { 
  mockDemoAccounts, 
  mockDemoInvestors, 
  mockDemoPortfolio, 
  mockDemoTransactions, 
  mockDemoValuations 
} from './data/mockDemoData';

import { cn, handleFirestoreError, OperationType } from './lib/utils';
import { 
  setLocalCollection, 
  getLocalCollection, 
  subscribeToLocalDb, 
  isQuotaExceededError 
} from './services/localDbService';

// Components
import Dashboard from './components/Dashboard';
import AccountManagement from './components/AccountManagement';
import InvestorManagement from './components/InvestorManagement';
import PortfolioManagement from './components/PortfolioManagement';
import TransactionModule from './components/TransactionModule';
import ValuationEngine from './components/ValuationEngine';
import GeminiAssistant from './components/GeminiAssistant';
import StatementModule from './components/StatementModule';
import AnalyticsSuite from './components/AnalyticsSuite';
import IngestionEngineUI from './components/IngestionEngineUI';
import GlobalSearch from './components/GlobalSearch';
import ActivationScreen from './components/ActivationScreen';
import InvestorPortal from './components/InvestorPortal';
import LoginPage from './components/LoginPage';
import UserSettingsPanel from './components/UserSettingsPanel';
import StaffManagement from './components/StaffManagement';
import SupportCenter from './components/SupportCenter';
import { UserRoleType } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRoleType | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');

  // Synchronize document element class for light/dark mode
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
  }, [theme]);

  const handleThemeChange = async (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    if (user && !isDemoMode) {
      try {
        await setDoc(doc(db, 'users', user.uid), { theme: newTheme, updatedAt: serverTimestamp() }, { merge: true });
        toast.success(`Theme switched to ${newTheme === 'light' ? 'Light' : 'Dark'} mode & saved to Firestore profile!`);
      } catch (err: any) {
        console.error('Failed to save theme in Firestore:', err);
      }
    } else if (isDemoMode) {
      toast.success(`Theme switched to ${newTheme === 'light' ? 'Light' : 'Dark'} mode`);
    }
  };

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
        const isDemoUser = user.email?.includes('demo') || user.isAnonymous || false;

        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setRole((data.role as UserRoleType) || 'admin');
            setIsDemoMode(!!data.isDemo || isDemoUser);
            if (data.theme === 'light' || data.theme === 'dark') {
              setTheme(data.theme);
            }
          } else {
            const newRole: UserRoleType = 'investor';
            setRole(newRole);
            setIsDemoMode(isDemoUser);
            await setDoc(doc(db, 'users', user.uid), { role: newRole, email: user.email, isDemo: isDemoUser, theme: 'dark' });
          }
        } catch {
          setRole(isDemoUser ? 'admin' : 'investor');
          setIsDemoMode(isDemoUser);
        }
      } else {
        setRole(null);
        setIsDemoMode(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Real-time Data Listeners
  useEffect(() => {
    if (!user) return;

    if (isDemoMode) {
      // Load simulated mock fund data for demo accounts to protect live fund records
      setAccounts(mockDemoAccounts);
      setInvestors(mockDemoInvestors);
      setPortfolio(mockDemoPortfolio);
      setTransactions(mockDemoTransactions);
      setValuations(mockDemoValuations);
      setRevertedValuations([]);
      return;
    }

    const accountsUnsub = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as InvestmentAccount));
      setAccounts(data);
      setLocalCollection('accounts', data);
    }, (error) => {
      if (isQuotaExceededError(error)) setAccounts(getLocalCollection('accounts'));
      else handleFirestoreError(error, OperationType.GET, 'accounts');
    });

    const investorsUnsub = onSnapshot(collection(db, 'investors'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Investor));
      setInvestors(data);
      setLocalCollection('investors', data);
    }, (error) => {
      if (isQuotaExceededError(error)) setInvestors(getLocalCollection('investors'));
      else handleFirestoreError(error, OperationType.GET, 'investors');
    });

    const portfolioUnsub = onSnapshot(collection(db, 'portfolio'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Asset));
      setPortfolio(data);
      setLocalCollection('portfolio', data);
    }, (error) => {
      if (isQuotaExceededError(error)) setPortfolio(getLocalCollection('portfolio'));
      else handleFirestoreError(error, OperationType.GET, 'portfolio');
    });

    const transactionsUnsub = onSnapshot(collection(db, 'transactions'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Transaction));
      setTransactions(data);
      setLocalCollection('transactions', data);
    }, (error) => {
      if (isQuotaExceededError(error)) setTransactions(getLocalCollection('transactions'));
      else handleFirestoreError(error, OperationType.GET, 'transactions');
    });

    const valuationsUnsub = onSnapshot(collection(db, 'valuations'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Valuation));
      const sorted = data.sort((a, b) => {
        const timeA = a.date?.seconds || Date.now() / 1000 + 1000;
        const timeB = b.date?.seconds || Date.now() / 1000 + 1000;
        return timeB - timeA;
      });
      setValuations(sorted);
      setLocalCollection('valuations', sorted);
    }, (error) => {
      if (isQuotaExceededError(error)) setValuations(getLocalCollection('valuations'));
      else handleFirestoreError(error, OperationType.GET, 'valuations');
    });

    const revertedUnsub = onSnapshot(collection(db, 'reverted_valuations'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setRevertedValuations(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'reverted_valuations'));

    // Subscribe to local storage changes (for local quota fallback updates)
    const unsubLocal = subscribeToLocalDb((col, data) => {
      if (col === 'portfolio') setPortfolio(data);
      if (col === 'accounts') setAccounts(data);
      if (col === 'investors') setInvestors(data);
      if (col === 'transactions') setTransactions(data);
      if (col === 'valuations') setValuations(data);
    });

    return () => {
      accountsUnsub();
      investorsUnsub();
      portfolioUnsub();
      transactionsUnsub();
      valuationsUnsub();
      revertedUnsub();
      unsubLocal();
    };
  }, [user, role, isDemoMode]);

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
    return <LoginPage />;
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['superadmin', 'admin', 'staff', 'support', 'investor'] },
    { id: 'accounts', label: 'Accounts', icon: PieChart, roles: ['superadmin', 'admin', 'staff'] },
    { id: 'investors', label: 'Investors', icon: Users, roles: ['superadmin', 'admin', 'staff', 'support'] },
    { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight, roles: ['superadmin', 'admin', 'staff', 'support'] },
    { id: 'portfolio', label: 'Portfolio', icon: Briefcase, roles: ['superadmin', 'admin', 'staff', 'investor'] },
    { id: 'analytics', label: 'Analytics', icon: Activity, roles: ['superadmin', 'admin', 'staff', 'investor'] },
    { id: 'ingestion', label: 'Ingestion', icon: Cpu, roles: ['superadmin', 'admin', 'staff'] },
    { id: 'valuation', label: 'Valuation', icon: TrendingUp, roles: ['superadmin', 'admin', 'staff'] },
    { id: 'statements', label: 'Statements', icon: FileText, roles: ['superadmin', 'admin', 'staff', 'support', 'investor'] },
    { id: 'staff', label: 'Staff Logins', icon: ShieldCheck, roles: ['superadmin', 'admin'] },
    { id: 'support', label: 'Support Center', icon: Headphones, roles: ['superadmin', 'admin', 'staff', 'support', 'investor'] },
    { id: 'settings', label: 'Settings', icon: Settings, roles: ['superadmin', 'admin', 'staff', 'support', 'investor'] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(role || ''));

  const isDark = theme === 'dark';

  // Activation Link Handler
  const hasActivationToken = typeof window !== 'undefined' && window.location.search.includes('token=');
  if (hasActivationToken) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Toaster position="top-right" theme="dark" richColors />
        <ActivationScreen onActivated={() => {
          if (typeof window !== 'undefined') window.location.href = '/';
        }} />
      </div>
    );
  }

  // Dedicated Investor Portal for Investor Role
  if (role === 'investor' && user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6">
        <Toaster position="top-right" theme="dark" richColors />
        <InvestorPortal 
          user={user}
          investors={investors}
          accounts={accounts}
          portfolio={portfolio}
          transactions={transactions}
          valuations={valuations}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen flex transition-colors duration-200", isDark ? "bg-slate-950 text-slate-200" : "bg-slate-100 text-slate-900")}>
      <Toaster position="top-right" theme={isDark ? "dark" : "light"} richColors />
      
      {/* Collapsible Sidebar Menu Bar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn(
          "border-r flex flex-col sticky top-0 h-screen z-40 transition-colors duration-200 shadow-xl",
          isDark ? "bg-slate-900 border-slate-800 text-slate-200" : "bg-white border-slate-200 text-slate-800"
        )}
      >
        {/* Sidebar Header */}
        <div className="p-5 flex items-center justify-between gap-3 overflow-hidden border-b border-slate-800/30">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex-shrink-0 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <TrendingUp className="text-white w-6 h-6" />
            </div>
            {isSidebarOpen && (
              <span className={cn("text-xl font-black tracking-tight whitespace-nowrap", isDark ? "text-white" : "text-slate-900")}>
                OmniFund
              </span>
            )}
          </div>

          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "Collapse Menu Bar" : "Expand Menu Bar"}
            className={cn(
              "p-2 rounded-xl transition-all border shrink-0",
              isDark 
                ? "bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-white" 
                : "bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-600"
            )}
          >
            {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 px-3 space-y-1.5 mt-4 overflow-y-auto">
          {filteredNavItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={!isSidebarOpen ? item.label : undefined}
                className={cn(
                  "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all group relative font-medium text-sm",
                  !isSidebarOpen && "justify-center px-0",
                  isActive 
                    ? isDark 
                      ? "bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 shadow-sm" 
                      : "bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 shadow-sm"
                    : isDark 
                      ? "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200" 
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <item.icon className={cn("w-5 h-5 shrink-0", isActive ? "text-emerald-500" : "text-slate-400 group-hover:text-emerald-500")} />
                {isSidebarOpen && <span className="truncate">{item.label}</span>}
                {!isSidebarOpen && isActive && (
                  <span className="absolute right-2 w-2 h-2 rounded-full bg-emerald-500" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className={cn("p-4 border-t space-y-2", isDark ? "border-slate-800" : "border-slate-200")}>
          {role === 'admin' && (
            <button 
              onClick={handleDownloadBackup}
              disabled={isBackingUp}
              title={!isSidebarOpen ? "System Backup" : undefined}
              className={cn(
                "w-full flex items-center gap-3 px-3.5 py-2.5 text-amber-500 hover:bg-amber-500/10 rounded-xl transition-all text-xs font-bold disabled:opacity-50",
                !isSidebarOpen && "justify-center px-0"
              )}
            >
              {isBackingUp ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full shrink-0"
                />
              ) : (
                <Database className="w-4 h-4 text-amber-500 shrink-0" />
              )}
              {isSidebarOpen && <span>System Backup</span>}
            </button>
          )}

          <button 
            onClick={handleLogout}
            title={!isSidebarOpen ? "Sign Out" : undefined}
            className={cn(
              "w-full flex items-center gap-3 px-3.5 py-2.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-xs font-semibold",
              !isSidebarOpen && "justify-center px-0"
            )}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {isSidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        {isDemoMode && (
          <div className="bg-gradient-to-r from-amber-600/90 via-emerald-600/90 to-teal-600/90 text-white px-6 py-2.5 text-xs font-bold flex items-center justify-between shadow-md border-b border-amber-400/30 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-200 animate-pulse flex-shrink-0" />
              <span>SIMULATED DEMO SANDBOX — Operating with mock fund portfolio & investor ledgers. Real production fund data remains private & protected.</span>
            </div>
            <span className="bg-black/40 border border-white/20 px-3 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-extrabold shrink-0">
              {role === 'admin' ? 'Demo Admin Mode' : 'Demo Investor Portal'}
            </span>
          </div>
        )}

        {/* Top Header Navigation */}
        <header className={cn(
          "h-16 border-b sticky top-0 z-30 px-6 flex items-center justify-between backdrop-blur-md transition-colors duration-200",
          isDark ? "bg-slate-950/70 border-slate-800 text-white" : "bg-white/80 border-slate-200 text-slate-900 shadow-sm"
        )}>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={cn(
                "p-2 rounded-xl transition-all border",
                isDark ? "hover:bg-slate-800 border-slate-800 text-slate-400" : "hover:bg-slate-100 border-slate-200 text-slate-600"
              )}
              title={isSidebarOpen ? "Collapse Menu Bar" : "Expand Menu Bar"}
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
                className={cn(
                  "border text-xs rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-emerald-500 outline-none font-semibold",
                  isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                )}
              >
                {accounts
                  .filter(acc => !acc.isHidden || acc.id === selectedAccountId || accounts.every(a => a.isHidden))
                  .map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} {acc.isHidden ? '(Hidden)' : ''}
                    </option>
                  ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Light/Dark Mode Switcher */}
            <button
              onClick={() => handleThemeChange(isDark ? 'light' : 'dark')}
              className={cn(
                "px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all shadow-sm",
                isDark 
                  ? "bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800" 
                  : "bg-slate-100 border-slate-200 text-slate-800 hover:bg-slate-200"
              )}
              title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
              <span className="hidden md:inline">{isDark ? 'Light' : 'Dark'}</span>
            </button>

            <div 
              onClick={() => setActiveTab('settings')}
              className="flex items-center gap-3 cursor-pointer group p-1 rounded-2xl transition-all hover:bg-emerald-500/10"
              title="Open User Settings"
            >
              <div className="text-right hidden sm:block">
                <p className={cn("text-xs font-bold group-hover:text-emerald-500 transition-colors", isDark ? "text-white" : "text-slate-900")}>
                  {user.displayName || 'User Profile'}
                </p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-extrabold">{role}</p>
              </div>
              <img 
                src={user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'} 
                className="w-9 h-9 rounded-xl border border-slate-700 object-cover group-hover:border-emerald-500 transition-colors"
                alt={user.displayName || 'User Avatar'}
              />
            </div>
          </div>
        </header>

        <div className="p-6 md:p-8 overflow-y-auto flex-1">
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
              {activeTab === 'transactions' && (
                <TransactionModule 
                  transactions={transactions} 
                  accounts={accounts} 
                  investors={investors} 
                  valuations={valuations}
                  role={role}
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
              {activeTab === 'staff' && (
                <StaffManagement
                  currentUser={user}
                  role={role}
                  isDemoMode={isDemoMode}
                />
              )}
              {activeTab === 'support' && (
                <SupportCenter
                  currentUser={user}
                  role={role}
                  accounts={accounts}
                  isDemoMode={isDemoMode}
                />
              )}
              {activeTab === 'settings' && (
                <UserSettingsPanel 
                  user={user}
                  role={role}
                  theme={theme}
                  onThemeChange={handleThemeChange}
                  isDemoMode={isDemoMode}
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
