/** A review Fit is a missing-camera fallback, not a replacement for a real
 * legacy path. Inventing Fit over that path makes preview disagree with export.
 * A server shot plan still owns its own presentation and review status. */
export function needsAutomaticFitFallback(explicitAuto:boolean,shots:unknown[]|null|undefined,legacyKeyframes:unknown[]|null|undefined,groupKeyframes:unknown[]|null|undefined):boolean {
 return explicitAuto&&!shots?.length&&!legacyKeyframes?.length&&!groupKeyframes?.length;
}

/** The already selected source-bound shot owns its presentation. 'auto' is an
 * ownership stamp, not a concrete CSS tracking/cover layout. Callers must pass
 * the current scene's admitted shot, never select one by face count here. */
export function previewLayoutForResolvedShot(stored:string,shot:{split?:unknown}|undefined,renderedReview:boolean,manual:boolean):string {
 if(renderedReview||manual||!shot)return stored;
 return shot.split?'split':'track';
}

/** Match native higher-priority picture channels. Test the actual item rather
 * than asking each caller to remember an incomplete manual boolean. */
export function previewShotOwnedElsewhere(item:any):boolean {return Boolean(item?.crop||item?.panels||item?.framing_window!==undefined||item?.tracker?.enabled||item?.crop_config?.layout_mode_source==='user'||item?.manual_placement!==undefined||item?.manual_source_crop!==undefined||item?.is_title_card||item?.is_freeze);}
