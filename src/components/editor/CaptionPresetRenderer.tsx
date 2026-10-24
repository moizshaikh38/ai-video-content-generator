import React from 'react';
import { getPreviewCss, PreviewFrame, PreviewWord, ResolvedCaptionStyle } from '../../lib/captionPresets';

interface CaptionPresetRendererProps {
  style: ResolvedCaptionStyle;
  frame: PreviewFrame | null;
  /** CSS px per ASS unit: frame width in px / style.playResX. */
  scale: number;
  className?: string;
  /** Keep the preset's explicit line breaks only (gallery cards); export lines never re-wrap there. */
  noWrap?: boolean;
  interactive?: boolean;
  isSelected?: boolean;
  isDragging?: boolean;
  isInDangerZone?: boolean;
  showResizeHandles?: boolean;
  onResizeHandlePointerDown?: (corner: 'nw' | 'ne' | 'sw' | 'se', e: React.PointerEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Draws one caption frame with the same geometry as the exported ASS (margins, anchor,
 * font metrics, outline, shadow, box, active-word scale). Used by the gallery cards and
 * the editor preview so both show what export burns in.
 */
export const CaptionPresetRenderer: React.FC<CaptionPresetRendererProps> = ({
  style,
  frame,
  scale,
  className,
  noWrap,
  interactive,
  isSelected,
  isDragging,
  isInDangerZone,
  showResizeHandles,
  onResizeHandlePointerDown,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClick,
}) => {
  if (!frame || frame.words.length === 0) return null;
  const css = getPreviewCss(style, scale);

  const lines: PreviewWord[][] = [[]];
  for (const w of frame.words) {
    lines[lines.length - 1].push(w);
    if (w.breakAfter) lines.push([]);
  }

  return (
    <div
      data-selectable-item="true"
      className={`${className || ''} ${
        interactive
          ? 'pointer-events-auto cursor-grab select-none'
          : 'pointer-events-none'
      }`}
      style={{
        ...(css.container as React.CSSProperties),
        opacity: frame.opacity,
        ...(interactive ? { pointerEvents: 'auto' } : {}),
        ...(frame.positionX !== undefined || frame.positionY !== undefined
          ? {
              left: `${((frame.positionX ?? 0.5) * 100).toFixed(2)}%`,
              top: `${((frame.positionY ?? 0.667) * 100).toFixed(2)}%`,
              right: 'auto',
              bottom: 'auto',
              transform: 'translate(-50%, -50%)',
            }
          : {}),
      }}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
    >
      <div
        className={`relative inline-block transition-all ${
          isDragging
            ? 'cursor-grabbing opacity-90'
            : isInDangerZone
            ? 'ring-2 ring-rose-500 rounded-xl'
            : isSelected
            ? 'ring-2 ring-white/30 rounded-xl shadow-lg'
            : interactive
            ? 'hover:ring-1 hover:ring-white/30 rounded-xl'
            : ''
        }`}
      >
        {lines
          .filter((l) => l.length > 0)
          .map((line, li) => (
            <div key={li} style={{ ...(css.line as React.CSSProperties), ...(noWrap ? { whiteSpace: 'nowrap' } : null) }}>
              <span style={css.lineBox as React.CSSProperties}>
                {line.map((w, wi) => (
                  <React.Fragment key={wi}>
                    {wi > 0 && ' '}
                    <span style={css.word(w) as React.CSSProperties}>{w.text}</span>
                  </React.Fragment>
                ))}
              </span>
            </div>
          ))}

        {/* CORNER RESIZE HANDLES FOR FONT SIZE SCALING */}
        {showResizeHandles && isSelected && !isDragging && (
          <>
            <div
              onPointerDown={(e) => onResizeHandlePointerDown?.('nw', e)}
              className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-black/60 rounded-sm cursor-nwse-resize shadow-md z-30 pointer-events-auto"
              title="Drag to Scale Font Size"
            />
            <div
              onPointerDown={(e) => onResizeHandlePointerDown?.('ne', e)}
              className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-black/60 rounded-sm cursor-nesw-resize shadow-md z-30 pointer-events-auto"
              title="Drag to Scale Font Size"
            />
            <div
              onPointerDown={(e) => onResizeHandlePointerDown?.('sw', e)}
              className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-black/60 rounded-sm cursor-nesw-resize shadow-md z-30 pointer-events-auto"
              title="Drag to Scale Font Size"
            />
            <div
              onPointerDown={(e) => onResizeHandlePointerDown?.('se', e)}
              className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-black/60 rounded-sm cursor-nwse-resize shadow-md z-30 pointer-events-auto"
              title="Drag to Scale Font Size"
            />
          </>
        )}
      </div>
    </div>
  );
};
