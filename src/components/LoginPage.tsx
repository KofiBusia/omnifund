import React, { useState } from 'react';
import { 
  TrendingUp, 
  ShieldCheck, 
  Lock, 
  Mail, 
  Key, 
  UserCheck, 
  Building2, 
  Sparkles, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  PieChart, 
  CheckCircle2,
  Cpu,
  BarChart3,
  Award,
  Zap,
  HelpCircle,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInAnonymously,
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface LoginPageProps {
  onSuccess?: () => void;
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [authMode, setAuthMode] = useState<'google' | 'email_login' | 'email_register'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [preferredRole, setPreferredRole] = useState<'admin' | 'investor'>('admin');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Helper to establish user document in Firestore with selected role
  const syncUserRole = async (uid: string, userEmail?: string | null, name?: string | null, forceRole?: 'admin' | 'investor') => {
    try {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      const assignedRole = forceRole || preferredRole;

      if (!snap.exists()) {
        await setDoc(userRef, {
          role: assignedRole,
          email: userEmail || `${uid}@omnifund.demo`,
          displayName: name || (assignedRole === 'admin' ? 'Fund Administrator' : 'Investor Client'),
          createdAt: new Date().toISOString()
        });
      } else if (forceRole) {
        await setDoc(userRef, { role: forceRole }, { merge: true });
      }
    } catch (err) {
      console.warn('User document sync note:', err);
    }
  };

  // 1. Google Authentication
  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const result = await signInWithPopup(auth, provider);
      await syncUserRole(result.user.uid, result.user.email, result.user.displayName);
      toast.success(`Welcome to OmniFund Pro, ${result.user.displayName || 'User'}!`);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Google Sign In Error:', error);
      if (error.code !== 'auth/popup-closed-by-user') {
        setErrorMessage(error.message || 'Google sign-in failed. Please try again.');
        toast.error('Google sign-in failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Email & Password Sign In
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please fill in both email and password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await syncUserRole(result.user.uid, result.user.email, result.user.displayName);
      toast.success('Signed in successfully!');
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Email Sign In Error:', error);
      let msg = 'Authentication failed. Check your credentials.';
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        msg = 'Invalid email or password. If you do not have an account, please switch to Register.';
      } else if (error.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      }
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Email Registration
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please provide an email and password.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(result.user, { displayName });
      }
      await syncUserRole(result.user.uid, email, displayName || email.split('@')[0], preferredRole);
      toast.success(`Account created! Logged in as ${preferredRole === 'admin' ? 'Fund Administrator' : 'Investor'}`);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Email Register Error:', error);
      let msg = 'Registration failed.';
      if (error.code === 'auth/email-already-in-use') {
        msg = 'This email is already registered. Please click "Sign In" instead.';
      } else if (error.code === 'auth/weak-password') {
        msg = 'Password is too weak. Please use at least 6 characters.';
      }
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Quick Demo Sandbox Sign-In
  const handleDemoSignIn = async (role: 'admin' | 'investor') => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      // Try email credentials first for predictable demo account
      const demoEmail = role === 'admin' ? 'demo.admin@omnifund.com' : 'demo.investor@omnifund.com';
      const demoPass = 'OmniFundDemo2026!';

      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, demoEmail, demoPass);
      } catch (signInErr: any) {
        // If demo user doesn't exist yet, create it
        if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
          userCredential = await createUserWithEmailAndPassword(auth, demoEmail, demoPass);
          await updateProfile(userCredential.user, {
            displayName: role === 'admin' ? 'Demo Admin Manager' : 'Demo Investor Client'
          });
        } else {
          // Fallback to anonymous sign in
          userCredential = await signInAnonymously(auth);
        }
      }

      await syncUserRole(
        userCredential.user.uid, 
        userCredential.user.email || demoEmail, 
        userCredential.user.displayName || (role === 'admin' ? 'Demo Admin' : 'Demo Investor'), 
        role
      );

      toast.success(`Demo Access Granted as ${role === 'admin' ? 'Fund Administrator' : 'Investor Portal'}`);
      if (onSuccess) onSuccess();
    } catch (error: any) {
      console.error('Demo Sign In Error:', error);
      // Final resilient fallback to anonymous auth
      try {
        const anonRes = await signInAnonymously(auth);
        await syncUserRole(anonRes.user.uid, `${anonRes.user.uid}@demo.local`, role === 'admin' ? 'Demo Admin' : 'Demo Investor', role);
        toast.success(`Demo Mode Activated (${role.toUpperCase()})`);
        if (onSuccess) onSuccess();
      } catch (anonErr: any) {
        setErrorMessage('Unable to activate demo mode. Please try Google Sign-In.');
        toast.error('Demo access failed');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row font-sans selection:bg-emerald-500 selection:text-white">
      {/* LEFT COLUMN - Brand Experience & Showcase */}
      <div className="lg:w-1/2 relative flex flex-col justify-between p-8 lg:p-16 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border-r border-slate-800/80">
        {/* Glow Effects */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-tr from-emerald-600 to-teal-400 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-900/30 ring-1 ring-white/20">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-xl font-black text-white tracking-tight">OmniFund</span>
              <span className="text-xs font-bold text-emerald-400 block -mt-1 tracking-widest uppercase">PRO ENTERPRISE</span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-semibold text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>ISO 27001 Certified</span>
          </div>
        </div>

        {/* Center Content Showcase */}
        <div className="relative z-10 my-12 space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold tracking-wide uppercase">
              <Sparkles className="w-3.5 h-3.5" /> Next-Gen Fund Administration
            </div>
            <h1 className="text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.15]">
              Real-Time Portfolio Accounting & Investor Intelligence
            </h1>
            <p className="text-slate-400 text-base lg:text-lg max-w-xl font-normal leading-relaxed">
              Automated mark-to-market NAV calculations, multi-asset ledger ingestion, bulk statement publishing, and AI-driven valuation auditing.
            </p>
          </motion.div>

          {/* Key Metric Highlights Grid */}
          <div className="grid grid-cols-2 gap-4 max-w-xl">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md hover:border-slate-700 transition-all"
            >
              <div className="flex items-center gap-3 text-emerald-400 mb-2">
                <PieChart className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Smart NAV Engine</span>
              </div>
              <p className="text-2xl font-black text-white font-mono">Dynamic NAV</p>
              <p className="text-[11px] text-slate-400 mt-1">Live asset-level NAV recalculations</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md hover:border-slate-700 transition-all"
            >
              <div className="flex items-center gap-3 text-blue-400 mb-2">
                <Cpu className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Gemini AI Audit</span>
              </div>
              <p className="text-2xl font-black text-white font-mono">99.98%</p>
              <p className="text-[11px] text-slate-400 mt-1">Automated receipt & ledger verification</p>
            </motion.div>
          </div>

          {/* Feature Checklist */}
          <div className="space-y-2.5 max-w-xl pt-2">
            {[
              'Multi-Fund Account Management & Investor Ledgers',
              'Automated Daily GSE Stock & Fixed Income Valuations',
              'PDF Statement Workspace with Digital Member Certificates',
              'Role-Based Security for Administrators & Investors'
            ].map((feat, i) => (
              <div key={i} className="flex items-center gap-3 text-xs text-slate-300 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 pt-6 border-t border-slate-800/60 flex flex-col md:flex-row items-start md:items-center justify-between text-xs text-slate-400 gap-3">
          <div>
            <p className="font-semibold text-slate-300">© 2026 - Young Investors Network | OmniFund Financial Systems</p>
            <p className="text-[11px] text-emerald-400 font-bold mt-0.5">Powered by NexusByte Technologies</p>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span className="hover:text-white cursor-pointer transition-colors">Privacy Policy</span>
            <span>•</span>
            <span className="hover:text-white cursor-pointer transition-colors">Security Specs</span>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN - Login Form & Auth Methods */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-16 bg-slate-950 relative">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md space-y-6"
        >
          {/* Card Header */}
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black text-white tracking-tight">Access Portal</h2>
            <p className="text-sm text-slate-400">Sign in to manage mutual fund assets & investor portals</p>
          </div>

          {/* Mode Tabs (Google SSO vs Email Login vs Register) */}
          <div className="grid grid-cols-3 gap-1 bg-slate-900/90 p-1 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => { setAuthMode('google'); setErrorMessage(null); }}
              className={cn(
                "py-2 px-3 text-xs font-bold rounded-xl transition-all text-center",
                authMode === 'google' 
                  ? "bg-slate-800 text-white shadow-md border border-slate-700" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              Google SSO
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('email_login'); setErrorMessage(null); }}
              className={cn(
                "py-2 px-3 text-xs font-bold rounded-xl transition-all text-center",
                authMode === 'email_login' 
                  ? "bg-slate-800 text-white shadow-md border border-slate-700" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              Email Sign In
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('email_register'); setErrorMessage(null); }}
              className={cn(
                "py-2 px-3 text-xs font-bold rounded-xl transition-all text-center",
                authMode === 'email_register' 
                  ? "bg-slate-800 text-white shadow-md border border-slate-700" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              Register
            </button>
          </div>

          {/* Role Preference Selector (for Signup / Demo) */}
          {(authMode === 'email_register' || authMode === 'google') && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Account Access Level
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPreferredRole('admin')}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-all flex items-center gap-2.5",
                    preferredRole === 'admin'
                      ? "bg-emerald-500/10 border-emerald-500 text-white shadow-lg shadow-emerald-950/20"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                  )}
                >
                  <Building2 className={cn("w-4 h-4", preferredRole === 'admin' ? "text-emerald-400" : "text-slate-500")} />
                  <div>
                    <span className="text-xs font-bold block">Fund Admin</span>
                    <span className="text-[10px] opacity-70 block">Full management access</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPreferredRole('investor')}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-all flex items-center gap-2.5",
                    preferredRole === 'investor'
                      ? "bg-blue-500/10 border-blue-500 text-white shadow-lg shadow-blue-950/20"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                  )}
                >
                  <UserCheck className={cn("w-4 h-4", preferredRole === 'investor' ? "text-blue-400" : "text-slate-500")} />
                  <div>
                    <span className="text-xs font-bold block">Investor Portal</span>
                    <span className="text-[10px] opacity-70 block">Personal holding views</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl flex items-start gap-2"
            >
              <HelpCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </motion.div>
          )}

          {/* Form / Auth Buttons Container */}
          <AnimatePresence mode="wait">
            {authMode === 'google' && (
              <motion.div
                key="google"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-xl transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.99]"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>{isSubmitting ? 'Authenticating...' : 'Continue with Google'}</span>
                </button>

                <p className="text-[11px] text-center text-slate-500 leading-relaxed">
                  Fast single sign-on backed by Google OAuth 2.0 protocol.
                </p>
              </motion.div>
            )}

            {authMode === 'email_login' && (
              <motion.form
                key="email_login"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onSubmit={handleEmailSignIn}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input 
                      type="email"
                      required
                      placeholder="admin@fund.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-400">Password</label>
                    <span className="text-[10px] text-emerald-400 hover:underline cursor-pointer">Forgot?</span>
                  </div>
                  <div className="relative">
                    <Key className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input 
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-950/30 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
                >
                  <span>{isSubmitting ? 'Signing In...' : 'Sign In with Email'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.form>
            )}

            {authMode === 'email_register' && (
              <motion.form
                key="email_register"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onSubmit={handleEmailRegister}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400">Full Name</label>
                  <input 
                    type="text"
                    placeholder="Emmanuel Agbanyo"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400">Work Email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input 
                      type="email"
                      required
                      placeholder="user@organization.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400">Create Password</label>
                  <div className="relative">
                    <Key className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input 
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-950/30 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]"
                >
                  <span>{isSubmitting ? 'Creating Account...' : 'Create Account'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase tracking-wider font-bold">
              <span className="bg-slate-950 px-3 text-slate-500">Quick Sandbox Demo Access</span>
            </div>
          </div>

          {/* Quick Demo Access Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleDemoSignIn('admin')}
              disabled={isSubmitting}
              className="p-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-emerald-500/50 rounded-xl text-left transition-all group disabled:opacity-50"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                  Demo Admin
                </span>
                <Zap className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <p className="text-[10px] text-slate-400">Explore full admin suite & portfolio valuation engine</p>
            </button>

            <button
              type="button"
              onClick={() => handleDemoSignIn('investor')}
              disabled={isSubmitting}
              className="p-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-blue-500/50 rounded-xl text-left transition-all group disabled:opacity-50"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">
                  Demo Investor
                </span>
                <UserCheck className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <p className="text-[10px] text-slate-400">View client holding balances & statements</p>
            </button>
          </div>

          {/* Encrypted Notice Footer */}
          <div className="flex items-center justify-center gap-2 text-slate-500 text-[11px] pt-2">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>256-Bit SSL Encrypted & Firebase Auth Secured</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
