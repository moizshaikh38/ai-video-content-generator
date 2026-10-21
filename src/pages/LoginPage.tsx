import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleIcon } from '../components/GoogleIcon';
import { Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { authPathWithReturn, landingReturnPath } from '../lib/landingReturnPath';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const destination = landingReturnPath(
    location.search,
    (location.state as { from?: { pathname?: string; search?: string } } | null)?.from,
  );
  const { signInWithPassword, isConfigured, isAuthenticated, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate(destination || '/dashboard', { replace: true });
    }
  }, [loading, isAuthenticated, destination, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    setBusy(true);

    try {
      const { error } = await signInWithPassword(email.trim(), password);
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErrorMessage('Invalid email or password. Please check your credentials.');
        } else if (error.message.includes('Email not confirmed')) {
          setErrorMessage('Please confirm your email address before signing in.');
        } else {
          setErrorMessage(error.message || 'Failed to sign in. Please try again.');
        }
        setBusy(false);
        return;
      }

      navigate(destination || '/dashboard', { replace: true });
    } catch (err) {
      setErrorMessage((err as Error).message || 'An unexpected error occurred.');
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setErrorMessage('Please enter your email address to receive password reset instructions.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/settings`,
      });
      if (error) throw error;
      setInfoMessage('Password reset instructions sent. Please check your inbox.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not send reset email.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleOAuth = async () => {
    setErrorMessage(null);
    if (!isConfigured) {
      setInfoMessage('Google sign-in requires VITE_SUPABASE_URL and Google OAuth provider enabled in the Supabase Dashboard.');
      return;
    }

    try {
      const redirectTarget = destination && destination !== '/' ? destination : '/dashboard';
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${redirectTarget}`,
        },
      });
      if (error) {
        setErrorMessage('Google sign-in failed. Please verify Google OAuth configuration in Supabase Dashboard.');
      }
    } catch {
      setErrorMessage('Could not initiate Google authentication.');
    }
  };

  return (
    <AuthLayout
      title="Welcome back to VireoClip"
      subtitle="Sign in to access your AI clips, templates, and studio workspace."
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

      {/* Credentials Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="login-email" className="block text-xs font-medium text-slate-300 mb-1">
            Email address
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 w-full rounded-xl bg-[#0A0B10]/80 border border-white/[0.09] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/70 focus:bg-[#0D0E15] focus:outline-none focus:ring-4 focus:ring-violet-500/15 transition-all"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="login-password" className="block text-xs font-medium text-slate-300">
              Password
            </label>
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors focus:outline-none cursor-pointer"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete="current-password"
              placeholder="Enter your password"
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

        {/* Signature Electric Violet CTA Button */}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 h-11 w-full rounded-xl bg-gradient-to-b from-[#9B6BFF] to-[#7C3AED] hover:from-[#A87CFF] hover:to-[#8B5CF6] active:scale-[0.99] text-white font-semibold text-sm shadow-[0_8px_24px_rgba(139,92,246,0.40),inset_0_1px_0_rgba(255,255,255,0.28)] border border-violet-400/30 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <span>{busy ? 'Signing in…' : 'Continue with email'}</span>
          <ArrowRight className="size-4" />
        </button>
      </form>

      {/* Switch Link */}
      <p className="mt-4 text-center text-xs sm:text-sm text-slate-400">
        Don't have an account?{' '}
        <Link
          to={authPathWithReturn('/signup', destination)}
          className="font-semibold text-violet-400 hover:text-violet-300 transition-colors"
        >
          Sign up for free
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
export default LoginPage;
