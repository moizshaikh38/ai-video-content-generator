import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Palette,
  Mic,
  Subtitles,
  Film,
  Brain,
  History,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Upload,
  Shield,
  Target,
  Check,
  X,
} from 'lucide-react';
import { brandBrainService } from '../services/brandBrainService';
import {
  BrandBrainProfile,
  BrandBrainVersion,
  BrandEvidence,
  BrandCheckResult,
  BrandRecommendation,
  BrandContentPillar,
  BrandApprovedTerm,
  SAFE_EDITOR_FONTS,
} from '../types';

const renderEvidenceValue = (value: any) => {
  if (value === null || value === undefined) {
    return <span className="text-vc-text-secondary italic">None</span>;
  }
  if (typeof value === 'string') {
    return <span className="text-vc-text-primary font-medium">{value}</span>;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-vc-text-primary font-semibold">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5 mt-1">
        {value.map((item, idx) => (
          <span
            key={idx}
            className="rounded-md bg-white/[0.06] px-2 py-0.5 text-xs text-vc-text-primary"
          >
            {typeof item === 'object' ? JSON.stringify(item) : String(item)}
          </span>
        ))}
      </div>
    );
  }
  if (typeof value === 'object') {
    return (
      <div className="flex flex-wrap gap-2 mt-1">
        {Object.entries(value).map(([k, v]) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-0.5 text-xs"
          >
            <span className="text-vc-text-secondary capitalize">{k.replace(/_/g, ' ')}:</span>
            <span className="font-semibold text-vc-text-primary">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
          </span>
        ))}
      </div>
    );
  }
  return <span className="text-vc-text-primary">{String(value)}</span>;
};

const BrandVideoPreview916: React.FC<{
  profile: BrandBrainProfile;
}> = ({ profile }) => {
  const brandName = profile.identity.brand_name || 'VireoClip Brand';
  const primaryColor = profile.visual.primary_colors[0] || '#10B981';
  const accentColor = profile.visual.accent_colors[0] || '#10B981';
  const font = profile.visual.fonts[0] || 'Inter';
  const captionStyle = profile.captions?.default_style || 'active_word_pop';
  const caseStyle = profile.captions?.case_style || 'uppercase';

  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-full max-w-[280px] aspect-[9/16] rounded-3xl bg-vc-canvas shadow-2xl relative overflow-hidden flex flex-col justify-between p-4 group select-none">
        {/* Subtle Video Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/50 to-black/90 pointer-events-none" />
        <div
          className="absolute -top-24 -left-24 size-48 rounded-full blur-3xl opacity-25 pointer-events-none"
          style={{ backgroundColor: primaryColor }}
        />
        <div
          className="absolute -bottom-24 -right-24 size-48 rounded-full blur-3xl opacity-25 pointer-events-none"
          style={{ backgroundColor: accentColor }}
        />

        {/* Top Header / Watermark */}
        <div className="relative z-10 flex items-center justify-between text-white/90">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="size-7 rounded-full flex items-center justify-center text-xs font-bold text-black border border-white/20 shadow-sm shrink-0"
              style={{ backgroundColor: accentColor }}
            >
              {brandName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold leading-tight truncate">{brandName}</div>
              <div className="text-[10px] text-white/60">Brand DNA Live</div>
            </div>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/80 shrink-0">9:16</span>
        </div>

        {/* Center / Karaoke Caption Mock */}
        <div className="relative z-10 flex flex-col items-center justify-center my-auto px-2 text-center">
          <div
            className={`transition-all duration-300 p-3 rounded-xl max-w-full ${
              captionStyle === 'boxed_highlighter'
                ? 'bg-black/80 border border-white/20 shadow-lg'
                : 'bg-black/40 backdrop-blur-xs'
            }`}
            style={{ fontFamily: font }}
          >
            <div
              className="text-base font-extrabold tracking-wide leading-snug"
              style={{
                textTransform: caseStyle === 'uppercase' ? 'uppercase' : caseStyle === 'lowercase' ? 'lowercase' : 'none',
              }}
            >
              <span className="text-white">CREATE </span>
              <span
                className="px-1.5 py-0.5 rounded-md text-black transition-colors"
                style={{
                  backgroundColor: accentColor,
                  textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }}
              >
                VIRAL
              </span>
              <span className="text-white"> SHORTS</span>
            </div>
            <div
              className="text-xs font-semibold text-white/80 mt-1"
              style={{
                textTransform: caseStyle === 'uppercase' ? 'uppercase' : caseStyle === 'lowercase' ? 'lowercase' : 'none',
              }}
            >
              IN SECONDS WITH AI
            </div>
          </div>

          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono text-white/60">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Style: {captionStyle.replace(/_/g, ' ')}</span>
          </div>
        </div>

        {/* Bottom Metadata Badges */}
        <div className="relative z-10 space-y-1.5 border-t border-white/10 pt-2.5">
          <div className="flex items-center justify-between text-[11px] text-white/80">
            <span className="text-white/50">Safe Font</span>
            <span className="font-semibold text-white truncate max-w-[120px]">{font}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/80">
            <span className="text-white/50">Primary Accent</span>
            <div className="flex items-center gap-1.5 font-mono text-[10px]">
              <span className="size-2.5 rounded-full border border-white/20" style={{ backgroundColor: accentColor }} />
              <span>{accentColor}</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/80">
            <span className="text-white/50">Pacing Dynamics</span>
            <span className="capitalize font-medium text-white">{profile.editing?.pacing_style || 'fast'}</span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-vc-text-secondary text-center">Interactive 9:16 vertical video preview</p>
    </div>
  );
};

