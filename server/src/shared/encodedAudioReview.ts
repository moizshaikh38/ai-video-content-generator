export interface EncodedAudioReview {
  version:1;
  basis:'encoded-output-ebur128';
  status:'measured'|'needs_review'|'unavailable'|'muted';
  integrated_lufs:number|null;
  true_peak_dbtp:number|null;
  loudness_range_lu:number|null;
  issues:Array<'true_peak_above_zero'|'no_finite_audio_measurement'|'measurement_unavailable'>;
  listening_verified:false;
}
