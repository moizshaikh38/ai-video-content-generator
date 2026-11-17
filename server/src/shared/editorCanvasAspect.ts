import {designCanvas} from './renderResolution.js';
/** Known editor aspects use the same canonical design space as the renderer.
 * Preserve all non-geometric canvas settings. Unknown/custom ratios stay intact.
 */
export function normalizeEditorCanvasAspect<T extends {aspect_ratio?:string;width?:number;height?:number}>(canvas:T):T {
 if(!['9:16','1:1','16:9'].includes(canvas.aspect_ratio||''))return {...canvas};
 return {...canvas,...designCanvas(canvas.aspect_ratio!)};
}
