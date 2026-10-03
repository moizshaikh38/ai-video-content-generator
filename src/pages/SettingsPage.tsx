import React, { useState } from 'react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { projectService } from '../services/projectService';
import { CreatorProfile } from '../types';

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
  const [profile, setProfile] = useState<CreatorProfile>(() => projectService.getProfile());
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    projectService.updateProfile(profile);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight font-display text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure your creator profile and AI content persona preferences.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Profile Details */}
        <section className="card-soft space-y-4 p-5 md:p-7">
          <h2 className="text-lg font-semibold font-display text-foreground">Profile</h2>
          <Input
            label="Full Name"
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
          <Input
            label="Email Address"
            value={profile.email}
            disabled
            className="bg-secondary/40 text-muted-foreground cursor-not-allowed"
          />
        </section>

        {/* Content Persona Preferences */}
        <section className="card-soft space-y-4 p-5 md:p-7">
          <h2 className="text-lg font-semibold font-display text-foreground">
            Content preferences
          </h2>
          <Input
            label="Creator Niche"
            placeholder="e.g. Fitness, Tech breakdowns, SaaS & Startups"
            value={profile.niche}
            onChange={(e) => setProfile({ ...profile, niche: e.target.value })}
          />
          <Input
            label="Target Audience"
            placeholder="e.g. Busy founders, developers, early career professionals"
            value={profile.audience}
            onChange={(e) => setProfile({ ...profile, audience: e.target.value })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">Language</label>
              <select
                value={profile.language}
                onChange={(e) => setProfile({ ...profile, language: e.target.value })}
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
              <label className="block text-xs font-medium text-foreground">Content Tone</label>
              <select
                value={profile.tone}
                onChange={(e) => setProfile({ ...profile, tone: e.target.value })}
                className="flex h-10 w-full rounded-xl border border-input bg-card px-3.5 py-2 text-sm shadow-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {TONES.map((tone) => (
                  <option key={tone} value={tone}>
                    {tone}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {savedSuccess && (
          <div className="rounded-xl bg-sage/15 border border-sage/30 p-3 text-xs text-sage font-medium text-center">
            Settings saved successfully!
          </div>
        )}

        <Button type="submit" variant="sage" size="lg" className="w-full">
          Save Settings
        </Button>
      </form>

      {/* Account Section */}
      <section className="card-soft space-y-3 p-5 md:p-7">
        <h2 className="text-lg font-semibold font-display text-foreground">Account</h2>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="outline" size="sm" onClick={() => alert('Password reset link sent to ' + profile.email)}>
            Reset Password
          </Button>
          <Button variant="outline" size="sm" onClick={() => (window.location.href = '/')}>
            Sign Out
          </Button>
        </div>
      </section>
    </div>
  );
};
