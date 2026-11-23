/** Bounded timeline sampling. A single early cut must not replace coverage of
 * the rest of the video. Samples are not proof of absence between frames. */
export function multimodalKeyframeTimes(duration:number,maxFrames:number,cuts:number[]=[]):number[]{
 if(!Number.isFinite(duration)||duration<=0||!Number.isSafeInteger(maxFrames)||maxFrames<=0)return [];
 const cap=Math.min(120,maxFrames),edge=Math.min(.5,duration/4),first=edge,last=duration-edge;
 if(cap===1)return [Number((duration/2).toFixed(3))];
 const uniformBudget=Math.min(cap,12),uniform=Array.from({length:uniformBudget},(_,i)=>first+(last-first)*i/(uniformBudget-1));
 const unique=(values:number[])=>[...new Set(values.map(t=>Number(t.toFixed(3))))].sort((a,b)=>a-b);
 const baseline=unique(uniform),remaining=cap-baseline.length;
 const candidates=unique(cuts.filter(t=>typeof t==='number'&&Number.isFinite(t)&&t>=0&&t<duration)).filter(t=>!baseline.some(b=>Math.abs(b-t)<.001));
 if(candidates.length<=remaining)return unique([...baseline,...candidates]);
 // Preserve evenly distributed cut observations within the leftover budget.
 const picked=remaining===1?[candidates[Math.floor(candidates.length/2)]]:Array.from({length:remaining},(_,i)=>candidates[Math.round(i*(candidates.length-1)/(remaining-1))]);
 return unique([...baseline,...picked]);
}
/** Keep both ends when downstream OCR has a smaller budget than extraction. */
export function boundedKeyframeRows<T>(rows:T[],maxRows:number):T[]{
 if(!Array.isArray(rows)||!Number.isSafeInteger(maxRows)||maxRows<=0)return [];
 if(rows.length<=maxRows)return rows.slice();
 if(maxRows===1)return [rows[Math.floor(rows.length/2)]];
 return Array.from({length:maxRows},(_,i)=>rows[Math.round(i*(rows.length-1)/(maxRows-1))]);
}
