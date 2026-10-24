import React, { useState } from 'react';
import {
  SunMedium,
  Sparkles,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCcw,
  Type,
  Palette,
  Box,
} from 'lucide-react';
import { EditorCaptionItem } from '../../types';
import {
  CAPTION_RENDER_FONTS,
  ResolvedCaptionStyle,
} from '../../lib/captionPresets';

export interface CaptionStyleCustomizerProps {
  captionItem?: EditorCaptionItem;
  /** Present when the caption uses a gallery preset: controls then map 1:1 to export. */
  resolvedStyle?: ResolvedCaptionStyle | null;
  activeTab?: 'font' | 'effects' | 'customize';
  onChange: (updates: Partial<EditorCaptionItem>) => void;
}

const EXTENDED_FONTS: readonly string[] = [
  ...CAPTION_RENDER_FONTS,
  'Impact',
  'Montserrat',
  'Roboto',
  'Oswald',
].filter((v, i, a) => a.indexOf(v) === i);

const CURATED_COLORS = [
  '#FFFFFF',
  '#39FF14',
  '#FFE600',
  '#FF3B30',
  '#FF6B35',
  '#38BDF8',
  '#A855F7',
  '#000000',
];

export const CaptionStyleCustomizer: React.FC<CaptionStyleCustomizerProps> = ({
  captionItem,
  resolvedStyle,
  activeTab = 'customize',
  onChange,
}) => {
  const [activeColorChannel, setActiveColorChannel] = useState<'text' | 'active' | 'stroke' | 'box'>('text');

  // Resolved property values
  const isUppercase =
    captionItem?.uppercase ??
    resolvedStyle?.uppercase ??
    (captionItem?.style === 'bold' || captionItem?.style === 'karaoke' || captionItem?.style === 'highlight');

  const fontWeight =
    captionItem?.font_weight ??
    (resolvedStyle ? (resolvedStyle.bold ? 'bold' : 'regular') : 'bold');

  const fontFamily =
    captionItem?.font_family ??
    resolvedStyle?.fontFamily ??
    (captionItem?.style === 'bold' ? 'Arial Black' : 'Arial');

  const fontSize = captionItem?.font_size ?? resolvedStyle?.fontSize ?? 64;
  const letterSpacing = captionItem?.letter_spacing ?? resolvedStyle?.letterSpacing ?? 0;
  const alignment =
    captionItem?.alignment ??
    (resolvedStyle?.alignment === 1 || resolvedStyle?.alignment === 4 || resolvedStyle?.alignment === 7
      ? 'left'
      : resolvedStyle?.alignment === 3 || resolvedStyle?.alignment === 6 || resolvedStyle?.alignment === 9
      ? 'right'
      : 'center');

  const primaryColor = captionItem?.primary_color ?? resolvedStyle?.textColor ?? '#FFFFFF';
  const highlightColor = captionItem?.highlight_color ?? resolvedStyle?.activeColor ?? '#FFE600';

  const strokeWidth = captionItem?.stroke_width ?? resolvedStyle?.outlineWidth ?? 4;
  const strokeColor = captionItem?.stroke_color ?? resolvedStyle?.outlineColor ?? '#000000';

  const shadowEnabled = captionItem?.shadow_enabled ?? ((resolvedStyle?.shadowDepth ?? 0) > 0);
  const shadowDepth = captionItem?.shadow_depth ?? resolvedStyle?.shadowDepth ?? 2;
  const shadowOpacity = captionItem?.shadow_opacity ?? resolvedStyle?.shadowOpacity ?? 0.6;

  const boxEnabled = captionItem?.box_enabled ?? Boolean(resolvedStyle?.box);
  const boxColor = captionItem?.box_color ?? resolvedStyle?.box?.color ?? '#0B0D12';
  const boxOpacity = captionItem?.box_opacity ?? resolvedStyle?.box?.opacity ?? 0.85;
  const boxPadding = captionItem?.box_padding ?? resolvedStyle?.box?.padding ?? 16;

  const animationType =
    captionItem?.animation ?? (resolvedStyle?.wordAnimation.type === 'pop' ? 'pop' : 'none');
  const animationScale =
    captionItem?.animation_scale ?? resolvedStyle?.wordAnimation.scale ?? 1.15;

  const maxLines = captionItem?.max_lines ?? resolvedStyle?.maxLines ?? 2;

  const hasCustomPos = captionItem?.position_x !== undefined || captionItem?.position_y !== undefined;

  // Active color channel mapping
  const currentColor =
    activeColorChannel === 'text'
      ? primaryColor
      : activeColorChannel === 'active'
      ? highlightColor
      : activeColorChannel === 'stroke'
      ? strokeColor
      : boxColor;

  const handleColorChange = (hex: string) => {
    if (activeColorChannel === 'text') {
      onChange({ primary_color: hex });
    } else if (activeColorChannel === 'active') {
      onChange({ highlight_color: hex });
    } else if (activeColorChannel === 'stroke') {
      onChange({ stroke_color: hex });
    } else {
      onChange({ box_color: hex, box_enabled: true });
    }
  };

  // Position zone active states
  const currentPosY = captionItem?.position_y;
  const isTopActive = currentPosY !== undefined ? Math.abs(currentPosY - 0.20) < 0.08 : captionItem?.position === 'top';
  const isMidActive = currentPosY !== undefined ? Math.abs(currentPosY - 0.50) < 0.08 : captionItem?.position === 'center';
  const isBotActive = currentPosY !== undefined ? Math.abs(currentPosY - 0.75) < 0.08 : (captionItem?.position === 'bottom' || !captionItem?.position);

  const effectiveFontFamily = `"${resolvedStyle?.fontFamily || fontFamily || 'Inter'}", "Arial Black", "Inter", sans-serif`;
  const effectiveOutlineColor = resolvedStyle?.outlineColor || strokeColor;
  const strokePx = boxEnabled ? 0 : strokeWidth > 0 ? Math.max(1, Math.round(strokeWidth * 0.35)) : 0;

  // Render Live Preview Stage Box
  const renderSamplePreview = () => (
    <div className="p-3 rounded-xl bg-vc-canvas/90 text-center select-none overflow-hidden relative shadow-[inset_0_2px_12px_rgba(0,0,0,0.8)]">
      {hasCustomPos && (
        <button
          type="button"
          onClick={() => onChange({ position_x: undefined, position_y: undefined, position: 'bottom' })}
          className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-white/[0.10] hover:bg-white/20 border border-white/20 text-[9px] font-medium text-white transition flex items-center gap-1 shadow-sm z-10"
          title="Reset custom dragged position to default bottom"
        >
          <RotateCcw className="w-2.5 h-2.5" />
          <span>Reset Pos</span>
        </button>
      )}

      <div
        style={{
          fontFamily: effectiveFontFamily,
          fontWeight: 900,
          fontSize: `${Math.min(20, Math.max(13, Math.round(fontSize * 0.26)))}px`,
          letterSpacing: `${letterSpacing}px`,
          textAlign: alignment,
          textTransform: isUppercase ? 'uppercase' : 'none',
          paintOrder: 'stroke fill',
          WebkitTextStroke: strokePx > 0 ? `${strokePx}px ${effectiveOutlineColor}` : undefined,
          textShadow:
            shadowEnabled && !boxEnabled && shadowDepth > 0
              ? `${Math.max(1, shadowDepth * 0.5)}px ${Math.max(1, shadowDepth * 0.5)}px 0 rgba(0,0,0,${shadowOpacity})`
              : 'none',
        }}
        className="tracking-wide transition-all inline-block max-w-full leading-snug my-1"
      >
        <span
          style={{
            backgroundColor: boxEnabled
              ? `${boxColor}${Math.round(boxOpacity * 255).toString(16).padStart(2, '0')}`
              : 'transparent',
            padding: boxEnabled ? `${Math.round(boxPadding * 0.25)}px ${Math.round(boxPadding * 0.4)}px` : undefined,
            borderRadius: boxEnabled ? '5px' : undefined,
            color: primaryColor,
            paintOrder: 'stroke fill',
            WebkitTextStroke: strokePx > 0 ? `${strokePx}px ${effectiveOutlineColor}` : undefined,
          }}
        >
          <span>VIRAL HOOKS THAT </span>
          <span
            style={{
              color: highlightColor,
              display: 'inline-block',
              transform: animationType === 'pop' ? `scale(${animationScale})` : undefined,
              transition: 'transform 0.15s ease',
              paintOrder: 'stroke fill',
              WebkitTextStroke: strokePx > 0 ? `${strokePx}px ${effectiveOutlineColor}` : undefined,
            }}
          >
            POP
          </span>
        </span>
      </div>

      <div className="text-[10px] text-vc-text-secondary mt-2 flex items-center justify-center gap-1.5 font-mono">
        <span className="truncate max-w-[110px] text-vc-text-secondary">{resolvedStyle?.fontFamily || fontFamily}</span>
        <span>•</span>
        <span>{fontSize}px</span>
        <span>•</span>
        <span className="capitalize">{fontWeight}</span>
        <span>•</span>
        <span>{isUppercase ? 'ALL CAPS' : 'Normal'}</span>
      </div>
    </div>
  );

  // Render Font Controls
  const renderFontControls = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 pb-1 border-b border-vc-border">
        <Type className="w-3.5 h-3.5 text-vc-text-secondary" />
        <span className="text-[10px] font-semibold text-vc-text-secondary uppercase tracking-wider">
          Typography & Layout
        </span>
      </div>

      {/* Font Family & Size */}
      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-1.5">
          {/* Font Family Dropdown */}
          <div className="col-span-8">
            <span className="text-[10px] text-vc-text-secondary font-medium block mb-1">Font Family</span>
            <select
              value={fontFamily}
              onChange={(e) => onChange({ font_family: e.target.value })}
              className="w-full h-8 rounded-xl bg-vc-surface1 border border-vc-border hover:border-white/20 px-2.5 text-xs text-white focus:outline-none focus:border-white/30 transition cursor-pointer"
            >
              {EXTENDED_FONTS.map((f) => (
                <option key={f} value={f} className="bg-vc-surface1 text-white">
                  {f}
                </option>
              ))}
            </select>
          </div>

          {/* Size Numeric Pill */}
          <div className="col-span-4">
            <span className="text-[10px] text-vc-text-secondary font-medium block mb-1">Size</span>
            <div className="h-8 rounded-xl bg-vc-surface1 px-2 flex items-center justify-between text-xs font-mono tabular-nums text-white">
              <input
                type="number"
                min="32"
                max="110"
                value={fontSize}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) onChange({ font_size: Math.max(32, Math.min(110, val)) });
                }}
                className="w-8 bg-transparent text-xs font-mono text-white text-center focus:outline-none"
              />
              <span className="text-[10px] text-vc-text-secondary select-none">px</span>
            </div>
          </div>
        </div>

        {/* Range Slider */}
        <input
          type="range"
          min="32"
          max="110"
          step="1"
          value={fontSize}
          onChange={(e) => onChange({ font_size: parseInt(e.target.value, 10) })}
          className="w-full accent-white cursor-pointer h-1.5 bg-white/[0.06] rounded-lg"
        />
      </div>

      {/* Font Weight & Letter Spacing */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-[10px] text-vc-text-secondary font-medium block mb-1">Weight</span>
          <div className="grid grid-cols-2 p-0.5 bg-vc-surface1 rounded-lg ">
            <button
              type="button"
              onClick={() => onChange({ font_weight: 'regular' })}
              className={`py-1 rounded-md text-[11px] font-medium transition flex items-center justify-center ${
                fontWeight === 'regular'
                  ? 'bg-white/[0.12] text-white font-semibold border border-white/20 shadow-sm'
                  : 'text-vc-text-secondary hover:text-white'
              }`}
            >
              Regular
            </button>
            <button
              type="button"
              onClick={() => onChange({ font_weight: 'bold' })}
              className={`py-1 rounded-md text-[11px] font-medium transition flex items-center justify-center ${
                fontWeight !== 'regular'
                  ? 'bg-white/[0.12] text-white font-semibold border border-white/20 shadow-sm'
                  : 'text-vc-text-secondary hover:text-white'
              }`}
            >
              Bold
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-vc-text-secondary font-medium">Spacing</span>
            <span className="font-mono text-vc-text-secondary">{letterSpacing}px</span>
          </div>
          <input
            type="range"
            min="-2"
            max="8"
            step="0.5"
            value={letterSpacing}
            onChange={(e) => onChange({ letter_spacing: parseFloat(e.target.value) })}
            className="w-full accent-white cursor-pointer h-1.5 bg-white/[0.06] rounded-lg mt-2"
          />
        </div>
      </div>

      {/* Casing & Lines */}
      <div className="grid grid-cols-2 gap-2">
        {/* Casing */}
        <div>
          <span className="text-[10px] text-vc-text-secondary font-medium block mb-1">Casing</span>
          <div className="grid grid-cols-2 p-0.5 bg-vc-surface1 rounded-lg ">
            <button
              type="button"
              onClick={() => onChange({ uppercase: true })}
              className={`py-1 rounded-md text-[11px] font-medium transition flex items-center justify-center gap-1 ${
                isUppercase
                  ? 'bg-white/[0.12] text-white font-semibold border border-white/20 shadow-sm'
                  : 'text-vc-text-secondary hover:text-white'
              }`}
            >
              <span className="font-mono text-[10px] font-bold">TT</span>
              <span>All Caps</span>
            </button>
            <button
              type="button"
              onClick={() => onChange({ uppercase: false })}
              className={`py-1 rounded-md text-[11px] font-medium transition flex items-center justify-center gap-1 ${
                !isUppercase
                  ? 'bg-white/[0.12] text-white font-semibold border border-white/20 shadow-sm'
                  : 'text-vc-text-secondary hover:text-white'
              }`}
            >
              <span className="font-sans text-[10px] font-bold">Aa</span>
              <span>Normal</span>
            </button>
          </div>
        </div>

        {/* Lines */}
        <div>
          <span className="text-[10px] text-vc-text-secondary font-medium block mb-1">Lines</span>
          <div className="grid grid-cols-2 p-0.5 bg-vc-surface1 rounded-lg ">
            <button
              type="button"
              onClick={() => onChange({ max_lines: 1 })}
              className={`py-1 rounded-md text-[11px] font-medium transition flex items-center justify-center ${
                maxLines === 1
                  ? 'bg-white/[0.12] text-white font-semibold border border-white/20 shadow-sm'
                  : 'text-vc-text-secondary hover:text-white'
              }`}
            >
              1 Line
            </button>
            <button
              type="button"
              onClick={() => onChange({ max_lines: 2 })}
              className={`py-1 rounded-md text-[11px] font-medium transition flex items-center justify-center ${
                maxLines === 2
                  ? 'bg-white/[0.12] text-white font-semibold border border-white/20 shadow-sm'
                  : 'text-vc-text-secondary hover:text-white'
              }`}
            >
              2 Lines
            </button>
          </div>
        </div>
      </div>

      {/* Alignment */}
      <div>
        <span className="text-[10px] text-vc-text-secondary font-medium block mb-1">Alignment</span>
        <div className="grid grid-cols-3 p-0.5 bg-vc-surface1 rounded-lg ">
          {[
            { id: 'left', icon: AlignLeft, label: 'Left' },
            { id: 'center', icon: AlignCenter, label: 'Center' },
            { id: 'right', icon: AlignRight, label: 'Right' },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange({ alignment: id as 'left' | 'center' | 'right' })}
              className={`py-1 rounded-md text-[11px] font-medium transition flex items-center justify-center ${
                alignment === id
                  ? 'bg-white/[0.12] text-white font-semibold border border-white/20 shadow-sm'
                  : 'text-vc-text-secondary hover:text-white'
              }`}
              title={label}
              aria-label={label}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // Render Effects Controls
  const renderEffectsControls = () => (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 pb-1 border-b border-vc-border">
        <Palette className="w-3.5 h-3.5 text-vc-text-secondary" />
        <span className="text-[10px] font-semibold text-vc-text-secondary uppercase tracking-wider">
          Colors & Effects
        </span>
      </div>

      {/* 4-Channel Color Switcher */}
      <div className="space-y-2 bg-vc-surface1 rounded-xl p-2.5">
        <div className="grid grid-cols-4 gap-1">
          {[
            { id: 'text', label: 'Text', color: primaryColor },
            { id: 'active', label: 'Active', color: highlightColor },
            { id: 'stroke', label: 'Stroke', color: strokeColor },
            { id: 'box', label: 'Box', color: boxColor },
          ].map(({ id, label, color }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveColorChannel(id as any)}
              className={`h-7 rounded-lg border px-1.5 text-[10px] font-medium transition flex items-center justify-center gap-1 ${
                activeColorChannel === id
                  ? 'border-white/40 bg-white/[0.15] text-white font-semibold ring-1 ring-white/20'
                  : 'border-white/[0.08] bg-vc-canvas text-vc-text-secondary hover:text-white hover:border-white/20'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        {/* Curated color circles + native picker swatch + hex code */}
        <div className="flex items-center justify-between gap-1 pt-1">
          {CURATED_COLORS.map((hex) => {
            const isSelected = currentColor.toUpperCase() === hex.toUpperCase();
            return (
              <button
                key={hex}
                type="button"
                onClick={() => handleColorChange(hex)}
                style={{ backgroundColor: hex }}
                className={`w-5 h-5 rounded-full border transition-all ${
                  isSelected
                    ? 'border-white/50 ring-2 ring-white/25 scale-110 shadow-sm'
                    : 'border-white/20 hover:scale-105'
                }`}
                title={hex}
                aria-label={`Select color ${hex}`}
              />
            );
          })}

          {/* Native Color Picker Swatch */}
          <div
            className="relative w-5 h-5 rounded-full overflow-hidden border border-white/20 hover:border-white/50 transition cursor-pointer shrink-0 shadow-sm flex items-center justify-center bg-gradient-to-tr from-rose-500 via-amber-400 to-cyan-400"
            title="Custom color picker"
          >
            <input
              type="color"
              value={currentColor}
              onChange={(e) => handleColorChange(e.target.value)}
              className="absolute -inset-2 w-10 h-10 opacity-0 cursor-pointer"
              aria-label="Pick custom color"
            />
          </div>
        </div>

        {/* Direct Hex code field */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="text-[10px] text-vc-text-secondary font-mono">Hex</span>
          <input
            type="text"
            value={currentColor}
            onChange={(e) => handleColorChange(e.target.value)}
            className="flex-1 h-6 rounded bg-vc-canvas border border-vc-border px-2 text-[10px] font-mono text-white uppercase focus:outline-none focus:border-white/30"
            placeholder="#FFFFFF"
          />
        </div>
      </div>

      {/* Stroke Width & Shadow */}
      <div className="grid grid-cols-12 gap-1.5">
        {/* Stroke Width Slider */}
        <div className="col-span-8 bg-vc-surface1 rounded-xl px-2.5 py-1.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-vc-text-secondary font-medium flex items-center gap-1">
              <SunMedium className="w-3 h-3 text-vc-text-secondary" />
              Stroke
            </span>
            <span className="font-mono text-white text-[10px]">{strokeWidth}px</span>
          </div>
          <input
            type="range"
            min="0"
            max="12"
            step="0.5"
            value={strokeWidth}
            onChange={(e) => onChange({ stroke_width: parseFloat(e.target.value) })}
            className="w-full accent-white cursor-pointer h-1.5 bg-white/[0.06] rounded-lg"
          />
        </div>

        {/* Shadow Toggle */}
        <div className="col-span-4 bg-vc-surface1 rounded-xl px-2 py-1.5 flex flex-col justify-between">
          <span className="text-[10px] text-vc-text-secondary font-medium block mb-0.5">Shadow</span>
          <div className="grid grid-cols-2 p-0.5 bg-vc-canvas rounded-lg text-[10px]">
            <button
              type="button"
              onClick={() => onChange({ shadow_enabled: false })}
              className={`py-0.5 rounded font-medium transition flex items-center justify-center ${
                !shadowEnabled
                  ? 'bg-white/[0.12] text-white font-semibold'
                  : 'text-vc-text-secondary hover:text-white'
              }`}
            >
              Off
            </button>
            <button
              type="button"
              onClick={() => onChange({ shadow_enabled: true })}
              className={`py-0.5 rounded font-medium transition flex items-center justify-center ${
                shadowEnabled
                  ? 'bg-white/[0.12] text-white font-semibold'
                  : 'text-vc-text-secondary hover:text-white'
              }`}
            >
              On
            </button>
          </div>
        </div>
      </div>

      {/* Background Box & Padding */}
      <div className="bg-vc-surface1 rounded-xl p-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-vc-text-secondary font-medium flex items-center gap-1">
            <Box className="w-3 h-3 text-vc-text-secondary" />
            Background Box
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChange({ box_enabled: false })}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                !boxEnabled ? 'bg-white/[0.12] text-white font-semibold' : 'text-vc-text-secondary hover:text-white'
              }`}
            >
              Off
            </button>
            <button
              type="button"
              onClick={() => onChange({ box_enabled: true })}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                boxEnabled ? 'bg-white/[0.12] text-white font-semibold' : 'text-vc-text-secondary hover:text-white'
              }`}
            >
              On
            </button>
          </div>
        </div>
        {boxEnabled && (
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-vc-border">
            <div>
              <div className="flex items-center justify-between text-[9px] mb-0.5">
                <span className="text-vc-text-secondary">Padding</span>
                <span className="font-mono text-vc-text-secondary">{boxPadding}px</span>
              </div>
              <input
                type="range"
                min="8"
                max="32"
                step="2"
                value={boxPadding}
                onChange={(e) => onChange({ box_padding: parseInt(e.target.value, 10) })}
                className="w-full accent-white cursor-pointer h-1.5 bg-white/[0.06] rounded-lg"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-[9px] mb-0.5">
                <span className="text-vc-text-secondary">Opacity</span>
                <span className="font-mono text-vc-text-secondary">{Math.round(boxOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={boxOpacity}
                onChange={(e) => onChange({ box_opacity: parseFloat(e.target.value) })}
                className="w-full accent-white cursor-pointer h-1.5 bg-white/[0.06] rounded-lg"
              />
            </div>
          </div>
        )}
      </div>

      {/* Word Pop Scale */}
      <div className="bg-vc-surface1 rounded-xl px-2.5 py-1.5">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-vc-text-secondary font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-vc-text-secondary" />
            Word Pop Scale
          </span>
          {animationType === 'pop' && (
            <span className="text-[10px] font-mono text-white">{animationScale.toFixed(2)}x</span>
          )}
        </div>
        <div className="grid grid-cols-3 p-0.5 bg-vc-canvas rounded-lg text-[11px]">
          <button
            type="button"
            onClick={() => onChange({ animation: 'none' })}
            className={`py-1 rounded font-medium transition flex items-center justify-center ${
              animationType === 'none'
                ? 'bg-white/[0.12] text-white font-semibold border border-white/20 shadow-sm'
                : 'text-vc-text-secondary hover:text-white'
            }`}
          >
            None
          </button>
          <button
            type="button"
            onClick={() => onChange({ animation: 'pop', animation_scale: 1.10 })}
            className={`py-1 rounded font-medium transition flex items-center justify-center ${
              animationType === 'pop' && Math.abs(animationScale - 1.10) <= 0.05
                ? 'bg-white/[0.12] text-white font-semibold border border-white/20 shadow-sm'
                : 'text-vc-text-secondary hover:text-white'
            }`}
          >
            Subtle 1.1x
          </button>
          <button
            type="button"
            onClick={() => onChange({ animation: 'pop', animation_scale: 1.20 })}
            className={`py-1 rounded font-medium transition flex items-center justify-center ${
              animationType === 'pop' && Math.abs(animationScale - 1.20) <= 0.05
                ? 'bg-white/[0.12] text-white font-semibold border border-white/20 shadow-sm'
                : 'text-vc-text-secondary hover:text-white'
            }`}
          >
            Slam 1.2x
          </button>
        </div>
      </div>

      {/* Position Zone Quick Presets */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-vc-text-secondary font-medium uppercase tracking-wider">Position Zone</span>
          {hasCustomPos && (
            <button
              type="button"
              onClick={() => onChange({ position_x: undefined, position_y: undefined, position: 'bottom' })}
              className="text-[9px] font-mono text-vc-text-secondary hover:underline"
            >
              Reset Pos
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 p-0.5 bg-vc-surface1 rounded-lg ">
          <button
            type="button"
            onClick={() => onChange({ position: 'top', position_y: 0.20 })}
            className={`py-1 rounded-md text-[11px] font-medium transition flex items-center justify-center ${
              isTopActive
                ? 'bg-white/[0.12] text-white font-semibold border border-white/20 shadow-sm'
                : 'text-vc-text-secondary hover:text-white'
            }`}
          >
            Top
          </button>
          <button
            type="button"
            onClick={() => onChange({ position: 'center', position_y: 0.50 })}
            className={`py-1 rounded-md text-[11px] font-medium transition flex items-center justify-center ${
              isMidActive
                ? 'bg-white/[0.12] text-white font-semibold border border-white/20 shadow-sm'
                : 'text-vc-text-secondary hover:text-white'
            }`}
          >
            Mid
          </button>
          <button
            type="button"
            onClick={() => onChange({ position: 'bottom', position_y: 0.75 })}
            className={`py-1 rounded-md text-[11px] font-medium transition flex items-center justify-center ${
              isBotActive
                ? 'bg-white/[0.12] text-white font-semibold border border-white/20 shadow-sm'
                : 'text-vc-text-secondary hover:text-white'
            }`}
          >
            Bot
          </button>
        </div>
      </div>

      {/* Reset Typography and Effects Button */}
      <div className="pt-1 flex justify-end">
        <button
          type="button"
          onClick={() =>
            onChange({
              font_family: undefined,
              font_size: undefined,
              font_weight: undefined,
              uppercase: undefined,
              letter_spacing: undefined,
              alignment: undefined,
              max_lines: undefined,
              primary_color: undefined,
              highlight_color: undefined,
              stroke_color: undefined,
              stroke_width: undefined,
              shadow_enabled: undefined,
              shadow_depth: undefined,
              shadow_color: undefined,
              shadow_opacity: undefined,
              box_enabled: undefined,
              box_color: undefined,
              box_opacity: undefined,
              box_padding: undefined,
              animation: undefined,
              animation_scale: undefined,
              position_x: undefined,
              position_y: undefined,
            })
          }
          className="text-[9px] text-vc-text-muted hover:text-white flex items-center gap-1 transition focus:outline-none"
        >
          <RotateCcw className="w-2.5 h-2.5 text-vc-text-muted" />
          <span>Reset custom styling to defaults</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Live Sample Preview Stage Box */}
      {renderSamplePreview()}

      {/* Branch by active tab */}
      {activeTab === 'font' && renderFontControls()}
      {activeTab === 'effects' && renderEffectsControls()}
      {activeTab === 'customize' && (
        <div className="space-y-4">
          {renderFontControls()}
          {renderEffectsControls()}
        </div>
      )}
    </div>
  );
};
