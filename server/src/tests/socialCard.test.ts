/**
 * Social card mapper: insertion, idempotency, theme colors, corner positions,
 * user-content preservation. The card rides the existing TEXT channel so the
 * real save path and export graph carry it unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applySocialCardToProject, SOCIAL_CARD_TAG, SocialCardConfig } from '../shared/socialCard.js';

function baseProject(): any {
  return {
    id: 'p1',
    canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', fps: 30, duration: 9, background_color: '#000' },
    tracks: [
      {
        id: 'tv', type: 'VIDEO', name: 'Video 1', locked: false, muted: false, hidden: false,
        items: [
          {
            id: 'v1', track_id: 'tv', type: 'VIDEO',
            timeline_start: 0, timeline_end: 9, source_start: 0, source_end: 9,
            transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
            keyframes: [], effects: [], hidden: false, locked: false, muted: false,
          },
        ],
      },
    ],
    playhead: 0,
    settings: {},
  };
}

const cfg: SocialCardConfig = {
  enabled: true, displayName: 'Moiz', handle: 'moizbuilds',
  theme: 'dark', position: 'top-left',
};

function cardItems(p: any): any[] {
  return p.tracks.flatMap((t: any) => t.items).filter((i: any) => i.social_card === SOCIAL_CARD_TAG);
}

test('apply: inserts name + handle TEXT items, leaves user content untouched', () => {
  const next = applySocialCardToProject(baseProject(), cfg);
  const items = cardItems(next);
  // 2 TEXT chrome lines + the rounded card background (default on)
  assert.equal(items.length, 3);
  const [name, handle] = items;
  assert.equal(name.text.text, 'Moiz');
  assert.equal(handle.text.text, '@moizbuilds');
  assert.equal(name.type, 'TEXT');
  // user video item untouched
  const vid = next.tracks.find((t: any) => t.type === 'VIDEO').items[0];
  assert.equal(vid.id, 'v1');
  assert.equal(vid.social_card, undefined);
});

test('apply: theme owns text colors', () => {
  const dark = cardItems(applySocialCardToProject(baseProject(), cfg));
  assert.equal(dark[0].text.color, '#FFFFFF');
  const light = cardItems(applySocialCardToProject(baseProject(), { ...cfg, theme: 'light' }));
  assert.equal(light[0].text.color, '#111111');
});

test('apply: corners mirror around the canvas center', () => {
  const tl = cardItems(applySocialCardToProject(baseProject(), cfg));
  const br = cardItems(applySocialCardToProject(baseProject(), { ...cfg, position: 'bottom-right' }));
  assert.equal(tl[0].transform.position_x, -br[0].transform.position_x);
  assert.equal(tl[0].transform.position_y, -br[0].transform.position_y);
});

test('apply: idempotent - re-applying never stacks duplicate cards', () => {
  const once = applySocialCardToProject(baseProject(), cfg);
  const twice = applySocialCardToProject(once, { ...cfg, displayName: 'Renamed' });
  const items = cardItems(twice);
  assert.equal(items.length, 3);
  assert.equal(items[0].text.text, 'Renamed');
});

test('apply: enabled=false removes the card, keeps user TEXT items', () => {
  const withCard = applySocialCardToProject(baseProject(), cfg);
  // a user-added text item sharing the track must survive removal
  const withUserText = {
    ...withCard,
    tracks: withCard.tracks.map((t: any) =>
      t.type === 'TEXT'
        ? { ...t, items: [...t.items, { id: 'user-text', track_id: t.id, type: 'TEXT', text: { text: 'mine' }, timeline_start: 5, timeline_end: 7, transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 }, keyframes: [], effects: [], hidden: false, locked: false, muted: false }] }
        : t
    ),
  };
  const removed = applySocialCardToProject(withUserText as any, { ...cfg, enabled: false });
  assert.equal(cardItems(removed).length, 0);
  const userText = removed.tracks.flatMap((t: any) => t.items).find((i: any) => i.id === 'user-text');
  assert.ok(userText, 'user text item preserved');
});

test('apply: does not mutate the input project', () => {
  const src = baseProject();
  const snapshot = JSON.stringify(src);
  applySocialCardToProject(src, cfg);
  assert.equal(JSON.stringify(src), snapshot);
});

test('chrome: card background is a design_center OVERLAY with an exact card spec', () => {
  const next = applySocialCardToProject(baseProject(), cfg);
  const card = cardItems(next).find((i: any) => i.card);
  assert.ok(card, 'card background item present by default');
  assert.equal(card.type, 'OVERLAY');
  assert.equal(card.source_path, undefined);
  assert.equal(card.transform.position_space, 'design_center');
  assert.equal(card.card.color, '#000000');
  assert.equal(card.card.radius, 18);
  assert.ok(card.card.width <= 280 && card.card.width >= 120);
  assert.ok(card.card.height > 0);
  // text items sit above the card
  const name = cardItems(next).find((i: any) => i.text?.text === 'Moiz');
  assert.ok(name.z_index > card.z_index);
});

test('chrome: light theme card is white', () => {
  const card = cardItems(applySocialCardToProject(baseProject(), { ...cfg, theme: 'light' })).find((i: any) => i.card);
  assert.equal(card.card.color, '#FFFFFF');
});

test('chrome: cardBackground=false keeps the legacy text-only card', () => {
  const items = cardItems(applySocialCardToProject(baseProject(), { ...cfg, cardBackground: false }));
  assert.equal(items.length, 2);
  assert.ok(items.every((i: any) => i.type === 'TEXT'));
});

test('chrome: avatarUrl adds a design_center avatar above the name', () => {
  const items = cardItems(applySocialCardToProject(baseProject(), { ...cfg, avatarUrl: 'users/u1/avatar.png' }));
  const avatar = items.find((i: any) => i.source_path === 'users/u1/avatar.png');
  assert.ok(avatar, 'avatar item present');
  assert.equal(avatar.type, 'OVERLAY');
  assert.equal(avatar.transform.position_space, 'design_center');
  // 56 design px through the 280px overlay size base
  assert.ok(Math.abs(avatar.transform.scale - 56 / 280) < 1e-9);
  const name = items.find((i: any) => i.text?.text === 'Moiz');
  assert.equal(avatar.transform.position_x, name.transform.position_x);
  assert.ok(avatar.transform.position_y < name.transform.position_y, 'avatar stacked above name');
  // card grows to cover the avatar
  const card = items.find((i: any) => i.card);
  const cardTop = card.transform.position_y - card.card.height / 2;
  assert.ok(cardTop <= avatar.transform.position_y - 28, 'card covers avatar');
});

test('chrome: wider names widen the card, capped at 280 design px', () => {
  const narrow = cardItems(applySocialCardToProject(baseProject(), cfg)).find((i: any) => i.card).card.width;
  const wide = cardItems(applySocialCardToProject(baseProject(), { ...cfg, displayName: 'A Very Long Display Name Indeed' })).find((i: any) => i.card).card.width;
  assert.ok(wide > narrow);
  const huge = cardItems(applySocialCardToProject(baseProject(), { ...cfg, displayName: 'X'.repeat(80) })).find((i: any) => i.card).card.width;
  assert.equal(huge, 280);
});

test('chrome: the whole card stays on the 360px design canvas', () => {
  for (const c of [cfg, { ...cfg, avatarUrl: 'users/u1/a.png' }, { ...cfg, displayName: 'A Very Long Display Name Indeed' }]) {
    const items = cardItems(applySocialCardToProject(baseProject(), c));
    const card = items.find((i: any) => i.card);
    assert.ok(Math.abs(card.transform.position_x) + card.card.width / 2 <= 180, `x=${card.transform.position_x} w=${card.card.width}`);
    assert.ok(Math.abs(card.transform.position_y) + card.card.height / 2 <= 320, `y=${card.transform.position_y} h=${card.card.height}`);
  }
});
