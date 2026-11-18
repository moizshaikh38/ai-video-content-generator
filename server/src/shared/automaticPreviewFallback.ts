/** A review Fit is a missing-camera fallback, not a replacement for a real
 * legacy path. Inventing Fit over that path makes preview disagree with export.
 * A server shot plan still owns its own presentation and review status. */
export function needsAutomaticFitFallback(explicitAuto:boolean,shots:unknown[]|null|undefined,legacyKeyframes:unknown[]|null|undefined,groupKeyframes:unknown[]|null|undefined):boolean {
 return explicitAuto&&!shots?.length&&!legacyKeyframes?.length&&!groupKeyframes?.length;
}
