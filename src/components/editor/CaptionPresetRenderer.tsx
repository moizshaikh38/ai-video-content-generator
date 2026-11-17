import React from 'react';
import { FONT_EM_PER_ASS_SIZE, getCaptionRollingGeometry, getPreviewCss, PreviewFrame, PreviewWord, ResolvedCaptionStyle } from '../../lib/captionPresets';

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
    <>
    <div
      data-selectable-item="true"
      className={`${className || ''} ${
        interactive
          ? 'pointer-events-auto cursor-grab select-none'
          : 'pointer-events-none'
      }`}
      style={{
        ...(css.container as React.CSSProperties),
        ...(frame.chipLayout || frame.rollingRows || frame.movingBoxLayout || style.backdropBand ? {lineHeight:0}:{}),
        ...((frame.chipLayout || frame.rollingRows || frame.movingBoxLayout) && (frame.positionX!==undefined||frame.positionY!==undefined)?{textAlign:'center'}:{}),
        opacity: frame.opacity,
        ...(interactive ? { pointerEvents: 'auto' } : {}),
        ...(frame.positionX !== undefined || frame.positionY !== undefined
          ? {
              // Bottom-edge anchored at positionY, matching the exported ASS \an2 + \pos semantics.
              left: `${((frame.positionX ?? 0.5) * 100).toFixed(2)}%`,
              top: `${((frame.positionY ?? 0.667) * 100).toFixed(2)}%`,
              right: 'auto',
              bottom: 'auto',
              // Keep paragraph width unchanged when its anchor moves right.
              width: `${Math.max(1, style.playResX - style.marginL - style.marginR) * scale}px`,
              transform: frame.positionAnchor === 'center' ? 'translate(-50%, -50%)' : 'translate(-50%, -100%)',
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
        data-caption-cue-motion={frame.stampMotion?frame.cueMotionKind:undefined}
        style={{position:'relative',display:'inline-block',...(style.backdropBand?{width:'100%'}:{}),...(frame.stampMotion?{transform:`translateX(${('offsetX' in frame.stampMotion?frame.stampMotion.offsetX:0)*scale}px) rotate(${frame.stampMotion.rotation}deg) scale(${frame.stampMotion.scale})`,transformOrigin:frame.stampOrigin??'center bottom',opacity:frame.stampMotion.opacity,transition:'none'}:{})}}
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
        {style.backdropBand && <div data-caption-backdrop-band="true" style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:(style.playResX-style.backdropBand.insetX*2)*scale,height:(style.fontSize*lines.filter(l=>l.length>0).length+style.backdropBand.paddingY*2)*scale,backgroundColor:style.backdropBand.color,opacity:style.backdropBand.opacity}}/>}
        {frame.chipLayout ? (()=>{
          const l=frame.chipLayout;
          return <div data-caption-chips="true" style={{position:'relative',width:l.width*scale,height:l.height*scale}}>
            {l.targets.map((target,index)=>{const st=frame.chipStates![index];return <div key={index} style={{position:'absolute',left:target.x*scale,top:(target.y+st.offsetY)*scale,transform:`scale(${st.scale})`}}>
              <div style={{position:'absolute',left:-target.width*scale/2,top:-target.height*scale/2,width:target.width*scale,height:target.height*scale,borderRadius:style.chips!.radius*scale,backgroundColor:st.color}}/>
              {l.glyphs.filter(g=>g.wordIndex===index).map((g,i)=><span key={i} style={{...css.line as React.CSSProperties,position:'absolute',whiteSpace:'pre',left:(g.x-target.x)*scale,top:(g.line*l.lineHeight-target.y)*scale+parseFloat(String(css.line.top??0)),fontKerning:'none',fontVariantLigatures:'none',fontSize:css.line.fontSize}}>{g.text}</span>)}
            </div>})}
          </div>;
        })() : frame.movingBoxLayout ? (()=>{
          const l=frame.movingBoxLayout,b=frame.movingBoxState;
          return <div data-caption-moving-box="true" style={{position:'relative',width:l.width*scale,height:l.height*scale}}>
            {b&&style.movingBox&&<div style={{position:'absolute',left:b.x*scale,top:b.y*scale,width:b.width*scale,height:b.height*scale,transform:`translate(-50%,-50%) scale(${b.scale})`,borderRadius:style.movingBox.radius*scale,backgroundColor:style.movingBox.color}}/>}
            {l.glyphs.map((g,i)=><span key={i} style={{...css.line as React.CSSProperties,position:'absolute',whiteSpace:'pre',left:g.x*scale,top:g.line*l.lineHeight*scale+parseFloat(String(css.line.top??0)),fontKerning:'none',fontVariantLigatures:'none',fontSize:css.line.fontSize}}>{g.text}</span>)}
          </div>;
        })() : frame.rollingRows ? (()=>{
          const g=getCaptionRollingGeometry({position_x:frame.positionX,position_y:frame.positionY},style);
          return <div data-caption-rolling-rows="true" style={{position:'relative',width:g.width*scale,height:g.height*scale}}>
            {frame.rollingRows.map((row,index)=><div key={`${row.chunkId}:${index}`} data-caption-row={row.row} style={{...css.line as React.CSSProperties,position:'absolute',whiteSpace:'nowrap',left:(g.width/2+(row.row===0?-g.stagger:g.stagger))*scale,top:(row.row*g.lineHeight+row.offsetY)*scale+parseFloat(String(css.line.top??0)),transform:'translateX(-50%)',opacity:row.opacity}}>
              {style.shadowLayers?.map((l,i)=><span key={i} style={{position:'absolute',left:(l.x??0)*scale,top:l.y*scale,color:l.color,opacity:l.opacity,fontSize:css.line.fontSize}}>{row.text}</span>)}
              <span style={{...css.word({text:row.text,highlighted:false,active:false,scale:1,breakAfter:false}) as React.CSSProperties,position:'relative'}}>{row.text}</span>
            </div>)}
          </div>;
        })() : lines
          .filter((l) => l.length > 0)
          .map((line, li) => (
            <div key={li} style={{ ...(css.line as React.CSSProperties), ...(noWrap ? { whiteSpace: 'nowrap' } : null) }}>
              <span style={{...css.lineBox as React.CSSProperties,fontSize:css.line.fontSize}}>
                {line.map((w, wi) => (
                  <React.Fragment key={wi}>
                    {wi > 0 && ' '}
                    {style.caretColor || style.shadowLayers?.length ? <span style={{position:'relative',display:'inline-block',fontSize:css.line.fontSize}}>
                      {style.shadowLayers?.map((layer,idx)=><span key={idx} data-caption-shadow-layer={idx} style={{...css.word(w) as React.CSSProperties,position:'absolute',left:(layer.x??0)*scale,top:layer.y*scale,color:layer.color,opacity:(w.opacity??1)*layer.opacity*(frame.stampMotion&&'layerOpacity' in frame.stampMotion?frame.stampMotion.layerOpacity:1),WebkitTextStroke:'0 transparent',textShadow:'none'}}>{w.text}</span>)}
                      <span style={{...css.word(w) as React.CSSProperties,position:'relative'}}>{w.text}</span>
                      {w.caretActive && style.caretColor && frame.caret && <span data-caption-caret="true" style={{position:'absolute',pointerEvents:'none',left:(w.visibleCharacters ?? 0)*(style.fontSize*FONT_EM_PER_ASS_SIZE[style.fontFamily]*.6+style.letterSpacing)*scale,top:style.fontSize*.30*scale,width:frame.caret.width*scale,height:frame.caret.height*scale,backgroundColor:style.caretColor}}/>}
                    </span> : <span style={css.word(w) as React.CSSProperties}>{w.text}</span>}
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
    </>
  );
};
