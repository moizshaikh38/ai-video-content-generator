import{candidateReviewNotice}from'../../../server/src/shared/candidateReviewNotice';
export function CandidateReviewNotice({candidate}:{candidate:any}){const text=candidateReviewNotice(candidate);return text?<p data-testid="candidate-review-notice" className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-2.5 text-xs leading-relaxed text-amber-100/90">{text}</p>:null}
