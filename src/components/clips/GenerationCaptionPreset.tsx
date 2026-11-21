import { Captions } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CaptionStyle } from '../../types';
import { CAPTION_PRESETS, CAPTION_PRESET_IDS, getPreviewFrame, regroupCuesForPreset, resolveCaptionPreset, isRenderablePresetId, type CaptionPresetId } from '../../lib/captionPresets';
import { CaptionPresetRenderer } from '../editor/CaptionPresetRenderer';
import { CreditService } from '../../services/creditService';

/** Small pre-generation sample, using the editor/export preset definitions. */
export function GenerationCaptionPreset({value, disabled, onChange}:{value?:CaptionStyle;disabled:boolean;onChange:(value?:CaptionStyle)=>void}) {
  const [allowed,setAllowed]=useState<string[]>(['simple']);
  useEffect(()=>{let live=true;CreditService.getUserEntitlements().then(e=>{if(live)setAllowed(e.allowedSubtitlePresets)}).catch(()=>undefined);return()=>{live=false}},[]);
  const ids=['vireo_comic_default','simple','word_cut','karaoke'] as const;
  const id=isRenderablePresetId(value)?value:'simple';
  const style=resolveCaptionPreset(id,undefined,'9:16');
  const words=CAPTION_PRESETS[id].sampleText.split(' ').map((text,i)=>({text,start:i*.42,end:(i+1)*.42-.04}));
  const cues=regroupCuesForPreset([{id:'sample',start:0,end:words[words.length-1].end,text:'',words}],style).cues;
  const cue=cues.find(c=>c.start<=.9&&c.end>.9)||cues[0];
  const frame=cue?getPreviewFrame(cue,Math.min(.9,cue.end-.001),style):null;
  return <section className="space-y-3">
    <label htmlFor="generation-caption-preset" className="text-[13px] font-semibold text-vc-text-primary flex items-center gap-2"><Captions className="size-4 text-violet-300" aria-hidden="true"/>Caption preset</label>
    <div className="flex flex-col sm:flex-row items-center gap-3">
    <select id="generation-caption-preset" value={value||'default'} disabled={disabled} onChange={e=>onChange(e.target.value==='default'?undefined:e.target.value as CaptionStyle)} className="w-full rounded-full bg-zinc-900 border border-white/10 px-4 py-3 text-sm text-white">
      <option value="default">Automatic (plan default)</option>
      {value&&!ids.includes(value as any)&&<option value={value}>Saved: {value}</option>}
      {ids.map(id=><option key={id} value={id} disabled={!allowed.includes('*')&&!allowed.includes(id)}>{CAPTION_PRESETS[id].label}{!allowed.includes('*')&&!allowed.includes(id)?' (plan restricted)':''}</option>)}
    </select>
    {value&&isRenderablePresetId(value)&&<div className="relative mx-auto overflow-hidden rounded-xl bg-black/30 border border-white/10" style={{width:200,height:56,flexShrink:0}} aria-label="Caption style sample preview"><CaptionPresetRenderer style={style} frame={frame ? {...frame,positionX:.5,positionY:.65,positionAnchor:'bottom'} : null} scale={200/style.playResX}/></div>}
    </div>
    <p className="text-[11px] leading-relaxed text-vc-text-secondary">{!value?'Uses the plan default when rendering. Choose a preset to see a sample.':'Sample words only, not your recording. The selected preset is kept for new clips; timing depends on the transcript.'} {disabled?'Caption selection is inactive while captions are off or generation is starting. ':''}You can change captions in the editor.</p>
  </section>;
}

function PresetSample({id}:{id:Exclude<CaptionPresetId,'none'>}) {
  const style=resolveCaptionPreset(id,undefined,'9:16');
  const words=CAPTION_PRESETS[id].sampleText.split(' ').map((text,i)=>({text,start:i*.42,end:(i+1)*.42-.04}));
  const cues=regroupCuesForPreset([{id:'sample',start:0,end:words[words.length-1].end,text:'',words}],style).cues;
  const cue=cues.find(c=>c.start<=.9&&c.end>.9)||cues[0];
  const frame=cue?getPreviewFrame(cue,Math.min(.9,cue.end-.001),style):null;
  return <div className="relative w-full overflow-hidden rounded-lg bg-black/40 border border-white/10" style={{aspectRatio:'16/5'}} aria-hidden="true"><CaptionPresetRenderer style={style} frame={frame ? {...frame,positionX:.5,positionY:.65,positionAnchor:'bottom'} : null} scale={160/style.playResX}/></div>;
}

/** Visual preset tiles for the Configure screen. Full supported catalogue, real rendered samples, plan gating preserved. */
export function GenerationCaptionPresetTiles({value, disabled, onChange}:{value?:CaptionStyle;disabled:boolean;onChange:(value?:CaptionStyle)=>void}) {
  const [allowed,setAllowed]=useState<string[]>(['simple']);
  useEffect(()=>{let live=true;CreditService.getUserEntitlements().then(e=>{if(live)setAllowed(e.allowedSubtitlePresets)}).catch(()=>undefined);return()=>{live=false}},[]);
  const ids=CAPTION_PRESET_IDS.filter(id=>id!=='none') as Array<Exclude<CaptionPresetId,'none'>>;
  const current=isRenderablePresetId(value)?value:(value?'saved':'default');
  return <div className="space-y-2">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-0.5" role="radiogroup" aria-label="Caption style">
      <button type="button" role="radio" aria-checked={current==='default'} disabled={disabled}
        onClick={()=>onChange(undefined)}
        className={`rounded-xl border p-2 text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${current==='default'?'border-violet-500/70 bg-violet-500/15 ring-1 ring-violet-400/40':'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
        <div className="relative w-full rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-[11px] text-vc-text-secondary" style={{aspectRatio:'16/5'}}>Plan default</div>
        <div className={`mt-1.5 text-[11px] font-medium ${current==='default'?'text-white':'text-vc-text-secondary'}`}>Automatic</div>
      </button>
      {value&&!ids.includes(value as Exclude<CaptionPresetId,'none'>)&&<button type="button" role="radio" aria-checked={true} disabled={disabled}
        className="rounded-xl border border-violet-500/70 bg-violet-500/15 ring-1 ring-violet-400/40 p-2 text-left cursor-pointer disabled:opacity-50">
        <div className="relative w-full rounded-lg bg-black/40 border border-white/10 flex items-center justify-center text-[11px] text-vc-text-secondary" style={{aspectRatio:'16/5'}}>Saved style</div>
        <div className="mt-1.5 text-[11px] font-medium text-white truncate">{value}</div>
      </button>}
      {ids.map(id=>{
        const gated=!allowed.includes('*')&&!allowed.includes(id);
        const selected=current===id;
        return <button key={id} type="button" role="radio" aria-checked={selected} disabled={disabled||gated}
          onClick={()=>onChange(id as CaptionStyle)}
          className={`rounded-xl border p-2 text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${selected?'border-violet-500/70 bg-violet-500/15 ring-1 ring-violet-400/40':'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
          <PresetSample id={id}/>
          <div className={`mt-1.5 text-[11px] font-medium leading-tight ${selected?'text-white':'text-vc-text-secondary'}`}>{CAPTION_PRESETS[id].label}{gated?' (plan restricted)':''}</div>
        </button>;
      })}
    </div>
    <p className="text-[11px] leading-relaxed text-vc-text-secondary">{!isRenderablePresetId(value)?'Uses the plan default when rendering. Choose a preset to see a sample.':'Sample words only, not your recording. The selected preset is kept for new clips; timing depends on the transcript.'} You can change captions in the editor.</p>
  </div>;
}
