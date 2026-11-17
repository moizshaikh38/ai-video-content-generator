import { Captions } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CaptionStyle } from '../../types';
import { CAPTION_PRESETS, getPreviewFrame, regroupCuesForPreset, resolveCaptionPreset, isRenderablePresetId } from '../../lib/captionPresets';
import { CaptionPresetRenderer } from '../editor/CaptionPresetRenderer';
import { CreditService } from '../../services/creditService';

/** Small pre-generation sample, using the editor/export preset definitions. */
export function GenerationCaptionPreset({value, disabled, onChange}:{value?:CaptionStyle;disabled:boolean;onChange:(value?:CaptionStyle)=>void}) {
  const [allowed,setAllowed]=useState<string[]>(['simple']);
  useEffect(()=>{let live=true;CreditService.getUserEntitlements().then(e=>{if(live)setAllowed(e.allowedSubtitlePresets)}).catch(()=>undefined);return()=>{live=false}},[]);
  const ids=['simple','word_cut','karaoke'] as const;
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
