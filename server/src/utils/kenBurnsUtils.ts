/**
 * VireoClip Ken Burns Motion Utilities
 *
 * Implements Phase 7: Ken Burns Motion Effect for AI Image B-Roll.
 * Generates deterministic FFmpeg zoompan filter expressions to animate
 * static AI-generated images into dynamic 9:16 or 16:9 cinematic video clips.
 */

export type KenBurnsMotionStyle =
  | 'slow_zoom_in'
  | 'slow_zoom_out'
  | 'pan_left_to_right'
  | 'pan_right_to_left';

export interface KenBurnsFilterOptions {
  motion: KenBurnsMotionStyle;
  durationSec: number;
  fps?: number;
  outputWidth?: number;
  outputHeight?: number;
  zoomFactor?: number; // Target max zoom (default 1.20)
}

export class KenBurnsUtils {
  /**
   * Sanitizes prompt for AI image B-roll generation
   */
  public static sanitizePrompt(prompt: string): string {
    if (!prompt) return 'cinematic modern background';
    return prompt
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/["'\\]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 300);
  }

  /**
   * Builds an FFmpeg zoompan filter string for cinematic image animation.
   * Ensures output conforms to canvas aspect ratio (e.g. 1080x1920).
   */
  public static buildKenBurnsFilter(options: KenBurnsFilterOptions): string {
    const {
      motion,
      durationSec,
      fps = 30,
      outputWidth = 1080,
      outputHeight = 1920,
      zoomFactor = 1.20,
    } = options;

    const clampedDuration = Math.max(1.0, Math.min(30.0, durationSec));
    const totalFrames = Math.max(1, Math.round(clampedDuration * fps));
    const targetZoom = Math.max(1.05, Math.min(1.5, zoomFactor));
    const zoomStep = Number(((targetZoom - 1.0) / totalFrames).toFixed(6));

    switch (motion) {
      case 'slow_zoom_in':
        // Progressively increases zoom from 1.0 to targetZoom centered on canvas
        return `zoompan=z='min(zoom+${zoomStep},${targetZoom})':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${outputWidth}x${outputHeight}:fps=${fps}`;

      case 'slow_zoom_out':
        // Starts at targetZoom and steps down to 1.0
        return `zoompan=z='if(lte(zoom,1.0),${targetZoom},max(1.001,zoom-${zoomStep}))':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${outputWidth}x${outputHeight}:fps=${fps}`;

      case 'pan_left_to_right': {
        // Zoomed in slightly, moving x position from 0 to max x offset
        const panZoom = 1.15;
        const xStep = `(iw-iw/zoom)/${totalFrames}`;
        return `zoompan=z=${panZoom}:x='min(x+${xStep},iw-iw/zoom)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${outputWidth}x${outputHeight}:fps=${fps}`;
      }

      case 'pan_right_to_left': {
        const panZoom = 1.15;
        const xStep = `(iw-iw/zoom)/${totalFrames}`;
        return `zoompan=z=${panZoom}:x='if(lte(on,1),iw-iw/zoom,max(0,x-${xStep}))':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${outputWidth}x${outputHeight}:fps=${fps}`;
      }

      default:
        return `zoompan=z='min(zoom+${zoomStep},${targetZoom})':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${outputWidth}x${outputHeight}:fps=${fps}`;
    }
  }

  /**
   * Generates a complete FFmpeg filter chain to turn a static image into a high-quality video clip
   */
  public static buildStaticImageToVideoFilter(options: KenBurnsFilterOptions): string {
    const { outputWidth = 1080, outputHeight = 1920 } = options;
    const zoomFilter = this.buildKenBurnsFilter(options);
    // Pre-scale image to 1.25x canvas to avoid pixelation during zoom
    const preScaleW = Math.round(outputWidth * 1.25);
    const preScaleH = Math.round(outputHeight * 1.25);
    return `scale=${preScaleW}:${preScaleH}:force_original_aspect_ratio=increase,crop=${preScaleW}:${preScaleH},${zoomFilter},format=yuv420p`;
  }
}
