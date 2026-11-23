/** A consent binds this template canvas change to the currently locked visual
 * content. Never move locked content to fit; new locks/edits require a new ask. */
export function templateCanvasConsentKey(project:{canvas:{width?:number;height?:number;aspect_ratio?:string};tracks:Array<{id?:string;type:string;locked?:boolean;items:any[]}>},target:{width:number;height:number;aspect_ratio:string}):string|null{
 if(project.canvas.width===target.width&&project.canvas.height===target.height&&project.canvas.aspect_ratio===target.aspect_ratio)return null;
 const locked=project.tracks.filter(t=>t.type!=='AUDIO').flatMap(t=>t.items.filter(i=>t.locked||i.locked).map(i=>({trackId:t.id,trackLocked:Boolean(t.locked),item:i})));
 return locked.length?JSON.stringify({canvas:project.canvas,target,locked}):null;
}
