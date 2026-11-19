import React from 'react';
export const PublishRenderedReview:React.FC<{
  url:string|null;loading:boolean;error:string|null;mediaLoaded:boolean;reviewed:boolean;
  renderVersion:number|null;onLoaded:()=>void;onError:()=>void;onReviewed:(value:boolean)=>void;onRefresh:()=>void;
}> =({url,loading,error,mediaLoaded,reviewed,renderVersion,onLoaded,onError,onReviewed,onRefresh})=><section aria-label="Review exact rendered clip" className="space-y-2 rounded-2xl border border-border p-3 text-xs">
  <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Review exact rendered clip</h3><button type="button" onClick={onRefresh} disabled={loading} className="underline">Reload selected render</button></div>
  {loading&&<p role="status">Verifying the selected rendered output...</p>}
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  {url&&!loading&&<>
    <video key={url} src={url} controls playsInline preload="metadata" onLoadedData={onLoaded} onError={onError} className="w-full max-h-64 rounded-xl bg-black" aria-label="Exact selected rendered video"/>
    <p>Rendered version: {renderVersion??'legacy, storage identity pinned'}. Review the video and audio, caption, destination, audience and disclosure before submitting. This preview does not upload to TikTok.</p>
    <label className={`flex items-start gap-2 ${!mediaLoaded?'opacity-50':''}`}><input type="checkbox" disabled={!mediaLoaded} checked={reviewed&&mediaLoaded} onChange={e=>onReviewed(e.target.checked)}/><span>I reviewed this exact rendered video and the post details above, and authorize sending it to the selected TikTok account when I submit.</span></label>
    {!mediaLoaded&&<p>The video must load before you can confirm review.</p>}
  </>}
</section>;
