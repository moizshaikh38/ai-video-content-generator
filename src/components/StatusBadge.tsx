const map: Record<string, { label: string; cls: string }> = {
  uploading: { label: "Uploading", cls: "bg-secondary text-muted-foreground animate-pulse" },
  uploaded: { label: "Uploaded", cls: "bg-sage/15 text-sage font-medium" },
  queued: { label: "Queued", cls: "bg-secondary text-muted-foreground" },
  processing: { label: "Processing", cls: "bg-accent text-accent-foreground font-medium animate-pulse" },
  transcribing: { label: "Transcribing", cls: "bg-accent text-accent-foreground font-medium animate-pulse" },
  analyzing: { label: "Analyzing", cls: "bg-accent text-accent-foreground font-medium animate-pulse" },
  generating: { label: "Generating", cls: "bg-accent text-accent-foreground font-medium animate-pulse" },
  completed: { label: "Completed", cls: "bg-sage/15 text-sage font-medium" },
  complete: { label: "Complete", cls: "bg-sage/15 text-sage font-medium" },
  failed: { label: "Failed", cls: "bg-destructive/10 text-destructive font-medium" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = map[status] ?? map["queued"]!;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

export const isProcessing = (s: string) => !["complete", "completed", "uploaded", "failed"].includes(s);
