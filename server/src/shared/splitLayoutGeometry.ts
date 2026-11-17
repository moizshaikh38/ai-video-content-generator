/**
 * Normalized Split-Layout Geometry Contract
 *
 * Provides a single shared geometric definition and coordinate transformation
 * consumed consistently by:
 * 1. PreviewCanvas (CSS object/transform rendering)
 * 2. clipRenderService (export pipeline)
 * 3. proEditorService (NLE timeline export pipeline)
 * 4. buildSplitPodcastFilter (FFmpeg filter graph generator)
 *
 * Guarantees:
 * - Speaker 1 always maps to the top/first panel.
 * - Speaker 2 always maps to the bottom/second panel.
 * - Spatial left/right position never swaps speaker identity.
 * - Normalized source bounds { left, top, right, bottom } define the exact
 *   visible region of the source in [0, 1] coordinates.
 * - Both preview and export consume this shared geometry contract.
 */

export interface SplitSourceBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SplitPanelGeometry {
  x: number;
  y: number;
  windowW: number;
  windowH?: number;
  sourceBounds?: SplitSourceBounds;
}

export interface SplitLayoutGeometry {
  architecture: 'continuous' | 'horizontal_split' | 'vertical_split';
  fit: 'cover' | 'contain';
  speaker1: SplitPanelGeometry;
  speaker2: SplitPanelGeometry;
  speaker1TrackId?: string;
  speaker2TrackId?: string;
  dividerX?: number;
  dividerY?: number;
  unresolved?: boolean;
  unresolvedReason?: string;
}

/**
 * Derives normalized source-crop bounds and window height for one speaker panel
 * within a 9:16 dual-stacked split container (each panel aspect ratio = 9:8).
 */
export function computeSplitPanelBounds(options: {
  x: number;
  y: number;
  windowW: number;
  sourceWidth: number;
  sourceHeight: number;
  canvasWidth?: number;
  canvasHeight?: number;
}): {
  x: number;
  y: number;
  windowW: number;
  windowH: number;
  sourceBounds: SplitSourceBounds;
} {
  const {
    sourceWidth,
    sourceHeight,
    canvasWidth = 1080,
    canvasHeight = 1920,
  } = options;

  const cW = Number.isFinite(canvasWidth) && Number(canvasWidth) > 0 ? Number(canvasWidth) : 1080;
  const cH = Number.isFinite(canvasHeight) && Number(canvasHeight) > 0 ? Number(canvasHeight) : 1920;
  const halfH = Math.round(cH / 2);

  const clampW = Math.min(0.95, Math.max(0.05, options.windowW));
  const gx = Math.min(0.9, Math.max(0.1, options.x));
  const gy = Math.min(0.9, Math.max(0.1, options.y));

  // Scaled height for panel cover (matching buildSplitPodcastFilter logic):
  // When windowW of source width scales to canvasWidth, scaled height is:
  const rawH = Math.round((sourceHeight * cW) / (clampW * sourceWidth));
  const scaledHeight = Math.max(halfH, rawH % 2 === 0 ? rawH : rawH + 1);

  // Scaled dimensions under force_original_aspect_ratio=increase:
  const scaledWidth = Math.round(scaledHeight * (sourceWidth / sourceHeight));

  // Bounded crop offsets in scaled pixel space:
  const cropX = Math.min(Math.max(scaledWidth * gx - cW / 2, 0), Math.max(0, scaledWidth - cW));
  const cropY = Math.min(Math.max(scaledHeight * gy - halfH / 2, 0), Math.max(0, scaledHeight - halfH));

  // Normalized bounds on the original source [0, 1]:
  const left = cropX / scaledWidth;
  const top = cropY / scaledHeight;
  const right = Math.min(1.0, (cropX + cW) / scaledWidth);
  const bottom = Math.min(1.0, (cropY + halfH) / scaledHeight);

  const windowH = bottom - top;

  return {
    x: gx,
    y: gy,
    windowW: options.windowW,
    windowH,
    sourceBounds: { left, top, right, bottom },
  };
}

/**
 * Translates a normalized SplitPanelGeometry into CSS pixel properties for
 * preview rendering in PreviewCanvas.tsx.
 */
export function renderSplitPanelCss(options: {
  geometry: SplitPanelGeometry;
  sourceWidth: number;
  sourceHeight: number;
  boxW: number;
  boxH: number;
  canvasWidth?: number;
  canvasHeight?: number;
}): {
  left: string;
  top: string;
  width: string;
  height: string;
  panelH: number;
} {
  const {
    geometry,
    sourceWidth,
    sourceHeight,
    boxW,
    boxH,
    canvasWidth = 1080,
    canvasHeight = 1920,
  } = options;

  // Use provided sourceBounds or compute them from geometry with actual canvas dimensions:
  const bounds = geometry.sourceBounds ?? computeSplitPanelBounds({
    x: geometry.x,
    y: geometry.y,
    windowW: geometry.windowW,
    sourceWidth,
    sourceHeight,
    canvasWidth,
    canvasHeight,
  }).sourceBounds;

  const normW = Math.max(0.001, bounds.right - bounds.left);
  const normH = Math.max(0.001, bounds.bottom - bounds.top);

  const elW = boxW / normW;
  const elH = boxH / normH;
  const winL = bounds.left * elW;
  const winT = bounds.top * elH;

  return {
    left: `${(-winL).toFixed(1)}px`,
    top: `${(-winT).toFixed(1)}px`,
    width: `${elW.toFixed(1)}px`,
    height: `${elH.toFixed(1)}px`,
    panelH: boxH,
  };
}
