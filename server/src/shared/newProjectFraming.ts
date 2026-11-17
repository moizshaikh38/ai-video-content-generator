export interface NewProjectFraming {version:1;layout:'auto';autoReframe:boolean}
export const NEW_PROJECT_FRAMING:NewProjectFraming={version:1,layout:'auto',autoReframe:true};
/** Called only on creation. Never retrofit existing project/editor records. */
export function withNewProjectFraming<T extends object>(preferences:T):T&{framingDefaults:NewProjectFraming}{return {...preferences,framingDefaults:{...NEW_PROJECT_FRAMING,...((preferences as any).framingDefaults||{})}};}
export function normalizeFramingDefaults(value:any):NewProjectFraming|undefined{return value?.version===1&&value.layout==='auto'?{version:1,layout:'auto',autoReframe:value.autoReframe!==false}:undefined;}
