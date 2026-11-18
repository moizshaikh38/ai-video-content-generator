/** Attempts count acquired executions, not the enqueue operation. Missing legacy
 * counts start at zero; malformed values fail closed rather than retry forever.
 */
export function renderRetryBudget(job:{attempts?:unknown;max_attempts?:unknown;[key:string]:unknown}){
 const attempts=job.attempts===undefined||job.attempts===null?0:Number.isSafeInteger(job.attempts)&&Number(job.attempts)>=0?Number(job.attempts):Number.MAX_SAFE_INTEGER;
 const maximum=job.max_attempts===undefined||job.max_attempts===null?3:Number.isSafeInteger(job.max_attempts)&&Number(job.max_attempts)>=0?Number(job.max_attempts):0;
 return{attempts,maximum,available:attempts<maximum};
}
const valid=(field:string)=>({$and:[{$isNumber:field},{$gte:[field,0]},{$lte:[field,Number.MAX_SAFE_INTEGER]},{$eq:[field,{$trunc:{$convert:{input:field,to:'double',onError:-1,onNull:-1}}}]}]});
const normalized=(field:string,fallback:number,invalid:number)=>({$cond:[{$eq:[{$ifNull:[field,null]},null]},fallback,{$cond:[valid(field),field,invalid]}]});
export const renderBudgetAvailableExpr={$lt:[normalized('$attempts',0,Number.MAX_SAFE_INTEGER),normalized('$max_attempts',3,0)]};
export const renderBudgetExhaustedExpr={$not:[renderBudgetAvailableExpr]};
