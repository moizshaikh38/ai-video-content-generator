import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Sparkles,
  Sticker,
  X,
  Plus,
  AlertCircle,
  ExternalLink,
  Flame,
  Check,
} from 'lucide-react';
import { EditorProject } from '../../types';
import { backendRequest } from '../../services/backendClient';

export interface ElementMediaItem {
  id: string;
  type: 'gif' | 'sticker';
  title: string;
  sourceUrl: string;
  previewUrl: string;
  width: number;
  height: number;
  rating?: string;
  category?: string;
  tags?: string[];
}

export const CURATED_ELEMENTS_FALLBACK: ElementMediaItem[] = [
  // ── STICKERS (Transparent backgrounds) ──
  {
    id: 'sticker_fire',
    type: 'sticker',
    title: 'Fire Reaction Sticker',
    sourceUrl: 'https://media.giphy.com/media/26tOZ42Mg6pbTUPHW/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/26tOZ42Mg6pbTUPHW/200w.gif',
    width: 320,
    height: 320,
    rating: 'g',
    category: 'reactions',
    tags: ['fire', 'flame', 'lit', 'reaction', 'reactions', 'hot', 'trending'],
  },
  {
    id: 'sticker_arrow_neon',
    type: 'sticker',
    title: 'Neon Arrow Pointing Down',
    sourceUrl: 'https://media.giphy.com/media/13HgwGsXF0aiGY/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/13HgwGsXF0aiGY/200w.gif',
    width: 300,
    height: 300,
    rating: 'g',
    category: 'arrows',
    tags: ['arrow', 'arrows', 'down', 'pointer', 'point', 'direction'],
  },
  {
    id: 'sticker_arrow_curved',
    type: 'sticker',
    title: 'Curved Arrow Pointer',
    sourceUrl: 'https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/xT9IgzoKnwFNmISR8I/200w.gif',
    width: 280,
    height: 280,
    rating: 'g',
    category: 'arrows',
    tags: ['arrow', 'arrows', 'curved', 'pointer', 'here', 'look'],
  },
  {
    id: 'sticker_arrow_target',
    type: 'sticker',
    title: 'Target Arrow Pulse',
    sourceUrl: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/200w.gif',
    width: 300,
    height: 300,
    rating: 'g',
    category: 'arrows',
    tags: ['arrow', 'arrows', 'target', 'bullet', 'focus', 'point'],
  },
  {
    id: 'sticker_emoji_laugh',
    type: 'sticker',
    title: 'Crying Laughing Emoji',
    sourceUrl: 'https://media.giphy.com/media/hvq8ONQhQ1XLq/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/hvq8ONQhQ1XLq/200w.gif',
    width: 300,
    height: 300,
    rating: 'g',
    category: 'emojis',
    tags: ['emoji', 'emojis', 'laugh', 'lol', 'funny', 'tears', 'reaction', 'reactions'],
  },
  {
    id: 'sticker_emoji_sunglasses',
    type: 'sticker',
    title: 'Cool Sunglasses Emoji',
    sourceUrl: 'https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3o7btPCcdNniyf0ArS/200w.gif',
    width: 300,
    height: 300,
    rating: 'g',
    category: 'emojis',
    tags: ['emoji', 'emojis', 'cool', 'sunglasses', 'boss', 'vibes', 'trending'],
  },
  {
    id: 'sticker_emoji_heart_eyes',
    type: 'sticker',
    title: 'Heart Eyes Love Emoji',
    sourceUrl: 'https://media.giphy.com/media/l4pTdcifPZLpDjL1e/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/l4pTdcifPZLpDjL1e/200w.gif',
    width: 300,
    height: 300,
    rating: 'g',
    category: 'emojis',
    tags: ['emoji', 'emojis', 'love', 'heart', 'adore', 'reaction', 'reactions'],
  },
  {
    id: 'sticker_subscribe',
    type: 'sticker',
    title: 'Subscribe Bell Button',
    sourceUrl: 'https://media.giphy.com/media/ygcB6CIWBbcVY8ERIR/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/ygcB6CIWBbcVY8ERIR/200w.gif',
    width: 360,
    height: 180,
    rating: 'g',
    category: 'like_subscribe',
    tags: ['subscribe', 'bell', 'youtube', 'like', 'follow', 'button', 'badge'],
  },
  {
    id: 'sticker_100',
    type: 'sticker',
    title: '100 Percent Score Badge',
    sourceUrl: 'https://media.giphy.com/media/l41JRsph73VokN6ik/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/l41JRsph73VokN6ik/200w.gif',
    width: 300,
    height: 300,
    rating: 'g',
    category: 'badges',
    tags: ['100', 'percent', 'badge', 'badges', 'score', 'perfect', 'trending', 'emojis'],
  },
  {
    id: 'sticker_verified',
    type: 'sticker',
    title: 'Verified Checkmark Badge',
    sourceUrl: 'https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/26u4cqiYI30juCOGY/200w.gif',
    width: 260,
    height: 260,
    rating: 'g',
    category: 'badges',
    tags: ['verified', 'check', 'badge', 'badges', 'official', 'seal', 'blue check'],
  },
  {
    id: 'sticker_sparkles',
    type: 'sticker',
    title: 'Magic Sparkles Reaction',
    sourceUrl: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/200w.gif',
    width: 280,
    height: 280,
    rating: 'g',
    category: 'celebration',
    tags: ['sparkles', 'stars', 'magic', 'celebrate', 'celebration', 'shine', 'reaction'],
  },
  {
    id: 'sticker_thumbs_up_seal',
    type: 'sticker',
    title: 'Golden Thumbs Up Badge',
    sourceUrl: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/200w.gif',
    width: 300,
    height: 300,
    rating: 'g',
    category: 'reactions',
    tags: ['thumbs', 'up', 'reaction', 'reactions', 'badge', 'badges', 'good', 'approved'],
  },

  // ── GIFS (Standard video/animation clips) ──
  {
    id: 'gif_mindblown',
    type: 'gif',
    title: 'Mind Blown Reaction',
    sourceUrl: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/200w.gif',
    width: 480,
    height: 270,
    rating: 'g',
    category: 'reactions',
    tags: ['mind blown', 'reaction', 'reactions', 'meme', 'memes', 'trending', 'explosion', 'wow'],
  },
  {
    id: 'gif_clapping',
    type: 'gif',
    title: 'Applause & Clapping',
    sourceUrl: 'https://media.giphy.com/media/nbvFVPiEiJh6Q/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/nbvFVPiEiJh6Q/200w.gif',
    width: 400,
    height: 300,
    rating: 'g',
    category: 'reactions',
    tags: ['clapping', 'applause', 'reaction', 'reactions', 'celebrate', 'celebration', 'bravo'],
  },
  {
    id: 'gif_celebrate',
    type: 'gif',
    title: 'Celebration Confetti',
    sourceUrl: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/200w.gif',
    width: 480,
    height: 270,
    rating: 'g',
    category: 'celebration',
    tags: ['celebration', 'celebrate', 'party', 'confetti', 'yay', 'win', 'trending'],
  },
  {
    id: 'gif_thumbs_up',
    type: 'gif',
    title: 'Thumbs Up Approval',
    sourceUrl: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/111ebonMs90YLu/200w.gif',
    width: 400,
    height: 240,
    rating: 'g',
    category: 'reactions',
    tags: ['thumbs', 'up', 'reaction', 'reactions', 'yes', 'agree', 'meme', 'memes'],
  },
  {
    id: 'gif_deal_with_it',
    type: 'gif',
    title: 'Deal With It Sunglasses Meme',
    sourceUrl: 'https://media.giphy.com/media/xPGkOAdiIO3Is/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/xPGkOAdiIO3Is/200w.gif',
    width: 400,
    height: 300,
    rating: 'g',
    category: 'memes',
    tags: ['meme', 'memes', 'deal with it', 'glasses', 'cool', 'trending', 'funny'],
  },
  {
    id: 'gif_party_dance',
    type: 'gif',
    title: 'Party Dance Celebration',
    sourceUrl: 'https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/blSTtZehjAZ8I/200w.gif',
    width: 420,
    height: 315,
    rating: 'g',
    category: 'celebration',
    tags: ['party', 'dance', 'celebrate', 'celebration', 'happy', 'fun', 'meme'],
  },
];

