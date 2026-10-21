import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Layers,
  Search,
  RotateCcw,
  Sparkles,
  ExternalLink,
  FileText,
  Video,
  Image as ImageIcon,
  ShieldCheck,
  AlertTriangle,
  Send,
  Plus,
  X,
  History,
  CheckSquare,
  RefreshCw,
} from 'lucide-react';
import { workflowService } from '../services/workflowService';
import { ContentWorkflowRecord, WorkflowState } from '../types';

const STATE_COLUMNS: Array<{ id: WorkflowState; label: string; tone: string; description: string }> = [
  { id: 'PLANNED', label: 'Planned / Idea', tone: 'bg-white/[0.06] text-neutral-300 border-white/[0.1]', description: 'Concepts, prompts, or draft clips planned for production' },
  { id: 'IN_PREPARATION', label: 'In Preparation', tone: 'bg-blue-500/15 text-blue-300 border-blue-500/30', description: 'Generating clips, hooks, thumbnails, and copy' },
  { id: 'READY_FOR_REVIEW', label: 'Ready for Review', tone: 'bg-purple-500/15 text-purple-300 border-purple-500/30', description: 'All creative artifacts ready for editorial check' },
  { id: 'AWAITING_APPROVAL', label: 'Awaiting Approval', tone: 'bg-amber-500/15 text-amber-300 border-amber-500/30', description: 'Passed review, pending creator or manager sign-off' },
  { id: 'APPROVED', label: 'Approved', tone: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', description: 'Human approved and queued for distribution' },
  { id: 'PUBLISHED', label: 'Published', tone: 'bg-teal-500/15 text-teal-300 border-teal-500/30', description: 'Confirmed live publishing record on target platforms' },
];

export const WorkflowPage: React.FC = () => {
  const [workflows, setWorkflows] = useState<ContentWorkflowRecord[]>([]);
  const [stateCounts, setStateCounts] = useState<Record<WorkflowState, number>>({
    PLANNED: 0,
    IN_PREPARATION: 0,
    READY_FOR_REVIEW: 0,
    AWAITING_APPROVAL: 0,
    APPROVED: 0,
    PUBLISHED: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedState, setSelectedState] = useState<WorkflowState | 'ALL'>('ALL');
  const [activeWorkflow, setActiveWorkflow] = useState<ContentWorkflowRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [revisionNotes, setRevisionNotes] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await workflowService.listWorkflows({
        state: selectedState === 'ALL' ? undefined : selectedState,
        search: search.trim() || undefined,
      });
      setWorkflows(res.workflows);
      setStateCounts(res.state_counts);
    } catch (err: any) {
      setError(err?.message || 'Failed to load content workflows.');
    } finally {
      setLoading(false);
    }
  };

  // Immediate debounced search (280ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchWorkflows();
    }, 280);
    return () => clearTimeout(timer);
  }, [search, selectedState]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchWorkflows();
  };

  const handleOpenDetail = (wf: ContentWorkflowRecord) => {
    setActiveWorkflow(wf);
    setIsDetailOpen(true);
    setActionMessage(null);
    setRevisionNotes('');
    setApprovalNotes('');
  };

  const handleTransition = async (targetState: WorkflowState) => {
    if (!activeWorkflow) return;
    try {
      setActionLoading(true);
      setActionMessage(null);
      const updated = await workflowService.transitionWorkflow(activeWorkflow.id, targetState, {
        expectedVersion: activeWorkflow.version,
      });
      setActiveWorkflow(updated);
      setActionMessage({ type: 'success', text: `Successfully moved to ${targetState.replace(/_/g, ' ')}.` });
      await fetchWorkflows();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Transition failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!activeWorkflow) return;
    try {
      setActionLoading(true);
      setActionMessage(null);
      const updated = await workflowService.approveWorkflow(activeWorkflow.id, approvalNotes.trim() || undefined);
      setActiveWorkflow(updated);
      setActionMessage({ type: 'success', text: 'Content approved successfully.' });
      setApprovalNotes('');
      await fetchWorkflows();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Approval failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestRevisions = async () => {
    if (!activeWorkflow) return;
    if (!revisionNotes.trim()) {
      setActionMessage({ type: 'error', text: 'Please specify the revisions needed.' });
      return;
    }
    try {
      setActionLoading(true);
      setActionMessage(null);
      const updated = await workflowService.requestRevisions(activeWorkflow.id, revisionNotes.trim());
      setActiveWorkflow(updated);
      setActionMessage({ type: 'success', text: 'Content returned to preparation for revisions.' });
      setRevisionNotes('');
      await fetchWorkflows();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Revision request failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 text-[#F4F6FB]">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-vireo-green">Content Lifecycle & Automation</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[#F4F6FB]">
            Content Workflows
          </h1>
          <p className="mt-1 text-sm text-[#9AA2B2]">
            Track video content from ideation and preparation through review, human approval, and published verification.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl border border-white/[0.08] bg-[#0E1017] p-0.5 text-xs font-medium">
            <button
              onClick={() => setViewMode('board')}
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                viewMode === 'board' ? 'bg-white/[0.12] text-[#F4F6FB] font-semibold shadow-xs' : 'text-[#9AA2B2] hover:text-[#F4F6FB]'
              }`}
            >
              Pipeline Board
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                viewMode === 'list' ? 'bg-white/[0.12] text-[#F4F6FB] font-semibold shadow-xs' : 'text-[#9AA2B2] hover:text-[#F4F6FB]'
              }`}
            >
              List View
            </button>
          </div>
          <button
            onClick={() => fetchWorkflows()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#0E1017] px-3 py-1.5 text-xs font-semibold text-[#F4F6FB] hover:bg-white/[0.05]"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* State Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] pb-3">
        <button
          onClick={() => setSelectedState('ALL')}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
            selectedState === 'ALL'
              ? 'bg-[#F4F6FB] text-[#0B0C0F] shadow-sm'
              : 'bg-[#0E1017] border border-white/[0.08] text-[#9AA2B2] hover:text-[#F4F6FB] hover:border-white/[0.16]'
          }`}
        >
          All Stages ({Object.values(stateCounts).reduce((a, b) => a + b, 0)})
        </button>
        {STATE_COLUMNS.map((col) => (
          <button
            key={col.id}
            onClick={() => setSelectedState(col.id)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedState === col.id
                ? 'bg-[#F4F6FB] text-[#0B0C0F] shadow-sm'
                : 'bg-[#0E1017] border border-white/[0.08] text-[#9AA2B2] hover:text-[#F4F6FB] hover:border-white/[0.16]'
            }`}
          >
            {col.label} ({stateCounts[col.id] || 0})
          </button>
        ))}
      </div>

      {/* Search and Filters Bar */}
      <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[280px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9AA2B2]" />
          <input
            type="text"
            placeholder="Search content or clip title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/[0.08] bg-[#0E1017] py-2 pl-9 pr-3 text-sm text-[#F4F6FB] placeholder:text-[#64748B] focus:border-vireo-green focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-[#F4F6FB] px-4 py-2 text-sm font-semibold text-[#0B0C0F] shadow-sm hover:bg-white"
        >
          Search
        </button>
      </form>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-white/[0.1] bg-[#0E1017]/60">
          <div className="text-center">
            <RefreshCw className="mx-auto size-6 animate-spin text-vireo-green" />
            <p className="mt-2 text-sm text-[#9AA2B2]">Loading content workflows...</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-950/20 p-6 text-center">
          <AlertTriangle className="mx-auto size-8 text-rose-400" />
          <h3 className="mt-2 text-sm font-semibold text-rose-300">Unable to load workflows</h3>
          <p className="mt-1 text-xs text-rose-400/80">{error}</p>
          <button
            onClick={() => fetchWorkflows()}
            className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      ) : workflows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.08] bg-[#0E1017] p-12 text-center">
          <Layers className="mx-auto size-12 text-[#9AA2B2]/40" />
          <h3 className="mt-4 text-base font-semibold text-[#F4F6FB]">No content items found</h3>
          <p className="mt-1 text-sm text-[#9AA2B2]">
            {selectedState !== 'ALL'
              ? `No content currently in ${selectedState.replace(/_/g, ' ')}. Try selecting 'All Stages'.`
              : 'Create a video clip to begin automatic workflow tracking.'}
          </p>
          <Link
            to="/projects/new"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#F4F6FB] px-5 py-2.5 text-sm font-semibold text-[#0B0C0F] shadow-black/40 hover:bg-white"
          >
            <Plus className="size-4" /> Clip a Video
          </Link>
        </div>
      ) : viewMode === 'board' ? (
        /* Kanban Pipeline View */
        <div
          className={
            (selectedState === 'ALL' ? STATE_COLUMNS : STATE_COLUMNS.filter((col) => col.id === selectedState)).length === 1
              ? "max-w-2xl mx-auto w-full pb-4"
              : "grid grid-cols-1 gap-4 lg:grid-cols-3 xl:grid-cols-6 overflow-x-auto pb-4"
          }
        >
          {(selectedState === 'ALL' ? STATE_COLUMNS : STATE_COLUMNS.filter((col) => col.id === selectedState)).map((col) => {
            const colWorkflows = workflows.filter((w) => w.current_state === col.id);
            return (
              <div key={col.id} className="flex min-w-[260px] flex-col rounded-2xl border border-white/[0.08] bg-[#0E1017] p-3 shadow-md">
                {/* Column Header */}
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5 mb-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#F4F6FB]">{col.label}</h3>
                    <p className="text-[10px] text-[#9AA2B2] truncate" title={col.description}>
                      {col.description}
                    </p>
                  </div>
                  <span className="rounded-full bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 text-xs font-bold text-[#F4F6FB]">
                    {colWorkflows.length}
                  </span>
                </div>

                {/* Column Items */}
                <div className="space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
                  {colWorkflows.length === 0 ? (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-white/[0.08] text-center text-[11px] text-[#9AA2B2]/60">
                      Empty
                    </div>
                  ) : (
                    colWorkflows.map((wf) => {
                      const completedCount = wf.checklist.filter((c) => c.completed).length;
                      return (
                        <div
                          key={wf.id}
                          onClick={() => handleOpenDetail(wf)}
                          className="group cursor-pointer rounded-xl border border-white/[0.08] bg-[#131620] p-3.5 shadow-sm transition-all hover:border-vireo-green hover:shadow-lg"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-semibold text-[#F4F6FB] line-clamp-2 group-hover:text-vireo-green">
                              {wf.title}
                            </h4>
                          </div>

                          {/* Artifact Badges */}
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            {wf.artifacts.clip && (
                              <span className="inline-flex items-center gap-1 rounded bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-[#CBD5E1]">
                                <Video className="size-3 text-vireo-green" />
                                Clip {wf.artifacts.clip.status}
                              </span>
                            )}
                            {wf.artifacts.content_pack && (
                              <span className="inline-flex items-center gap-1 rounded bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-[#CBD5E1]">
                                <FileText className="size-3 text-purple-400" />
                                Pack ({wf.artifacts.content_pack.items_count})
                              </span>
                            )}
                            {wf.artifacts.hook_lab && (
                              <span className="inline-flex items-center gap-1 rounded bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-[#CBD5E1]">
                                <Sparkles className="size-3 text-amber-400" />
                                Hook
                              </span>
                            )}
                            {wf.artifacts.thumbnail_lab && (
                              <span className="inline-flex items-center gap-1 rounded bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 text-[10px] font-medium text-[#CBD5E1]">
                                <ImageIcon className="size-3 text-blue-400" />
                                Thumb
                              </span>
                            )}
                            {wf.artifacts.publishing?.status === 'published' && (
                              <span className="inline-flex items-center gap-1 rounded bg-teal-500/15 border border-teal-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-teal-300">
                                <Send className="size-3" />
                                Published
                              </span>
                            )}
                          </div>

                          {/* Progress indicator */}
                          <div className="mt-3 flex items-center justify-between text-[11px] text-[#9AA2B2] border-t border-white/[0.08] pt-2">
                            <span className="inline-flex items-center gap-1">
                              <CheckSquare className="size-3" />
                              {completedCount}/{wf.checklist.length} ready
                            </span>
                            <span className="text-[10px] text-vireo-green font-medium group-hover:underline">
                              Inspect →
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0E1017] shadow-md">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] bg-[#07080D] text-xs font-semibold text-[#9AA2B2]">
                <th className="py-3 px-4">Content Title</th>
                <th className="py-3 px-4">Workflow State</th>
                <th className="py-3 px-4">Artifacts Ready</th>
                <th className="py-3 px-4">Readiness Progress</th>
                <th className="py-3 px-4">Human Approval</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {workflows.map((wf) => {
                const completedCount = wf.checklist.filter((c) => c.completed).length;
                return (
                  <tr key={wf.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 font-semibold text-[#F4F6FB]">
                      <button onClick={() => handleOpenDetail(wf)} className="hover:text-vireo-green text-left">
                        {wf.title}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-block rounded-full bg-white/[0.06] border border-white/[0.08] px-2.5 py-1 text-xs font-semibold text-[#F4F6FB]">
                        {wf.current_state.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 text-xs text-[#9AA2B2]">
                        {wf.artifacts.clip && <span title="Clip Ready"><Video className="size-3.5 text-vireo-green" /></span>}
                        {wf.artifacts.content_pack && <span title="Content Pack"><FileText className="size-3.5 text-purple-400" /></span>}
                        {wf.artifacts.hook_lab && <span title="Hook Lab"><Sparkles className="size-3.5 text-amber-400" /></span>}
                        {wf.artifacts.thumbnail_lab && <span title="Thumbnail Lab"><ImageIcon className="size-3.5 text-blue-400" /></span>}
                        {wf.artifacts.publishing?.status === 'published' && <span title="Published"><Send className="size-3.5 text-teal-400" /></span>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-white/[0.1] overflow-hidden">
                          <div
                            className="h-full bg-vireo-green rounded-full"
                            style={{ width: `${(completedCount / (wf.checklist.length || 1)) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#9AA2B2]">
                          {completedCount}/{wf.checklist.length}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {wf.approved_at ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                          <ShieldCheck className="size-3.5 text-emerald-400" /> Approved
                        </span>
                      ) : (
                        <span className="text-[#9AA2B2]">Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleOpenDetail(wf)}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-[#F4F6FB] hover:bg-white/[0.08]"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide-over Detail Drawer */}
      {isDetailOpen && activeWorkflow && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="relative w-full max-w-xl bg-[#0E1017] border-l border-white/[0.08] text-[#F4F6FB] shadow-2xl flex flex-col h-full overflow-hidden">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] p-5">
              <div>
                <span className="rounded-full bg-white/[0.08] border border-white/[0.12] px-2.5 py-1 text-xs font-bold text-[#F4F6FB]">
                  {activeWorkflow.current_state.replace(/_/g, ' ')}
                </span>
                <h2 className="mt-2 font-display text-xl font-semibold text-[#F4F6FB]">
                  {activeWorkflow.title}
                </h2>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="rounded-xl p-1.5 text-[#9AA2B2] hover:bg-white/[0.08] hover:text-[#F4F6FB]"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {actionMessage && (
                <div
                  className={`rounded-xl p-3.5 text-xs font-medium ${
                    actionMessage.type === 'success'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {actionMessage.text}
                </div>
              )}

              {/* Outstanding Missing Blockers */}
              {activeWorkflow.missing_prerequisites.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                    <AlertTriangle className="size-4 text-amber-400" />
                    Outstanding Prerequisites
                  </div>
                  <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-amber-200/90">
                    {activeWorkflow.missing_prerequisites.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Readiness Checklist */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F4F6FB] mb-3">
                  Readiness Criteria & Gates
                </h3>
                <div className="space-y-2.5">
                  {activeWorkflow.checklist.map((task) => (
                    <div
                      key={task.task_key}
                      className={`flex items-start gap-3 rounded-xl border p-3 ${
                        task.completed ? 'border-emerald-500/30 bg-emerald-950/20' : 'border-white/[0.08] bg-white/[0.03]'
                      }`}
                    >
                      {task.completed ? (
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-400 mt-0.5" />
                      ) : (
                        <Clock className="size-4 shrink-0 text-[#9AA2B2] mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-[#F4F6FB]">{task.label}</h4>
                          <span
                            className={`text-[10px] font-bold uppercase ${
                              task.completed ? 'text-emerald-400' : 'text-[#9AA2B2]'
                            }`}
                          >
                            {task.completed ? 'Complete' : 'Required'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#9AA2B2]">{task.description}</p>
                        {task.details && (
                          <p className="mt-1 text-[11px] font-medium text-white/80">{task.details}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Linked Studio Artifacts */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F4F6FB] mb-3">
                  Studio Artifacts & Links
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {activeWorkflow.clip_id ? (
                    <>
                      <Link
                        to={`/clips/${activeWorkflow.clip_id}/edit`}
                        className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 hover:bg-white/[0.08] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Video className="size-4 text-vireo-green" />
                          <span className="text-xs font-semibold text-[#F4F6FB]">Clip Editor</span>
                        </div>
                        <ExternalLink className="size-3 text-[#9AA2B2]" />
                      </Link>
                      <Link
                        to={`/clips/${activeWorkflow.clip_id}/edit?tab=content_pack`}
                        className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 hover:bg-white/[0.08] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 text-purple-400" />
                          <span className="text-xs font-semibold text-[#F4F6FB]">Content Pack</span>
                        </div>
                        <ExternalLink className="size-3 text-[#9AA2B2]" />
                      </Link>
                      <Link
                        to={`/clips/${activeWorkflow.clip_id}/edit?tab=hook_lab`}
                        className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 hover:bg-white/[0.08] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles className="size-4 text-amber-400" />
                          <span className="text-xs font-semibold text-[#F4F6FB]">Hook Lab</span>
                        </div>
                        <ExternalLink className="size-3 text-[#9AA2B2]" />
                      </Link>
                      <Link
                        to={`/clips/${activeWorkflow.clip_id}/edit?tab=thumbnail_lab`}
                        className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 hover:bg-white/[0.08] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <ImageIcon className="size-4 text-blue-400" />
                          <span className="text-xs font-semibold text-[#F4F6FB]">Thumbnail Lab</span>
                        </div>
                        <ExternalLink className="size-3 text-[#9AA2B2]" />
                      </Link>
                    </>
                  ) : null}
                  <Link
                    to="/brand"
                    className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 hover:bg-white/[0.08] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-emerald-400" />
                      <span className="text-xs font-semibold text-[#F4F6FB]">Brand Brain</span>
                    </div>
                    <ExternalLink className="size-3 text-[#9AA2B2]" />
                  </Link>
                  <Link
                    to="/ab-testing"
                    className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 hover:bg-white/[0.08] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-violet-400" />
                      <span className="text-xs font-semibold text-[#F4F6FB]">A/B Studio</span>
                    </div>
                    <ExternalLink className="size-3 text-[#9AA2B2]" />
                  </Link>
                </div>
              </div>

              {/* Human Approval Sign-off or Revision Request */}
              {['READY_FOR_REVIEW', 'AWAITING_APPROVAL'].includes(activeWorkflow.current_state) && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#F4F6FB]">
                    Human Review Gate
                  </h3>
                  <p className="text-xs text-[#9AA2B2]">
                    Content cannot be published without explicit approval sign-off.
                  </p>
                  <div>
                    <input
                      type="text"
                      placeholder="Optional approval notes..."
                      value={approvalNotes}
                      onChange={(e) => setApprovalNotes(e.target.value)}
                      className="w-full rounded-xl border border-white/[0.1] bg-[#07080D] px-3 py-2 text-xs text-white placeholder:text-[#64748B] focus:border-vireo-green focus:outline-none"
                    />
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        onClick={handleApprove}
                        disabled={actionLoading}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition"
                      >
                        <ShieldCheck className="mr-1.5 inline size-3.5" />
                        Approve Content
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-white/[0.08] pt-3">
                    <p className="text-xs font-semibold text-[#F4F6FB] mb-1">Need Changes?</p>
                    <input
                      type="text"
                      placeholder="Specify requested revisions..."
                      value={revisionNotes}
                      onChange={(e) => setRevisionNotes(e.target.value)}
                      className="w-full rounded-xl border border-white/[0.1] bg-[#07080D] px-3 py-2 text-xs text-white placeholder:text-[#64748B] focus:border-vireo-green focus:outline-none"
                    />
                    <button
                      onClick={handleRequestRevisions}
                      disabled={actionLoading || !revisionNotes.trim()}
                      className="mt-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-[#F4F6FB] hover:bg-white/[0.08] disabled:opacity-50 transition"
                    >
                      <RotateCcw className="mr-1.5 inline size-3" />
                      Send Back for Revisions
                    </button>
                  </div>
                </div>
              )}

              {/* State Transitions Actions */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F4F6FB] mb-2">
                  Move to Next Stage
                </h3>
                <div className="flex flex-wrap gap-2">
                  {activeWorkflow.can_transition_to.map((target) => (
                    <button
                      key={target}
                      onClick={() => handleTransition(target)}
                      disabled={actionLoading}
                      className="rounded-xl bg-[#F4F6FB] px-3 py-1.5 text-xs font-semibold text-[#0B0C0F] hover:bg-white disabled:opacity-50 shadow-sm transition"
                    >
                      Move to {target.replace(/_/g, ' ')} →
                    </button>
                  ))}
                  {activeWorkflow.can_transition_to.length === 0 && (
                    <p className="text-xs text-[#9AA2B2]">
                      {activeWorkflow.current_state === 'PUBLISHED'
                        ? 'This content has been published live.'
                        : 'Complete outstanding prerequisites above to advance stage.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Audit Trail Timeline */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F4F6FB] mb-3 flex items-center gap-1.5">
                  <History className="size-3.5" />
                  Audit Trail History
                </h3>
                <div className="space-y-2 border-l-2 border-white/[0.1] ml-2 pl-3">
                  {activeWorkflow.audit_trail.slice().reverse().map((entry) => (
                    <div key={entry.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#F4F6FB]">
                          {entry.from_state} → {entry.to_state}
                        </span>
                        <span className="text-[10px] text-[#9AA2B2]">
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#9AA2B2]">
                        Action: <span className="font-medium text-[#F4F6FB]">{entry.action}</span>
                        {entry.notes ? ` — "${entry.notes}"` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
