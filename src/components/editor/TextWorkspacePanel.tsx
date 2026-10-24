import React, { useState, useMemo, useEffect } from 'react';
import {
  Type,
  Search,
  Plus,
} from 'lucide-react';
import {
  EditorProject,
  EditorTrackItem,
} from '../../types';
import {
  PanelBody,
  PanelTile,
  PanelEmpty,
  CollapsibleSection,
  PANEL_HEADER_TITLE,
  FIELD_INPUT,
  ACTION_PRIMARY,
  BADGE,
  TONE,
} from './panelKit';
import {
  TEXT_TEMPLATES,
  TEXT_TEMPLATE_CATEGORIES,
  TextTemplate,
  TextTemplateCategory,
  createTrackItemFromTemplate,
  createQuickAddTextItem,
} from '../../lib/textTemplates';

interface TextWorkspacePanelProps {
  project: EditorProject;
  currentTime: number;
  onAddTextItem: (item: EditorTrackItem) => void;
  onSelectTrackItem?: (itemId: string, trackId: string) => void;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

interface TemplateCardPreviewProps {
  template: TextTemplate;
  isHovered: boolean;
  isSelected: boolean;
  reducedMotion: boolean;
}

const TemplateCardPreview: React.FC<TemplateCardPreviewProps> = React.memo(
  ({ template, isHovered, isSelected, reducedMotion }) => {
    const isAnimating = (isHovered || isSelected) && !reducedMotion;
    const [animCycle, setAnimCycle] = useState(0);
    const [charCount, setCharCount] = useState(template.defaultText.length);
    const [phase, setPhase] = useState<'enter' | 'hold' | 'reset'>('hold');

    useEffect(() => {
      if (!isAnimating) {
        setPhase('hold');
        setCharCount(template.defaultText.length);
        return;
      }

      let timeoutId: NodeJS.Timeout;
      let intervalId: NodeJS.Timeout;

      // Typewriter character reveal loop
      if (template.textConfig.animation === 'typewriter') {
        let currentChars = 0;
        setCharCount(0);
        setPhase('enter');
        intervalId = setInterval(() => {
          currentChars++;
          setCharCount(currentChars);
          if (currentChars >= template.defaultText.length) {
            clearInterval(intervalId);
            setPhase('hold');
            timeoutId = setTimeout(() => {
              setAnimCycle((c) => c + 1);
            }, 1200);
          }
        }, 50);
      } else {
        // Standard motion animation loop
        setPhase('enter');
        timeoutId = setTimeout(() => {
          setPhase('hold');
          timeoutId = setTimeout(() => {
            setAnimCycle((c) => c + 1);
          }, 1400);
        }, 600);
      }

      return () => {
        clearTimeout(timeoutId);
        clearInterval(intervalId);
      };
    }, [isAnimating, animCycle, template.textConfig.animation, template.defaultText]);

    const { textConfig } = template;

    // Determine animation styling based on active phase
    const getMotionStyle = (): React.CSSProperties => {
      if (!isAnimating || phase === 'hold') {
        return {
          opacity: 1,
          transform: 'scale(1) translate(0, 0)',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        };
      }

      const anim = textConfig.animation;
      switch (anim) {
        case 'pop':
          return {
            opacity: 1,
            transform: 'scale(1.08)',
            transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease-out',
          };
        case 'slide_up':
          return {
            opacity: 1,
            transform: 'translateY(-6px)',
            transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease-out',
          };
        case 'fade':
          return {
            opacity: 1,
            transform: 'scale(1)',
            transition: 'opacity 0.5s ease-in-out',
          };
        case 'scale':
          return {
            opacity: 1,
            transform: 'scale(1.06)',
            transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease-out',
          };
        case 'bounce_lite':
          return {
            opacity: 1,
            transform: 'translateY(-4px)',
            transition: 'transform 0.35s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
          };
        default:
          return {};
      }
    };

    const displayedText =
      isAnimating && textConfig.animation === 'typewriter'
        ? template.defaultText.slice(0, charCount)
        : template.defaultText;

    return (
      <div className="w-full h-full bg-vc-canvas flex items-center justify-center p-3 relative overflow-hidden select-none">
        {/* Subtle dot-grid preview backdrop */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:8px_8px] pointer-events-none" />

        {/* Text preview badge */}
        <div
          style={{
            fontFamily: textConfig.font_family || 'Inter',
            fontSize: '13px',
            fontWeight:
              textConfig.font_weight === 'black'
                ? 900
                : textConfig.font_weight === 'bold'
                ? 700
                : textConfig.font_weight === 'medium'
                ? 600
                : 400,
            fontStyle: textConfig.italic ? 'italic' : 'normal',
            color: textConfig.color || '#FFFFFF',
            backgroundColor: textConfig.background_color || 'transparent',
            padding: textConfig.background_padding ? '4px 10px' : '2px 6px',
            borderRadius: `${Math.min(textConfig.background_corner_radius || 0, 16)}px`,
            letterSpacing: `${(textConfig.letter_spacing || 0) * 0.5}px`,
            textAlign: textConfig.alignment || 'center',
            boxShadow: textConfig.shadow_color ? `0 2px 8px ${textConfig.shadow_color}` : undefined,
            WebkitTextStroke: textConfig.stroke_width
              ? `${Math.max(0.5, textConfig.stroke_width * 0.5)}px ${textConfig.stroke_color || '#000000'}`
              : undefined,
            ...getMotionStyle(),
          }}
          className="max-w-[92%] truncate z-10 leading-snug"
        >
          {displayedText}
        </div>

        {/* Animation pulse indicator when active */}
        {isAnimating && (
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 bg-black/80 rounded px-1.5 py-0.5 text-[9px] font-mono text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="capitalize">{template.textConfig.animation}</span>
          </div>
        )}
      </div>
    );
  }
);

export const TextWorkspacePanel: React.FC<TextWorkspacePanelProps> = ({
  project,
  currentTime,
  onAddTextItem,
  onSelectTrackItem,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<TextTemplateCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Filter templates by category and search query
  const filteredTemplates = useMemo(() => {
    return TEXT_TEMPLATES.filter((tpl) => {
      const matchesCategory =
        selectedCategory === 'all' || tpl.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        tpl.name.toLowerCase().includes(q) ||
        tpl.defaultText.toLowerCase().includes(q) ||
        tpl.description.toLowerCase().includes(q) ||
        (tpl.textConfig.animation && tpl.textConfig.animation.toLowerCase().includes(q))
      );
    });
  }, [selectedCategory, searchQuery]);

  // Find or determine existing TEXT track
  const textTrack = useMemo(() => {
    return project.tracks.find((t) => t.type === 'TEXT');
  }, [project.tracks]);

  // Handle adding standard heading/subheading/body
  const handleQuickAdd = (type: 'heading' | 'subheading' | 'body') => {
    const trackId = textTrack ? textTrack.id : crypto.randomUUID();
    const newItem = createQuickAddTextItem(
      type,
      trackId,
      currentTime,
      project.canvas.duration
    );
    onAddTextItem(newItem);
    if (onSelectTrackItem) {
      onSelectTrackItem(newItem.id, trackId);
    }
  };

  // Handle adding template to canvas
  const handleSelectTemplate = (template: TextTemplate) => {
    setSelectedTemplateId(template.id);
    const trackId = textTrack ? textTrack.id : crypto.randomUUID();
    const newItem = createTrackItemFromTemplate(
      template,
      trackId,
      currentTime,
      project.canvas.duration
    );
    onAddTextItem(newItem);
    if (onSelectTrackItem) {
      onSelectTrackItem(newItem.id, trackId);
    }
  };

  // One shape for every quick-add entry; previously these were five hand-written buttons
  // across two grids with their own markup.
  const quickAdd = [
    {
      id: 'editorial',
      label: 'Editorial',
      sample: <span className="font-serif italic font-bold text-white text-sm">Add heading</span>,
      onSelect: () => handleSelectTemplate(TEXT_TEMPLATES.find((t) => t.id === 'headline_editorial') || TEXT_TEMPLATES[0]),
    },
    {
      id: 'statement',
      label: 'Statement',
      sample: <span className="font-black uppercase tracking-wider text-white text-[11px]">ADD HEADING</span>,
      onSelect: () => handleSelectTemplate(TEXT_TEMPLATES.find((t) => t.id === 'headline_impact') || TEXT_TEMPLATES[0]),
    },
    {
      id: 'classic',
      label: 'Classic',
      sample: <span className="font-sans font-semibold text-white text-xs">Add heading</span>,
      onSelect: () => handleQuickAdd('heading'),
    },
    {
      id: 'name_tag',
      label: 'Name tag',
      sample: (
        <div className="px-2 py-1 rounded-lg bg-white/[0.08] text-[10px] font-medium text-white truncate max-w-[110px]">
          Alejandro Coleman
        </div>
      ),
      onSelect: () => handleSelectTemplate(TEXT_TEMPLATES.find((t) => t.id === 'lower_third_streamer') || TEXT_TEMPLATES[0]),
    },
    {
      id: 'verified',
      label: 'Verified',
      sample: (
        <div className="px-2 py-0.5 rounded-full bg-white/[0.10] text-[10px] font-medium text-white truncate max-w-[110px]">
          Jeremiah Chesterton
        </div>
      ),
      onSelect: () => handleSelectTemplate(TEXT_TEMPLATES.find((t) => t.id === 'name_tag_verified') || TEXT_TEMPLATES[0]),
    },
  ];

  const showQuickAdd = !searchQuery && selectedCategory === 'all';

  return (
    <div className="flex flex-col h-full bg-vc-surface1 text-vc-text-secondary text-xs select-none overflow-hidden animate-panelSlideIn">
      {/* Header */}
      <div className="p-3.5 border-b border-vc-border shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center text-vc-text-secondary">
              <Type className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className={PANEL_HEADER_TITLE}>Overlay</h3>
              <p className="text-[10px] text-vc-text-muted">Add titles, headlines &amp; name tags</p>
            </div>
          </div>
          <span className={`${BADGE} ${TONE.neutral}`}>{TEXT_TEMPLATES.length} styles</span>
        </div>

        <button type="button" onClick={() => handleQuickAdd('heading')} className={`${ACTION_PRIMARY} w-full h-9`}>
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add text</span>
        </button>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-vc-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates or motion styles..."
            className={`${FIELD_INPUT} pl-8`}
          />
        </div>
      </div>

      {/* Category filter — sticky, so it never scrolls away from the results it filters */}
      <div className="shrink-0 px-3.5 py-2 border-b border-vc-border flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {TEXT_TEMPLATE_CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'bg-white/[0.15] text-vc-text-primary'
                  : 'bg-white/[0.04] text-vc-text-muted hover:text-vc-text-primary hover:bg-white/[0.08]'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* The ONE scroll container for this panel. */}
      <PanelBody>
        {showQuickAdd && (
          <CollapsibleSection id="text.quickAdd" title="Quick add" defaultOpen count={quickAdd.length}>
            <div className="grid grid-cols-3 gap-2">
              {quickAdd.map((q) => (
                <PanelTile
                  key={q.id}
                  label={q.label}
                  mediaHeight={62}
                  onSelect={q.onSelect}
                  media={<div className="w-full h-full flex items-center justify-center px-2">{q.sample}</div>}
                />
              ))}
            </div>
          </CollapsibleSection>
        )}

        <CollapsibleSection
          id="text.templates"
          title="Templates"
          defaultOpen
          count={filteredTemplates.length}
        >
          {filteredTemplates.length === 0 ? (
            <PanelEmpty
              icon={Type}
              title="No matching templates"
              hint="Try a different search or category."
              action={{
                label: 'Clear filters',
                onClick: () => {
                  setSelectedCategory('all');
                  setSearchQuery('');
                },
              }}
            />
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {filteredTemplates.map((template) => {
                const isHovered = hoveredTemplateId === template.id;
                const isSelected = selectedTemplateId === template.id;
                return (
                  <PanelTile
                    key={template.id}
                    label={template.name}
                    selected={isSelected}
                    mediaHeight={84}
                    onSelect={() => handleSelectTemplate(template)}
                    onPointerEnter={() => setHoveredTemplateId(template.id)}
                    onPointerLeave={() =>
                      setHoveredTemplateId((prev) => (prev === template.id ? null : prev))
                    }
                    trailing={
                      template.textConfig.animation ? (
                        <span className="text-[9px] font-mono uppercase text-vc-text-muted shrink-0">
                          {template.textConfig.animation}
                        </span>
                      ) : undefined
                    }
                    media={
                      <TemplateCardPreview
                        template={template}
                        isHovered={isHovered}
                        isSelected={isSelected}
                        reducedMotion={reducedMotion}
                      />
                    }
                  />
                );
              })}
            </div>
          )}
        </CollapsibleSection>
      </PanelBody>
    </div>
  );
};
