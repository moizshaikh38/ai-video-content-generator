/** Execution provenance, not a claim of source-version freshness or accuracy. */
export type SignalExecutionStatus='completed'|'partial'|'unavailable'|'not-run'|'legacy-unverified';
export interface SignalExecutionReceipt {status:SignalExecutionStatus;method:string;scope?:'whole-source'|'sampled-source'}
export type MultimodalSignalEvidence=Record<'sceneCuts'|'silence'|'audioVolume'|'faces',SignalExecutionReceipt>;
export function unverifiedMultimodalSignals():MultimodalSignalEvidence {
 return Object.fromEntries(['sceneCuts','silence','audioVolume','faces'].map(key=>[key,{status:'legacy-unverified',method:'unknown'}])) as MultimodalSignalEvidence;
}
