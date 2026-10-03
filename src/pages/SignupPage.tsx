import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const { signUp, isConfigured } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    setBusy(true);

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

      navigate('/dashboard');
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
          redirectTo: window.location.origin + '/dashboard',
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
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10 bg-background text-foreground">
      <Logo />

      <div className="card-soft mt-8 w-full max-w-sm p-6 sm:p-7">
        <h1 className="text-2xl font-semibold font-display text-foreground">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn one video into content everywhere.
        </p>

        {errorMessage && (
          <div className="mt-4 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive font-medium">
            {errorMessage}
          </div>
        )}

        {infoMessage && (
          <div className="mt-4 rounded-xl bg-sage/15 border border-sage/30 p-3 text-xs text-sage font-medium">
            {infoMessage}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className="mt-6 w-full flex items-center justify-center gap-2"
          onClick={handleGoogleOAuth}
        >
          <svg className="size-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continue with Google</span>
        </Button>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Your Name"
            type="text"
            required
            placeholder="Alex Rivera"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            required
            minLength={6}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Button type="submit" variant="sage" className="w-full mt-2" disabled={busy}>
            {busy ? 'Creating account…' : 'Sign up'}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs sm:text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};
