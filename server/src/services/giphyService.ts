import { Request, Response } from 'express';
import { logger } from '../utils/logger.js';

export interface GiphyMediaItem {
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

export interface GiphyCategory {
  id: string;
  name: string;
  type: 'gif' | 'sticker';
  query: string;
}

export const ELEMENT_CATEGORIES: GiphyCategory[] = [
  { id: 'all', name: 'All Elements', type: 'sticker', query: '' },
  { id: 'trending', name: 'Trending', type: 'gif', query: 'trending' },
  { id: 'reactions', name: 'Reactions', type: 'gif', query: 'reaction' },
  { id: 'arrows', name: 'Arrows & Pointers', type: 'sticker', query: 'arrow' },
  { id: 'emojis', name: 'Animated Emojis', type: 'sticker', query: 'emoji' },
  { id: 'badges', name: 'Badges & Seals', type: 'sticker', query: 'badge' },
  { id: 'celebration', name: 'Celebration', type: 'gif', query: 'celebrate' },
  { id: 'memes', name: 'Viral Memes', type: 'gif', query: 'meme' },
  { id: 'like_subscribe', name: 'Subscribe & Like', type: 'sticker', query: 'subscribe' },
];

/**
 * High-quality curated fallback elements (used when GIPHY_API_KEY is not set or in offline/test environments).
 * These ensure full functional verification of canvas placement, timeline, and export without external network dependencies.
 */
export const CURATED_FALLBACK_ELEMENTS: GiphyMediaItem[] = [
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

export class GiphyService {
  private static get apiKey(): string | undefined {
    return process.env.GIPHY_API_KEY?.trim();
  }

  public static isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 5);
  }

  /**
   * Search GIFs or Stickers via GIPHY API, with fallback to curated elements.
   */
  public static async searchElements(params: {
    query: string;
    category?: string;
    type?: 'gif' | 'sticker';
    limit?: number;
    offset?: number;
    rating?: string;
  }): Promise<{ items: GiphyMediaItem[]; totalCount: number; isFallback: boolean; attribution: string }> {
    const type = params.type || 'gif';
    const limit = Math.max(1, Math.min(50, params.limit || 24));
    const offset = Math.max(0, params.offset || 0);
    const query = (params.query || '').trim();
    const category = (params.category || '').trim().toLowerCase();

    if (!this.isConfigured()) {
      let filtered = CURATED_FALLBACK_ELEMENTS.filter((item) => (type ? item.type === type : true));

      // Category filter (if specific category chosen)
      if (category && category !== 'all') {
        const catSingular = category.endsWith('s') ? category.slice(0, -1) : category;
        filtered = filtered.filter(
          (item) =>
            item.category?.toLowerCase() === category ||
            item.category?.toLowerCase() === catSingular ||
            item.tags?.some((t) => t.toLowerCase() === category || t.toLowerCase() === catSingular)
        );
      }

      // Query filter
      if (query) {
        const q = query.toLowerCase();
        const singularQ = q.endsWith('s') ? q.slice(0, -1) : q;
        filtered = filtered.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.id.toLowerCase().includes(q) ||
            item.title.toLowerCase().includes(singularQ) ||
            item.category?.toLowerCase().includes(q) ||
            item.tags?.some((t) => t.toLowerCase().includes(q) || t.toLowerCase().includes(singularQ))
        );
      }

      const paged = filtered.slice(offset, offset + limit);
      return {
        items: paged,
        totalCount: filtered.length,
        isFallback: true,
        attribution: 'Powered by GIPHY',
      };
    }

