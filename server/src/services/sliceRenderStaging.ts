import type {CompiledRenderGraph} from './proEditorService.js';

export interface SliceRenderStagingPlan {
  stages:Array<{inputArgs:string[];filterComplex:string[];videoMap:string;audioMap:string;outputPath:string;codecArgs:string[]}>;
  finalGraph:CompiledRenderGraph;
}
/** Offline qualification boundary, not a normal export strategy. Stage at most
 * twelve ordinary cuts to lossless FFV1 + float PCM. Reject rather than guess at
 * transitions, synthetic sources, overlays/music inputs or dynamic-normalized
 * external dialogue. Global captions and audio filters remain in the final pass.
 * The caller owns subprocess deadlines, cleanup, disk limits and final encoding.
 */
export function buildSliceRenderStaging(graph:CompiledRenderGraph,paths:string[]):SliceRenderStagingPlan|null {
 const staging=graph.sliceStaging;
 if(!staging||graph.inputArgs.length!==2||graph.inputArgs[0]!=='-i'||staging.stages.length<2||staging.stages.length>12||paths.length!==staging.stages.length||new Set(paths).size!==paths.length||paths.some(p=>!p.endsWith('.nut'))||graph.measurement||graph.normalizationMode!==undefined||graph.filterComplex.some(chain=>chain.includes('loudnorm=')))return null;
 if(paths.includes(graph.inputArgs[1])||staging.stages.some((s,i)=>s.videoMap!==`[v_slice_${i}]`||s.audioMap!==`[a_slice_${i}]`)||JSON.stringify([...staging.stages.flatMap(s=>s.filterComplex),...staging.tailFilterComplex])!==JSON.stringify(graph.filterComplex)||staging.tailFilterComplex.some(chain=>/\[\d+:(?:a|v)\]/.test(chain)))return null;
 const expectedConcat=staging.stages.map(s=>s.videoMap+s.audioMap).join('')+`concat=n=${staging.stages.length}:v=1:a=1[base_v][base_a]`;
 if(staging.tailFilterComplex[0]!==expectedConcat)return null;
 const stages=staging.stages.map((stage,index)=>{
  return {...structuredClone(stage),inputArgs:[...graph.inputArgs],outputPath:paths[index],codecArgs:['-c:v','ffv1','-threads:v','1','-c:a','pcm_f32le','-f','nut']};
 });
 // Rebuild only the known compiler concat expression. Do not run label
 // substitution over later filters, where matching text may be user content.
 const filters=[stages.map((_,i)=>`[${i}:v][${i}:a]`).join('')+`concat=n=${stages.length}:v=1:a=1[base_v][base_a]`,...staging.tailFilterComplex.slice(1)];
 const {sliceStaging:_,...rest}=graph;
 return {stages,finalGraph:{...structuredClone(rest),inputArgs:paths.flatMap(p=>['-i',p]),filterComplex:filters}};
}
