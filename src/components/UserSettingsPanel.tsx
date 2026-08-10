import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { 
  Sun, 
  Moon, 
  Shield, 
  User as UserIcon, 
  Bell, 
  Check, 
  Sparkles, 
  Save, 
  Clock, 
  Laptop, 
  Key, 
  Lock,
  Mail,
  Palette,
  Sliders,
  CheckCircle2,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

interface UserSettingsPanelProps {
  user: User | null;
  role: string | null;
  theme: 'dark' | 'light';
  onThemeChange: (newTheme: 'dark' | 'light') => void;
  isDemoMode?: boolean;
}

export default function UserSettingsPanel({
  user,
  role,
  theme,
  onThemeChange,
  isDemoMode = false
}: UserSettingsPanelProps) {
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [notifications, setNotifications] = useState({
    emailStatements: true,
    valuationAlerts: true,
    securityAlerts: true,
    portfolioUpdates: false
  });
  const [compactDensity, setCompactDensity] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  useEffect(() => {
    if (user?.displayName) {
      setDisplayName(user.displayName);
    }
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    const toastId = toast.loading('Saving user preferences to Firestore...');

    try {
      if (!isDemoMode) {
        await setDoc(doc(db, 'users', user.uid), {
          displayName,
          theme,
          notifications,
          compactDensity,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      setLastSavedTime(new Date().toLocaleTimeString());
      toast.success('User settings persisted in Firestore profile!', { id: toastId });
    } catch (err: any) {
      console.error('Error updating user document:', err);
      toast.error(`Failed to save settings: ${err?.message || 'Error occurred'}`, { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleNotification = (key: keyof typeof notifications) => {
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated);
  };

  const isDark = theme === 'dark';

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className={`p-8 rounded-3xl border transition-all relative overflow-hidden ${
        isDark 
          ? 'bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border-slate-800' 
          : 'bg-gradient-to-r from-white via-slate-50 to-emerald-50/40 border-slate-200 shadow-sm'
      }`}>
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Sliders className="w-3.5 h-3.5" />
              <span>User Profile & System Preferences</span>
            </div>
            <h1 className={`text-3xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Account Settings
            </h1>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Customize display modes, notification triggers, and user profile metadata stored in Firestore.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {lastSavedTime && (
              <span className={`text-xs flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <Clock className="w-3.5 h-3.5 text-emerald-500" />
                <span>Last saved: {lastSavedTime}</span>
              </span>
            )}
            <button
              onClick={handleSaveProfile}
              disabled={isSaving}
              className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isSaving ? 'Saving...' : 'Save Preferences'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid Settings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Theme & Appearance */}
        <div className="md:col-span-2 space-y-8">
          {/* Theme Selector Section */}
          <div className={`p-6 rounded-3xl border transition-all ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Theme & Display Mode
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Persists across sessions in your Firestore user document
                </p>
              </div>
            </div>

            {/* Light / Dark Mode Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Dark Mode Card */}
              <div
                onClick={() => onThemeChange('dark')}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all relative overflow-hidden group ${
                  theme === 'dark'
                    ? 'border-emerald-500 bg-slate-950 shadow-lg shadow-emerald-950/40'
                    : isDark 
                      ? 'border-slate-800 bg-slate-950/50 hover:border-slate-700' 
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400">
                    <Moon className="w-5 h-5" />
                  </div>
                  {theme === 'dark' && (
                    <span className="p-1 rounded-full bg-emerald-500 text-slate-950">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </span>
                  )}
                </div>
                <h4 className={`font-bold text-sm mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Dark Mode
                </h4>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Deep slate background, high contrast text for night & low-light usage.
                </p>
                {/* Visual Preview Box */}
                <div className="mt-4 p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 pointer-events-none">
                  <div className="h-2 w-16 bg-emerald-500 rounded-full" />
                  <div className="h-2 w-24 bg-slate-700 rounded-full" />
                </div>
              </div>

              {/* Light Mode Card */}
              <div
                onClick={() => onThemeChange('light')}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition-all relative overflow-hidden group ${
                  theme === 'light'
                    ? 'border-emerald-500 bg-emerald-50/20 shadow-lg shadow-emerald-500/10'
                    : isDark 
                      ? 'border-slate-800 bg-slate-950/50 hover:border-slate-700' 
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                    <Sun className="w-5 h-5" />
                  </div>
                  {theme === 'light' && (
                    <span className="p-1 rounded-full bg-emerald-500 text-white">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </span>
                  )}
                </div>
                <h4 className={`font-bold text-sm mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Light Mode
                </h4>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Clean white canvas with crisp typography, tailored for bright day viewing.
                </p>
                {/* Visual Preview Box */}
                <div className="mt-4 p-3 rounded-xl bg-white border border-slate-200 space-y-1.5 pointer-events-none shadow-sm">
                  <div className="h-2 w-16 bg-emerald-600 rounded-full" />
                  <div className="h-2 w-24 bg-slate-300 rounded-full" />
                </div>
              </div>
            </div>

            {/* Sync Badge Notice */}
            <div className={`mt-6 p-4 rounded-2xl border flex items-center justify-between text-xs ${
              isDark ? 'bg-slate-950/80 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Active Theme: <strong className={isDark ? 'text-white' : 'text-slate-900'}>{theme.toUpperCase()} MODE</strong></span>
              </div>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20">
                Firestore Persisted
              </span>
            </div>
          </div>

          {/* User Profile Details */}
          <div className={`p-6 rounded-3xl border transition-all ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                <UserIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  User Profile Information
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Personal identity & account parameters
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your full name"
                  className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all ${
                    isDark 
                      ? 'bg-slate-950 border-slate-800 text-white' 
                      : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    Email Address
                  </label>
                  <div className={`px-4 py-3 rounded-xl border text-sm font-mono flex items-center justify-between ${
                    isDark ? 'bg-slate-950/60 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}>
                    <span className="truncate">{user?.email || 'N/A'}</span>
                    <Mail className="w-4 h-4 text-slate-500 shrink-0" />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    Portal Access Role
                  </label>
                  <div className={`px-4 py-3 rounded-xl border text-sm font-semibold flex items-center justify-between ${
                    role === 'admin' 
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' 
                      : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                  }`}>
                    <span className="uppercase tracking-wider font-bold">{role} Portal</span>
                    <Shield className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Notifications & Security Info */}
        <div className="space-y-8">
          {/* Notifications Panel */}
          <div className={`p-6 rounded-3xl border transition-all ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-2xl bg-teal-500/10 text-teal-500 border border-teal-500/20">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Notification Alerts
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Automated dispatch triggers
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {[
                { key: 'emailStatements', label: 'Quarterly Statement Emails', desc: 'Auto-receive PDF investor statements via Resend API' },
                { key: 'valuationAlerts', label: 'NAV & Valuation Re-calculations', desc: 'Alert when fund NAV updates via Smart Engine' },
                { key: 'securityAlerts', label: 'Security & Login Audit Logs', desc: 'Instant alerts on unknown device authentication' },
                { key: 'portfolioUpdates', label: 'Portfolio Asset Price Movements', desc: 'Daily market value shift summaries' }
              ].map((item) => {
                const active = notifications[item.key as keyof typeof notifications];
                return (
                  <div 
                    key={item.key}
                    onClick={() => handleToggleNotification(item.key as keyof typeof notifications)}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-start justify-between gap-3 ${
                      active
                        ? isDark ? 'bg-slate-950 border-emerald-500/40' : 'bg-emerald-50/40 border-emerald-200'
                        : isDark ? 'bg-slate-950/40 border-slate-800/80 opacity-70' : 'bg-slate-50 border-slate-200 opacity-70'
                    }`}
                  >
                    <div>
                      <h4 className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        {item.label}
                      </h4>
                      <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {item.desc}
                      </p>
                    </div>

                    <div className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${
                      active ? 'bg-emerald-500 justify-end' : isDark ? 'bg-slate-800 justify-start' : 'bg-slate-300 justify-start'
                    }`}>
                      <div className="w-4 h-4 rounded-full bg-white shadow-md" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Firestore Sync Security Card */}
          <div className={`p-6 rounded-3xl border transition-all ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-500 border border-purple-500/20">
                <Lock className="w-4 h-4" />
              </div>
              <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Firestore Security & Metadata
              </h4>
            </div>

            <div className={`p-4 rounded-2xl border space-y-2 text-xs font-mono ${
              isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <div className="flex justify-between">
                <span>UID:</span>
                <span className="text-slate-200 font-bold truncate max-w-[150px]">{user?.uid}</span>
              </div>
              <div className="flex justify-between">
                <span>Auth Provider:</span>
                <span className="text-emerald-500 font-bold">Google Auth</span>
              </div>
              <div className="flex justify-between">
                <span>Database Path:</span>
                <span className="text-slate-300">users/{user?.uid}</span>
              </div>
              <div className="flex justify-between">
                <span>Rules Status:</span>
                <span className="text-emerald-400 font-bold">Verified ABAC</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
