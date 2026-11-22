import React from 'react';
import { Sparkles } from 'lucide-react';
import { genreEvidencePresentation } from '../../../server/src/shared/genreEvidencePresentation';
import { GENRE_OPTIONS } from './ClipPreferencesControl';

/** The selected genre has its own badge. This badge only describes the saved
 * automatic suggestion and its limits; it never renders heuristic percentages. */
export function GenreEvidenceBadge({metadata}:{metadata:unknown}):React.ReactElement|null {
  const view=genreEvidencePresentation(metadata,GENRE_OPTIONS.filter(g=>g.id!=='auto').map(g=>g.id));
  if(!view)return null;
  const genre=GENRE_OPTIONS.find(g=>g.id===view.genreId);
  const label=view.state==='review-required'?'Auto genre: review needed':`Auto suggestion: ${genre?.label}`;
  return <span data-genre-evidence={view.state} title={view.description} aria-label={`${label}. ${view.description}`}
    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.08] text-[10px] font-mono text-zinc-200">
    <Sparkles className="size-2.5 shrink-0" aria-hidden="true" />
    <span>{label}</span>
  </span>;
}
