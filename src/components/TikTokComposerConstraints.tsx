import React from 'react';
import {TIKTOK_PRIVACY_LABELS,type TikTokCreatorOptions,type TikTokPrivacyLevel} from '../../server/src/shared/tiktokCreatorOptions';
export interface TikTokConstraintSelection {privacy:TikTokPrivacyLevel|'';comment:boolean;duet:boolean;stitch:boolean;musicConsent:boolean}
export const emptyTikTokSelection=():TikTokConstraintSelection=>({privacy:'',comment:false,duet:false,stitch:false,musicConsent:false});
export const TikTokComposerConstraints:React.FC<{
  creator:TikTokCreatorOptions|null;loading:boolean;error:string|null;selection:TikTokConstraintSelection;mediaDurationSeconds?:number|null;
  onChange:(value:TikTokConstraintSelection)=>void;onRefresh:()=>void;
}> =({creator,loading,error,selection,onChange,onRefresh,mediaDurationSeconds})=><section className="space-y-3 rounded-2xl border border-border p-3 text-xs" aria-label="TikTok account options">
  <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">TikTok account options</h3><button type="button" disabled={loading} onClick={onRefresh} className="underline disabled:opacity-50">Refresh account options</button></div>
  {loading&&<p role="status">Loading current creator options. Nothing is ready to submit yet.</p>}
  {error&&<p role="alert" className="text-destructive break-words">{error}</p>}
  {!loading&&!error&&!creator&&<p>Select a TikTok account to load current options.</p>}
  {creator&&<>
    <p className="break-words"><strong>Posting to {creator.nickname}</strong> (@{creator.username})</p>
    <p>Current maximum video duration: {creator.maxVideoSeconds} seconds.</p>
    {typeof mediaDurationSeconds==='number'&&Number.isFinite(mediaDurationSeconds)&&mediaDurationSeconds>0?<p role={mediaDurationSeconds>creator.maxVideoSeconds?'alert':undefined}>Selected clip: {mediaDurationSeconds} seconds.{mediaDurationSeconds>creator.maxVideoSeconds?' Too long for this account. Submission is disabled.':''}</p>:<p>Video duration has not been verified. Submission is disabled.</p>}
    <label className="block font-medium">TikTok audience
      <select value={selection.privacy} disabled={loading} onChange={e=>onChange({...selection,privacy:e.target.value as TikTokPrivacyLevel|''})} className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2">
        <option value="" disabled>Choose an audience, no default</option>
        {creator.privacyLevels.map(level=><option key={level} value={level}>{TIKTOK_PRIVACY_LABELS[level]}</option>)}
      </select>
    </label>
    <fieldset className="space-y-2"><legend className="mb-1 font-medium">Interactions, off unless you choose them</legend>
      {([{key:'comment',label:'Allow comments',disabled:creator.commentDisabled},{key:'duet',label:'Allow Duet',disabled:creator.duetDisabled},{key:'stitch',label:'Allow Stitch',disabled:creator.stitchDisabled}] as const).map(item=><label key={item.key} className={`flex items-center gap-2 ${item.disabled?'opacity-50':''}`}><input type="checkbox" checked={!item.disabled&&selection[item.key]} disabled={loading||item.disabled} onChange={e=>onChange({...selection,[item.key]:e.target.checked})}/>{item.label}{item.disabled?' (disabled by this account)':''}</label>)}
    </fieldset>
    <label className="flex items-start gap-2"><input type="checkbox" checked={selection.musicConsent} disabled={loading} onChange={e=>onChange({...selection,musicConsent:e.target.checked})}/><span>By posting, you agree to TikTok's Music Usage Confirmation.</span></label>
    <p className="text-muted-foreground">Current account options do not prove app approval, verified media-domain setup or publication. Options are checked again before submission. Review your rendered clip before submitting. Commercial content controls are not available in this local build. Do not use it for promotional posts.</p>
  </>}
</section>;
