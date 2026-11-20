import React, { useLayoutEffect, useRef, useState } from 'react';
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


/** Allowlist: only colour/highlightColor custom styles qualify; any other key (size, effect, pill, case, ...) keeps the HTML stroke. */
const plainWordStyle = (c?: object) =>
  !c || Object.entries(c as Record<string, unknown>).every(([k, v]) => v === undefined || ((k === 'color' || k === 'highlightColor') && typeof v === 'string'));

/** Round-join outline for one word. HTML text stroke uses miter joins (spikes on sharp glyph apexes);
 * the outline is drawn as SVG text with round joins behind the normal glyphs. The SVG is placed from the
 * baseline of a zero-height probe in the same span, divided by the accumulated ancestor scale. If any ancestor
 * is rotated, skewed or non-uniformly scaled the baseline cannot be recovered exactly, so the word keeps the
 * HTML stroke. The caller qualifies the word; everything else keeps the HTML stroke. */
const ancestorScale = (el: HTMLElement): number | null => {
  let k = 1;
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const t = getComputedStyle(n).transform;
    if (!t || t === 'none') continue;
    const mm = /^matrix\(([^)]+)\)$/.exec(t);
    if (!mm) return null;
    const [a, b, c, d] = mm[1].split(',').map(parseFloat);
    if (![a, b, c, d].every(Number.isFinite) || Math.abs(b) > 1e-4 || Math.abs(c) > 1e-4 || Math.abs(a - d) > 1e-4 || a <= 0) return null;
    k *= a;
  }
  return k;
};
const typographyKey = (o: HTMLElement) => {
  const cs = getComputedStyle(o);
  return [cs.fontFamily, cs.fontSize, cs.fontWeight, cs.fontStyle, cs.letterSpacing, cs.wordSpacing, cs.lineHeight, cs.textTransform, cs.fontKerning, cs.fontVariantLigatures, cs.whiteSpace].join('|');
};

const RoundOutlineWord: React.FC<{ css: React.CSSProperties; text: string; roundOutline: boolean }> = ({ css, text, roundOutline }) => {
  const outer = useRef<HTMLSpanElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const lastKey = useRef('');
  const lastSupported = useRef(true);
  const textRef = useRef(text);
  textRef.current = text;
  const measureRef = useRef<() => void>(() => {});
  const [m, setM] = useState<{ w: number; h: number; b: number } | null>(null);
  const parsed = /^([\d.]+)px\s+(.+)$/.exec(String((css as any).WebkitTextStroke || ''));
  const c: any = css;
  const hasBoxLike = !!(c.padding || c.paddingLeft || c.paddingRight || c.background || c.backgroundColor || c.borderRadius || c.border);
  const active = roundOutline && !!parsed && !hasBoxLike;
  useLayoutEffect(() => {
    if (!active) { setM(null); return; }
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const o = outer.current, pr = probe.current;
      if (!o || !pr) return;
      const k = ancestorScale(o);
      if (k === null) { setM(null); return; }
      const cs = getComputedStyle(o);
      const w = parseFloat(cs.width), h = parseFloat(cs.height);
      if (!(w > 0) || !(h > 0)) return;
      const b = (pr.getBoundingClientRect().top - o.getBoundingClientRect().top) / k;
      lastKey.current = typographyKey(o) + '|' + textRef.current;
      setM((prev) => (prev && Math.abs(prev.w - w) < .01 && Math.abs(prev.h - h) < .01 && Math.abs(prev.b - b) < .01 ? prev : { w, h, b }));
    };
    measureRef.current = measure;
    measure();
    const fonts: any = (document as any).fonts;
    fonts?.ready?.then(measure);
    fonts?.addEventListener?.('loadingdone', measure);
    const ro = typeof ResizeObserver !== 'undefined' && outer.current ? new ResizeObserver(measure) : null;
    if (ro && outer.current) ro.observe(outer.current);
    // Transform/class/style changes on the caption's ancestors (up to its selectable wrapper) change eligibility without a size change.
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => { const o = outer.current; if (!o) return; const sup = ancestorScale(o) !== null; if (sup !== lastSupported.current) { lastSupported.current = sup; measure(); } }) : null;
    if (mo) for (let n: HTMLElement | null = outer.current?.parentElement || null; n; n = n.parentElement) { mo.observe(n, { attributes: true, attributeFilter: ['style', 'class'] }); if (n.hasAttribute('data-selectable-item')) break; }
    return () => { cancelled = true; ro?.disconnect(); mo?.disconnect(); fonts?.removeEventListener?.('loadingdone', measure); };
  }, [active]);
  // Cheap per-commit check of the RESOLVED typography (inherited from the line too): re-measure only if it changed or text changed.
  useLayoutEffect(() => {
    if (!active || !outer.current) return;
    const key = typographyKey(outer.current) + '|' + text;
    const supported = ancestorScale(outer.current) !== null;
    // Supported path: ancestors above the caption wrapper only change transform through React state in PreviewCanvas
    // (canvas fitScale, item translate/scale/rotate), which re-renders this component, so this commit check covers them.
    // The observer covers only the wrapper chain; out-of-band style/class edits above it are not supported.
    // Entering/leaving an unsupported (rotated/skewed/non-uniform) ancestor transform drops or restores the SVG immediately.
    if (key !== lastKey.current || supported !== (lastSupported.current)) { lastSupported.current = supported; measureRef.current(); }
  });
  if (!active || !parsed) return <span style={css}>{text}</span>;
  const { WebkitTextStroke: _s, paintOrder: _p, ...rest } = css as any;
  return (
    <span ref={outer} style={m ? { ...rest, position: 'relative' } : { ...(css as any), position: 'relative' }}>
      {m && (
        <svg aria-hidden="true" width={m.w} height={m.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
          <text x={0} y={m.b} xmlSpace="preserve" fill="none" stroke={parsed[2]} strokeWidth={parseFloat(parsed[1])} strokeLinejoin="round" strokeLinecap="round" style={{ textShadow: 'none', whiteSpace: 'pre' }}>{text}</text>
        </svg>
      )}
      <span style={{ position: 'relative' }}>{text}</span>
      <span ref={probe} aria-hidden="true" style={{ display: 'inline-block', width: 0, height: 0 }} />
    </span>
  );
};

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
          const g=getCaptionRollingGeometry({position_x:frame.positionX,position_y:frame.positionY,position_anchor:frame.positionAnchor},style);
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
                      <RoundOutlineWord roundOutline={false} text={w.text} css={{...css.word(w) as React.CSSProperties,position:'relative'}}/>
                      {w.caretActive && style.caretColor && frame.caret && <span data-caption-caret="true" style={{position:'absolute',pointerEvents:'none',left:(w.visibleCharacters ?? 0)*(style.fontSize*FONT_EM_PER_ASS_SIZE[style.fontFamily]*.6+style.letterSpacing)*scale,top:style.fontSize*.30*scale,width:frame.caret.width*scale,height:frame.caret.height*scale,backgroundColor:style.caretColor}}/>}
                    </span> : <RoundOutlineWord roundOutline={style.presetId==='vireo_comic_default'&&style.cueMotion==='comic'&&!style.box&&!style.caretColor&&!style.shadowLayers?.length&&!style.activeWordBox&&w.visibleCharacters===undefined&&plainWordStyle(w.customStyle)} text={w.text} css={css.word(w) as React.CSSProperties}/>}
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
