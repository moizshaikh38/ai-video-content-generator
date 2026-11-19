import React from 'react';
import {postingOutcomeView,type PostingOutcomeInput} from '../shared/postingOutcomeView';

/** Publication status and any review state must stay distinct from failure. */
export const PublishOutcomeBadge:React.FC<{post:PostingOutcomeInput}>=({post})=>{
  const view=postingOutcomeView(post);
  const tone=view.tone==='warning'?'bg-amber-500/20 text-amber-700 dark:text-amber-200':view.tone==='error'?'bg-destructive/20 text-destructive':view.tone==='success'?'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400':'bg-muted text-muted-foreground';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{view.statusLabel}{post.status==='published'&&view.tone==='warning'?', review details':''}</span>;
};

/** Uses only the saved result. No status polling, account discovery or resends. */
export const PublishOutcomeDetails:React.FC<{post:PostingOutcomeInput}>=({post})=>{
  const view=postingOutcomeView(post);
  const tone=view.tone==='warning'?'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200':view.tone==='error'?'border-destructive/40 bg-destructive/10 text-destructive':'border-border/60 bg-muted/40 text-muted-foreground';
  return <div className="space-y-2 text-[11px] leading-relaxed">
    <dl className="grid gap-1 text-muted-foreground">
      <div><dt className="inline font-medium">Destination: </dt><dd className="inline break-all">{view.destination}</dd></div>
      <div><dt className="inline font-medium">Visibility: </dt><dd className="inline">{view.visibility}</dd></div>
      {view.receipt&&<div><dt className="inline font-medium">Platform receipt: </dt><dd className="inline break-all">{view.receipt}</dd></div>}
    </dl>
    {view.feedback&&<div role={view.tone==='error'?'alert':'status'} className={`rounded-xl border px-3 py-2 ${tone}`}>
      <p className="font-semibold">{view.feedbackLabel}</p>
      <p className="mt-0.5 break-words">{view.feedback}</p>
    </div>}
  </div>;
};
