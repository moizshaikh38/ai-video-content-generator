/**
 * VireoClip YouTube Thumbnail Studio Service
 *
 * Implements Phase 8: YouTube Thumbnail Studio (1280x720).
 * Produces high-CTR thumbnail specifications and FFmpeg rendering filter graphs
 * adhering strictly to the YouTube 50-character mobile title truncation limit
 * and the bottom-right timestamp badge safe zone.
 */

export type YouTubeThumbnailStyle =
  | 'bold_text_face'
  | 'cinematic_minimal'
  | 'high_contrast_curiosity';

export interface YouTubeThumbnailSpec {
  title: string;
  originalTitle: string;
  isClamped: boolean;
  style: YouTubeThumbnailStyle;
  width: 1280;
  height: 720;
  facePlacement: 'left' | 'right' | 'center';
  textPosition: {
    x: number;
    y: number;
    maxWidth: number;
    alignment: 'left' | 'center' | 'right';
  };
  typography: {
    fontFamily: string;
    fontSize: number;
    fontWeight: 'bold' | 'extra-bold' | 'black';
    textColor: string;
    strokeColor?: string;
    strokeWidth?: number;
    shadowColor?: string;
    shadowOffset?: number;
  };
  safeZones: {
    timestampBadgeAvoided: boolean;
    marginAvoidance: { left: number; right: number; top: number; bottom: number };
  };
}

export class ThumbnailStudioService {
  public static readonly MOBILE_TITLE_LIMIT = 50;
  public static readonly TIMESTAMP_BADGE_WIDTH = 180;
  public static readonly TIMESTAMP_BADGE_HEIGHT = 60;
  public static readonly CANVAS_WIDTH = 1280;
  public static readonly CANVAS_HEIGHT = 720;

  /**
   * Clamps a title string to the empirical YouTube mobile 50-character limit,
   * breaking cleanly at the last space before the boundary.
   */
  public static clampMobileTitle(rawTitle: string): { title: string; isClamped: boolean } {
    if (!rawTitle) return { title: '', isClamped: false };

    const sanitized = rawTitle.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (sanitized.length <= this.MOBILE_TITLE_LIMIT) {
      return { title: sanitized, isClamped: false };
    }

    // Truncate at word boundary
    const truncated = sanitized.substring(0, this.MOBILE_TITLE_LIMIT - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    const boundaryText = lastSpace > 20 ? truncated.substring(0, lastSpace) : truncated;

    return {
      title: `${boundaryText.trim()}...`,
      isClamped: true,
    };
  }

  /**
   * Generates a YouTube 1280x720 thumbnail specification conforming to safe zones
   */
  public static generateThumbnailSpec(options: {
    title: string;
    style?: YouTubeThumbnailStyle;
    facePlacement?: 'left' | 'right' | 'center';
  }): YouTubeThumbnailSpec {
    const { title: rawTitle, style = 'bold_text_face', facePlacement = 'right' } = options;
    const { title, isClamped } = this.clampMobileTitle(rawTitle);

    const safeMargin = { left: 80, right: 80, top: 60, bottom: 80 };

    // Text position based on face placement to avoid occluding face
    let textX = safeMargin.left;
    let textY = 160;
    let maxWidth = 640;
    let alignment: 'left' | 'center' | 'right' = 'left';

    if (style === 'bold_text_face') {
      if (facePlacement === 'right') {
        // Face is on right (640..1200) -> text on left (80..620)
        textX = safeMargin.left;
        textY = 200;
        maxWidth = 560;
        alignment = 'left';
      } else if (facePlacement === 'left') {
        // Face is on left (80..640) -> text on right (640..1200)
        textX = 640;
        textY = 180;
        maxWidth = 520; // leaves space before bottom-right timestamp badge
        alignment = 'left';
      } else {
        // Face is center -> text at top center
        textX = 640;
        textY = 90;
        maxWidth = 900;
        alignment = 'center';
      }
    } else if (style === 'cinematic_minimal') {
      textX = 640;
      textY = 520;
      maxWidth = 800;
      alignment = 'center';
    } else if (style === 'high_contrast_curiosity') {
      textX = safeMargin.left;
      textY = 180;
      maxWidth = 600;
      alignment = 'left';
    }

    // Verify timestamp badge avoidance (bottom-right: 1100..1280 x 660..720)
    // If text is on right and low, pull textY up above 600px
    if (textX + maxWidth > 1050 && textY + 120 > 620) {
      textY = 480;
    }

    // Typography setup
    let typography: YouTubeThumbnailSpec['typography'];
    switch (style) {
      case 'high_contrast_curiosity':
        typography = {
          fontFamily: 'Arial Black',
          fontSize: 76,
          fontWeight: 'black',
          textColor: '#FFE600', // Neon yellow
          strokeColor: '#000000',
          strokeWidth: 6,
          shadowColor: '#000000CC',
          shadowOffset: 4,
        };
        break;

      case 'cinematic_minimal':
        typography = {
          fontFamily: 'Inter',
          fontSize: 54,
          fontWeight: 'bold',
          textColor: '#FFFFFF',
          strokeColor: '#0F172A',
          strokeWidth: 2,
          shadowColor: '#00000088',
          shadowOffset: 2,
        };
        break;

      case 'bold_text_face':
      default:
        typography = {
          fontFamily: 'Arial Black',
          fontSize: 80,
          fontWeight: 'black',
          textColor: '#FFFFFF',
          strokeColor: '#000000',
          strokeWidth: 5,
          shadowColor: '#000000AA',
          shadowOffset: 3,
        };
        break;
    }

    return {
      title,
      originalTitle: rawTitle,
      isClamped,
      style,
      width: 1280,
      height: 720,
      facePlacement,
      textPosition: {
        x: textX,
        y: textY,
        maxWidth,
        alignment,
      },
      typography,
      safeZones: {
        timestampBadgeAvoided: true,
        marginAvoidance: safeMargin,
      },
    };
  }

  /**
   * Generates the FFmpeg filter complex string to render the 1280x720 thumbnail
   */
  public static buildThumbnailFilter(spec: YouTubeThumbnailSpec): string {
    const escapedText = spec.title
      .replace(/'/g, "'\\''")
      .replace(/:/g, '\\:')
      .replace(/%/g, '\\%');

    const drawTextParts: string[] = [
      `text='${escapedText}'`,
      `fontsize=${spec.typography.fontSize}`,
      `fontcolor=${spec.typography.textColor}`,
    ];

    if (spec.typography.strokeColor && spec.typography.strokeWidth) {
      drawTextParts.push(`bordercolor=${spec.typography.strokeColor}`);
      drawTextParts.push(`borderw=${spec.typography.strokeWidth}`);
    }

    if (spec.typography.shadowColor && spec.typography.shadowOffset) {
      drawTextParts.push(`shadowcolor=${spec.typography.shadowColor}`);
      drawTextParts.push(`shadowx=${spec.typography.shadowOffset}`);
      drawTextParts.push(`shadowy=${spec.typography.shadowOffset}`);
    }

    if (spec.textPosition.alignment === 'center') {
      drawTextParts.push(`x=(w-text_w)/2`);
    } else {
      drawTextParts.push(`x=${spec.textPosition.x}`);
    }
    drawTextParts.push(`y=${spec.textPosition.y}`);

    const drawTextFilter = `drawtext=${drawTextParts.join(':')}`;

    if (spec.style === 'cinematic_minimal') {
      // Scale to 1280x720 + subtle vignette + drawtext
      return `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,vignette=PI/4,${drawTextFilter}`;
    }

    return `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,${drawTextFilter}`;
  }
}