interface ElementsWorkspacePanelProps {
  project: EditorProject;
  currentTime: number;
  onAddElement: (element: ElementMediaItem) => void;
  onSelectTrackItem?: (itemId: string, trackId: string) => void;
}

const CATEGORY_CHIPS = [
  { id: 'all', label: 'All', query: '' },
  { id: 'trending', label: 'Trending', query: 'trending' },
  { id: 'reactions', label: 'Reactions', query: 'reaction' },
  { id: 'arrows', label: 'Arrows', query: 'arrow' },
  { id: 'emojis', label: 'Emojis', query: 'emoji' },
  { id: 'badges', label: 'Badges', query: 'badge' },
  { id: 'celebrate', label: 'Celebrate', query: 'celebrate' },
  { id: 'memes', label: 'Memes', query: 'meme' },
];

export const ElementsWorkspacePanel: React.FC<ElementsWorkspacePanelProps> = ({
  project: _project,
  currentTime: _currentTime,
  onAddElement,
  onSelectTrackItem: _onSelectTrackItem,
}) => {
  const [activeType, setActiveType] = useState<'gif' | 'sticker'>('sticker');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [items, setItems] = useState<ElementMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch items from elements API with race condition protection
  useEffect(() => {
    let cancelled = false;
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    const fetchElements = async () => {
      setLoading(true);
      setError(null);
      setIsRateLimited(false);

      const chip = CATEGORY_CHIPS.find((c) => c.id === selectedCategory);
      const isTrendingCategory = selectedCategory === 'all' || selectedCategory === 'trending';

      let endpoint: string;
      if (debouncedQuery) {
        endpoint = `/elements/search?q=${encodeURIComponent(debouncedQuery)}&type=${activeType}&limit=30`;
      } else if (isTrendingCategory) {
        endpoint = `/elements/trending?type=${activeType}&limit=30`;
      } else {
        const q = chip?.query || selectedCategory;
        endpoint = `/elements/search?q=${encodeURIComponent(q)}&category=${encodeURIComponent(selectedCategory)}&type=${activeType}&limit=30`;
      }

      const filterFallback = () => {
        let filtered = CURATED_ELEMENTS_FALLBACK.filter((i) => i.type === activeType);
        if (debouncedQuery) {
          const q = debouncedQuery.toLowerCase();
          const sq = q.endsWith('s') ? q.slice(0, -1) : q;
          filtered = filtered.filter(
            (i) =>
              i.title.toLowerCase().includes(q) ||
              i.id.toLowerCase().includes(q) ||
              i.title.toLowerCase().includes(sq) ||
              i.category?.toLowerCase().includes(q) ||
              i.tags?.some((t) => t.toLowerCase().includes(q) || t.toLowerCase().includes(sq))
          );
        } else if (selectedCategory === 'trending') {
          filtered = filtered.filter(
            (i) => i.tags?.includes('trending') || i.category === 'reactions' || i.category === 'celebration'
          );
        } else if (selectedCategory !== 'all') {
          const chipQuery = chip?.query || selectedCategory;
          const catSingular = selectedCategory.endsWith('s') ? selectedCategory.slice(0, -1) : selectedCategory;
          filtered = filtered.filter(
            (i) =>
              i.category === selectedCategory ||
              i.category === catSingular ||
              i.tags?.includes(selectedCategory) ||
              i.tags?.includes(catSingular) ||
              i.tags?.includes(chipQuery) ||
              i.title.toLowerCase().includes(chipQuery)
          );
        }
        return filtered;
      };

      try {
        const data = await backendRequest<{ items: ElementMediaItem[]; code?: string }>(endpoint);

        if (!cancelled && currentRequestId === requestIdRef.current) {
          if (Array.isArray(data?.items) && data.items.length > 0) {
            setItems(data.items);
          } else {
            setItems(filterFallback());
          }
        }
      } catch (err: any) {
        if (!cancelled && currentRequestId === requestIdRef.current) {
          if (err.message && err.message.includes('429')) {
            setIsRateLimited(true);
          }
          setItems(filterFallback());
        }
      } finally {
        if (!cancelled && currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    };

    fetchElements();

    return () => {
      cancelled = true;
    };
  }, [activeType, debouncedQuery, selectedCategory]);

  const handleSelectElement = (item: ElementMediaItem) => {
    onAddElement(item);
    setRecentlyAddedId(item.id);
    setTimeout(() => {
      setRecentlyAddedId((prev) => (prev === item.id ? null : prev));
    }, 1200);
  };

  return (
    <div className="flex flex-col h-full bg-vc-surface1 text-vc-text-primary select-none animate-panelSlideIn">
      {/* HEADER */}
      <div className="p-4 border-b border-white/[0.08] shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sticker className="w-5 h-5 text-neutral-300" />
            <h2 className="text-sm font-semibold tracking-wide text-white">Elements & Stickers</h2>
          </div>
          {/* Powered by GIPHY Badge */}
          <a
            href="https://giphy.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 opacity-70 hover:opacity-100 transition text-[10px] text-vc-text-secondary"
            title="Powered by GIPHY"
          >
            <span className="font-bold tracking-tight text-neutral-300">GIPHY</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>

        {/* TYPE SWITCHER (Stickers vs GIFs) */}
        <div className="grid grid-cols-2 gap-1 bg-vc-canvas p-1 rounded-lg mb-3">
          <button
            type="button"
            onClick={() => {
              setActiveType('sticker');
              setSelectedCategory('all');
            }}
            className={`py-1.5 text-xs font-medium rounded-md transition flex items-center justify-center gap-1.5 ${
              activeType === 'sticker'
                ? 'bg-white/[0.15] text-white shadow-sm'
                : 'text-vc-text-secondary hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Stickers</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveType('gif');
              setSelectedCategory('all');
            }}
            className={`py-1.5 text-xs font-medium rounded-md transition flex items-center justify-center gap-1.5 ${
              activeType === 'gif'
                ? 'bg-white/[0.15] text-white shadow-sm'
                : 'text-vc-text-secondary hover:text-white'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>GIFs</span>
          </button>
        </div>

        {/* SEARCH BAR */}
        <div className="relative">
          <Search className="w-4 h-4 text-vc-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeType === 'sticker' ? 'stickers (emojis, arrows...)' : 'GIFs (reactions, memes...)'}`}
            className="w-full bg-vc-canvas border border-white/[0.08] rounded-lg pl-9 pr-8 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/30 transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-vc-text-muted hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* CATEGORY CHIPS */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mt-3 pt-1">
          {CATEGORY_CHIPS.map((cat) => {
            const isSelected = selectedCategory === cat.id && !searchQuery;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setSearchQuery('');
                }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition ${
                  isSelected
                    ? 'bg-white/[0.10] border border-white/40 text-white'
                    : 'bg-white/[0.04] border border-white/[0.06] text-vc-text-secondary hover:text-white hover:border-white/20'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* RATE LIMIT / WARNING BANNER */}
      {isRateLimited && (
        <div className="mx-4 mt-3 p-2.5 rounded-lg bg-amber-500/10 text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>GIPHY live limit reached. Showing curated collection.</span>
        </div>
      )}

      {/* ERROR BANNER */}
      {error && !isRateLimited && (
        <div className="mx-4 mt-3 p-2.5 rounded-lg bg-red-500/10 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* MEDIA GRID */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-xl border border-vc-border bg-white/[0.03] animate-pulse"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-vc-text-muted text-xs">
            <Sticker className="w-8 h-8 mb-2 opacity-40 text-neutral-600" />
            <p className="font-medium text-vc-text-secondary">No {activeType}s found</p>
            <p className="text-[11px] mt-1 text-neutral-600">Try searching for reactions, arrows, or memes</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {items.map((item) => {
              const isHovered = hoveredItemId === item.id;
              const isJustAdded = recentlyAddedId === item.id;

              return (
                <div
                  key={item.id}
                  onMouseEnter={() => setHoveredItemId(item.id)}
                  onMouseLeave={() => setHoveredItemId(null)}
                  onClick={() => handleSelectElement(item)}
                  className={`group relative rounded-xl border overflow-hidden cursor-pointer transition-colors flex items-center justify-center bg-vc-canvas aspect-square p-2 ${
                    isJustAdded
                      ? 'border-emerald-500 ring-2 ring-emerald-500/40'
                      : 'border-vc-border hover:border-vc-border-strong'
                  }`}
                  title={item.title}
                >
                  {/* Checkerboard pattern for transparent stickers */}
                  {item.type === 'sticker' && (
                    <div
                      className="absolute inset-0 opacity-[0.03] pointer-events-none"
                      style={{
                        backgroundImage: `linear-gradient(45deg, #fff 25%, transparent 25%), linear-gradient(-45deg, #fff 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #fff 75%), linear-gradient(-45deg, transparent 75%, #fff 75%)`,
                        backgroundSize: '12px 12px',
                        backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                      }}
                    />
                  )}

                  {/* Thumbnail Image */}
                  <img
                    src={item.previewUrl || item.sourceUrl}
                    alt={item.title}
                    loading="lazy"
                    className="max-h-full max-w-full object-contain pointer-events-none transition-transform duration-200 group-hover:scale-105"
                  />

                  {/* Tag Pill (Top Left) */}
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-black/75 text-neutral-300">
                    {item.type}
                  </div>

                  {/* Quick Add Overlay on Hover */}
                  <div
                    className={`absolute inset-0 bg-black/60 backdrop-blur-[1px] flex flex-col items-center justify-center gap-1 transition-opacity ${
                      isHovered || isJustAdded ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  >
                    {isJustAdded ? (
                      <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                        <Check className="w-4 h-4" />
                        <span>Added!</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-8 h-8 rounded-full bg-white/[0.15] flex items-center justify-center text-white shadow-lg hover:scale-110 transition">
                          <Plus className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-medium text-neutral-200">Add to Video</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FOOTER ATTRIBUTION */}
      <div className="p-3 border-t border-white/[0.08] bg-vc-canvas flex items-center justify-between text-[11px] text-vc-text-muted">
        <span>Click any element to add to canvas</span>
        <span className="font-mono text-[10px] text-vc-text-secondary">Powered by GIPHY</span>
      </div>
    </div>
  );
};
