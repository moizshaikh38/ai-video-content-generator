import type{ClassifyGenreMetricsInput}from'../services/genreIntelligenceService.js';
/** Convert only source-wide completed detector receipts into genre inputs.
 * Presence is not a face count, average audio volume is not a reaction peak,
 * and scene-cut activity is not measured optical motion. */
export function measuredGenreSignals(timeline:any,durationSeconds:number):Partial<ClassifyGenreMetricsInput>{
 const result:Partial<ClassifyGenreMetricsInput>={};
 if(!timeline||!Number.isFinite(durationSeconds)||durationSeconds<=0||!Number.isFinite(timeline.duration_seconds)||Math.abs(timeline.duration_seconds-durationSeconds)>.05)return result;
 const completed=(key:string)=>timeline.signal_evidence?.[key]?.status==='completed'&&timeline.signal_evidence[key].scope==='whole-source';
 const cuts=timeline.scene_cuts;
 if(completed('sceneCuts')&&Array.isArray(cuts)&&cuts.every((c:any)=>Number.isFinite(c?.timestamp)&&c.timestamp>=0&&c.timestamp<=durationSeconds))result.sceneCutRatePerMin=cuts.length/(durationSeconds/60);
 const silence=timeline.silence_intervals;
 if(completed('silence')&&Array.isArray(silence)&&silence.every((s:any)=>Number.isFinite(s?.start)&&Number.isFinite(s?.end)&&s.start>=0&&s.end>s.start&&s.end<=durationSeconds)){
  let end=0,total=0;
  for(const s of [...silence].sort((a,b)=>a.start-b.start)){total+=Math.max(0,s.end-Math.max(end,s.start));end=Math.max(end,s.end);}
  result.silenceRatio=total/durationSeconds;
 }
 // Positive OCR has explicit detector output. Empty/default metadata alone
 // does not establish that sampled OCR actually completed without errors.
 if(timeline.summary_metadata?.ocr_status==='detected'&&Array.isArray(timeline.keyframes)){
  const text=timeline.keyframes.filter((k:any)=>Number.isFinite(k?.timestamp)&&k.timestamp>=0&&k.timestamp<=durationSeconds&&typeof k.ocr_text==='string'&&k.ocr_text.trim());
  if(text.length)result.ocrDensityPerMin=text.length/(durationSeconds/60);
 }
 return result;
}
