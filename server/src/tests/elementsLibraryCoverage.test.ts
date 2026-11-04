import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CURATED_FALLBACK_ELEMENTS, GiphyService } from '../services/giphyService.js';

// These checks cover the built-in library, so force the no-key path even if a key is set locally.
process.env.GIPHY_API_KEY = '';

// Categories behind the Elements panel chips (Celebrate → celebration, Subscribe → like_subscribe).
const CATEGORIES = ['reactions', 'arrows', 'emojis', 'badges', 'celebration', 'memes', 'like_subscribe'];
const MIN_PER_SECTION = 6;

describe('Elements library coverage (no GIPHY key)', () => {
  it('every category has enough stickers and GIFs', () => {
    for (const type of ['sticker', 'gif'] as const) {
      for (const category of CATEGORIES) {
        const n = CURATED_FALLBACK_ELEMENTS.filter((i) => i.type === type && i.category === category).length;
        assert.ok(n >= MIN_PER_SECTION, `${type}/${category} has only ${n} items`);
      }
    }
  });

  it('ids and media are unique and point at GIPHY originals + 200w previews', () => {
    const ids = new Set<string>();
    const media = new Set<string>();
    for (const item of CURATED_FALLBACK_ELEMENTS) {
      assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
      ids.add(item.id);
      assert.ok(!media.has(item.sourceUrl), `duplicate media ${item.sourceUrl}`);
      media.add(item.sourceUrl);
      assert.match(item.sourceUrl, /^https:\/\/media\.giphy\.com\/media\/[A-Za-z0-9]+\/giphy\.gif$/);
      assert.match(item.previewUrl, /^https:\/\/media\.giphy\.com\/media\/[A-Za-z0-9]+\/200w\.gif$/);
      assert.ok(item.width > 0 && item.height > 0, `${item.id} needs real dimensions`);
      assert.equal(item.rating, 'g');
    }
  });

  it('chip queries resolve to their sections', async () => {
    const celebrate = await GiphyService.searchElements({ type: 'sticker', category: 'celebrate', query: 'celebrate' });
    assert.ok(celebrate.items.length >= MIN_PER_SECTION);
    const subscribe = await GiphyService.searchElements({ type: 'gif', category: 'like_subscribe', query: 'subscribe' });
    assert.ok(subscribe.items.length >= MIN_PER_SECTION);
    assert.ok(subscribe.items.every((i) => i.type === 'gif'));
  });

  it('Trending returns only trending items; All returns the whole library, trending first', async () => {
    const trending = await GiphyService.searchElements({ type: 'sticker', category: 'trending', query: 'trending' });
    assert.ok(trending.items.length > 0);
    assert.ok(trending.items.every((i) => i.tags?.includes('trending')));

    const all = await GiphyService.getTrendingElements({ type: 'sticker', limit: 50 });
    const stickers = CURATED_FALLBACK_ELEMENTS.filter((i) => i.type === 'sticker');
    assert.equal(all.totalCount, stickers.length);
    const firstNonTrending = all.items.findIndex((i) => !i.tags?.includes('trending'));
    assert.ok(all.items.slice(firstNonTrending).every((i) => !i.tags?.includes('trending')), 'trending items come first');
  });

  it('frontend fallback mirrors the server library', () => {
    const panel = fs.readFileSync(path.resolve('src/components/editor/ElementsWorkspacePanel.tsx'), 'utf8');
    for (const item of CURATED_FALLBACK_ELEMENTS) {
      assert.ok(panel.includes(item.sourceUrl), `frontend fallback is missing ${item.id}`);
    }
    assert.match(panel, /\{ id: 'like_subscribe', label: 'Subscribe', query: 'subscribe' \}/);
  });
});