    const endpoint = type === 'sticker' ? 'stickers/search' : 'gifs/search';
    const url = new URL(`https://api.giphy.com/v1/${endpoint}`);
    url.searchParams.set('api_key', this.apiKey!);
    url.searchParams.set('q', query || category || 'trending');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('rating', params.rating || 'g');
    url.searchParams.set('lang', 'en');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        if (resp.status === 429) {
          logger.warn('GIPHY API rate limit exceeded.');
          throw new Error('GIPHY_RATE_LIMIT');
        }
        logger.error(`GIPHY API returned HTTP ${resp.status}`);
        throw new Error(`GIPHY_API_ERROR_${resp.status}`);
      }

      const json = (await resp.json()) as any;
      const data = Array.isArray(json.data) ? json.data : [];

      const items: GiphyMediaItem[] = data.map((item: any) => {
        const images = item.images || {};
        const sourceUrl =
          images.fixed_height?.url ||
          images.original?.url ||
          images.downsized?.url ||
          item.url;
        const previewUrl =
          images.fixed_height_small?.url ||
          images.fixed_width_downsampled?.url ||
          images.preview_gif?.url ||
          sourceUrl;

        return {
          id: item.id,
          type,
          title: item.title || `${type.toUpperCase()} from GIPHY`,
          sourceUrl,
          previewUrl,
          width: parseInt(images.fixed_height?.width || images.original?.width || '320', 10),
          height: parseInt(images.fixed_height?.height || images.original?.height || '320', 10),
          rating: item.rating,
        };
      });

      return {
        items,
        totalCount: json.pagination?.total_count || items.length,
        isFallback: false,
        attribution: 'Powered by GIPHY',
      };
    } catch (err: any) {
      if (err.message === 'GIPHY_RATE_LIMIT') {
        throw err;
      }
      logger.error('Failed to fetch from GIPHY API; falling back to curated elements', { error: err.message });
      let filtered = CURATED_FALLBACK_ELEMENTS.filter((item) => item.type === type);
      if (category && category !== 'all') {
        filtered = filtered.filter(
          (item) => item.category === category || item.tags?.includes(category)
        );
      }
      return {
        items: filtered.slice(offset, offset + limit),
        totalCount: filtered.length,
        isFallback: true,
        attribution: 'Powered by GIPHY',
      };
    }
  }

  /**
   * Trending GIFs or Stickers
   */
  public static async getTrendingElements(params: {
    type?: 'gif' | 'sticker';
    limit?: number;
    offset?: number;
    rating?: string;
  }): Promise<{ items: GiphyMediaItem[]; totalCount: number; isFallback: boolean; attribution: string }> {
    const type = params.type || 'gif';
    const limit = Math.max(1, Math.min(50, params.limit || 24));
    const offset = Math.max(0, params.offset || 0);

    if (!this.isConfigured()) {
      // Prioritize items tagged trending or popular
      const typeItems = CURATED_FALLBACK_ELEMENTS.filter((item) => item.type === type);
      const trendingItems = typeItems.filter(
        (item) => item.tags?.includes('trending') || item.category === 'reactions' || item.category === 'celebration'
      );
      const combined = trendingItems.length > 0 ? trendingItems : typeItems;
      return {
        items: combined.slice(offset, offset + limit),
        totalCount: combined.length,
        isFallback: true,
        attribution: 'Powered by GIPHY',
      };
    }

    const endpoint = type === 'sticker' ? 'stickers/trending' : 'gifs/trending';
    const url = new URL(`https://api.giphy.com/v1/${endpoint}`);
    url.searchParams.set('api_key', this.apiKey!);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('rating', params.rating || 'g');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        throw new Error(`GIPHY_API_ERROR_${resp.status}`);
      }

      const json = (await resp.json()) as any;
      const data = Array.isArray(json.data) ? json.data : [];

      const items: GiphyMediaItem[] = data.map((item: any) => {
        const images = item.images || {};
        const sourceUrl =
          images.fixed_height?.url ||
          images.original?.url ||
          images.downsized?.url ||
          item.url;
        const previewUrl =
          images.fixed_height_small?.url ||
          images.fixed_width_downsampled?.url ||
          sourceUrl;

        return {
          id: item.id,
          type,
          title: item.title || `${type.toUpperCase()} from GIPHY`,
          sourceUrl,
          previewUrl,
          width: parseInt(images.fixed_height?.width || '320', 10),
          height: parseInt(images.fixed_height?.height || '320', 10),
          rating: item.rating,
        };
      });

      return {
        items,
        totalCount: json.pagination?.total_count || items.length,
        isFallback: false,
        attribution: 'Powered by GIPHY',
      };
    } catch (err: any) {
      logger.error('Failed to fetch trending from GIPHY API; using curated fallback', { error: err.message });
      const filtered = CURATED_FALLBACK_ELEMENTS.filter((item) => item.type === type);
      return {
        items: filtered.slice(offset, offset + limit),
        totalCount: filtered.length,
        isFallback: true,
        attribution: 'Powered by GIPHY',
      };
    }
  }
}
