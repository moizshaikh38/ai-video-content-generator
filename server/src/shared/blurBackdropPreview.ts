/** Preview approximation to the existing FFmpeg boxblur=r:5 / eq chain.
 * Keep CSS lengths in design-canvas coordinates, not viewport pixels.
 * Five radius-25 box passes have variance 5*r*(r+1)/3 at 1080 wide.
 * SVG sRGB additive transfer is closer than CSS multiplicative brightness.
 * Browser edge handling and FFmpeg YUV/box blur still differ; not pixel parity.
 */
export function previewBackdropBlurPx(designWidth:number):number {
 const width=Number.isFinite(designWidth)&&designWidth>0?designWidth:360;
 return Math.sqrt(5*25*26/3)*width/1080;
}
export const PREVIEW_BACKDROP_COLOR_MATRIX='.95 0 0 0 -.125 0 .95 0 0 -.125 0 0 .95 0 -.125 0 0 0 1 0';
