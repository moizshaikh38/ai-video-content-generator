import {DEFAULT_RENDER_RESOLUTION,parseRenderResolutionStrict,type RenderResolution} from './renderResolution.js';
/** The configured next export is authoritative. A prior completed request is
 * only a fallback for legacy clips without a configured tier. */
export function initialExportResolution(clip:{render_resolution?:unknown;render_resolution_requested?:unknown}|null|undefined):RenderResolution{
 return parseRenderResolutionStrict(clip?.render_resolution)
  ??parseRenderResolutionStrict(clip?.render_resolution_requested)
  ??DEFAULT_RENDER_RESOLUTION;
}
