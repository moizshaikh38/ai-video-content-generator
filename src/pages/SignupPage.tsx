import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleIcon } from '../components/GoogleIcon';
import { Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { authPathWithReturn, landingReturnPath } from '../lib/landingReturnPath';

export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const destination = landingReturnPath(location.search);
  const { signUp, isConfigured } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    setBusy(true);

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      setBusy(false);
      return;
    }
    if (!agreed) {
      setErrorMessage('Please agree to the account terms.');
      setBusy(false);
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      setBusy(false);
      return;
    }

    try {
      const { error } = await signUp(email.trim(), password, name.trim());
      if (error) {
        if (error.message.includes('User already registered') || error.message.includes('already exists')) {
          setErrorMessage('An account with this email already exists. Please sign in instead.');
        } else if (error.message.includes('Password should be')) {
          setErrorMessage('Password is too weak. Please use at least 6 characters.');
        } else {
          setErrorMessage(error.message || 'Failed to create account. Please try again.');
        }
        setBusy(false);
        return;
      }

      navigate(destination);
    } catch (err) {
      setErrorMessage((err as Error).message || 'An unexpected error occurred.');
      setBusy(false);
    }
  };

  const handleGoogleOAuth = async () => {
    setErrorMessage(null);
    if (!isConfigured) {
      setInfoMessage('Google sign-up requires VITE_SUPABASE_URL and Google OAuth provider enabled in the Supabase Dashboard.');
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + destination,
        },
      });
      if (error) {
        setErrorMessage('Google sign-up failed. Please verify Google OAuth configuration in Supabase Dashboard.');
      }
    } catch {
      setErrorMessage('Could not initiate Google authentication.');
    }
  };

  return (
    <AuthLayout
      title="Finish signing up to get your free clips"
      subtitle="Free plan available. No credit card required."
    >
      {/* Alerts */}
      {errorMessage && (
        <div role="alert" className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-200 flex items-start gap-2">
          <AlertCircle className="size-4 shrink-0 text-rose-400 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}
      {infoMessage && (
        <div role="status" className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-200 flex items-start gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-400 mt-0.5" />
          <span>{infoMessage}</span>
        </div>
      )}

      {/* Tactile Frosted Glass Google OAuth Button */}
      <button
        type="button"
        onClick={handleGoogleOAuth}
        className="mt-4 h-10 w-full rounded-xl bg-white/[0.06] hover:bg-white/[0.11] active:scale-[0.99] border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] text-xs sm:text-sm font-medium text-white flex items-center justify-center gap-2.5 transition-all cursor-pointer"
      >
        <GoogleIcon />
        <span>Continue with Google</span>
      </button>

      {/* Refined Divider */}
      <div className="my-3.5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-400 font-mono">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <span>or continue with email</span>
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      </div>

      {/* Signup Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="signup-name" className="block text-xs font-medium text-slate-300 mb-1">
            Full name
          </label>
          <input
            id="signup-name"
            type="text"
            required
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-xl bg-[#0A0B10]/80 border border-white/[0.09] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/70 focus:bg-[#0D0E15] focus:outline-none focus:ring-4 focus:ring-violet-500/15 transition-all"
          />
        </div>

        <div>
          <label htmlFor="signup-email" className="block text-xs font-medium text-slate-300 mb-1">
            Email address
          </label>
          <input
            id="signup-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 w-full rounded-xl bg-[#0A0B10]/80 border border-white/[0.09] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/70 focus:bg-[#0D0E15] focus:outline-none focus:ring-4 focus:ring-violet-500/15 transition-all"
          />
        </div>

        {/* 2-Column Side-by-Side Grid for Password & Confirm Password (saves 68px vertical height!) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="signup-password" className="block text-xs font-medium text-slate-300 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="signup-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Min 6 chars"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 w-full rounded-xl bg-[#0A0B10]/80 border border-white/[0.09] pl-3.5 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/70 focus:bg-[#0D0E15] focus:outline-none focus:ring-4 focus:ring-violet-500/15 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1.5 bottom-1.5 p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="signup-confirm-password" className="block text-xs font-medium text-slate-300 mb-1">
              Confirm password
            </label>
            <div className="relative">
              <input
                id="signup-confirm-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-10 w-full rounded-xl bg-[#0A0B10]/80 border border-white/[0.09] pl-3.5 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/70 focus:bg-[#0D0E15] focus:outline-none focus:ring-4 focus:ring-violet-500/15 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1.5 bottom-1.5 p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Terms agreement checkbox */}
        <label className="flex items-start gap-2.5 text-xs text-slate-400 cursor-pointer pt-0.5">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 accent-violet-500 size-4 rounded bg-[#0A0B10]/80 border-white/20 text-violet-500 focus:ring-violet-500/30 cursor-pointer shrink-0"
          />
          <span className="leading-snug text-[11px] sm:text-xs">
            I agree to the{' '}
            <Link to="/terms" target="_blank" className="text-slate-300 underline decoration-white/30 hover:text-violet-300 transition-colors">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" target="_blank" className="text-slate-300 underline decoration-white/30 hover:text-violet-300 transition-colors">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        {/* Signature Electric Violet CTA Button */}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 h-11 w-full rounded-xl bg-gradient-to-b from-[#9B6BFF] to-[#7C3AED] hover:from-[#A87CFF] hover:to-[#8B5CF6] active:scale-[0.99] text-white font-semibold text-sm shadow-[0_8px_24px_rgba(139,92,246,0.40),inset_0_1px_0_rgba(255,255,255,0.28)] border border-violet-400/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <span>{busy ? 'Creating account…' : 'Continue with email'}</span>
          <ArrowRight className="size-4" />
        </button>
      </form>

      {/* Switch Link */}
      <p className="mt-4 text-center text-xs sm:text-sm text-slate-400">
        Already have an account?{' '}
        <Link
          to={authPathWithReturn('/login', destination)}
          className="font-semibold text-violet-400 hover:text-violet-300 transition-colors"
        >
          Sign in
        </Link>
      </p>

      {/* Terms of Service & Privacy Policy inside card */}
      <div className="mt-4 pt-3.5 border-t border-white/[0.06] text-center text-[11px] text-slate-500 flex items-center justify-center gap-3">
        <Link to="/terms" target="_blank" className="hover:text-slate-400 transition-colors">
          Terms of Service
        </Link>
        <span>·</span>
        <Link to="/privacy" target="_blank" className="hover:text-slate-400 transition-colors">
          Privacy Policy
        </Link>
      </div>
    </AuthLayout>
  );
};
export default SignupPage;
