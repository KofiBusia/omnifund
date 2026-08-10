import React, { useState, useEffect } from 'react';
import { 
  verifyActivationToken, 
  activateInvestorPortalAccount 
} from '../services/investorProvisioningService';
import { cn } from '../lib/utils';
import { PortalInvitation } from '../types';
import { 
  ShieldCheck, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  RefreshCw, 
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';
import { toast } from 'sonner';

interface ActivationScreenProps {
  tokenFromUrl?: string;
  onActivated?: () => void;
}

export default function ActivationScreen({ tokenFromUrl, onActivated }: ActivationScreenProps) {
  const [token, setToken] = useState<string>('');
  const [isValidating, setIsValidating] = useState<boolean>(true);
  const [isValidToken, setIsValidToken] = useState<boolean>(false);
  const [invitation, setInvitation] = useState<PortalInvitation | null>(null);
  const [validationError, setValidationError] = useState<string>('');

  // Password State
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  useEffect(() => {
    // Determine token from URL query params if not explicitly passed as prop
    let activeToken = tokenFromUrl;
    if (!activeToken && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      activeToken = urlParams.get('token') || '';
    }

    setToken(activeToken || '');

    if (activeToken) {
      validateToken(activeToken);
    } else {
      setIsValidating(false);
      setValidationError('No activation token provided in the link.');
    }
  }, [tokenFromUrl]);

  const validateToken = async (tok: string) => {
    setIsValidating(true);
    try {
      const res = await verifyActivationToken(tok);
      if (res.isValid && res.invitation) {
        setIsValidToken(true);
        setInvitation(res.invitation);
      } else {
        setIsValidToken(false);
        setValidationError(res.error || 'Invalid or expired token.');
      }
    } catch (err: any) {
      setIsValidToken(false);
      setValidationError(err?.message || 'Token verification failed.');
    } finally {
      setIsValidating(false);
    }
  };

  // Real-time password strength validation
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isFormValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && passwordsMatch;

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || !token) return;

    setIsSubmitting(true);
    try {
      const res = await activateInvestorPortalAccount(token, password);
      if (res.success) {
        setIsSuccess(true);
        toast.success("Account activated successfully!");
        if (onActivated) {
          setTimeout(onActivated, 1500);
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Activation failed: " + (err?.message || 'Check logs'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 mx-auto">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold">Investor Portal Activation</h2>
          <p className="text-xs text-slate-400">OmniFund Pro Secure Account Provisioning</p>
        </div>

        {/* Loading State */}
        {isValidating && (
          <div className="py-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-mono">Verifying activation token...</p>
          </div>
        )}

        {/* Invalid / Expired Token View */}
        {!isValidating && !isValidToken && (
          <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-center space-y-4">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
            <div>
              <h3 className="text-sm font-bold text-white">Activation Link Error</h3>
              <p className="text-xs text-slate-400 mt-1">{validationError}</p>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              For security, activation links expire after 48 hours. Please request a new activation link from your fund administrator.
            </p>
          </div>
        )}

        {/* Success View */}
        {!isValidating && isSuccess && (
          <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <div>
              <h3 className="text-lg font-bold text-white">Account Activated!</h3>
              <p className="text-xs text-slate-400 mt-1">Your password has been saved securely.</p>
            </div>
            <button 
              onClick={() => onActivated ? onActivated() : window.location.href = '/'}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
            >
              Go to Investor Dashboard <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Valid Token Form View */}
        {!isValidating && isValidToken && !isSuccess && (
          <form onSubmit={handleActivate} className="space-y-6">
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Account Email</span>
              <p className="text-sm font-mono font-bold text-emerald-400">{invitation?.email}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Create Password</label>
                <div className="relative">
                  <input 
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500 font-mono pr-10"
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Confirm Password</label>
                <input 
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  required
                />
              </div>
            </div>

            {/* Real-time Password Rules Checklist */}
            <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-2 text-xs">
              <span className="text-[10px] uppercase font-bold text-slate-500">Security Requirements</span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className={cn("flex items-center gap-1.5", hasMinLength ? "text-emerald-400 font-bold" : "text-slate-500")}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> 8+ Characters
                </div>
                <div className={cn("flex items-center gap-1.5", hasUppercase ? "text-emerald-400 font-bold" : "text-slate-500")}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Uppercase Letter
                </div>
                <div className={cn("flex items-center gap-1.5", hasLowercase ? "text-emerald-400 font-bold" : "text-slate-500")}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Lowercase Letter
                </div>
                <div className={cn("flex items-center gap-1.5", hasNumber ? "text-emerald-400 font-bold" : "text-slate-500")}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Number (0-9)
                </div>
              </div>
            </div>

            <button 
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-2xl text-sm transition-all shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2"
            >
              {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {isSubmitting ? 'Activating Account...' : 'Set Password & Activate Portal'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
