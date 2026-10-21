import React from 'react';
import { CheckCircle2, Clock3, FileText, AlertCircle, Circle, Loader2 } from 'lucide-react';

const map: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  uploading: { label: 'Uploading', cls: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30', icon: Loader2 },
  uploaded: { label: 'Uploaded', cls: 'bg-white/10 text-slate-300 border border-white/15', icon: Circle },
  queued: { label: 'Queued', cls: 'bg-amber-500/15 text-amber-300 border border-amber-500/30', icon: Clock3 },
  processing: { label: 'Processing', cls: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30', icon: Loader2 },
  transcribing: { label: 'Transcribing', cls: 'bg-violet-500/15 text-violet-300 border border-violet-500/30', icon: FileText },
  transcribed: { label: 'Transcribed', cls: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30', icon: CheckCircle2 },
  analyzing: { label: 'Analyzing', cls: 'bg-violet-500/15 text-violet-300 border border-violet-500/30', icon: Loader2 },
  generating: { label: 'Generating', cls: 'bg-violet-500/15 text-violet-300 border border-violet-500/30', icon: Loader2 },
  completed: { label: 'Completed', cls: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30', icon: CheckCircle2 },
  complete: { label: 'Complete', cls: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30', icon: CheckCircle2 },
  failed: { label: 'Failed', cls: 'bg-rose-500/15 text-rose-300 border border-rose-500/30', icon: AlertCircle },
};

export function StatusBadge({ status }: { status: string }) {
  const s = map[status] || map.queued;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur-sm ${s.cls}`}>
      <Icon className={`size-3.5 ${['uploading', 'processing'].includes(status) ? 'animate-spin' : ''}`} />
      {s.label}
    </span>
  );
}

export const isProcessing = (s: string) => ['uploading', 'queued', 'processing', 'transcribing', 'analyzing', 'generating'].includes(s);

