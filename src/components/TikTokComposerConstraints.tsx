import {tikTokCommercialErrors,tikTokMusicDeclaration} from '../../server/src/shared/tiktokCommercialDisclosure';
import React from 'react';
import {TIKTOK_PRIVACY_LABELS,type TikTokCreatorOptions,type TikTokPrivacyLevel} from '../../server/src/shared/tiktokCreatorOptions';
export interface TikTokConstraintSelection {privacy:TikTokPrivacyLevel|'';comment:boolean;duet:boolean;stitch:boolean;musicConsent:boolean;disclose:boolean;ownBrand:boolean;brandedContent:boolean}
export const emptyTikTokSelection=():TikTokConstraintSelection=>({privacy:'',comment:false,duet:false,stitch:false,musicConsent:false,disclose:false,ownBrand:false,brandedContent:false});
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
        {creator.privacyLevels.map(level=><option key={level} value={level} disabled={!['PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS'].includes(level)&&selection.brandedContent}>{TIKTOK_PRIVACY_LABELS[level]}</option>)}
      </select>
    </label>
    <fieldset className="space-y-2"><legend className="mb-1 font-medium">Interactions, off unless you choose them</legend>
      {([{key:'comment',label:'Allow comments',disabled:creator.commentDisabled},{key:'duet',label:'Allow Duet',disabled:creator.duetDisabled},{key:'stitch',label:'Allow Stitch',disabled:creator.stitchDisabled}] as const).map(item=><label key={item.key} className={`flex items-center gap-2 ${item.disabled?'opacity-50':''}`}><input type="checkbox" checked={!item.disabled&&selection[item.key]} disabled={loading||item.disabled} onChange={e=>onChange({...selection,[item.key]:e.target.checked})}/>{item.label}{item.disabled?' (disabled by this account)':''}</label>)}
    </fieldset>
    <fieldset className="space-y-2"><legend className="font-medium">Commercial content disclosure</legend>
      <label className="flex items-start gap-2"><input type="checkbox" checked={selection.disclose} onChange={e=>onChange({...selection,disclose:e.target.checked,ownBrand:false,brandedContent:false,musicConsent:false})}/><span>This content promotes a brand, product or service</span></label>
      {selection.disclose&&<>
        <label className="flex items-start gap-2"><input type="checkbox" checked={selection.ownBrand} onChange={e=>onChange({...selection,ownBrand:e.target.checked,musicConsent:false})}/><span>Your brand{selection.ownBrand&&!selection.brandedContent?', labelled Promotional content':''}</span></label>
        <label className={`flex items-start gap-2 ${(['SELF_ONLY','FOLLOWER_OF_CREATOR'].includes(selection.privacy))?'opacity-50':''}`} title={(['SELF_ONLY','FOLLOWER_OF_CREATOR'].includes(selection.privacy))?'Branded content requires Everyone or Friends. Choose another supported audience.':undefined}><input type="checkbox" checked={selection.brandedContent} disabled={(['SELF_ONLY','FOLLOWER_OF_CREATOR'].includes(selection.privacy))} onChange={e=>onChange({...selection,brandedContent:e.target.checked,musicConsent:false})}/><span>Branded content, promoting a third party{selection.brandedContent?', labelled Paid partnership':''}</span></label>
        {(['SELF_ONLY','FOLLOWER_OF_CREATOR'].includes(selection.privacy))&&<p>Branded content requires Everyone or Friends, not private or followers-only. Audience is never changed automatically.</p>}
        {tikTokCommercialErrors(selection,selection.privacy).map(message=><p role="alert" key={message} className="text-destructive">{message}</p>)}
      </>}
    </fieldset>
    <label className="flex items-start gap-2"><input type="checkbox" checked={selection.musicConsent} disabled={loading} onChange={e=>onChange({...selection,musicConsent:e.target.checked})}/><span>{tikTokMusicDeclaration(selection.disclose&&selection.brandedContent)}</span></label>
    <p className="text-muted-foreground">Current account options do not prove app approval, verified media-domain setup or publication. Options are checked again before submission. Review your rendered clip before submitting. Processing can take a few minutes after submission; it is not confirmed publication.</p>
  </>}
</section>;
