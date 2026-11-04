import React, { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical,
  Play,
  Pause,
  Plus,
  Trophy,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  BarChart3,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Image as ImageIcon,
  Type,
  Mic,
  Download,
  Upload,
} from 'lucide-react';
import {
  ABExperiment,
  ABTestType,
  ABTargetMetric,
  CreateABExperimentDTO,
  RecordABObservationDTO,
} from '../../types';
import { abStudioService } from '../../services/abStudioService';
import { ABExperimentHistory } from './ABExperimentHistory';
import { ABCsvImportModal } from './ABCsvImportModal';

export interface ABStudioWorkspaceProps {
  clipId: string;
  projectId: string;
  clipTitle: string;
  clipDurationSeconds?: number;
}

export const ABStudioWorkspace: React.FC<ABStudioWorkspaceProps> = ({
  clipId,
  projectId,
  clipTitle,
}) => {
  const [experiments, setExperiments] = useState<ABExperiment[]>([]);
  const [selectedExperiment, setSelectedExperiment] = useState<ABExperiment | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'WORKSPACE' | 'HISTORY'>('WORKSPACE');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isObservationModalOpen, setIsObservationModalOpen] = useState<boolean>(false);
  const [isCsvImportModalOpen, setIsCsvImportModalOpen] = useState<boolean>(false);
  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState<boolean>(false);
  const [confirmPromotionCheck, setConfirmPromotionCheck] = useState<boolean>(false);

  // Observation Form State
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [observationExposures, setObservationExposures] = useState<number>(1000);
  const [observationConversions, setObservationConversions] = useState<number>(65);
  const [observationProvenance, setObservationProvenance] = useState<
    'MANUAL_ENTRY' | 'CSV_IMPORT' | 'PLATFORM_ANALYTICS_SYNC'
  >('MANUAL_ENTRY');
  const [observationSourceLabel, setObservationSourceLabel] = useState<string>('');

  // Create Form State
  const [newExpName, setNewExpName] = useState<string>('');
  const [newExpHypothesis, setNewExpHypothesis] = useState<string>('');
  const [newExpTestType, setNewExpTestType] = useState<ABTestType>('THUMBNAIL_ONLY');
  const [newExpTargetMetric, setNewExpTargetMetric] = useState<ABTargetMetric>('CTR');
  const [newVarBTitle, setNewVarBTitle] = useState<string>('');
  const [hookVariants, setHookVariants] = useState<Array<{
    hook_type: string;
    hook_text: string;
    predicted_retention_lift: string;
    suggested_caption_burst: string[];
  }>>([]);
  const [isGeneratingHooks, setIsGeneratingHooks] = useState<boolean>(false);

  const loadExperiments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const list = await abStudioService.getExperimentsForClip(clipId);
      setExperiments(list);
      if (list.length > 0) {
        // Fetch detailed evaluation for first experiment
        const detailed = await abStudioService.getExperiment(list[0].id);
        setSelectedExperiment(detailed);
      } else {
        setSelectedExperiment(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load A/B experiments.');
    } finally {
      setIsLoading(false);
    }
  }, [clipId]);

  useEffect(() => {
    loadExperiments();
  }, [loadExperiments]);

  const handleSelectExperiment = async (expId: string) => {
    try {
      setIsLoading(true);
      const detailed = await abStudioService.getExperiment(expId);
      setSelectedExperiment(detailed);
    } catch (err: any) {
      setError(err.message || 'Failed to select experiment.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartExperiment = async () => {
    if (!selectedExperiment) return;
    try {
      setIsSubmitting(true);
      setError(null);
      const updated = await abStudioService.startExperiment(selectedExperiment.id);
      setSelectedExperiment(updated);
      setSuccessMessage('Experiment started! You can now log performance observations.');
      await loadExperiments();
    } catch (err: any) {
      setError(err.message || 'Failed to start experiment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePauseExperiment = async () => {
    if (!selectedExperiment) return;
    try {
      setIsSubmitting(true);
      setError(null);
      const updated = await abStudioService.pauseExperiment(selectedExperiment.id);
      setSelectedExperiment(updated);
      setSuccessMessage('Experiment paused.');
      await loadExperiments();
    } catch (err: any) {
      setError(err.message || 'Failed to pause experiment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExperiment || !selectedVariantId) return;

    if (observationConversions > observationExposures) {
      setError('Conversions cannot exceed exposures.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const dto: RecordABObservationDTO = {
        variant_id: selectedVariantId,
        exposures: Number(observationExposures),
        conversions: Number(observationConversions),
        data_provenance: observationProvenance,
        source_label: observationSourceLabel || undefined,
      };

      const updated = await abStudioService.recordObservation(selectedExperiment.id, dto);
      setSelectedExperiment(updated);
      setIsObservationModalOpen(false);
      setSuccessMessage('Observations logged and statistical metrics recalculated.');
      await loadExperiments();
    } catch (err: any) {
      setError(err.message || 'Failed to record observations.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeclareWinner = async (variantId: string) => {
    if (!selectedExperiment) return;
    try {
      setIsSubmitting(true);
      setError(null);
      const updated = await abStudioService.declareWinner(selectedExperiment.id, {
        variant_id: variantId,
      });
      setSelectedExperiment(updated);
      setSuccessMessage('Winning variant formally declared! You can now review and promote.');
      await loadExperiments();
    } catch (err: any) {
      setError(err.message || 'Failed to declare winner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromoteWinner = async () => {
    if (!selectedExperiment || !confirmPromotionCheck) return;
    try {
      setIsSubmitting(true);
      setError(null);
      const res = await abStudioService.promoteWinner(selectedExperiment.id, {
        confirm_promotion: true,
      });
      setSelectedExperiment(res.experiment);
      setIsPromoteModalOpen(false);
      setSuccessMessage(
        `Promoted successfully to: ${res.promotedTo.join(', ')}. Brand Brain updated.`
      );
      await loadExperiments();
    } catch (err: any) {
      setError(err.message || 'Failed to promote winner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateHookVariants = async () => {
    try {
      setIsGeneratingHooks(true);
      setError(null);
      const variants = await abStudioService.generateHookVariants(clipTitle || 'Engaging viral video clip');
      setHookVariants(variants);
    } catch (err: any) {
      setError(err.message || 'Failed to generate viral hook variants.');
    } finally {
      setIsGeneratingHooks(false);
    }
  };

  const handleCreateExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError(null);

      const dto: CreateABExperimentDTO = {
        clip_id: clipId,
        project_id: projectId,
        name: newExpName || `${clipTitle} — A/B Test`,
        hypothesis:
          newExpHypothesis ||
          'Challenger variant will achieve higher performance in short-form feed.',
        test_type: newExpTestType,
        target_metric: newExpTargetMetric,
        variants: [
          {
            variant_letter: 'A',
            is_control: true,
            name: 'Variant A (Control)',
            title: (newExpTestType === 'TITLE_ONLY' || newExpTestType === 'HOOK_LINE') ? clipTitle : undefined,
            traffic_weight: 50,
          },
          {
            variant_letter: 'B',
            is_control: false,
            name: 'Variant B (Challenger)',
            title: (newExpTestType === 'TITLE_ONLY' || newExpTestType === 'HOOK_LINE') ? newVarBTitle || `New: ${clipTitle}` : undefined,
            traffic_weight: 50,
          },
        ],
      };

      const created = await abStudioService.createExperiment(dto);
      setIsCreateModalOpen(false);
      setNewExpName('');
      setNewExpHypothesis('');
      setNewVarBTitle('');
      setSuccessMessage('New A/B experiment draft created.');
      await loadExperiments();
      setSelectedExperiment(created);
    } catch (err: any) {
      setError(err.message || 'Failed to create experiment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportCsv = async (expId: string, expName: string) => {
    try {
      setIsExporting(true);
      setError(null);
      await abStudioService.downloadExperimentCsv(expId);
      setSuccessMessage(`CSV Report for "${expName}" downloaded successfully.`);
    } catch (err: any) {
      setError(err.message || 'Failed to export CSV report.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-neutral-100 overflow-y-auto overflow-x-hidden min-w-0 w-full">
      {/* Top Banner & Header */}
      <div className="border-b border-neutral-800 bg-neutral-900/60 p-4 sticky top-0 z-10 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-white">A/B Testing Studio</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-neutral-300 ">
                  Studio Experiment Engine
                </span>
                {selectedExperiment && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      selectedExperiment.status === 'ACTIVE'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : selectedExperiment.status === 'CONCLUDED'
                        ? 'bg-white/[0.04] text-zinc-300 border border-white/20'
                        : selectedExperiment.status === 'PAUSED'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                    }`}
                  >
                    {selectedExperiment.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400">
                Statistically rigorous split-testing for Thumbnails, Titles, and Opening Hooks.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-neutral-950 rounded-lg p-0.5">
              <button
                onClick={() => setActiveWorkspaceTab('WORKSPACE')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                  activeWorkspaceTab === 'WORKSPACE'
                    ? 'bg-neutral-800 text-white font-semibold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Workspace
              </button>
              <button
                onClick={() => setActiveWorkspaceTab('HISTORY')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                  activeWorkspaceTab === 'HISTORY'
                    ? 'bg-neutral-800 text-white font-semibold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                History & Reports
              </button>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-vc-ai-hover hover:bg-vc-ai active:bg-violet-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4)] text-white rounded-full transition shadow-md shadow-violet-950/40"
            >
              <Plus className="w-3.5 h-3.5" />
              New Experiment
            </button>
            <button
              onClick={loadExperiments}
              className="p-1.5 text-neutral-400 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] rounded-lg transition border border-white/[0.08]"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Experiment Selector Bar */}
        {experiments.length > 1 && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.08] overflow-x-auto">
            <span className="text-xs text-neutral-400 shrink-0">Experiments:</span>
            {experiments.map((exp) => (
              <button
                key={exp.id}
                onClick={() => handleSelectExperiment(exp.id)}
                className={`text-xs px-2.5 py-1 rounded-md transition shrink-0 ${
                  selectedExperiment?.id === exp.id
                    ? 'bg-violet-600/20 text-violet-300 border border-violet-500/50'
                    : 'bg-white/[0.04] text-neutral-400 hover:text-white border border-white/[0.06]'
                }`}
              >
                {exp.name} ({exp.status})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notifications */}
      {error && (
        <div className="m-4 p-3 bg-red-950/40 text-red-300 text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white">
            ✕
          </button>
        </div>
      )}
      {successMessage && (
        <div className="m-4 p-3 bg-emerald-950/40 text-emerald-300 text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Main Content */}
      {activeWorkspaceTab === 'HISTORY' ? (
        <div className="p-4 flex-1">
          <ABExperimentHistory
            clipId={clipId}
            onSelectExperiment={(expId) => {
              handleSelectExperiment(expId);
              setActiveWorkspaceTab('WORKSPACE');
            }}
          />
        </div>
      ) : isLoading ? (
        <div className="flex-1 flex items-center justify-center p-8 text-neutral-400 text-xs">
          <RefreshCw className="w-5 h-5 animate-spin mr-2 text-violet-400" />
          Loading experiments...
        </div>
      ) : !selectedExperiment ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
          <div className="p-3 bg-vc-surface1 rounded-2xl mb-3 text-violet-400">
            <FlaskConical className="w-8 h-8" />
          </div>
          <h2 className="text-sm font-semibold text-white mb-1">No Experiments for this Clip</h2>
          <p className="text-xs text-neutral-400 mb-4">
            Create an A/B test to scientifically compare 2 to 4 thumbnail covers, video titles, or opening spoken hooks.
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-vc-ai-hover hover:bg-vc-ai active:bg-violet-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4)] text-white rounded-full text-xs font-medium transition shadow-lg shadow-violet-950/50"
          >
            <Plus className="w-4 h-4" />
            Create Your First Experiment
          </button>
        </div>
      ) : (
        <div className="p-4 space-y-5 flex-1 min-w-0">
          {/* Experiment Meta & Decision Bar */}
          <div className="bg-vc-surface1 rounded-2xl p-4 space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <h2 className="text-sm font-semibold text-white truncate max-w-[220px]" title={selectedExperiment.name}>
                    {selectedExperiment.name}
                  </h2>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-white/[0.06] text-neutral-300 flex items-center gap-1 shrink-0">
                    {selectedExperiment.test_type === 'THUMBNAIL_ONLY' && <ImageIcon className="w-3 h-3 text-violet-400" />}
                    {selectedExperiment.test_type === 'TITLE_ONLY' && <Type className="w-3 h-3 text-zinc-300" />}
                    {selectedExperiment.test_type === 'HOOK_LINE' && <Mic className="w-3 h-3 text-emerald-400" />}
                    {selectedExperiment.test_type}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-white/[0.06] text-neutral-300 shrink-0">
                    Metric: {selectedExperiment.target_metric}
                  </span>
                </div>
                <p className="text-xs text-neutral-300 mt-1 italic break-words">
                  &ldquo;{selectedExperiment.hypothesis}&rdquo;
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {selectedExperiment.status === 'DRAFT' && (
                  <button
                    onClick={handleStartExperiment}
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-full transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Start Experiment
                  </button>
                )}
                {selectedExperiment.status === 'ACTIVE' && (
                  <>
                    <button
                      onClick={() => setIsObservationModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-vc-ai-hover hover:bg-vc-ai active:bg-violet-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4)] text-white text-xs font-medium rounded-full transition shadow-md shadow-violet-950/40"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Log Observations
                    </button>
                    <button
                      onClick={() => setIsCsvImportModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-violet-300 text-xs font-medium rounded-lg border border-white/[0.08] transition"
                      title="Import performance analytics from CSV"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Import CSV
                    </button>
                    <button
                      onClick={handlePauseExperiment}
                      disabled={isSubmitting}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 text-xs font-medium rounded-lg border border-white/[0.08] transition"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      Pause
                    </button>
                  </>
                )}
                {selectedExperiment.status === 'PAUSED' && (
                  <button
                    onClick={handleStartExperiment}
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-full transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Resume
                  </button>
                )}
                {selectedExperiment.status === 'CONCLUDED' && !selectedExperiment.promoted_to_clip && (
                  <button
                    onClick={() => {
                      setConfirmPromotionCheck(false);
                      setIsPromoteModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-vc-ai-hover hover:bg-vc-ai active:bg-violet-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4)] text-white text-xs font-medium rounded-full transition shadow-lg shadow-violet-950/40"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Promote Winner to Clip
                  </button>
                )}
                {selectedExperiment.promoted_to_clip && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium px-2 py-1 bg-emerald-950/40 rounded-lg">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Promoted to Clip & Brand Brain
                  </span>
                )}
                <button
                  onClick={() => handleExportCsv(selectedExperiment.id, selectedExperiment.name)}
                  disabled={isExporting}
                  title="Download RFC-4180 CSV report"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 text-xs font-medium rounded-lg border border-white/[0.08] transition"
                >
                  <Download className={`w-3.5 h-3.5 ${isExporting ? 'animate-bounce text-violet-400' : ''}`} />
                  <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
                </button>
              </div>
            </div>

            {/* Statistical Decision Rationale Banner */}
            <div className="p-3 bg-vc-canvas rounded-xl text-xs flex items-start gap-2.5 min-w-0">
              <BarChart3 className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-neutral-200">Decision Engine: </span>
                <span className="text-neutral-400 break-words">
                  {selectedExperiment.winner_declaration_rationale}
                </span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-neutral-500">
                  <span>
                    Min Sample Size:{' '}
                    <strong className="text-neutral-300">
                      {selectedExperiment.minimum_sample_size.toLocaleString()}
                    </strong>{' '}
                    exposures/variant
                  </span>
                  <span>•</span>
                  <span>
                    Bonferroni Adjusted &alpha;:{' '}
                    <strong className="text-neutral-300">
                      {(
                        (1 - selectedExperiment.confidence_threshold) /
                        Math.max(1, selectedExperiment.variants.length - 1)
                      ).toFixed(4)}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Min Practical Lift:{' '}
                    <strong className="text-neutral-300">
                      +{(selectedExperiment.minimum_practical_lift * 100).toFixed(1)}%
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Variants Comparison Cards Grid */}
          <div
            className="grid gap-4 min-w-0"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
            }}
          >
            {selectedExperiment.variants.map((v) => {
              const isWinner = selectedExperiment.winning_variant_id === v.id;
              const obs = v.observations;
              const stats = v.statistical_metrics;
              const ratePercent = (obs.rate * 100).toFixed(2);
              const liftPercent = stats ? (stats.relative_lift * 100).toFixed(1) : '0.0';

              return (
                <div
                  key={v.id}
                  className={`bg-vc-surface1 border rounded-2xl p-4 flex flex-col justify-between transition min-w-0 overflow-hidden ${
                    isWinner
                      ? 'border-amber-500/80 bg-amber-950/20 shadow-xl shadow-amber-950/30'
                      : v.is_control
                      ? 'border-white/[0.14]'
                      : 'border-white/[0.08] hover:border-white/[0.16]'
                  }`}
                >
                  <div className="space-y-3 min-w-0">
                    {/* Top Winner Ribbon */}
                    {isWinner && (
                      <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-300">
                        <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Declared Winner</span>
                      </div>
                    )}

                    {/* Variant Top Bar */}
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-full bg-white/[0.08] text-white font-bold text-xs flex items-center justify-center border border-white/[0.12] shrink-0">
                          {v.variant_letter}
                        </span>
                        <span className="text-xs font-semibold text-white truncate max-w-[120px]" title={v.name}>
                          {v.name}
                        </span>
                      </div>
                      <span
                        title={v.performance_status.replace(/_/g, ' ')}
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                          v.is_control
                            ? 'bg-white/[0.08] text-neutral-300 border border-white/[0.12]'
                            : v.performance_status === 'STATISTICALLY_SIGNIFICANT_WINNER' || isWinner
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                            : v.performance_status === 'LEADER'
                            ? 'bg-white/[0.06] text-zinc-200 border border-white/20'
                            : v.performance_status === 'UNDERPERFORMING'
                            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            : 'bg-white/[0.06] text-neutral-400 border border-white/[0.08]'
                        }`}
                      >
                        {v.is_control ? (
                          'CONTROL'
                        ) : v.performance_status === 'STATISTICALLY_SIGNIFICANT_WINNER' || isWinner ? (
                          <>
                            <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>WINNER</span>
                          </>
                        ) : v.performance_status === 'LEADER' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-zinc-300 shrink-0" />
                            <span>LEADER</span>
                          </>
                        ) : v.performance_status === 'UNDERPERFORMING' ? (
                          <>
                            <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                            <span>UNDERPERFORMING</span>
                          </>
                        ) : (
                          v.performance_status.replace(/_/g, ' ')
                        )}
                      </span>
                    </div>

                    {/* Variant Asset Preview */}
                    <div className="p-3 bg-neutral-950 rounded-xl min-h-[70px] flex flex-col justify-center min-w-0 overflow-hidden">
                      {selectedExperiment.test_type === 'THUMBNAIL_ONLY' && (
                        <div className="flex items-center gap-2.5 min-w-0">
                          {v.thumbnail_image_url ? (
                            <img
                              src={v.thumbnail_image_url}
                              alt={v.name}
                              className="w-16 h-10 object-cover rounded border border-neutral-800 shrink-0"
                            />
                          ) : (
                            <div className="w-16 h-10 bg-neutral-900 rounded border border-neutral-800 flex items-center justify-center text-zinc-300 shrink-0">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                          )}
                          <div className="text-[11px] text-neutral-300 truncate min-w-0" title={v.name}>
                            {v.name}
                          </div>
                        </div>
                      )}

                      {selectedExperiment.test_type === 'TITLE_ONLY' && (
                        <div className="text-xs font-medium text-white line-clamp-2 break-words" title={v.title || clipTitle}>
                          &ldquo;{v.title || clipTitle}&rdquo;
                        </div>
                      )}

                      {selectedExperiment.test_type === 'HOOK_LINE' && (
                        <div className="text-xs text-neutral-300 italic line-clamp-2 break-words" title={v.hook_text || 'Opening line test'}>
                          &ldquo;{v.hook_text || 'Opening line test'}&rdquo;
                        </div>
                      )}
                    </div>

                    {/* Heuristic Benchmark Badge */}
                    {v.preflight_heuristic_score !== null && v.preflight_heuristic_score !== undefined && (
                      <div className="text-[10px] text-neutral-500 flex items-center gap-1 min-w-0">
                        <Sparkles className="w-3 h-3 text-violet-400 shrink-0" />
                        <span className="truncate">Heuristic Score: {v.preflight_heuristic_score}/100</span>
                      </div>
                    )}

                    {/* Observed Performance Stats */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800/60 min-w-0">
                      <div className="min-w-0">
                        <div className="text-[10px] text-neutral-400 truncate">Exposures</div>
                        <div className="text-sm font-semibold text-white truncate">
                          {(obs.impressions || obs.views || 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] text-neutral-400 truncate">
                          {selectedExperiment.target_metric === 'CTR' ? 'Clicks' : 'Conversions'}
                        </div>
                        <div className="text-sm font-semibold text-white truncate">
                          {obs.conversions.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Conversion Rate & Lift */}
                    <div className="p-2.5 bg-neutral-950/80 rounded-xl space-y-1.5 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] text-neutral-400 truncate">{selectedExperiment.target_metric}</span>
                        <span className="text-sm font-bold text-white shrink-0">{ratePercent}%</span>
                      </div>

                      {!v.is_control && stats && (
                        <div className="flex items-center justify-between text-[11px] gap-1">
                          <span className="text-neutral-400 truncate">Relative Lift:</span>
                          <span
                            className={`font-semibold flex items-center gap-0.5 shrink-0 ${
                              stats.relative_lift > 0
                                ? 'text-emerald-400'
                                : stats.relative_lift < 0
                                ? 'text-red-400'
                                : 'text-neutral-400'
                            }`}
                          >
                            <TrendingUp className="w-3 h-3" />
                            {stats.relative_lift > 0 ? `+${liftPercent}%` : `${liftPercent}%`}
                          </span>
                        </div>
                      )}

                      {/* Wilson 95% Confidence Interval */}
                      {stats && (
                        <div className="text-[10px] text-neutral-500 pt-1 border-t border-neutral-900 flex flex-wrap items-center justify-between gap-1">
                          <span className="shrink-0">95% Wilson CI:</span>
                          <span className="font-mono text-neutral-400 shrink-0">
                            [{(stats.confidence_interval_95[0] * 100).toFixed(2)}% –{' '}
                            {(stats.confidence_interval_95[1] * 100).toFixed(2)}%]
                          </span>
                        </div>
                      )}

                      {!v.is_control && stats && stats.p_value < 1 && (
                        <div className="text-[10px] text-neutral-500 flex items-center justify-between gap-1">
                          <span className="shrink-0">p-value:</span>
                          <span className={`shrink-0 ${stats.is_statistically_significant ? 'text-emerald-400 font-semibold' : ''}`}>
                            {stats.p_value.toFixed(4)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Winner Action */}
                  <div className="pt-3 mt-3 border-t border-neutral-800/80">
                    {isWinner ? (
                      <div className="flex items-center justify-center gap-1.5 text-xs text-amber-400 font-bold py-1.5 bg-amber-500/10 rounded-lg ">
                        <Trophy className="w-3.5 h-3.5" />
                        Declared Winner
                      </div>
                    ) : selectedExperiment.status === 'ACTIVE' && !v.is_control ? (
                      <button
                        onClick={() => handleDeclareWinner(v.id)}
                        disabled={isSubmitting}
                        className="w-full text-xs font-medium py-1.5 px-2 bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 rounded-lg transition border border-white/[0.08] flex items-center justify-center gap-1"
                      >
                        <Trophy className="w-3 h-3 text-amber-400" />
                        Declare as Winner
                      </button>
                    ) : (
                      <div className="text-[10px] text-neutral-500 text-center py-1">
                        {v.is_control ? 'Baseline Control' : 'Waiting for decision'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Observation Ingestion Modal */}
      {isObservationModalOpen && selectedExperiment && (
        <div className="fixed inset-0 z-50 glass-scrim flex items-center justify-center p-4">
          <div className="glass-float rounded-3xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-violet-400" />
                Log Observed Performance Batch
              </h3>
              <button
                onClick={() => setIsObservationModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordObservation} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-neutral-300 block mb-1">Select Variant</label>
                <select
                  value={selectedVariantId}
                  onChange={(e) => setSelectedVariantId(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-vc-canvas border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="">Select variant...</option>
                  {selectedExperiment.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.variant_letter}: {v.name} ({v.is_control ? 'Control' : 'Challenger'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1">
                    Exposures (Impressions/Views)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={observationExposures}
                    onChange={(e) => setObservationExposures(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 bg-vc-canvas border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1">
                    Conversions (Clicks/Completions)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={observationExposures}
                    value={observationConversions}
                    onChange={(e) => setObservationConversions(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 bg-vc-canvas border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-300 block mb-1">Data Provenance</label>
                <select
                  value={observationProvenance}
                  onChange={(e) => setObservationProvenance(e.target.value as any)}
                  className="w-full px-3 py-2 bg-vc-canvas border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-violet-500"
                >
                  <option value="MANUAL_ENTRY">Manual Entry from Creator Studio</option>
                  <option value="CSV_IMPORT">CSV / Spreadsheet Import</option>
                  <option value="PLATFORM_ANALYTICS_SYNC">External Platform Analytics</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-300 block mb-1">
                  Source Reference / Campaign Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. YouTube Studio batch Oct 1-3"
                  value={observationSourceLabel}
                  onChange={(e) => setObservationSourceLabel(e.target.value)}
                  className="w-full px-3 py-2 bg-vc-canvas border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setIsObservationModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-medium bg-vc-ai-hover hover:bg-vc-ai active:bg-violet-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4)] text-white rounded-full transition shadow-md shadow-violet-950/40"
                >
                  Save Observations
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Experiment Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 glass-scrim flex items-center justify-center p-4">
          <div className="glass-float rounded-3xl w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-violet-400" />
                Configure New A/B Experiment
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-neutral-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateExperiment} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-neutral-300 block mb-1">Experiment Name</label>
                <input
                  type="text"
                  placeholder={`e.g. ${clipTitle} Thumbnail Split Test`}
                  value={newExpName}
                  onChange={(e) => setNewExpName(e.target.value)}
                  className="w-full px-3 py-2 bg-vc-canvas border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-300 block mb-1">Hypothesis</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Bold contrast thumbnail with face focal point will lift CTR by >= 20% on YouTube."
                  value={newExpHypothesis}
                  onChange={(e) => setNewExpHypothesis(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-vc-canvas border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-violet-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1">
                    Experimental Dimension (Single)
                  </label>
                  <select
                    value={newExpTestType}
                    onChange={(e) => setNewExpTestType(e.target.value as ABTestType)}
                    className="w-full px-3 py-2 bg-vc-canvas border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="THUMBNAIL_ONLY">Thumbnail Only (Visuals / Layout)</option>
                    <option value="TITLE_ONLY">Title Only (Headlines / Hooks)</option>
                    <option value="HOOK_LINE">Opening Hook Spoken Line</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1">Target Metric</label>
                  <select
                    value={newExpTargetMetric}
                    onChange={(e) => setNewExpTargetMetric(e.target.value as ABTargetMetric)}
                    className="w-full px-3 py-2 bg-vc-canvas border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="CTR">Click-Through Rate (CTR)</option>
                    <option value="RETENTION_RATE">Completion / Retention Rate</option>
                    <option value="ENGAGEMENT_RATE">Engagement Rate</option>
                  </select>
                </div>
              </div>

              {newExpTestType === 'TITLE_ONLY' && (
                <div>
                  <label className="text-xs font-medium text-neutral-300 block mb-1">
                    Challenger Title (Variant B)
                  </label>
                  <input
                    type="text"
                    placeholder="Alternative headline..."
                    value={newVarBTitle}
                    onChange={(e) => setNewVarBTitle(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-vc-canvas border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
              )}

              {newExpTestType === 'HOOK_LINE' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-neutral-300">
                      Challenger Hook Line (Variant B)
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateHookVariants}
                      disabled={isGeneratingHooks}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 rounded-lg transition disabled:opacity-50"
                    >
                      <Sparkles className="w-3 h-3 text-violet-400" />
                      {isGeneratingHooks ? 'Generating...' : 'Generate 5 Viral Hooks (Vireo SVML)'}
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Stop making this critical mistake in 2026..."
                    value={newVarBTitle}
                    onChange={(e) => setNewVarBTitle(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-vc-canvas border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none focus:border-violet-500"
                  />
                  {hookVariants.length > 0 && (
                    <div className="space-y-2 pt-1 max-h-48 overflow-y-auto pr-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 block">
                        Select a Viral Hook Formula
                      </span>
                      {hookVariants.map((v, i) => (
                        <div
                          key={i}
                          onClick={() => {
                            setNewVarBTitle(v.hook_text);
                            setNewExpHypothesis(`Testing ${v.hook_type.replace('_', ' ')} hook ("${v.hook_text}") will lift viewer retention by ${v.predicted_retention_lift}.`);
                          }}
                          className={`p-2.5 rounded-lg border cursor-pointer transition text-left ${
                            newVarBTitle === v.hook_text
                              ? 'bg-violet-950/40 border-violet-500/50 text-white'
                              : 'bg-white/[0.02] border-white/[0.06] hover:border-violet-500/30 text-neutral-300'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-semibold capitalize text-violet-300">
                              {v.hook_type.replace('_', ' ')}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 ">
                              {v.predicted_retention_lift}
                            </span>
                          </div>
                          <p className="text-xs text-neutral-200 line-clamp-2">{v.hook_text}</p>
                          {v.suggested_caption_burst && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {v.suggested_caption_burst.map((word, wIdx) => (
                                <span
                                  key={wIdx}
                                  className="text-[9px] px-1 py-0.2 rounded bg-white/[0.05] text-neutral-400"
                                >
                                  {word}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="p-3 bg-vc-canvas rounded-xl text-[11px] text-neutral-400">
                <span className="font-semibold text-neutral-200">Statistical Planning: </span>
                Default parameters: 95% Confidence ($\alpha=0.05$), 80% Power, 20% relative MDE. The system will
                calculate minimum required sample size mathematically (Evan Miller formula).
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-medium bg-vc-ai-hover hover:bg-vc-ai active:bg-violet-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4)] text-white rounded-full transition shadow-md shadow-violet-950/40"
                >
                  Create Experiment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Human-Approved Promotion Confirmation Modal */}
      {isPromoteModalOpen && selectedExperiment && (
        <div className="fixed inset-0 z-50 glass-scrim flex items-center justify-center p-4">
          <div className="glass-float rounded-3xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                Confirm Winner Promotion
              </h3>
              <button onClick={() => setIsPromoteModalOpen(false)} className="text-neutral-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-neutral-300">
              <p>
                Promoting the winning variant will update your active clip and store learned traits into Brand Brain.
              </p>

              <div className="p-3 bg-vc-canvas rounded-xl space-y-1.5">
                <div className="font-semibold text-white">What will happen:</div>
                <ul className="list-disc list-inside text-neutral-400 space-y-1">
                  <li>Active clip state will adopt the winning asset.</li>
                  <li>Thumbnail Lab or Hook Lab session will mark the concept approved.</li>
                  <li>Brand Brain will record high-confidence evidence from this experiment.</li>
                  <li>
                    <strong className="text-emerald-400">Zero external publishing:</strong> Does NOT publish
                    or deploy to social platforms.
                  </li>
                </ul>
              </div>

              <label className="flex items-start gap-2.5 pt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmPromotionCheck}
                  onChange={(e) => setConfirmPromotionCheck(e.target.checked)}
                  className="mt-0.5 rounded border-white/20 bg-vc-canvas text-violet-500 focus:ring-violet-500"
                />
                <span className="text-[11px] text-neutral-200">
                  I explicitly confirm promoting this winning variant to my active clip.
                </span>
              </label>
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={() => setIsPromoteModalOpen(false)}
                className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePromoteWinner}
                disabled={!confirmPromotionCheck || isSubmitting}
                className="px-4 py-1.5 text-xs font-medium bg-vc-ai-hover hover:bg-vc-ai active:bg-violet-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4)] disabled:opacity-50 text-white rounded-full transition shadow-md shadow-violet-950/40"
              >
                Promote Winner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Analytics Import Modal */}
      <ABCsvImportModal
        isOpen={isCsvImportModalOpen}
        onClose={() => setIsCsvImportModalOpen(false)}
        experiment={selectedExperiment}
        onImportSuccess={async (result) => {
          setSelectedExperiment(result.updated_experiment);
          setSuccessMessage(result.summary);
          await loadExperiments();
        }}
      />
    </div>
  );
};
