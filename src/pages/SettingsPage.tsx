import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { projectService } from '../services/projectService';

const LANGUAGES = [
  'English',
  'Hindi',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Arabic',
  'Japanese',
];

const TONES = [
  'Friendly',
  'Professional',
  'Witty',
  'Bold',
  'Inspirational',
  'Educational',
];

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile: authProfile, creatorProfile: authCreator, refreshProfile, signOut, isConfigured } = useAuth();

  const [fullName, setFullName] = useState(authProfile?.full_name || '');
  const [niche, setNiche] = useState(authCreator?.niche || '');
  const [audience, setAudience] = useState(authCreator?.target_audience || '');
  const [language, setLanguage] = useState(authCreator?.language || 'English');
  const [tone, setTone] = useState(authCreator?.tone || 'Friendly');

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authProfile) {
      setFullName(authProfile.full_name);
    } else if (user?.user_metadata?.full_name) {
      setFullName(user.user_metadata.full_name);
    }

    if (authCreator) {
      if (authCreator.niche) setNiche(authCreator.niche);
      if (authCreator.target_audience) setAudience(authCreator.target_audience);
      if (authCreator.language) setLanguage(authCreator.language);
      if (authCreator.tone) setTone(authCreator.tone);
    }
  }, [authProfile, authCreator, user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    let saved = true;
    setSaving(true);
    setSavedSuccess(false);
    setErrorMessage(null);

    // Sync local projectService profile for immediate responsiveness
    projectService.updateProfile({
      name: fullName,
      niche,
      audience,
      language,
      tone,
    });

    if (isConfigured && user) {
      try {
        // 1. Update public.profiles
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ full_name: fullName.trim() })
          .eq('id', user.id);

        if (profileError) throw profileError;

        // 2. Upsert public.creator_profiles
        const { error: creatorError } = await supabase
          .from('creator_profiles')
          .upsert({
            user_id: user.id,
            niche: niche.trim(),
            target_audience: audience.trim(),
            language,
            tone,
          }, { onConflict: 'user_id' });

        if (creatorError) throw creatorError;

        await refreshProfile();
      } catch (err) {
        console.error('Failed to save to Supabase:', err);
        setErrorMessage('Failed to sync settings with database. Local changes were preserved.');
        saved = false;
      }
    }

    setSaving(false);
    if (saved) {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  const handleResetPassword = async () => {
    setAccountMessage(null);
    if (!user?.email) return;

    if (!isConfigured) {
      setAccountMessage('Supabase is not configured yet in .env.local.');
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: window.location.origin + '/settings',
      });
      if (error) {
        setAccountMessage(`Password reset error: ${error.message}`);
      } else {
        setAccountMessage(`Password reset link sent to ${user.email}`);
      }
    } catch {
      setAccountMessage('Could not send password reset email.');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold tracking-tight font-display text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalize your creator profile and content preferences.
        </p>
      </div>

      <form onSubmit={handleSave} className="grid items-start gap-5 lg:grid-cols-2">
        {/* Profile Details */}
        <section className="card-soft space-y-4 p-5 md:p-7">
          <div><h2 className="text-xl font-semibold font-display text-foreground">Profile Settings</h2><p className="text-sm text-muted-foreground">Manage how your account appears.</p></div>
          <Input
            label="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Alex Rivera"
          />
          <Input
            label="Email Address"
            value={user?.email || ''}
            disabled
            className="bg-secondary/40 text-muted-foreground cursor-not-allowed"
          />
        </section>

        {/* Content Persona Preferences */}
        <section className="card-soft space-y-4 p-5 md:p-7">
          <div><h2 className="text-xl font-semibold font-display text-foreground">Creator Profile</h2><p className="text-sm text-muted-foreground">Help Vireo shape content for your audience.</p></div>
          <Input
            label="Creator Niche"
            placeholder="e.g. Fitness, Tech breakdowns, SaaS & Startups"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
          />
          <Input
            label="Target Audience"
            placeholder="e.g. Busy founders, developers, early career professionals"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="creator-language" className="block text-sm font-semibold text-foreground">Language</label>
              <select
                id="creator-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-card px-3.5 py-2 text-sm shadow-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="creator-tone" className="block text-sm font-semibold text-foreground">Content Tone</label>
              <select
                id="creator-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-card px-3.5 py-2 text-sm shadow-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {errorMessage && (
          <div role="alert" className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive font-medium lg:col-span-2">
            {errorMessage}
          </div>
        )}

        {savedSuccess && (
          <div role="status" className="rounded-xl bg-sage/15 border border-sage/30 p-3 text-sm text-sage font-medium lg:col-span-2">
            Settings saved successfully!
          </div>
        )}

        <Button type="submit" variant="clay" size="lg" className="lg:col-span-2 lg:justify-self-end" disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </form>

      {/* Account Section */}
      <section className="card-soft space-y-3 p-5 md:p-7">
        <h2 className="text-lg font-semibold font-display text-foreground">Account</h2>
        {accountMessage && (
          <p className="text-xs font-medium text-sage mb-2">{accountMessage}</p>
        )}
        <div className="flex flex-wrap gap-2.5">
          <Button variant="outline" size="sm" onClick={handleResetPassword}>
            Reset Password
          </Button>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      </section>
    </div>
  );
};
