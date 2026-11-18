import {LoudnormTwoPassService} from './loudnormTwoPassService.js';

import type {EncodedAudioReview} from '../shared/encodedAudioReview.js';

/** Meter the encoded deliverable, not source settings. No fake target values,
 * speech-quality score, automatic gain change, or listening approval. */
export async function reviewEncodedAudio(filePath:string, muted:boolean, timeoutMs=60000):Promise<EncodedAudioReview> {
  const empty:EncodedAudioReview={version:1,basis:'encoded-output-ebur128',status:muted?'muted':'unavailable',integrated_lufs:null,true_peak_dbtp:null,loudness_range_lu:null,issues:[],listening_verified:false};
  if(muted)return empty;
  try {
    const m=await LoudnormTwoPassService.measure(['-nostdin','-i',filePath],{
      filterComplex:['[0:a]ebur128=peak=true[encoded_meter]'],audioMap:'[encoded_meter]',targetI:-16,
      dialogueInputLabel:'[0:a]',preMarkerFilters:[],postMarkerFilters:[],
    },Math.min(60000,Math.max(1000,timeoutMs)));
    if (![m.inputI,m.inputTP,m.inputLRA].every(Number.isFinite))return {...empty,status:'needs_review',issues:['no_finite_audio_measurement']};
    const peakRisk=m.inputTP>=0;
    return {...empty,status:peakRisk?'needs_review':'measured',integrated_lufs:m.inputI,true_peak_dbtp:m.inputTP,loudness_range_lu:m.inputLRA,issues:peakRisk?['true_peak_above_zero']:[]};
  } catch {
    return {...empty,issues:['measurement_unavailable']};
  }
}
