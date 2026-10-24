import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  FIELD,
  FIELD_HEADER,
  FIELD_LABEL,
  FIELD_VALUE,
  FIELD_INPUT,
  SEGMENTED_GROUP,
  SEGMENTED_ITEM,
  SEGMENTED_ITEM_ACTIVE,
  SEGMENTED_ITEM_IDLE,
  SWATCH,
  SWATCH_SELECTED,
} from './panelTokens';

/**
 * Thin wrappers over the natives, which are already styled globally in index.css
 * (range thumb/track, select chevron, focus rings). The point is a single label+value rhythm:
 * every field puts its label left and its current value right, with the control beneath — so a
 * long settings panel reads as one pattern instead of N bespoke layouts.
 */

const FieldFrame: React.FC<{
  label: string;
  value?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, value, children }) => (
  <div className={FIELD}>
    <div className={FIELD_HEADER}>
      <span className={FIELD_LABEL}>{label}</span>
      {value !== undefined && <span className={FIELD_VALUE}>{value}</span>}
    </div>
    {children}
  </div>
);

export const SliderField: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  disabled?: boolean;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 1, format, disabled, onChange }) => (
  <FieldFrame label={label} value={format ? format(value) : value}>
    <input
      type="range"
      className="w-full"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  </FieldFrame>
);

export const SelectField: React.FC<{
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <FieldFrame label={label}>
    <select
      className={FIELD_INPUT}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </FieldFrame>
);

export const NumberField: React.FC<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 1, suffix, onChange }) => (
  <FieldFrame label={label} value={suffix ? `${value}${suffix}` : undefined}>
    <input
      type="number"
      className={FIELD_INPUT}
      value={value}
      min={min}
      max={max}
      step={step}
      aria-label={label}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  </FieldFrame>
);

export const ToggleField: React.FC<{
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, description, checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="w-full flex items-center justify-between gap-2.5 text-left py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg"
  >
    <span className="min-w-0">
      <span className="block text-[11px] text-vc-text-secondary">{label}</span>
      {description && (
        <span className="block text-[10.5px] text-vc-text-muted leading-snug">{description}</span>
      )}
    </span>
    <span
      className={`shrink-0 w-8 h-[18px] rounded-full p-0.5 transition-colors ${
        checked ? 'bg-violet-500' : 'bg-white/[0.12]'
      }`}
    >
      <span
        className={`block w-[14px] h-[14px] rounded-full transition-transform ${
          checked ? 'translate-x-[14px] bg-white' : 'bg-white/70'
        }`}
      />
    </span>
  </button>
);

export const SegmentedField: React.FC<{
  label?: string;
  value: string;
  options: { value: string; label: string; icon?: LucideIcon }[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => {
  const group = (
    <div className={SEGMENTED_GROUP} role="tablist" aria-label={label}>
      {options.map((o) => {
        const Icon = o.icon;
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`${SEGMENTED_ITEM} ${active ? SEGMENTED_ITEM_ACTIVE : SEGMENTED_ITEM_IDLE}`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
  return label ? <FieldFrame label={label}>{group}</FieldFrame> : group;
};

export const ColorField: React.FC<{
  label: string;
  value: string;
  swatches?: string[];
  onChange: (hex: string) => void;
}> = ({ label, value, swatches = [], onChange }) => (
  <FieldFrame label={label} value={value.toUpperCase()}>
    <div className="flex items-center gap-1.5 flex-wrap">
      <label
        className={`${SWATCH} relative cursor-pointer overflow-hidden`}
        style={{ backgroundColor: value }}
        title={`${label}: ${value}`}
      >
        <input
          type="color"
          value={value}
          aria-label={`${label} custom colour`}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </label>
      {swatches.map((hex) => (
        <button
          key={hex}
          type="button"
          onClick={() => onChange(hex)}
          title={hex}
          aria-label={hex}
          style={{ backgroundColor: hex }}
          className={`${SWATCH} ${hex.toLowerCase() === value.toLowerCase() ? SWATCH_SELECTED : ''}`}
        />
      ))}
    </div>
  </FieldFrame>
);