export const BrandPage: React.FC = () => {
  const [profile, setProfile] = useState<BrandBrainProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'intelligence' | 'voice' | 'visual' | 'captions' | 'hooks_cta' | 'editing_audio' | 'learned' | 'check' | 'versions' | 'import'
  >('overview');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Extra state for sub-features
  const [evidenceList, setEvidenceList] = useState<BrandEvidence[]>([]);
  const [versions, setVersions] = useState<BrandBrainVersion[]>([]);
  const [recommendations, setRecommendations] = useState<BrandRecommendation[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [analyticsStatus, setAnalyticsStatus] = useState<string>('INSUFFICIENT_DATA');
  const [evidenceExplanation, setEvidenceExplanation] = useState<string>('');

  // Human review modal state
  const [overwriteModal, setOverwriteModal] = useState<{
    isOpen: boolean;
    recommendation: BrandRecommendation | null;
    message: string;
    editedValue?: any;
  }>({ isOpen: false, recommendation: null, message: '' });

  // Brand Check State
  const [checkText, setCheckText] = useState('');
  const [checkResult, setCheckResult] = useState<BrandCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // Import guidelines state
  const [guidelinesText, setGuidelinesText] = useState('');
  const [importedDraft, setImportedDraft] = useState<any | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  // Fast Onboarding modal
  const [showWizard, setShowWizard] = useState(false);
  const [wizardData, setWizardData] = useState({
    brand_name: '',
    industry: '',
    tone: 'conversational',
    primary_color: '#3B82F6',
    font: 'Inter',
    caption_style: 'active_word_pop',
    pacing_style: 'fast' as const,
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await brandBrainService.getProfile();
      setProfile(data);

      // Load supporting data in parallel
      const [ev, vers, recs] = await Promise.all([
        brandBrainService.getEvidence(data.id),
        brandBrainService.getVersions(data.id),
        brandBrainService.getRecommendations(data.id),
      ]);
      setEvidenceList(ev);
      setVersions(vers);
      setRecommendations(recs.recommendations || []);
      setConflicts(recs.conflicts || []);
      setAnalyticsStatus(recs.analytics_status || 'INSUFFICIENT_DATA');
      setEvidenceExplanation(recs.explanation || '');
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load Brand Brain profile.' });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveInsight = async (
    rec: BrandRecommendation,
    confirmOverwrite = false,
    customValue?: any
  ) => {
    if (!profile) return;
    try {
      const res = await brandBrainService.approveRecommendation(rec.id, {
        confirm_overwrite: confirmOverwrite,
        edited_value: customValue,
        brand_id: profile.id,
      });
      setProfile(res.profile);
      setRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
      setOverwriteModal({ isOpen: false, recommendation: null, message: '' });
      setFeedback({
        type: 'success',
        message: `Approved brand insight: "${rec.title}". Profile updated and version recorded.`,
      });
      // Refresh version ledger
      const updatedVersions = await brandBrainService.getVersions(profile.id);
      setVersions(updatedVersions);
    } catch (err: any) {
      if (err.code === 'CONFIRMATION_REQUIRED' || err.message?.includes('confirm')) {
        setOverwriteModal({
          isOpen: true,
          recommendation: rec,
          message: err.message || 'Approving this insight will replace an existing guideline.',
          editedValue: customValue,
        });
      } else {
        setFeedback({
          type: 'error',
          message: err.message || 'Failed to approve recommendation.',
        });
      }
    }
  };

  const handleDismissInsight = async (rec: BrandRecommendation) => {
    try {
      await brandBrainService.dismissRecommendation(rec.id);
      setRecommendations((prev) => prev.filter((r) => r.id !== rec.id));
      setFeedback({
        type: 'success',
        message: `Dismissed recommendation: "${rec.title}".`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to dismiss recommendation.',
      });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleLock = async (ruleKey: string) => {
    if (!profile) return;
    try {
      const isCurrentlyLocked = profile.locks?.[ruleKey] === true;
      const updated = await brandBrainService.setLock(ruleKey, !isCurrentlyLocked, profile.id);
      setProfile(updated);
      setFeedback({
        type: 'success',
        message: !isCurrentlyLocked ? `Locked rule: ${ruleKey}` : `Unlocked rule: ${ruleKey}`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update rule lock.' });
    }
  };

  const handleResetLearned = async () => {
    if (!profile) return;
    if (!window.confirm('Reset all learned intelligence preferences back to default? Explicit and locked brand settings will NOT be touched.')) {
      return;
    }
    try {
      const updated = await brandBrainService.resetLearned(profile.id);
      setProfile(updated);
      setFeedback({ type: 'success', message: 'Learned intelligence layer reset successfully.' });
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to reset learned layer.' });
    }
  };

  const handleRunCheck = async () => {
    if (!profile) return;
    try {
      setIsChecking(true);
      const result = await brandBrainService.checkCompliance(
        {
          text: checkText,
          fonts: [profile.visual.fonts[0] || 'Inter'],
          colors: [profile.visual.primary_colors[0] || '#3B82F6'],
          caption_style: profile.captions.default_style,
          pacing_style: profile.editing.pacing_style,
        },
        profile.id
      );
      setCheckResult(result);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Check failed.' });
    } finally {
      setIsChecking(false);
    }
  };

  const handleParseGuidelines = async () => {
    try {
      setIsParsing(true);
      const draft = await brandBrainService.parseGuidelines(guidelinesText);
      setImportedDraft(draft);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to parse guidelines.' });
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!profile || !importedDraft) return;
    try {
      setSaving(true);
      const updates: any = {};
      if (importedDraft.detected_brand_name) {
        updates.identity = { brand_name: importedDraft.detected_brand_name };
      }
      if (importedDraft.detected_colors?.length > 0) {
        updates.visual = { primary_colors: importedDraft.detected_colors };
      }
      if (importedDraft.detected_tones?.length > 0) {
        updates.voice = { tones: importedDraft.detected_tones };
      }
      if (importedDraft.detected_avoid_phrases?.length > 0) {
        updates.voice = { ...updates.voice, avoid_phrasing: importedDraft.detected_avoid_phrases };
      }

      const updated = await brandBrainService.updateProfile(updates, profile.id);
      setProfile(updated);
      setImportedDraft(null);
      setGuidelinesText('');
      setFeedback({ type: 'success', message: 'Imported guidelines saved to Brand Brain!' });
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to apply import.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreVersion = async (versionNum: number) => {
    if (!profile) return;
    if (!window.confirm(`Restore Brand Brain version ${versionNum}? Current settings will be snapshotted in version history.`)) {
      return;
    }
    try {
      const restored = await brandBrainService.restoreVersion(versionNum, profile.id);
      setProfile(restored);
      setFeedback({ type: 'success', message: `Restored version ${versionNum} successfully.` });
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to restore version.' });
    }
  };

  const handleSaveProfile = async (updates: Partial<BrandBrainProfile>) => {
    if (!profile) return;
    try {
      setSaving(true);
      const updated = await brandBrainService.updateProfile(updates, profile.id);
      setProfile(updated);
      setFeedback({ type: 'success', message: 'Brand Brain updated successfully.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteWizard = async () => {
    if (!profile) return;
    try {
      setSaving(true);
      const updated = await brandBrainService.updateProfile(
        {
          identity: {
            brand_name: wizardData.brand_name || profile.identity.brand_name,
            industry: wizardData.industry || profile.identity.industry,
          },
          voice: {
            ...profile.voice,
            tones: [wizardData.tone],
          },
          visual: {
            ...profile.visual,
            primary_colors: [wizardData.primary_color],
            fonts: [wizardData.font],
          },
          captions: {
            ...profile.captions,
            default_style: wizardData.caption_style,
          },
          editing: {
            ...profile.editing,
            pacing_style: wizardData.pacing_style,
          },
        },
        profile.id
      );
      setProfile(updated);
      setShowWizard(false);
      setFeedback({ type: 'success', message: 'Brand Brain setup complete!' });
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Setup wizard failed.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Brain className="size-8 animate-pulse text-violet-400" />
          <p className="text-sm font-medium text-vc-text-secondary">Loading VireoClip Brand Brain...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-vc-text-primary">
      {/* Header Banner */}
      <div className="mb-8 flex flex-col justify-between gap-4 rounded-3xl bg-vc-surface1 p-8 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_60px_-20px_rgba(0,0,0,0.8)] md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-violet-500/15 border border-violet-500/30">
              <Brain className="size-6 text-violet-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-vc-text-primary">VireoClip Brand Brain</h1>
              <p className="text-xs text-emerald-300/80">Persistent Brand Memory, Creator Voice & Visual Identity</p>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-vc-text-secondary">
            Advisory brand intelligence powering your Producer plans, Pro Editor timeline, Captions, B-Roll, and Multilingual Dubbing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 rounded-full bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 px-4 py-2.5 text-xs font-semibold text-white  transition hover:bg-vc-ai"
          >
            <Sparkles className="size-4" />
            Fast Setup Wizard
          </button>
          <button
            onClick={handleResetLearned}
            className="flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.06] px-4 py-2.5 text-xs font-medium text-white transition hover:bg-white/[0.1]"
          >
            <RotateCcw className="size-4" />
            Reset Learned Layer
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mb-6 flex items-center justify-between rounded-xl p-4 text-sm border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="size-5" /> : <AlertTriangle className="size-5" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs font-semibold underline hover:opacity-80">
            Dismiss
          </button>
        </div>
      )}

      {/* 4-Group Navigation Bar */}
      <div className="mb-6 space-y-3">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            {
              id: 'identity_voice',
              label: 'Identity & Voice',
              desc: 'Voice, Tone & CTAs',
              icon: Mic,
              defaultTab: 'overview',
            },
            {
              id: 'visual_media',
              label: 'Visual & Media Styling',
              desc: 'Palette, Captions & Preview',
              icon: Palette,
              defaultTab: 'visual',
            },
            {
              id: 'intelligence_learnings',
              label: 'Intelligence & Learnings',
              desc: 'Audience & Learned Memory',
              icon: Brain,
              defaultTab: 'intelligence',
            },
            {
              id: 'tools_versions',
              label: 'Tools & Versions',
              desc: 'Audit, History & Import',
              icon: Shield,
              defaultTab: 'check',
            },
          ].map((group) => {
            const isGroupActive =
              (group.id === 'identity_voice' && ['overview', 'voice', 'hooks_cta'].includes(activeTab)) ||
              (group.id === 'visual_media' && ['visual', 'captions', 'editing_audio'].includes(activeTab)) ||
              (group.id === 'intelligence_learnings' && ['intelligence', 'learned'].includes(activeTab)) ||
              (group.id === 'tools_versions' && ['check', 'versions', 'import'].includes(activeTab));

            return (
              <button
                key={group.id}
                onClick={() => {
                  if (!isGroupActive) {
                    setActiveTab(group.defaultTab as any);
                  }
                }}
                className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition ${
                  isGroupActive
                    ? 'border-emerald-500/50 bg-vc-surface1 shadow-lg shadow-emerald-950/20 ring-1 ring-emerald-500/30'
                    : 'border-white/[0.08] bg-vc-surface1/60 hover:border-white/[0.16] hover:bg-vc-surface1'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`p-1.5 rounded-lg ${
                      isGroupActive ? 'bg-violet-500/15 text-white ring-1 ring-violet-500/30' : 'bg-white/[0.06] text-vc-text-secondary'
                    }`}
                  >
                    <group.icon className="size-4" />
                  </div>
                  <span
                    className={`text-xs font-bold ${
                      isGroupActive ? 'text-vc-text-primary' : 'text-vc-text-secondary'
                    }`}
                  >
                    {group.label}
                  </span>
                </div>
                <span className="text-[10px] text-vc-text-secondary">{group.desc}</span>
              </button>
            );
          })}
        </div>

        {/* Sub-Tabs / Views for Active Group */}
        <div className="flex gap-2 overflow-x-auto border-b border-white/[0.08] pb-3 text-xs font-medium">
          {['overview', 'voice', 'hooks_cta'].includes(activeTab) && (
            <>
              <button
                onClick={() => setActiveTab('overview')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${
                  activeTab === 'overview'
                    ? 'bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 text-white font-semibold '
                    : 'text-vc-text-secondary hover:bg-vc-ai/[0.04] hover:text-vc-text-primary'
                }`}
              >
                <Brain className="size-3.5" />
                <span>Identity Overview</span>
              </button>
              <button
                onClick={() => setActiveTab('voice')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${
                  activeTab === 'voice'
                    ? 'bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 text-white font-semibold '
                    : 'text-vc-text-secondary hover:bg-vc-ai/[0.04] hover:text-vc-text-primary'
                }`}
              >
                <Mic className="size-3.5" />
                <span>Creator Voice & Tone</span>
              </button>
              <button
                onClick={() => setActiveTab('hooks_cta')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${
                  activeTab === 'hooks_cta'
                    ? 'bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 text-white font-semibold '
                    : 'text-vc-text-secondary hover:bg-vc-ai/[0.04] hover:text-vc-text-primary'
                }`}
              >
                <Sparkles className="size-3.5" />
                <span>Hooks & CTA</span>
              </button>
            </>
          )}

          {['visual', 'captions', 'editing_audio'].includes(activeTab) && (
            <>
              <button
                onClick={() => setActiveTab('visual')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${
                  activeTab === 'visual'
                    ? 'bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 text-white font-semibold '
                    : 'text-vc-text-secondary hover:bg-vc-ai/[0.04] hover:text-vc-text-primary'
                }`}
              >
                <Palette className="size-3.5" />
                <span>Palette & Typography</span>
              </button>
              <button
                onClick={() => setActiveTab('captions')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${
                  activeTab === 'captions'
                    ? 'bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 text-white font-semibold '
                    : 'text-vc-text-secondary hover:bg-vc-ai/[0.04] hover:text-vc-text-primary'
                }`}
              >
                <Subtitles className="size-3.5" />
                <span>Captions DNA</span>
              </button>
              <button
                onClick={() => setActiveTab('editing_audio')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${
                  activeTab === 'editing_audio'
                    ? 'bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 text-white font-semibold '
                    : 'text-vc-text-secondary hover:bg-vc-ai/[0.04] hover:text-vc-text-primary'
                }`}
              >
                <Film className="size-3.5" />
                <span>Editing & Audio Dynamics</span>
              </button>
            </>
          )}

          {['intelligence', 'learned'].includes(activeTab) && (
            <>
              <button
                onClick={() => setActiveTab('intelligence')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${
                  activeTab === 'intelligence'
                    ? 'bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 text-white font-semibold '
                    : 'text-vc-text-secondary hover:bg-vc-ai/[0.04] hover:text-vc-text-primary'
                }`}
              >
                <Target className="size-3.5" />
                <span>Audience & Positioning</span>
              </button>
              <button
                onClick={() => setActiveTab('learned')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${
                  activeTab === 'learned'
                    ? 'bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 text-white font-semibold '
                    : 'text-vc-text-secondary hover:bg-vc-ai/[0.04] hover:text-vc-text-primary'
                }`}
              >
                <CheckCircle2 className="size-3.5" />
                <span>Learned Evidence & Memory</span>
              </button>
            </>
          )}

          {['check', 'versions', 'import'].includes(activeTab) && (
            <>
              <button
                onClick={() => setActiveTab('check')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${
                  activeTab === 'check'
                    ? 'bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 text-white font-semibold '
                    : 'text-vc-text-secondary hover:bg-vc-ai/[0.04] hover:text-vc-text-primary'
                }`}
              >
                <Shield className="size-3.5" />
                <span>Brand Compliance Check</span>
              </button>
              <button
                onClick={() => setActiveTab('versions')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${
                  activeTab === 'versions'
                    ? 'bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 text-white font-semibold '
                    : 'text-vc-text-secondary hover:bg-vc-ai/[0.04] hover:text-vc-text-primary'
                }`}
              >
                <History className="size-3.5" />
                <span>Version History</span>
              </button>
              <button
                onClick={() => setActiveTab('import')}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition ${
                  activeTab === 'import'
                    ? 'bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 text-white font-semibold '
                    : 'text-vc-text-secondary hover:bg-vc-ai/[0.04] hover:text-vc-text-primary'
                }`}
              >
                <Upload className="size-3.5" />
                <span>Import Guidelines</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* TAB CONTENT: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary lg:col-span-2">
            <h2 className="text-lg font-bold text-vc-text-primary">Brand Identity Summary</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-vc-text-secondary">Brand Name</label>
                <p className="text-base font-semibold text-vc-text-primary">{profile.identity.brand_name || 'Not set'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-vc-text-secondary">Industry / Niche</label>
                <p className="text-base font-semibold text-vc-text-primary">{profile.identity.industry || 'General'}</p>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-vc-text-secondary">Target Audience</label>
                <p className="text-sm font-medium text-vc-text-primary">
                  {profile.identity.target_audience || 'Not defined yet. Review proposed intelligence or define in Audience & Positioning.'}
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-vc-text-secondary">Core Value Proposition</label>
                <p className="text-sm font-medium text-vc-text-primary">
                  {profile.identity.core_messaging || 'Not defined yet. Add in Audience & Positioning.'}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-vc-text-secondary">Primary Palette</label>
                <div className="mt-1 flex items-center gap-2">
                  {profile.visual.primary_colors.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-xl bg-white/[0.04] px-2.5 py-1 text-xs font-mono text-vc-text-primary">
                      <span className="size-3.5 rounded-full border border-black/20" style={{ backgroundColor: c }} />
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-vc-text-secondary">Primary Brand Font</label>
                <p className="text-base font-semibold text-vc-text-primary">{profile.visual.fonts[0] || 'Inter'}</p>
              </div>
            </div>

            <div className="mt-6 border-t border-white/[0.08] pt-4">
              <h3 className="text-sm font-semibold text-vc-text-primary">Core Writing Tone</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {profile.voice.tones.map((t, idx) => (
                  <span key={idx} className="rounded-xl bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary">
            <h2 className="text-lg font-bold text-vc-text-primary">Governance & Learning</h2>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <span className="text-xs text-vc-text-secondary">Profile Version</span>
                <span className="rounded-lg bg-white/[0.06] px-2 py-1 text-xs font-bold text-vc-text-primary">v{profile.version}</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <span className="text-xs text-vc-text-secondary">Evidence Records</span>
                <span className="text-xs font-semibold text-vc-text-primary">{profile.learning.evidence_count} events recorded</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <span className="text-xs text-vc-text-secondary">Evidence References</span>
                <span className="text-xs font-semibold text-vc-text-primary">
                  {(profile.evidence_references || []).length} linked citations
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <span className="text-xs text-vc-text-secondary">Locked Brand Rules</span>
                <span className="text-xs font-semibold text-emerald-400">
                  {Object.values(profile.locks || {}).filter(Boolean).length} rules locked
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-vc-text-secondary">Performance Signals</span>
                <span className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                  analyticsStatus === 'SUFFICIENT_DATA'
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                }`}>
                  {analyticsStatus}
                </span>
              </div>
            </div>
          </div>

          {/* Insufficient Evidence Notice */}
          {analyticsStatus === 'INSUFFICIENT_DATA' && (
            <div className="rounded-2xl bg-amber-500/10 p-5 shadow-sm lg:col-span-3 text-amber-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-5 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Evidence Gathering in Progress
                  </h4>
                  <p className="mt-1 text-xs text-amber-200/90 leading-relaxed">
                    {evidenceExplanation ||
                      'At least 3 analyzed clips or performance records are required to derive statistically grounded audience or messaging insights without speculation.'}
                  </p>
                  <p className="mt-2 text-[11px] text-amber-300/80 font-medium">
                    VireoClip Brand Brain never invents audience facts, customer testimonials, or performance metrics. Import or analyze clips to unlock automated intelligence suggestions.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Explainable Proposed Brand Insights */}
          {recommendations.length > 0 && (
            <div className="rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary lg:col-span-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-vc-text-primary">Proposed Brand Intelligence Insights</h3>
                  <p className="text-xs text-vc-text-secondary">
                    Evidence-derived recommendations for voice, audience, and content pillars. Human approval required before applying to brand guidelines.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                  {recommendations.length} Pending Review
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {recommendations.map((r) => (
                  <div key={r.id} className="flex flex-col justify-between rounded-xl bg-vc-canvas p-4 transition ">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-vc-text-primary leading-snug">{r.title}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                              r.source === 'EVIDENCE_LEARNED'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : r.source === 'USER_PROVIDED'
                                ? 'bg-white/[0.08] text-zinc-200 border border-white/20'
                                : 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                            }`}
                          >
                            {r.source || 'AI_DERIVED'}
                          </span>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                              r.confidence === 'HIGH'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : r.confidence === 'MEDIUM'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-white/[0.06] text-vc-text-secondary border border-white/[0.08]'
                            }`}
                          >
                            {r.confidence}
                          </span>
                        </div>
                      </div>

                      <p className="mt-2 text-xs text-vc-text-secondary leading-relaxed">{r.description}</p>

                      {/* Source snippet citation */}
                      {r.source_snippet && (
                        <div className="mt-2 rounded-lg border-l-2 border-emerald-400 bg-white/[0.03] p-2 text-[11px] italic text-vc-text-secondary">
                          {r.source_snippet}
                        </div>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-mono text-vc-text-secondary">Evidence: {r.evidence}</span>
                      </div>

                      {r.evidence_references && r.evidence_references.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {r.evidence_references.map((ref, idx) => (
                            <span key={idx} className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-mono text-vc-text-secondary">
                              {ref}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Human Review Actions */}
                    <div className="mt-4 flex items-center justify-end gap-2 border-t border-white/[0.06] pt-3">
                      <button
                        onClick={() => handleDismissInsight(r)}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-vc-text-secondary hover:bg-white/[0.08] hover:text-vc-text-primary"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => handleApproveInsight(r)}
                        className="flex items-center gap-1.5 rounded-full bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 px-3 py-1 text-xs font-semibold text-white  hover:bg-vc-ai"
                      >
                        <Check className="size-3.5" />
                        Approve Insight
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="rounded-2xl bg-amber-500/10 p-6 shadow-sm lg:col-span-3 text-amber-200">
              <h3 className="text-sm font-bold text-amber-300">Performance Divergence & Conflict Resolution</h3>
              <div className="mt-3 space-y-3">
                {conflicts.map((c, i) => (
                  <div key={i} className="rounded-xl bg-vc-canvas p-4">
                    <p className="text-xs font-medium text-vc-text-primary">{c.message}</p>
                    <p className="mt-2 text-xs font-semibold text-amber-400">{c.action_prompt}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Audience & Positioning */}
      {activeTab === 'intelligence' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <div>
                <h2 className="text-lg font-bold text-vc-text-primary">Target Audience & Needs</h2>
                <p className="text-xs text-vc-text-secondary">
                  Grounded audience definitions used across Hook Lab, Thumbnail Lab, Content Packs, and Autopilot.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-vc-text-primary">Primary Target Audience</label>
                <textarea
                  rows={3}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                  value={profile.identity.target_audience || ''}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      identity: { ...profile.identity, target_audience: e.target.value },
                    })
                  }
                  placeholder="e.g. Early-to-mid career software engineers and tech creators looking for actionable systems..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-vc-text-primary">Audience Needs & Goals (one per line)</label>
                <textarea
                  rows={4}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                  value={(profile.identity.audience_needs || []).join('\n')}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      identity: {
                        ...profile.identity,
                        audience_needs: e.target.value.split('\n').filter(Boolean),
                      },
                    })
                  }
                  placeholder="Need faster video production&#10;Want clear technical explanations&#10;Seeking career growth advice..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-vc-text-primary">Audience Pain Points (one per line)</label>
                <textarea
                  rows={4}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                  value={(profile.identity.audience_pain_points || []).join('\n')}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      identity: {
                        ...profile.identity,
                        audience_pain_points: e.target.value.split('\n').filter(Boolean),
                      },
                    })
                  }
                  placeholder="Struggles with retention drops in first 3s&#10;Overwhelmed by editing software&#10;Inconsistent posting schedule..."
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-vc-text-primary">Target Demographics / Professional Level</label>
                <input
                  type="text"
                  className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                  value={profile.identity.target_demographics || ''}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      identity: { ...profile.identity, target_demographics: e.target.value },
                    })
                  }
                  placeholder="e.g. 24–40, Tech / Knowledge workers, Global English-speaking creators"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <div>
                <h2 className="text-lg font-bold text-vc-text-primary">Core Messaging & Positioning</h2>
                <p className="text-xs text-vc-text-secondary">
                  The central thesis and distinct angle of your brand.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-vc-text-primary">Positioning Statement</label>
                <textarea
                  rows={2}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                  value={profile.identity.positioning_statement || ''}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      identity: { ...profile.identity, positioning_statement: e.target.value },
                    })
                  }
                  placeholder="For [target audience] who [need], our brand provides [unique solution] that [key benefit]..."
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-vc-text-primary">Core Messaging & Value Proposition</label>
                <textarea
                  rows={3}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                  value={profile.identity.core_messaging || ''}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      identity: { ...profile.identity, core_messaging: e.target.value },
                    })
                  }
                  placeholder="Primary value proposition communicated in clips, captions, and thumbnails..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-vc-text-primary">Brand Mission / Vision</label>
                <input
                  type="text"
                  className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                  value={profile.identity.brand_mission || ''}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      identity: { ...profile.identity, brand_mission: e.target.value },
                    })
                  }
                  placeholder="e.g. Empowering 100,000 engineers to communicate clearly on video"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-vc-text-primary">Supporting Value Propositions (one per line)</label>
                <textarea
                  rows={3}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                  value={(profile.identity.value_propositions || []).join('\n')}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      identity: {
                        ...profile.identity,
                        value_propositions: e.target.value.split('\n').filter(Boolean),
                      },
                    })
                  }
                  placeholder="Zero-fluff technical deep dives&#10;Tested production blueprints&#10;Actionable in under 60 seconds..."
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <div>
                <h2 className="text-lg font-bold text-vc-text-primary">Content Pillars & Recurring Themes</h2>
                <p className="text-xs text-vc-text-secondary">
                  The primary content buckets that structure your videos and Content Packs.
                </p>
              </div>
              <button
                onClick={() => {
                  const currentPillars = profile.identity.content_pillars || [];
                  const newPillar: BrandContentPillar = {
                    name: `Pillar ${currentPillars.length + 1}`,
                    description: '',
                    keywords: [],
                  };
                  setProfile({
                    ...profile,
                    identity: {
                      ...profile.identity,
                      content_pillars: [...currentPillars, newPillar],
                    },
                  });
                }}
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-vc-text-primary hover:bg-white/[0.08]"
              >
                + Add Content Pillar
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {(!profile.identity.content_pillars || profile.identity.content_pillars.length === 0) ? (
                <div className="rounded-xl border border-dashed border-white/[0.1] p-8 text-center">
                  <p className="text-xs text-vc-text-secondary">
                    No content pillars set yet. Click &quot;+ Add Content Pillar&quot; or approve evidence recommendations in Overview.
                  </p>
                </div>
              ) : (
                profile.identity.content_pillars.map((pillar, idx) => (
                  <div key={idx} className="rounded-xl p-4 bg-vc-canvas">
                    <div className="flex items-center justify-between gap-4">
                      <input
                        type="text"
                        className="font-bold text-sm bg-transparent border-b border-white/[0.1] pb-1 text-vc-text-primary focus:outline-none focus:border-white/25 flex-1"
                        value={pillar.name}
                        onChange={(e) => {
                          const updated = [...(profile.identity.content_pillars || [])];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          setProfile({ ...profile, identity: { ...profile.identity, content_pillars: updated } });
                        }}
                        placeholder="Pillar Name (e.g. Tactical Tutorials)"
                      />
                      <button
                        onClick={() => {
                          const updated = (profile.identity.content_pillars || []).filter((_, i) => i !== idx);
                          setProfile({ ...profile, identity: { ...profile.identity, content_pillars: updated } });
                        }}
                        className="text-xs font-medium text-rose-400 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      className="mt-3 w-full rounded-xl border border-white/[0.1] bg-vc-surface1 p-2.5 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                      value={pillar.description}
                      onChange={(e) => {
                        const updated = [...(profile.identity.content_pillars || [])];
                        updated[idx] = { ...updated[idx], description: e.target.value };
                        setProfile({ ...profile, identity: { ...profile.identity, content_pillars: updated } });
                      }}
                      placeholder="Describe the focus and audience goal of this content pillar..."
                    />
                    <div className="mt-2">
                      <input
                        type="text"
                        className="w-full rounded-xl border border-white/[0.1] bg-vc-surface1 px-2.5 py-1.5 text-xs font-mono text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                        value={(pillar.keywords || []).join(', ')}
                        onChange={(e) => {
                          const updated = [...(profile.identity.content_pillars || [])];
                          updated[idx] = {
                            ...updated[idx],
                            keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean),
                          };
                          setProfile({ ...profile, identity: { ...profile.identity, content_pillars: updated } });
                        }}
                        placeholder="Comma-separated keywords (e.g. tutorial, engineering, how-to)"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary">
            <h2 className="text-lg font-bold text-vc-text-primary">Platform-Specific Content Guidance</h2>
            <p className="text-xs text-vc-text-secondary">
              Approved tone and duration parameters consumed by Content Pack and Autopilot generators.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { key: 'tiktok', name: 'TikTok', defaultTone: 'casual and fast' },
                { key: 'youtube_shorts', name: 'YouTube Shorts', defaultTone: 'engaging and structured' },
                { key: 'instagram', name: 'Instagram Reels', defaultTone: 'conversational and aesthetic' },
                { key: 'linkedin', name: 'LinkedIn Video', defaultTone: 'professional and insightful' },
              ].map((plat) => {
                const guidance = (profile.platform_guidance || {})[plat.key] || {};
                return (
                  <div key={plat.key} className="rounded-xl p-4 bg-vc-canvas">
                    <h4 className="text-xs font-bold text-vc-text-primary uppercase tracking-wider">{plat.name}</h4>
                    <div className="mt-3 space-y-2">
                      <div>
                        <label className="text-[10px] font-medium text-vc-text-secondary">Platform Tone</label>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-lg border border-white/[0.1] bg-vc-surface1 p-1.5 text-xs text-white focus:border-white/25 focus:outline-none"
                          value={guidance.tone || plat.defaultTone}
                          onChange={(e) => {
                            const updated = {
                              ...(profile.platform_guidance || {}),
                              [plat.key]: { ...guidance, tone: e.target.value },
                            };
                            setProfile({ ...profile, platform_guidance: updated });
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium text-vc-text-secondary">CTA Style</label>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-lg border border-white/[0.1] bg-vc-surface1 p-1.5 text-xs text-white focus:border-white/25 focus:outline-none"
                          value={guidance.cta_style || 'FOLLOW'}
                          onChange={(e) => {
                            const updated = {
                              ...(profile.platform_guidance || {}),
                              [plat.key]: { ...guidance, cta_style: e.target.value },
                            };
                            setProfile({ ...profile, platform_guidance: updated });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() =>
                handleSaveProfile({
                  identity: profile.identity,
                  platform_guidance: profile.platform_guidance,
                })
              }
              disabled={saving}
              className="rounded-full bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 px-6 py-2.5 text-xs font-semibold text-white  hover:bg-vc-ai disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Audience & Positioning Guidelines'}
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Voice */}
      {activeTab === 'voice' && (
        <div className="space-y-6 rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-vc-text-primary">Creator Voice & Terminology</h2>
              <p className="text-xs text-vc-text-secondary">Defines how AI writes hooks, scripts, and captions.</p>
            </div>
            <button
              onClick={() => handleToggleLock('voice.avoid_phrasing')}
              className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-vc-text-primary hover:bg-white/[0.08]"
            >
              {profile.locks['voice.avoid_phrasing'] ? (
                <>
                  <Lock className="size-3.5 text-emerald-400" /> Locked Avoid Phrasing
                </>
              ) : (
                <>
                  <Unlock className="size-3.5 text-vc-text-secondary" /> Unlocked
                </>
              )}
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-vc-text-primary">Voice & Tone Summary</label>
              <textarea
                rows={2}
                className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                value={profile.voice.voice_summary || ''}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    voice: { ...profile.voice, voice_summary: e.target.value },
                  })
                }
                placeholder="High-level description of voice, e.g. Direct, educational, conversational, zero-fluff..."
              />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-vc-text-primary">Preferred Phrasing / Signatures</label>
                <textarea
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                  value={profile.voice.preferred_phrasing.join('\n')}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      voice: { ...profile.voice, preferred_phrasing: e.target.value.split('\n').filter(Boolean) },
                    })
                  }
                  placeholder="Enter one preferred phrase per line..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-vc-text-primary">Prohibited / Avoid Phrasing</label>
                <textarea
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                  value={profile.voice.avoid_phrasing.join('\n')}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      voice: { ...profile.voice, avoid_phrasing: e.target.value.split('\n').filter(Boolean) },
                    })
                  }
                  placeholder="Enter prohibited phrases that VireoClip should never generate..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-vc-text-primary">Forbidden Claims & Guarantees (one per line)</label>
                <textarea
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                  value={(profile.voice.forbidden_claims || []).join('\n')}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      voice: {
                        ...profile.voice,
                        forbidden_claims: e.target.value.split('\n').filter(Boolean),
                      },
                    })
                  }
                  placeholder="Guaranteed 10x ROI&#10;Zero effort required&#10;Instant results..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-vc-text-primary">Styles & Tropes to Avoid (one per line)</label>
                <textarea
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                  value={(profile.voice.styles_to_avoid || []).join('\n')}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      voice: {
                        ...profile.voice,
                        styles_to_avoid: e.target.value.split('\n').filter(Boolean),
                      },
                    })
                  }
                  placeholder="Over-hyped YouTube yelling&#10;Cheesy clickbait tropes&#10;Passive-aggressive tone..."
                />
              </div>
            </div>

            {/* Approved Terminology Management */}
            <div className="pt-2">
              <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
                <div>
                  <h3 className="text-xs font-bold text-vc-text-primary uppercase tracking-wider">Approved Terminology Glossary</h3>
                  <p className="text-[11px] text-vc-text-secondary">Standardized terms and phrasing VireoClip should favor in hooks and scripts.</p>
                </div>
                <button
                  onClick={() => {
                    const currentTerms = profile.voice.approved_terminology || [];
                    const newTerm: BrandApprovedTerm = { term: '', definition: '' };
                    setProfile({
                      ...profile,
                      voice: { ...profile.voice, approved_terminology: [...currentTerms, newTerm] },
                    });
                  }}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs font-medium text-vc-text-primary hover:bg-white/[0.08]"
                >
                  + Add Term
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {(!profile.voice.approved_terminology || profile.voice.approved_terminology.length === 0) ? (
                  <p className="text-xs italic text-vc-text-secondary">No approved terminology registered yet.</p>
                ) : (
                  profile.voice.approved_terminology.map((t, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        className="w-1/3 rounded-xl border border-white/[0.1] bg-vc-canvas p-2 text-xs font-semibold text-white focus:border-white/25 focus:outline-none"
                        placeholder="Approved Term"
                        value={t.term}
                        onChange={(e) => {
                          const updated = [...(profile.voice.approved_terminology || [])];
                          updated[idx] = { ...updated[idx], term: e.target.value };
                          setProfile({ ...profile, voice: { ...profile.voice, approved_terminology: updated } });
                        }}
                      />
                      <input
                        type="text"
                        className="flex-1 rounded-xl border border-white/[0.1] bg-vc-canvas p-2 text-xs text-white focus:border-white/25 focus:outline-none"
                        placeholder="Definition / Preferred context"
                        value={t.definition || ''}
                        onChange={(e) => {
                          const updated = [...(profile.voice.approved_terminology || [])];
                          updated[idx] = { ...updated[idx], definition: e.target.value };
                          setProfile({ ...profile, voice: { ...profile.voice, approved_terminology: updated } });
                        }}
                      />
                      <button
                        onClick={() => {
                          const updated = (profile.voice.approved_terminology || []).filter((_, i) => i !== idx);
                          setProfile({ ...profile, voice: { ...profile.voice, approved_terminology: updated } });
                        }}
                        className="p-1 text-vc-text-secondary hover:text-rose-400"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={() => handleSaveProfile({ voice: profile.voice })}
              disabled={saving}
              className="rounded-full bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 px-5 py-2.5 text-xs font-semibold text-white  hover:bg-vc-ai"
            >
              {saving ? 'Saving...' : 'Save Voice Rules'}
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Hooks & CTA */}
      {activeTab === 'hooks_cta' && (
        <div className="space-y-6 rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-vc-text-primary">Opening Hooks & Call-To-Action (CTA)</h2>
              <p className="text-xs text-vc-text-secondary">
                Proven viral hook formulas, forbidden opening phrases, and approved sign-offs.
              </p>
            </div>
            <button
              onClick={() => handleToggleLock('hooks.banned_patterns')}
              className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-vc-text-primary hover:bg-white/[0.08]"
            >
              {profile.locks?.['hooks.banned_patterns'] ? (
                <>
                  <Lock className="size-3.5 text-emerald-400" /> Locked Hook Tropes
                </>
              ) : (
                <>
                  <Unlock className="size-3.5 text-vc-text-secondary" /> Unlocked
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-vc-text-primary">Preferred Hook Length</label>
              <select
                className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-xs text-white"
                value={profile.hooks?.preferred_hook_length || 'short'}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    hooks: { ...profile.hooks, preferred_hook_length: e.target.value as any },
                  })
                }
              >
                <option value="short">Short (&lt; 3s / punchy line)</option>
                <option value="medium">Medium (3–6s / context + twist)</option>
                <option value="long">Long (Story prelude)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-vc-text-primary">Example Hooks (one per line)</label>
              <textarea
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                value={(profile.hooks?.example_hooks || []).join('\n')}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    hooks: {
                      ...profile.hooks,
                      example_hooks: e.target.value.split('\n').filter(Boolean),
                    },
                  })
                }
                placeholder="Stop doing X if you want Y...&#10;The one framework that changed everything..."
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-vc-text-primary">Banned Hook Patterns (one per line)</label>
              <textarea
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                value={(profile.hooks?.banned_patterns || []).join('\n')}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    hooks: {
                      ...profile.hooks,
                      banned_patterns: e.target.value.split('\n').filter(Boolean),
                    },
                  })
                }
                placeholder="Hey guys, welcome back to my channel...&#10;In this video I will show you..."
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-vc-text-primary">Approved CTA Phrases (one per line)</label>
              <textarea
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                value={(profile.cta?.approved_phrases || []).join('\n')}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    cta: {
                      ...profile.cta,
                      approved_phrases: e.target.value.split('\n').filter(Boolean),
                    },
                  })
                }
                placeholder="Follow for daily engineering breakdowns&#10;Drop a comment with your favorite stack..."
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-vc-text-primary">Blocked CTA Tropes (one per line)</label>
              <textarea
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-xs text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
                value={(profile.cta?.blocked_phrases || []).join('\n')}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    cta: {
                      ...profile.cta,
                      blocked_phrases: e.target.value.split('\n').filter(Boolean),
                    },
                  })
                }
                placeholder="Smash that subscribe button!&#10;Leave a like or else..."
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-white/[0.08]">
            <button
              onClick={() =>
                handleSaveProfile({
                  hooks: profile.hooks,
                  cta: profile.cta,
                })
              }
              disabled={saving}
              className="rounded-full bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-vc-ai"
            >
              {saving ? 'Saving...' : 'Save Hooks & CTA'}
            </button>
          </div>
        </div>
      )}

      {/* GROUP 2: Visual & Media Styling with Live 9:16 Preview */}
      {['visual', 'captions', 'editing_audio'].includes(activeTab) && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Controls Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* TAB CONTENT: Visual */}
            {activeTab === 'visual' && (
              <div className="space-y-6 rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-vc-text-primary">Visual Identity & Colors</h2>
                    <p className="text-xs text-vc-text-secondary">Palettes and allowlisted typography for Pro Editor & renders.</p>
                  </div>
                  <button
                    onClick={() => handleToggleLock('visual.primary_colors')}
                    className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-vc-text-primary hover:bg-white/[0.08]"
                  >
                    {profile.locks?.['visual.primary_colors'] ? (
                      <>
                        <Lock className="size-3.5 text-emerald-400" /> Locked Palette
                      </>
                    ) : (
                      <>
                        <Unlock className="size-3.5 text-vc-text-secondary" /> Unlocked
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-vc-text-primary">Primary Brand Color (Hex)</label>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="color"
                        className="size-10 cursor-pointer rounded-xl border border-white/[0.1] bg-vc-canvas p-1"
                        value={profile.visual.primary_colors[0] || '#3B82F6'}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            visual: { ...profile.visual, primary_colors: [e.target.value] },
                          })
                        }
                      />
                      <input
                        type="text"
                        className="w-32 rounded-xl border border-white/[0.1] bg-vc-canvas px-3 py-2 text-sm font-mono text-white focus:border-white/25 focus:outline-none"
                        value={profile.visual.primary_colors[0] || '#3B82F6'}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            visual: { ...profile.visual, primary_colors: [e.target.value] },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-vc-text-primary">Primary Accent Highlight (Hex)</label>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="color"
                        className="size-10 cursor-pointer rounded-xl border border-white/[0.1] bg-vc-canvas p-1"
                        value={profile.visual.accent_colors[0] || '#10B981'}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            visual: { ...profile.visual, accent_colors: [e.target.value] },
                          })
                        }
                      />
                      <input
                        type="text"
                        className="w-32 rounded-xl border border-white/[0.1] bg-vc-canvas px-3 py-2 text-sm font-mono text-white focus:border-white/25 focus:outline-none"
                        value={profile.visual.accent_colors[0] || '#10B981'}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            visual: { ...profile.visual, accent_colors: [e.target.value] },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-vc-text-primary">Safe Editor Font</label>
                    <select
                      className="mt-2 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-sm text-white focus:border-white/25 focus:outline-none"
                      value={profile.visual.fonts[0] || 'Inter'}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          visual: { ...profile.visual, fonts: [e.target.value] },
                        })
                      }
                    >
                      {SAFE_EDITOR_FONTS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-white/[0.08]">
                  <button
                    onClick={() => handleSaveProfile({ visual: profile.visual })}
                    disabled={saving}
                    className="rounded-full bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-vc-ai"
                  >
                    {saving ? 'Saving...' : 'Save Visual Rules'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB CONTENT: Captions DNA */}
            {activeTab === 'captions' && (
              <div className="space-y-6 rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary">
                <div>
                  <h2 className="text-lg font-bold text-vc-text-primary">Captions DNA & Formatting</h2>
                  <p className="text-xs text-vc-text-secondary">Default subtitle animation preset, case style, line density, and highlight behavior.</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-vc-text-primary">Default Caption Style</label>
                    <select
                      className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-xs text-white"
                      value={profile.captions?.default_style || 'active_word_pop'}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          captions: { ...profile.captions, default_style: e.target.value },
                        })
                      }
                    >
                      <option value="active_word_pop">Active Word Pop (Karaoke)</option>
                      <option value="bold_minimal">Bold Minimal</option>
                      <option value="boxed_highlighter">Boxed Highlighter</option>
                      <option value="cinematic_glow">Cinematic Glow</option>
                      <option value="hormozi_bold">Hormozi Bold</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-vc-text-primary">Typography Case</label>
                    <select
                      className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-xs text-white"
                      value={profile.captions?.case_style || 'uppercase'}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          captions: { ...profile.captions, case_style: e.target.value as any },
                        })
                      }
                    >
                      <option value="uppercase">UPPERCASE (Punchy)</option>
                      <option value="titlecase">Title Case</option>
                      <option value="normal">Normal sentence case</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-vc-text-primary">
                      Max Words Per Line ({profile.captions?.max_words_per_line || 3})
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={6}
                      className="mt-2 w-full accent-violet-500 cursor-pointer"
                      value={profile.captions?.max_words_per_line || 3}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          captions: { ...profile.captions, max_words_per_line: Number(e.target.value) },
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-vc-text-primary">Highlight Style</label>
                    <select
                      className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-xs text-white"
                      value={profile.captions?.highlight_style || 'color_pop'}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          captions: { ...profile.captions, highlight_style: e.target.value },
                        })
                      }
                    >
                      <option value="color_pop">Color Pop (Accent Highlight)</option>
                      <option value="scale_up">Scale Up (Kinetic Pop)</option>
                      <option value="underline">Underline</option>
                      <option value="box">Background Pill</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-white/[0.08]">
                  <button
                    onClick={() => handleSaveProfile({ captions: profile.captions })}
                    disabled={saving}
                    className="rounded-full bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-vc-ai"
                  >
                    {saving ? 'Saving...' : 'Save Captions DNA'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB CONTENT: Editing & Audio Dynamics */}
            {activeTab === 'editing_audio' && (
              <div className="space-y-6 rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary">
                <div>
                  <h2 className="text-lg font-bold text-vc-text-primary">Editing & Audio Dynamics</h2>
                  <p className="text-xs text-vc-text-secondary">Pacing speed, B-Roll frequency, dynamic zoom cuts, and music ducking.</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-vc-text-primary">Pacing Style</label>
                    <select
                      className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-xs text-white"
                      value={profile.editing?.pacing_style || 'fast'}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          editing: { ...profile.editing, pacing_style: e.target.value as any },
                        })
                      }
                    >
                      <option value="fast">Fast & punchy (TikTok / Reels / Shorts)</option>
                      <option value="ultra_fast">Ultra Fast (High Retaining Hook)</option>
                      <option value="balanced">Balanced & natural</option>
                      <option value="slow">Deliberate & educational</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-vc-text-primary">B-Roll Density</label>
                    <select
                      className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-xs text-white"
                      value={profile.editing?.broll_density || 'balanced'}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          editing: { ...profile.editing, broll_density: e.target.value as any },
                        })
                      }
                    >
                      <option value="minimal">Minimal (Speaker only)</option>
                      <option value="balanced">Balanced (Cutaways every 4–6s)</option>
                      <option value="dense">Dense (Continuous Visual Cutaways)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-vc-text-primary">Punch-in Frequency</label>
                    <select
                      className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-xs text-white"
                      value={profile.editing?.punch_in_frequency || 'moderate'}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          editing: { ...profile.editing, punch_in_frequency: e.target.value as any },
                        })
                      }
                    >
                      <option value="none">None (Static Frame)</option>
                      <option value="low">Low (Emphasis key words only)</option>
                      <option value="moderate">Moderate (Standard dynamic reframing)</option>
                      <option value="high">High (High-energy cadence)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-vc-text-primary">Silence Trimming Style</label>
                    <select
                      className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-xs text-white"
                      value={profile.editing?.silence_style || 'tight'}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          editing: { ...profile.editing, silence_style: e.target.value as any },
                        })
                      }
                    >
                      <option value="tight">Tight (Strip breath pauses &gt;250ms)</option>
                      <option value="natural">Natural (Preserve cadence pauses &gt;500ms)</option>
                      <option value="relaxed">Relaxed (Minimal trimming)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-vc-text-primary">Audio Cleanup Preset</label>
                    <select
                      className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-xs text-white"
                      value={profile.audio?.cleanup_preset || 'clean'}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          audio: { ...profile.audio, cleanup_preset: e.target.value as any },
                        })
                      }
                    >
                      <option value="clean">Clean (Balanced noise gate & EQ)</option>
                      <option value="studio">Studio (Broadcast warmth & presence)</option>
                      <option value="podcast">Podcast (Voice-forward clarity)</option>
                      <option value="subtle">Subtle (Gentle filter)</option>
                      <option value="aggressive">Aggressive (Heavy suppression)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-vc-text-primary">Music Ducking Style</label>
                    <select
                      className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-xs text-white"
                      value={profile.audio?.ducking_style || 'broadcast'}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          audio: { ...profile.audio, ducking_style: e.target.value as any },
                        })
                      }
                    >
                      <option value="broadcast">Broadcast (Smooth -18dB duck under voice)</option>
                      <option value="aggressive">Aggressive (-24dB sharp cutoff)</option>
                      <option value="balanced">Balanced (-12dB subtle duck)</option>
                      <option value="subtle">Subtle (-6dB gentle bed)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-white/[0.08]">
                  <button
                    onClick={() =>
                      handleSaveProfile({
                        editing: profile.editing,
                        audio: profile.audio,
                      })
                    }
                    disabled={saving}
                    className="rounded-full bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-vc-ai"
                  >
                    {saving ? 'Saving...' : 'Save Editing & Audio Dynamics'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Live 9:16 Interactive Brand Preview Column */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-2xl bg-vc-surface1 p-6 shadow-md flex flex-col items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider text-vc-text-primary mb-4">
                Live 9:16 Brand Preview
              </h3>
              <BrandVideoPreview916 profile={profile} />
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Learned Intelligence */}
      {activeTab === 'learned' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-vc-text-primary">VireoClip Has Learned</h2>
                <p className="text-xs text-vc-text-secondary">
                  Observed only from your approved video exports and finalized Producer plans.
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                {evidenceList.length} evidence records
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {evidenceList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center text-sm text-vc-text-secondary">
                  No approved projects recorded yet. As you edit and export videos, VireoClip will organically learn your editing and caption style here.
                </div>
              ) : (
                evidenceList.slice(0, 10).map((ev) => (
                  <div key={ev.id} className="flex flex-col justify-between gap-3 rounded-xl bg-white/[0.03] p-4 sm:flex-row sm:items-center">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-white/[0.08] px-2 py-0.5 text-xs font-bold uppercase text-vc-text-primary">
                          {ev.dimension}
                        </span>
                        <span className="text-xs text-vc-text-secondary">Source: {ev.source_type}</span>
                      </div>
                      <div className="mt-2 text-sm text-vc-text-primary">{renderEvidenceValue(ev.value)}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                          ev.confidence === 'HIGH'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : ev.confidence === 'MEDIUM'
                            ? 'bg-white/[0.06] text-zinc-200 border-white/20'
                            : 'bg-white/[0.06] text-vc-text-secondary border-white/[0.08]'
                        }`}
                      >
                        Confidence: {ev.confidence}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Brand Check & Compliance */}
      {activeTab === 'check' && (
        <div className="space-y-6 rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary">
          <div>
            <h2 className="text-lg font-bold text-vc-text-primary">Brand Check & Compliance Test</h2>
            <p className="text-xs text-vc-text-secondary">
              Test copy or video transcripts against brand avoid phrasing, typography, and tone governance.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-vc-text-primary">Content Text / Script to Evaluate</label>
            <textarea
              rows={4}
              className="mt-2 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-sm text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
              value={checkText}
              onChange={(e) => setCheckText(e.target.value)}
              placeholder="Paste video hook, transcript, or caption text here..."
            />
          </div>

          <button
            onClick={handleRunCheck}
            disabled={isChecking || !checkText}
            className="rounded-full bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 px-5 py-2.5 text-xs font-semibold text-white  hover:bg-vc-ai disabled:opacity-50"
          >
            {isChecking ? 'Evaluating...' : 'Run Compliance Check'}
          </button>

          {checkResult && (
            <div className="mt-6 rounded-2xl bg-white/[0.03] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-vc-text-primary">Deterministic Brand Match</h3>
                  <p className="text-xs text-vc-text-secondary">Strict evaluation of brand alignment</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-extrabold text-vireo-green">{checkResult.score}</span>
                  <span className="text-xs text-vc-text-secondary"> / 100</span>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {Object.entries(checkResult.match_breakdown).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between rounded-xl bg-vc-canvas p-3 text-xs">
                    <span className="font-semibold uppercase text-vc-text-secondary">{key}</span>
                    <span className={val.matched ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}>
                      {val.details}
                    </span>
                  </div>
                ))}
              </div>

              {checkResult.warnings.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-white/[0.08] pt-4">
                  <h4 className="text-xs font-bold uppercase text-rose-400">Warnings Detected</h4>
                  {checkResult.warnings.map((w, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-rose-300">
                      <AlertTriangle className="size-4 shrink-0" />
                      <span>[{w.rule}]: {w.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: Version History */}
      {activeTab === 'versions' && (
        <div className="space-y-6 rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary">
          <div>
            <h2 className="text-lg font-bold text-vc-text-primary">Brand Brain Version History</h2>
            <p className="text-xs text-vc-text-secondary">Every setting change is snapshotted and reversible.</p>
          </div>

          <div className="space-y-3">
            {versions.map((ver) => (
              <div key={ver.id} className="flex items-center justify-between rounded-xl bg-white/[0.03] p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-white/[0.08] px-2 py-0.5 text-xs font-bold text-vc-text-primary">
                      v{ver.version}
                    </span>
                    <span className="text-xs font-medium text-vc-text-primary">{ver.change_summary}</span>
                  </div>
                  <p className="mt-1 text-xs text-vc-text-secondary">
                    {new Date(ver.created_at).toLocaleString()} • Source: {ver.source}
                  </p>
                </div>
                <button
                  onClick={() => handleRestoreVersion(ver.version)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-vc-text-primary hover:bg-white/[0.08]"
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: Import Guidelines */}
      {activeTab === 'import' && (
        <div className="space-y-6 rounded-2xl bg-vc-surface1 p-6 shadow-md text-vc-text-primary">
          <div>
            <h2 className="text-lg font-bold text-vc-text-primary">Brand Guidelines Document Import</h2>
            <p className="text-xs text-vc-text-secondary">
              Paste public brand guideline text or style guides. Text is processed strictly as data with prompt injection defense.
            </p>
          </div>

          <textarea
            rows={6}
            className="w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-3 text-sm text-white placeholder:text-vc-text-muted focus:border-white/25 focus:outline-none"
            value={guidelinesText}
            onChange={(e) => setGuidelinesText(e.target.value)}
            placeholder="Paste brand guidelines, tone rules, brand colors (#HEX), or banned phrases..."
          />

          <button
            onClick={handleParseGuidelines}
            disabled={isParsing || !guidelinesText}
            className="rounded-full bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 px-5 py-2.5 text-xs font-semibold text-white  hover:bg-vc-ai disabled:opacity-50"
          >
            {isParsing ? 'Parsing...' : 'Analyze Document'}
          </button>

          {importedDraft && (
            <div className="rounded-xl bg-emerald-950/20 p-6 text-vc-text-primary">
              <h3 className="text-sm font-bold text-emerald-300">Detected Guidelines Draft</h3>
              <p className="text-xs text-emerald-400/80">{importedDraft.review_notice}</p>

              <div className="mt-4 space-y-2 text-xs">
                {importedDraft.detected_brand_name && (
                  <div>
                    <strong className="text-emerald-300">Name:</strong> {importedDraft.detected_brand_name}
                  </div>
                )}
                {importedDraft.detected_colors?.length > 0 && (
                  <div>
                    <strong className="text-emerald-300">Colors:</strong> {importedDraft.detected_colors.join(', ')}
                  </div>
                )}
                {importedDraft.detected_tones?.length > 0 && (
                  <div>
                    <strong className="text-emerald-300">Tones:</strong> {importedDraft.detected_tones.join(', ')}
                  </div>
                )}
                {importedDraft.detected_avoid_phrases?.length > 0 && (
                  <div>
                    <strong className="text-emerald-300">Avoid phrases:</strong> {importedDraft.detected_avoid_phrases.join(', ')}
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleConfirmImport}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.4)] active:bg-emerald-700 active:translate-y-px hover:bg-emerald-500"
                >
                  Confirm & Apply to Brand Brain
                </button>
                <button
                  onClick={() => setImportedDraft(null)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-medium text-vc-text-primary hover:bg-white/[0.08]"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FAST SETUP WIZARD MODAL */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass-scrim p-4">
          <div className="w-full max-w-lg rounded-3xl glass-float p-6 text-vc-text-primary">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-violet-300" />
                <h3 className="text-base font-bold text-vc-text-primary">Fast Brand Setup Wizard</h3>
              </div>
              <button
                onClick={() => setShowWizard(false)}
                className="text-xs font-semibold text-vc-text-secondary hover:text-vc-text-primary"
              >
                Close
              </button>
            </div>

            <div className="py-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-vc-text-primary">Brand Name</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-sm text-white focus:border-white/25 focus:outline-none"
                  value={wizardData.brand_name}
                  onChange={(e) => setWizardData({ ...wizardData, brand_name: e.target.value })}
                  placeholder="e.g. Acme Studio"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-vc-text-primary">What do you create? (Industry / Niche)</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-sm text-white focus:border-white/25 focus:outline-none"
                  value={wizardData.industry}
                  onChange={(e) => setWizardData({ ...wizardData, industry: e.target.value })}
                  placeholder="e.g. AI Engineering, Tech Tutorials, Fitness..."
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-vc-text-primary">Primary Brand Color</label>
                <div className="mt-1 flex items-center gap-3">
                  <input
                    type="color"
                    className="size-10 cursor-pointer rounded-xl border border-white/[0.1] bg-vc-canvas p-1"
                    value={wizardData.primary_color}
                    onChange={(e) => setWizardData({ ...wizardData, primary_color: e.target.value })}
                  />
                  <input
                    type="text"
                    className="w-32 rounded-xl border border-white/[0.1] bg-vc-canvas px-3 py-2 text-sm font-mono text-white focus:border-white/25 focus:outline-none"
                    value={wizardData.primary_color}
                    onChange={(e) => setWizardData({ ...wizardData, primary_color: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-vc-text-primary">Pacing Preference</label>
                <select
                  className="mt-1 w-full rounded-xl border border-white/[0.1] bg-vc-canvas p-2.5 text-sm text-white focus:border-white/25 focus:outline-none"
                  value={wizardData.pacing_style}
                  onChange={(e) => setWizardData({ ...wizardData, pacing_style: e.target.value as any })}
                >
                  <option value="fast">Fast & punchy (TikTok / Shorts)</option>
                  <option value="balanced">Balanced & natural</option>
                  <option value="slow">Deliberate & educational</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-white/[0.08] pt-4">
              <button
                onClick={() => setShowWizard(false)}
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-medium text-vc-text-primary hover:bg-white/[0.08]"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteWizard}
                disabled={saving}
                className="rounded-full bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] active:bg-violet-700 px-5 py-2 text-xs font-semibold text-white  hover:bg-vc-ai"
              >
                {saving ? 'Completing...' : 'Finish Setup'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERWRITE CONFIRMATION MODAL */}
      {overwriteModal.isOpen && overwriteModal.recommendation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center glass-scrim p-4">
          <div className="w-full max-w-md rounded-3xl glass-float !border-amber-500/30 p-6 text-vc-text-primary">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="size-5 shrink-0 text-amber-400" />
              <h3 className="text-base font-bold text-vc-text-primary">Confirm Overwriting Brand Guideline</h3>
            </div>
            <p className="mt-3 text-xs text-vc-text-secondary leading-relaxed">
              {overwriteModal.message ||
                'This approved recommendation will replace your currently approved brand guideline. This change will be snapshotted in version history.'}
            </p>

            <div className="mt-4 rounded-xl bg-amber-950/20 p-3 text-xs">
              <div className="font-semibold text-amber-300">{overwriteModal.recommendation.title}</div>
              <p className="mt-1 text-vc-text-secondary text-[11px]">{overwriteModal.recommendation.description}</p>
            </div>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                onClick={() => setOverwriteModal({ isOpen: false, recommendation: null, message: '' })}
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-xs font-medium text-vc-text-primary hover:bg-white/[0.08]"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleApproveInsight(
                    overwriteModal.recommendation!,
                    true,
                    overwriteModal.editedValue
                  )
                }
                className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-500"
              >
                Confirm & Overwrite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
