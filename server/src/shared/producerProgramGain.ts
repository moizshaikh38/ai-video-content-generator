import type{EditorProject}from'../types/index.js';
/** Producer gain_db is an absolute post-normalization program gain, not a
 * percentage or a multiplier on an already saved gain. Refuse editor limits. */
export function producerProgramGain(parameters:{gain_db?:number;target_lufs?:number}):number{
 if(!parameters||typeof parameters!=='object'||Array.isArray(parameters))throw Error('invalid-normalization');
 const db=parameters.gain_db===undefined?0:parameters.gain_db,target=parameters.target_lufs===undefined?-16:parameters.target_lufs;
 if(typeof db!=='number'||!Number.isFinite(db)||db < -20||db>20||target!==-16)throw Error('unsupported-normalization');
 const linear=10**(db/20);if(linear>2)throw Error('program-gain-exceeds-editor-limit');return linear;
}
export function applyProducerProgramGain(project:EditorProject,parameters:{gain_db?:number;target_lufs?:number}):number{
 const gain=producerProgramGain(parameters),track=project.tracks.find(t=>t.type==='VIDEO'&&!t.hidden),items=track?.items.filter(i=>!i.hidden)||[];
 if(!items.length||track?.locked||items.some(i=>i.locked)||project.tracks.some(t=>!t.hidden&&!t.muted&&t.items.some(i=>!i.hidden&&!i.muted&&i.audio?.enhancement&&i.audio.enhancement.preset!=='off')))throw Error('program-audio-needs-review');
 for(const item of items)item.audio={fade_in:.15,fade_out:.25,...item.audio,volume:gain,normalized:true,target_lufs:-16};
 return gain;
}
