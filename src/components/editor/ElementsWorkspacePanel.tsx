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
    type: 'gif',
    title: 'Colorful Fireworks GIF',
    sourceUrl: 'https://media.giphy.com/media/26tOZ42Mg6pbTUPHW/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/26tOZ42Mg6pbTUPHW/200w.gif',
    width: 320,
    height: 320,
    rating: 'g',
    category: 'celebration',
    tags: ['fireworks', 'celebrate', 'celebration', 'party', 'trending'],
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
  // ── Expanded library: verified GIPHY items for every category (stickers + GIFs) ──
  {
    id: 'giphy_bgIUovWAtVaNixyZG2',
    type: 'sticker',
    title: 'No Way Wow Sticker',
    sourceUrl: 'https://media.giphy.com/media/bgIUovWAtVaNixyZG2/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/bgIUovWAtVaNixyZG2/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'reactions',
    tags: ['wow', 'omg', 'surprise', 'reactions', 'trending'],
  },
  {
    id: 'giphy_f9haOLGzoMPoJEp07I',
    type: 'sticker',
    title: 'Hands Up Wow Sticker',
    sourceUrl: 'https://media.giphy.com/media/f9haOLGzoMPoJEp07I/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/f9haOLGzoMPoJEp07I/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'reactions',
    tags: ['wow', 'excited', 'hype', 'reactions'],
  },
  {
    id: 'giphy_xUA7b7SQ5ZhNrIJAMo',
    type: 'sticker',
    title: 'Surprised Face Sticker',
    sourceUrl: 'https://media.giphy.com/media/xUA7b7SQ5ZhNrIJAMo/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/xUA7b7SQ5ZhNrIJAMo/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'reactions',
    tags: ['surprised', 'shock', 'omg', 'reactions'],
  },
  {
    id: 'giphy_9lysN9HWOPYPZDtqj7',
    type: 'sticker',
    title: 'Wow Face Sticker',
    sourceUrl: 'https://media.giphy.com/media/9lysN9HWOPYPZDtqj7/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/9lysN9HWOPYPZDtqj7/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'reactions',
    tags: ['wow', 'face', 'amazed', 'reactions'],
  },
  {
    id: 'giphy_8cgf7z1wtBSusvxkDp',
    type: 'sticker',
    title: 'Surprise Wow Sticker',
    sourceUrl: 'https://media.giphy.com/media/8cgf7z1wtBSusvxkDp/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/8cgf7z1wtBSusvxkDp/200w.gif',
    width: 500,
    height: 500,
    rating: 'g',
    category: 'reactions',
    tags: ['surprise', 'wow', 'cute', 'reactions'],
  },
  {
    id: 'giphy_Q1OdBWGGvcizt37BVP',
    type: 'sticker',
    title: 'Oh My God Sticker',
    sourceUrl: 'https://media.giphy.com/media/Q1OdBWGGvcizt37BVP/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/Q1OdBWGGvcizt37BVP/200w.gif',
    width: 461,
    height: 480,
    rating: 'g',
    category: 'reactions',
    tags: ['omg', 'wow', 'text', 'reactions', 'trending'],
  },
  {
    id: 'giphy_h2ZHafpzqVXssKkBbt',
    type: 'sticker',
    title: 'Mind Blown Sticker',
    sourceUrl: 'https://media.giphy.com/media/h2ZHafpzqVXssKkBbt/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/h2ZHafpzqVXssKkBbt/200w.gif',
    width: 350,
    height: 233,
    rating: 'g',
    category: 'reactions',
    tags: ['mind blown', 'explode', 'wow', 'reactions', 'trending'],
  },
  {
    id: 'giphy_nuoSzPYhqz3qCbSMMq',
    type: 'sticker',
    title: 'Pixel Surprise Sticker',
    sourceUrl: 'https://media.giphy.com/media/nuoSzPYhqz3qCbSMMq/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/nuoSzPYhqz3qCbSMMq/200w.gif',
    width: 500,
    height: 500,
    rating: 'g',
    category: 'reactions',
    tags: ['surprise', 'pixel', 'wow', 'reactions'],
  },
  {
    id: 'giphy_dSmw9tT59Tm5HYWcN4',
    type: 'sticker',
    title: 'No Way Sticker',
    sourceUrl: 'https://media.giphy.com/media/dSmw9tT59Tm5HYWcN4/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/dSmw9tT59Tm5HYWcN4/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'reactions',
    tags: ['no way', 'shock', 'text', 'reactions'],
  },
  {
    id: 'giphy_ibjOWWBs0x3c2syap9',
    type: 'sticker',
    title: 'Fire Burst Sticker',
    sourceUrl: 'https://media.giphy.com/media/ibjOWWBs0x3c2syap9/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/ibjOWWBs0x3c2syap9/200w.gif',
    width: 456,
    height: 480,
    rating: 'g',
    category: 'reactions',
    tags: ['fire', 'flame', 'lit', 'hot', 'reactions', 'trending'],
  },
  {
    id: 'giphy_TdpjDZfxgFyDhY4rwY',
    type: 'sticker',
    title: 'Looping Fire Sticker',
    sourceUrl: 'https://media.giphy.com/media/TdpjDZfxgFyDhY4rwY/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/TdpjDZfxgFyDhY4rwY/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'reactions',
    tags: ['fire', 'flame', 'lit', 'hot', 'reactions'],
  },
  {
    id: 'giphy_WE066ErCk0Z91fLgaJ',
    type: 'sticker',
    title: 'Burning Flame Sticker',
    sourceUrl: 'https://media.giphy.com/media/WE066ErCk0Z91fLgaJ/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/WE066ErCk0Z91fLgaJ/200w.gif',
    width: 480,
    height: 222,
    rating: 'g',
    category: 'reactions',
    tags: ['fire', 'flame', 'burn', 'reactions'],
  },
  {
    id: 'giphy_hOQQGD5h7iwYCoaqfK',
    type: 'sticker',
    title: 'Fire Burn Sticker',
    sourceUrl: 'https://media.giphy.com/media/hOQQGD5h7iwYCoaqfK/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/hOQQGD5h7iwYCoaqfK/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'reactions',
    tags: ['fire', 'flame', 'hot', 'reactions'],
  },
  {
    id: 'giphy_SDQWs8KSqjJ8rrKAUb',
    type: 'sticker',
    title: 'Bouncing Arrow Sticker',
    sourceUrl: 'https://media.giphy.com/media/SDQWs8KSqjJ8rrKAUb/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/SDQWs8KSqjJ8rrKAUb/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'arrows',
    tags: ['arrow', 'point', 'direction', 'arrows'],
  },
  {
    id: 'giphy_Bbtt7TNygikGLUQf6X',
    type: 'sticker',
    title: 'Red Arrow Pointing Sticker',
    sourceUrl: 'https://media.giphy.com/media/Bbtt7TNygikGLUQf6X/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/Bbtt7TNygikGLUQf6X/200w.gif',
    width: 480,
    height: 360,
    rating: 'g',
    category: 'arrows',
    tags: ['arrow', 'red', 'point', 'arrows', 'trending'],
  },
  {
    id: 'giphy_hvPNeP1uQOAJIEc6YX',
    type: 'sticker',
    title: 'Hand-drawn Arrow Sticker',
    sourceUrl: 'https://media.giphy.com/media/hvPNeP1uQOAJIEc6YX/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/hvPNeP1uQOAJIEc6YX/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'arrows',
    tags: ['arrow', 'doodle', 'point', 'arrows'],
  },
  {
    id: 'giphy_YckWAcjkSZ66d5P6Fh',
    type: 'sticker',
    title: 'Look Here Arrow Sticker',
    sourceUrl: 'https://media.giphy.com/media/YckWAcjkSZ66d5P6Fh/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/YckWAcjkSZ66d5P6Fh/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'arrows',
    tags: ['look here', 'arrow', 'text', 'arrows'],
  },
  {
    id: 'giphy_UDNftoQb9oYY6x4qoG',
    type: 'sticker',
    title: 'Curved Red Arrow Sticker',
    sourceUrl: 'https://media.giphy.com/media/UDNftoQb9oYY6x4qoG/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/UDNftoQb9oYY6x4qoG/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'arrows',
    tags: ['arrow', 'curved', 'red', 'right', 'arrows'],
  },
  {
    id: 'giphy_irRmA2qyRCo7wcmIiC',
    type: 'sticker',
    title: 'Click This Way Sticker',
    sourceUrl: 'https://media.giphy.com/media/irRmA2qyRCo7wcmIiC/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/irRmA2qyRCo7wcmIiC/200w.gif',
    width: 500,
    height: 500,
    rating: 'g',
    category: 'arrows',
    tags: ['click', 'arrow', 'this way', 'text', 'arrows'],
  },
  {
    id: 'giphy_KDhKM9QPmC4MeoXYbt',
    type: 'sticker',
    title: 'Swipe Up Sticker',
    sourceUrl: 'https://media.giphy.com/media/KDhKM9QPmC4MeoXYbt/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/KDhKM9QPmC4MeoXYbt/200w.gif',
    width: 393,
    height: 480,
    rating: 'g',
    category: 'arrows',
    tags: ['swipe up', 'arrow', 'cta', 'arrows'],
  },
  {
    id: 'giphy_haeIE71peF1zqgBypT',
    type: 'sticker',
    title: 'Swipe Up Look Here Sticker',
    sourceUrl: 'https://media.giphy.com/media/haeIE71peF1zqgBypT/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/haeIE71peF1zqgBypT/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'arrows',
    tags: ['swipe up', 'look here', 'arrow', 'arrows'],
  },
  {
    id: 'giphy_euj8QInBh1aVDf3ntu',
    type: 'sticker',
    title: 'Heart Swipe Up Sticker',
    sourceUrl: 'https://media.giphy.com/media/euj8QInBh1aVDf3ntu/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/euj8QInBh1aVDf3ntu/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'arrows',
    tags: ['swipe up', 'heart', 'arrow', 'arrows'],
  },
  {
    id: 'giphy_ADBqGiTdefTnR2v5SI',
    type: 'sticker',
    title: 'Swipe Up Arrows Sticker',
    sourceUrl: 'https://media.giphy.com/media/ADBqGiTdefTnR2v5SI/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/ADBqGiTdefTnR2v5SI/200w.gif',
    width: 700,
    height: 700,
    rating: 'g',
    category: 'arrows',
    tags: ['swipe up', 'arrow', 'up', 'arrows'],
  },
  {
    id: 'giphy_UuN8I0hAgRd72ZH7AE',
    type: 'sticker',
    title: 'Pink Swipe Up Sticker',
    sourceUrl: 'https://media.giphy.com/media/UuN8I0hAgRd72ZH7AE/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/UuN8I0hAgRd72ZH7AE/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'arrows',
    tags: ['swipe up', 'pink', 'arrow', 'arrows'],
  },
  {
    id: 'giphy_PmXsJnwzEebcoO88HN',
    type: 'sticker',
    title: 'Smile Emoji Sticker',
    sourceUrl: 'https://media.giphy.com/media/PmXsJnwzEebcoO88HN/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/PmXsJnwzEebcoO88HN/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'emojis',
    tags: ['smile', 'happy', 'emoji', 'emojis'],
  },
  {
    id: 'giphy_PmuLLvty3SDOIaEh77',
    type: 'sticker',
    title: 'I Love You Hearts Sticker',
    sourceUrl: 'https://media.giphy.com/media/PmuLLvty3SDOIaEh77/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/PmuLLvty3SDOIaEh77/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'emojis',
    tags: ['love', 'hearts', 'emoji', 'emojis', 'trending'],
  },
  {
    id: 'giphy_hVlZnRT6QW1DeYj6We',
    type: 'sticker',
    title: 'Ha Ha Laughing Emoji Sticker',
    sourceUrl: 'https://media.giphy.com/media/hVlZnRT6QW1DeYj6We/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/hVlZnRT6QW1DeYj6We/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'emojis',
    tags: ['laugh', 'haha', 'lol', 'emoji', 'emojis', 'trending'],
  },
  {
    id: 'giphy_gOj9DTDLAx2IhYw3gW',
    type: 'sticker',
    title: 'Happy In Love Sticker',
    sourceUrl: 'https://media.giphy.com/media/gOj9DTDLAx2IhYw3gW/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/gOj9DTDLAx2IhYw3gW/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'emojis',
    tags: ['love', 'happy', 'emoji', 'emojis'],
  },
  {
    id: 'giphy_vAxS6tBr7RLBP199Oh',
    type: 'sticker',
    title: 'Sad 3D Emoji Sticker',
    sourceUrl: 'https://media.giphy.com/media/vAxS6tBr7RLBP199Oh/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/vAxS6tBr7RLBP199Oh/200w.gif',
    width: 256,
    height: 256,
    rating: 'g',
    category: 'emojis',
    tags: ['sad', 'cry', 'emoji', '3d', 'emojis'],
  },
  {
    id: 'giphy_t6IYNvfpird4HC70qE',
    type: 'sticker',
    title: 'Shocked Emoji Sticker',
    sourceUrl: 'https://media.giphy.com/media/t6IYNvfpird4HC70qE/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/t6IYNvfpird4HC70qE/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'emojis',
    tags: ['shocked', 'omg', 'emoji', 'emojis'],
  },
  {
    id: 'giphy_ZoZk28cjtWWBZdFVtL',
    type: 'sticker',
    title: 'Heart Eyes Sticker',
    sourceUrl: 'https://media.giphy.com/media/ZoZk28cjtWWBZdFVtL/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/ZoZk28cjtWWBZdFVtL/200w.gif',
    width: 480,
    height: 438,
    rating: 'g',
    category: 'emojis',
    tags: ['love', 'heart eyes', 'emoji', 'emojis'],
  },
  {
    id: 'giphy_03GhuyellOSFOKGbCr',
    type: 'sticker',
    title: 'Happy Face Sticker',
    sourceUrl: 'https://media.giphy.com/media/03GhuyellOSFOKGbCr/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/03GhuyellOSFOKGbCr/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'emojis',
    tags: ['happy', 'smile', 'emoji', 'emojis'],
  },
  {
    id: 'giphy_P5SZi1hHz3KZTTzDj0',
    type: 'sticker',
    title: 'Mood Emoji Sticker',
    sourceUrl: 'https://media.giphy.com/media/P5SZi1hHz3KZTTzDj0/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/P5SZi1hHz3KZTTzDj0/200w.gif',
    width: 477,
    height: 480,
    rating: 'g',
    category: 'emojis',
    tags: ['mood', 'face', 'emoji', 'emojis'],
  },
  {
    id: 'giphy_VBSEZYP3IkqxBHnF6N',
    type: 'sticker',
    title: 'Salute Emoji Sticker',
    sourceUrl: 'https://media.giphy.com/media/VBSEZYP3IkqxBHnF6N/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/VBSEZYP3IkqxBHnF6N/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'emojis',
    tags: ['salute', 'respect', 'emoji', 'emojis'],
  },
  {
    id: 'giphy_uG1Grx8owuyPSORALz',
    type: 'sticker',
    title: 'Brand New Sticker',
    sourceUrl: 'https://media.giphy.com/media/uG1Grx8owuyPSORALz/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/uG1Grx8owuyPSORALz/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'badges',
    tags: ['new', 'badge', 'label', 'badges'],
  },
  {
    id: 'giphy_5K1geMwEy9Iqa8sPf6',
    type: 'sticker',
    title: 'New Post Sticker',
    sourceUrl: 'https://media.giphy.com/media/5K1geMwEy9Iqa8sPf6/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/5K1geMwEy9Iqa8sPf6/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'badges',
    tags: ['new post', 'badge', 'new', 'badges', 'trending'],
  },
  {
    id: 'giphy_VAdQZWTN5BNj5lC5Iz',
    type: 'sticker',
    title: 'New Post Flash Sticker',
    sourceUrl: 'https://media.giphy.com/media/VAdQZWTN5BNj5lC5Iz/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/VAdQZWTN5BNj5lC5Iz/200w.gif',
    width: 480,
    height: 439,
    rating: 'g',
    category: 'badges',
    tags: ['new post', 'badge', 'badges'],
  },
  {
    id: 'giphy_8rSLTryw3SDvdjzg4q',
    type: 'sticker',
    title: 'New Post Burst Sticker',
    sourceUrl: 'https://media.giphy.com/media/8rSLTryw3SDvdjzg4q/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/8rSLTryw3SDvdjzg4q/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'badges',
    tags: ['new post', 'badge', 'new', 'badges'],
  },
  {
    id: 'giphy_WA4aaWSojfaEqxRb1C',
    type: 'sticker',
    title: 'New Gold Badge Sticker',
    sourceUrl: 'https://media.giphy.com/media/WA4aaWSojfaEqxRb1C/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/WA4aaWSojfaEqxRb1C/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'badges',
    tags: ['label', 'tag', 'badge', 'badges'],
  },
  {
    id: 'giphy_dfUyzQmmEysy7k7WVA',
    type: 'sticker',
    title: 'Sale Discount Sticker',
    sourceUrl: 'https://media.giphy.com/media/dfUyzQmmEysy7k7WVA/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/dfUyzQmmEysy7k7WVA/200w.gif',
    width: 480,
    height: 369,
    rating: 'g',
    category: 'badges',
    tags: ['sale', 'discount', 'badge', 'badges'],
  },
  {
    id: 'giphy_OGIMN1ROXDPStIAwYM',
    type: 'sticker',
    title: 'Sale Tag Sticker',
    sourceUrl: 'https://media.giphy.com/media/OGIMN1ROXDPStIAwYM/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/OGIMN1ROXDPStIAwYM/200w.gif',
    width: 480,
    height: 320,
    rating: 'g',
    category: 'badges',
    tags: ['sale', 'tag', 'badge', 'badges'],
  },
  {
    id: 'giphy_O98tTVjKZw9gY72aTL',
    type: 'sticker',
    title: 'Shopping Spree Sticker',
    sourceUrl: 'https://media.giphy.com/media/O98tTVjKZw9gY72aTL/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/O98tTVjKZw9gY72aTL/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'badges',
    tags: ['shopping', 'sale', 'badge', 'badges'],
  },
  {
    id: 'giphy_LmTlw5rKlVBFJXLXTT',
    type: 'sticker',
    title: 'Sale Deal Sticker',
    sourceUrl: 'https://media.giphy.com/media/LmTlw5rKlVBFJXLXTT/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/LmTlw5rKlVBFJXLXTT/200w.gif',
    width: 400,
    height: 295,
    rating: 'g',
    category: 'badges',
    tags: ['sale', 'deal', 'badge', 'badges'],
  },
  {
    id: 'giphy_u7Lqr8BhhWbvasXFpy',
    type: 'sticker',
    title: 'Best Price Ribbon Sticker',
    sourceUrl: 'https://media.giphy.com/media/u7Lqr8BhhWbvasXFpy/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/u7Lqr8BhhWbvasXFpy/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'badges',
    tags: ['sale', 'discount', 'badge', 'badges'],
  },
  {
    id: 'giphy_RylKTvy2g9bozX6hcN',
    type: 'sticker',
    title: 'Swinging Sale Tag Sticker',
    sourceUrl: 'https://media.giphy.com/media/RylKTvy2g9bozX6hcN/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/RylKTvy2g9bozX6hcN/200w.gif',
    width: 480,
    height: 384,
    rating: 'g',
    category: 'badges',
    tags: ['cart', 'shopping', 'badge', 'badges'],
  },
  {
    id: 'giphy_kYeYm9lihLUI8I0igI',
    type: 'sticker',
    title: 'Party Celebrate Sticker',
    sourceUrl: 'https://media.giphy.com/media/kYeYm9lihLUI8I0igI/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/kYeYm9lihLUI8I0igI/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'celebration',
    tags: ['party', 'celebrate', 'celebration', 'trending'],
  },
  {
    id: 'giphy_PotiYSwEnO33KX007a',
    type: 'sticker',
    title: 'Falling Confetti Sticker',
    sourceUrl: 'https://media.giphy.com/media/PotiYSwEnO33KX007a/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/PotiYSwEnO33KX007a/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'celebration',
    tags: ['confetti', 'celebrate', 'celebration', 'trending'],
  },
  {
    id: 'giphy_7EAVOeRWc825rGR1FW',
    type: 'sticker',
    title: 'Confetti Pop Sticker',
    sourceUrl: 'https://media.giphy.com/media/7EAVOeRWc825rGR1FW/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/7EAVOeRWc825rGR1FW/200w.gif',
    width: 360,
    height: 480,
    rating: 'g',
    category: 'celebration',
    tags: ['confetti', 'celebrate', 'celebration'],
  },
  {
    id: 'giphy_BiEoa3vwfoH4nD76of',
    type: 'sticker',
    title: 'Congratulations Sticker',
    sourceUrl: 'https://media.giphy.com/media/BiEoa3vwfoH4nD76of/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/BiEoa3vwfoH4nD76of/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'celebration',
    tags: ['congrats', 'celebrate', 'celebration'],
  },
  {
    id: 'giphy_2nOSQ6ZIZo4IIFQ1Ud',
    type: 'sticker',
    title: 'Happy Celebration Sticker',
    sourceUrl: 'https://media.giphy.com/media/2nOSQ6ZIZo4IIFQ1Ud/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/2nOSQ6ZIZo4IIFQ1Ud/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'celebration',
    tags: ['happy', 'celebrate', 'celebration'],
  },
  {
    id: 'giphy_MpYLZ1XllkyzDZwpv2',
    type: 'sticker',
    title: 'Happy Birthday Sticker',
    sourceUrl: 'https://media.giphy.com/media/MpYLZ1XllkyzDZwpv2/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/MpYLZ1XllkyzDZwpv2/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'celebration',
    tags: ['birthday', 'celebrate', 'celebration'],
  },
  {
    id: 'giphy_S3nZ8V9uemShxiWX8g',
    type: 'sticker',
    title: 'Good Job Sticker',
    sourceUrl: 'https://media.giphy.com/media/S3nZ8V9uemShxiWX8g/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/S3nZ8V9uemShxiWX8g/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'celebration',
    tags: ['good job', 'congrats', 'celebrate', 'celebration'],
  },
  {
    id: 'giphy_fW4qzqnk9WluHMbAtZ',
    type: 'sticker',
    title: 'Party Streamers Sticker',
    sourceUrl: 'https://media.giphy.com/media/fW4qzqnk9WluHMbAtZ/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/fW4qzqnk9WluHMbAtZ/200w.gif',
    width: 480,
    height: 270,
    rating: 'g',
    category: 'celebration',
    tags: ['party', 'celebrate', 'celebration'],
  },
  {
    id: 'giphy_2neucQvRXgddx8K5rV',
    type: 'sticker',
    title: 'Smiling Cat Sticker',
    sourceUrl: 'https://media.giphy.com/media/2neucQvRXgddx8K5rV/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/2neucQvRXgddx8K5rV/200w.gif',
    width: 320,
    height: 480,
    rating: 'g',
    category: 'memes',
    tags: ['cat', 'smile', 'meme', 'memes', 'trending'],
  },
  {
    id: 'giphy_BXjqytvu9bKzCUHdzz',
    type: 'sticker',
    title: 'Jam Cat Sticker',
    sourceUrl: 'https://media.giphy.com/media/BXjqytvu9bKzCUHdzz/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/BXjqytvu9bKzCUHdzz/200w.gif',
    width: 112,
    height: 112,
    rating: 'g',
    category: 'memes',
    tags: ['cat', 'vibing', 'meme', 'memes', 'trending'],
  },
  {
    id: 'giphy_NEmydmd0cXFdj4ZH9m',
    type: 'sticker',
    title: 'Shocked Cat Sticker',
    sourceUrl: 'https://media.giphy.com/media/NEmydmd0cXFdj4ZH9m/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/NEmydmd0cXFdj4ZH9m/200w.gif',
    width: 500,
    height: 500,
    rating: 'g',
    category: 'memes',
    tags: ['cat', 'shocked', 'meme', 'memes'],
  },
  {
    id: 'giphy_JXYpWj1qM7YTPesiVB',
    type: 'sticker',
    title: 'Cat Escaping Sticker',
    sourceUrl: 'https://media.giphy.com/media/JXYpWj1qM7YTPesiVB/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/JXYpWj1qM7YTPesiVB/200w.gif',
    width: 128,
    height: 125,
    rating: 'g',
    category: 'memes',
    tags: ['cat', 'run', 'meme', 'memes'],
  },
  {
    id: 'giphy_C1GAgvaNL7JgGA6NH4',
    type: 'sticker',
    title: 'Confused Monkey Sticker',
    sourceUrl: 'https://media.giphy.com/media/C1GAgvaNL7JgGA6NH4/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/C1GAgvaNL7JgGA6NH4/200w.gif',
    width: 220,
    height: 253,
    rating: 'g',
    category: 'memes',
    tags: ['monkey', 'confused', 'meme', 'memes'],
  },
  {
    id: 'giphy_yzNqF1iOzFgHjEBt2h',
    type: 'sticker',
    title: 'Laughing Dog Sticker',
    sourceUrl: 'https://media.giphy.com/media/yzNqF1iOzFgHjEBt2h/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/yzNqF1iOzFgHjEBt2h/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'memes',
    tags: ['dog', 'laugh', 'lol', 'meme', 'memes', 'trending'],
  },
  {
    id: 'giphy_eHKxvjF3rvlORqe0LB',
    type: 'sticker',
    title: 'LOL Dog Sticker',
    sourceUrl: 'https://media.giphy.com/media/eHKxvjF3rvlORqe0LB/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/eHKxvjF3rvlORqe0LB/200w.gif',
    width: 618,
    height: 618,
    rating: 'g',
    category: 'memes',
    tags: ['dog', 'lol', 'meme', 'memes'],
  },
  {
    id: 'giphy_IrSd9WXpBXWyG8NEtN',
    type: 'sticker',
    title: 'Jumping Dog Sticker',
    sourceUrl: 'https://media.giphy.com/media/IrSd9WXpBXWyG8NEtN/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/IrSd9WXpBXWyG8NEtN/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'memes',
    tags: ['dog', 'jump', 'happy', 'meme', 'memes'],
  },
  {
    id: 'giphy_6fmLmrAHoEz0k',
    type: 'sticker',
    title: 'Spinning Dog Sticker',
    sourceUrl: 'https://media.giphy.com/media/6fmLmrAHoEz0k/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/6fmLmrAHoEz0k/200w.gif',
    width: 109,
    height: 125,
    rating: 'g',
    category: 'memes',
    tags: ['dog', 'spin', 'meme', 'memes'],
  },
  {
    id: 'giphy_DS52bWLj4zbGsxD628',
    type: 'sticker',
    title: 'Dancing Pug Sticker',
    sourceUrl: 'https://media.giphy.com/media/DS52bWLj4zbGsxD628/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/DS52bWLj4zbGsxD628/200w.gif',
    width: 480,
    height: 386,
    rating: 'g',
    category: 'memes',
    tags: ['dog', 'pug', 'dance', 'meme', 'memes'],
  },
  {
    id: 'giphy_ksd4N7sHcyaXhlM24g',
    type: 'sticker',
    title: 'YouTube Love Sticker',
    sourceUrl: 'https://media.giphy.com/media/ksd4N7sHcyaXhlM24g/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/ksd4N7sHcyaXhlM24g/200w.gif',
    width: 480,
    height: 285,
    rating: 'g',
    category: 'like_subscribe',
    tags: ['youtube', 'love', 'subscribe', 'like_subscribe'],
  },
  {
    id: 'giphy_Ve5hR4qmFYrAKWQbj6',
    type: 'sticker',
    title: 'Like Comment Subscribe Sticker',
    sourceUrl: 'https://media.giphy.com/media/Ve5hR4qmFYrAKWQbj6/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/Ve5hR4qmFYrAKWQbj6/200w.gif',
    width: 480,
    height: 360,
    rating: 'g',
    category: 'like_subscribe',
    tags: ['like', 'comment', 'subscribe', 'bell', 'like_subscribe', 'trending'],
  },
  {
    id: 'giphy_KDyixEIyiAWoz142T1',
    type: 'sticker',
    title: 'Subscribe Button Sticker',
    sourceUrl: 'https://media.giphy.com/media/KDyixEIyiAWoz142T1/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/KDyixEIyiAWoz142T1/200w.gif',
    width: 480,
    height: 224,
    rating: 'g',
    category: 'like_subscribe',
    tags: ['subscribe', 'button', 'like_subscribe'],
  },
  {
    id: 'giphy_wFggXRutqkpgUwJ8E5',
    type: 'sticker',
    title: 'Like Flash Sticker',
    sourceUrl: 'https://media.giphy.com/media/wFggXRutqkpgUwJ8E5/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/wFggXRutqkpgUwJ8E5/200w.gif',
    width: 480,
    height: 476,
    rating: 'g',
    category: 'like_subscribe',
    tags: ['subscribe', 'button', 'text', 'like_subscribe'],
  },
  {
    id: 'giphy_B9CRW8nMmZ6ptk7SbF',
    type: 'sticker',
    title: 'Like Button Sticker',
    sourceUrl: 'https://media.giphy.com/media/B9CRW8nMmZ6ptk7SbF/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/B9CRW8nMmZ6ptk7SbF/200w.gif',
    width: 554,
    height: 457,
    rating: 'g',
    category: 'like_subscribe',
    tags: ['share', 'follow', 'subscribe', 'like_subscribe'],
  },
  {
    id: 'giphy_LekDfkrHkRIEG6QXsF',
    type: 'sticker',
    title: 'Thumbs Up Sticker',
    sourceUrl: 'https://media.giphy.com/media/LekDfkrHkRIEG6QXsF/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/LekDfkrHkRIEG6QXsF/200w.gif',
    width: 447,
    height: 447,
    rating: 'g',
    category: 'like_subscribe',
    tags: ['like', 'thumbs up', 'like_subscribe', 'subscribe'],
  },
  {
    id: 'giphy_UTeimjzEr4N8EWIoSk',
    type: 'sticker',
    title: 'Like Thumb Sticker',
    sourceUrl: 'https://media.giphy.com/media/UTeimjzEr4N8EWIoSk/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/UTeimjzEr4N8EWIoSk/200w.gif',
    width: 480,
    height: 270,
    rating: 'g',
    category: 'like_subscribe',
    tags: ['like', 'heart', 'instagram', 'like_subscribe', 'subscribe'],
  },
  {
    id: 'giphy_zKBwU2TSfixfz70pJG',
    type: 'gif',
    title: 'Disbelief Wow GIF',
    sourceUrl: 'https://media.giphy.com/media/zKBwU2TSfixfz70pJG/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/zKBwU2TSfixfz70pJG/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'reactions',
    tags: ['wow', 'disbelief', 'shock', 'reactions', 'trending'],
  },
  {
    id: 'giphy_qXSJ3wEuFwOdGblE0Y',
    type: 'gif',
    title: 'Comedy Surprise GIF',
    sourceUrl: 'https://media.giphy.com/media/qXSJ3wEuFwOdGblE0Y/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/qXSJ3wEuFwOdGblE0Y/200w.gif',
    width: 480,
    height: 476,
    rating: 'g',
    category: 'reactions',
    tags: ['surprise', 'shock', 'funny', 'reactions'],
  },
  {
    id: 'giphy_xuZFsH7SNJhjaf76OS',
    type: 'gif',
    title: 'Shocked Man GIF',
    sourceUrl: 'https://media.giphy.com/media/xuZFsH7SNJhjaf76OS/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/xuZFsH7SNJhjaf76OS/200w.gif',
    width: 476,
    height: 413,
    rating: 'g',
    category: 'reactions',
    tags: ['shocked', 'omg', 'reaction', 'reactions'],
  },
  {
    id: 'giphy_D4iw2spy0aYJR3a5bM',
    type: 'gif',
    title: 'Shocked Oh No GIF',
    sourceUrl: 'https://media.giphy.com/media/D4iw2spy0aYJR3a5bM/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/D4iw2spy0aYJR3a5bM/200w.gif',
    width: 480,
    height: 442,
    rating: 'g',
    category: 'reactions',
    tags: ['oh no', 'shocked', 'reaction', 'reactions'],
  },
  {
    id: 'giphy_8GAj1GhvKXlUuB0zTd',
    type: 'gif',
    title: 'Baby Shock GIF',
    sourceUrl: 'https://media.giphy.com/media/8GAj1GhvKXlUuB0zTd/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/8GAj1GhvKXlUuB0zTd/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'reactions',
    tags: ['baby', 'shock', 'cute', 'reactions', 'trending'],
  },
  {
    id: 'giphy_oFvXciCA8px11faKJS',
    type: 'gif',
    title: 'Scared Kitty GIF',
    sourceUrl: 'https://media.giphy.com/media/oFvXciCA8px11faKJS/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/oFvXciCA8px11faKJS/200w.gif',
    width: 480,
    height: 476,
    rating: 'g',
    category: 'reactions',
    tags: ['cat', 'scared', 'omg', 'reactions'],
  },
  {
    id: 'giphy_Rgn6cUfaN5zW',
    type: 'gif',
    title: 'Clapping GIF',
    sourceUrl: 'https://media.giphy.com/media/Rgn6cUfaN5zW/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/Rgn6cUfaN5zW/200w.gif',
    width: 300,
    height: 169,
    rating: 'g',
    category: 'reactions',
    tags: ['clap', 'applause', 'reaction', 'reactions'],
  },
  {
    id: 'giphy_lMBcCPM0VYfhh2zCAy',
    type: 'gif',
    title: 'Good Job GIF',
    sourceUrl: 'https://media.giphy.com/media/lMBcCPM0VYfhh2zCAy/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/lMBcCPM0VYfhh2zCAy/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'reactions',
    tags: ['well done', 'win', 'applause', 'reactions'],
  },
  {
    id: 'giphy_kBZBlLVlfECvOQAVno',
    type: 'gif',
    title: 'Clapping Dogs GIF',
    sourceUrl: 'https://media.giphy.com/media/kBZBlLVlfECvOQAVno/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/kBZBlLVlfECvOQAVno/200w.gif',
    width: 400,
    height: 301,
    rating: 'g',
    category: 'reactions',
    tags: ['dogs', 'clap', 'applause', 'reactions'],
  },
  {
    id: 'giphy_BFYLNwlsSNtcc',
    type: 'gif',
    title: 'Laughing GIF',
    sourceUrl: 'https://media.giphy.com/media/BFYLNwlsSNtcc/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/BFYLNwlsSNtcc/200w.gif',
    width: 160,
    height: 159,
    rating: 'g',
    category: 'reactions',
    tags: ['laugh', 'lol', 'funny', 'reactions', 'trending'],
  },
  {
    id: 'giphy_UfoZx9nlFdnyLAnfTL',
    type: 'gif',
    title: 'Laughing Meerkat GIF',
    sourceUrl: 'https://media.giphy.com/media/UfoZx9nlFdnyLAnfTL/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/UfoZx9nlFdnyLAnfTL/200w.gif',
    width: 300,
    height: 300,
    rating: 'g',
    category: 'reactions',
    tags: ['laugh', 'meerkat', 'funny', 'reactions'],
  },
  {
    id: 'giphy_GnYcrL6w4uWsDSvKEO',
    type: 'gif',
    title: 'Cracking Up GIF',
    sourceUrl: 'https://media.giphy.com/media/GnYcrL6w4uWsDSvKEO/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/GnYcrL6w4uWsDSvKEO/200w.gif',
    width: 400,
    height: 480,
    rating: 'g',
    category: 'reactions',
    tags: ['laugh', 'lol', 'funny', 'reactions'],
  },
  {
    id: 'giphy_XHeLeuirRbwptHhSWd',
    type: 'gif',
    title: 'Laugh Out Loud GIF',
    sourceUrl: 'https://media.giphy.com/media/XHeLeuirRbwptHhSWd/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/XHeLeuirRbwptHhSWd/200w.gif',
    width: 480,
    height: 360,
    rating: 'g',
    category: 'reactions',
    tags: ['laugh', 'lol', 'reactions'],
  },
  {
    id: 'giphy_W4olt4mxVqIPs4SgNA',
    type: 'gif',
    title: 'What Just Happened GIF',
    sourceUrl: 'https://media.giphy.com/media/W4olt4mxVqIPs4SgNA/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/W4olt4mxVqIPs4SgNA/200w.gif',
    width: 480,
    height: 476,
    rating: 'g',
    category: 'reactions',
    tags: ['what', 'wtf', 'confused', 'reactions'],
  },
  {
    id: 'giphy_z835RsRqQHOlC4rsBr',
    type: 'gif',
    title: 'Check This Out GIF',
    sourceUrl: 'https://media.giphy.com/media/z835RsRqQHOlC4rsBr/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/z835RsRqQHOlC4rsBr/200w.gif',
    width: 480,
    height: 360,
    rating: 'g',
    category: 'arrows',
    tags: ['check this out', 'point', 'look', 'arrows', 'trending'],
  },
  {
    id: 'giphy_kWLPNb36rT1afK6qjc',
    type: 'gif',
    title: 'Pointing Down GIF',
    sourceUrl: 'https://media.giphy.com/media/kWLPNb36rT1afK6qjc/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/kWLPNb36rT1afK6qjc/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'arrows',
    tags: ['arrow', 'down', 'point', 'arrows'],
  },
  {
    id: 'giphy_CvTECq7rmXJ49VXL0G',
    type: 'gif',
    title: 'Check This Out Robot GIF',
    sourceUrl: 'https://media.giphy.com/media/CvTECq7rmXJ49VXL0G/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/CvTECq7rmXJ49VXL0G/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'arrows',
    tags: ['check this out', 'point', 'text', 'arrows'],
  },
  {
    id: 'giphy_dBsZ5ChSYEz9wruEU2',
    type: 'gif',
    title: 'Down Arrow Bounce GIF',
    sourceUrl: 'https://media.giphy.com/media/dBsZ5ChSYEz9wruEU2/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/dBsZ5ChSYEz9wruEU2/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'arrows',
    tags: ['arrow', 'point', 'arrows'],
  },
  {
    id: 'giphy_cIW1XzYs2fYK5EneDA',
    type: 'gif',
    title: 'Take A Look GIF',
    sourceUrl: 'https://media.giphy.com/media/cIW1XzYs2fYK5EneDA/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/cIW1XzYs2fYK5EneDA/200w.gif',
    width: 480,
    height: 270,
    rating: 'g',
    category: 'arrows',
    tags: ['look', 'click', 'point', 'arrows'],
  },
  {
    id: 'giphy_6QasJIsHD0ikAL3YCd',
    type: 'gif',
    title: 'Look Over There GIF',
    sourceUrl: 'https://media.giphy.com/media/6QasJIsHD0ikAL3YCd/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/6QasJIsHD0ikAL3YCd/200w.gif',
    width: 480,
    height: 270,
    rating: 'g',
    category: 'arrows',
    tags: ['look', 'point', 'reaction', 'arrows'],
  },
  {
    id: 'giphy_X6648OeXOftzbrkJF9',
    type: 'gif',
    title: 'Pointing GIF',
    sourceUrl: 'https://media.giphy.com/media/X6648OeXOftzbrkJF9/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/X6648OeXOftzbrkJF9/200w.gif',
    width: 450,
    height: 480,
    rating: 'g',
    category: 'arrows',
    tags: ['point', 'reaction', 'arrows'],
  },
  {
    id: 'giphy_14ASFrdlCUs7g2jyhY',
    type: 'gif',
    title: 'Crying Emoji GIF',
    sourceUrl: 'https://media.giphy.com/media/14ASFrdlCUs7g2jyhY/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/14ASFrdlCUs7g2jyhY/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'emojis',
    tags: ['sad', 'cry', 'emoji', 'emojis'],
  },
  {
    id: 'giphy_AQ53laN7CsiW8IUh05',
    type: 'gif',
    title: 'Exploding Emoji GIF',
    sourceUrl: 'https://media.giphy.com/media/AQ53laN7CsiW8IUh05/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/AQ53laN7CsiW8IUh05/200w.gif',
    width: 450,
    height: 450,
    rating: 'g',
    category: 'emojis',
    tags: ['explode', 'mind blown', 'emoji', 'emojis', 'trending'],
  },
  {
    id: 'giphy_8OYnFrez06yQt9zJFW',
    type: 'gif',
    title: 'Nerd Emoji GIF',
    sourceUrl: 'https://media.giphy.com/media/8OYnFrez06yQt9zJFW/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/8OYnFrez06yQt9zJFW/200w.gif',
    width: 320,
    height: 248,
    rating: 'g',
    category: 'emojis',
    tags: ['nerd', 'smart', 'emoji', 'emojis'],
  },
  {
    id: 'giphy_F3t0lZJV7wVJwqgi5Q',
    type: 'gif',
    title: 'Sad Emoji GIF',
    sourceUrl: 'https://media.giphy.com/media/F3t0lZJV7wVJwqgi5Q/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/F3t0lZJV7wVJwqgi5Q/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'emojis',
    tags: ['sad', 'emoji', 'emojis'],
  },
  {
    id: 'giphy_6WXyIZLuu9k343PfQg',
    type: 'gif',
    title: 'Big Eyes Emoji GIF',
    sourceUrl: 'https://media.giphy.com/media/6WXyIZLuu9k343PfQg/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/6WXyIZLuu9k343PfQg/200w.gif',
    width: 480,
    height: 476,
    rating: 'g',
    category: 'emojis',
    tags: ['eyes', 'wow', 'emoji', 'emojis'],
  },
  {
    id: 'giphy_aNQG4ugoNPxnL5n08C',
    type: 'gif',
    title: 'In Love Smile GIF',
    sourceUrl: 'https://media.giphy.com/media/aNQG4ugoNPxnL5n08C/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/aNQG4ugoNPxnL5n08C/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'emojis',
    tags: ['love', 'smile', 'emoji', 'emojis'],
  },
  {
    id: 'giphy_FnIOl9UZmHF8C3NTtc',
    type: 'gif',
    title: 'Charming Emoji GIF',
    sourceUrl: 'https://media.giphy.com/media/FnIOl9UZmHF8C3NTtc/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/FnIOl9UZmHF8C3NTtc/200w.gif',
    width: 480,
    height: 476,
    rating: 'g',
    category: 'emojis',
    tags: ['charming', 'wink', 'emoji', 'emojis'],
  },
  {
    id: 'giphy_aUfL53CqwwjzouQTup',
    type: 'gif',
    title: 'Laughing Emoji GIF',
    sourceUrl: 'https://media.giphy.com/media/aUfL53CqwwjzouQTup/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/aUfL53CqwwjzouQTup/200w.gif',
    width: 464,
    height: 450,
    rating: 'g',
    category: 'emojis',
    tags: ['laugh', 'lol', 'emoji', 'emojis', 'trending'],
  },
  {
    id: 'giphy_DGLDuF70PUqt6yluWo',
    type: 'gif',
    title: 'New Emoji GIF',
    sourceUrl: 'https://media.giphy.com/media/DGLDuF70PUqt6yluWo/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/DGLDuF70PUqt6yluWo/200w.gif',
    width: 438,
    height: 450,
    rating: 'g',
    category: 'emojis',
    tags: ['emoji', 'face', 'emojis'],
  },
  {
    id: 'giphy_8maQQ65FtVRWvGHem9',
    type: 'gif',
    title: 'Bouncy Emoji GIF',
    sourceUrl: 'https://media.giphy.com/media/8maQQ65FtVRWvGHem9/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/8maQQ65FtVRWvGHem9/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'emojis',
    tags: ['emoji', 'happy', 'emojis'],
  },
  {
    id: 'giphy_9xt1MUZqkneFiWrAAD',
    type: 'gif',
    title: 'Good Job Trophy GIF',
    sourceUrl: 'https://media.giphy.com/media/9xt1MUZqkneFiWrAAD/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/9xt1MUZqkneFiWrAAD/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'badges',
    tags: ['trophy', 'good job', 'badge', 'achievement', 'badges', 'trending'],
  },
  {
    id: 'giphy_lFHtqqh6orvAhbiGmy',
    type: 'gif',
    title: 'Well Done Star GIF',
    sourceUrl: 'https://media.giphy.com/media/lFHtqqh6orvAhbiGmy/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/lFHtqqh6orvAhbiGmy/200w.gif',
    width: 400,
    height: 400,
    rating: 'g',
    category: 'badges',
    tags: ['star', 'winner', 'badge', 'badges'],
  },
  {
    id: 'giphy_Wt7u1mKdpNOPoAKVkn',
    type: 'gif',
    title: 'Level Up GIF',
    sourceUrl: 'https://media.giphy.com/media/Wt7u1mKdpNOPoAKVkn/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/Wt7u1mKdpNOPoAKVkn/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'badges',
    tags: ['level up', 'game', 'badge', 'achievement', 'badges'],
  },
  {
    id: 'giphy_H9l0FtwC2hA3V7Bj5H',
    type: 'gif',
    title: 'Pixel Level Up GIF',
    sourceUrl: 'https://media.giphy.com/media/H9l0FtwC2hA3V7Bj5H/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/H9l0FtwC2hA3V7Bj5H/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'badges',
    tags: ['level up', 'pixel', 'badge', 'achievement', 'badges'],
  },
  {
    id: 'giphy_qTlwCeUwSPoKkyKcPl',
    type: 'gif',
    title: 'New Adventure Unlocked GIF',
    sourceUrl: 'https://media.giphy.com/media/qTlwCeUwSPoKkyKcPl/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/qTlwCeUwSPoKkyKcPl/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'badges',
    tags: ['level up', 'badge', 'achievement', 'badges'],
  },
  {
    id: 'giphy_Yn5fx5z4xyCsgrBKgg',
    type: 'gif',
    title: 'Achievement Unlocked GIF',
    sourceUrl: 'https://media.giphy.com/media/Yn5fx5z4xyCsgrBKgg/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/Yn5fx5z4xyCsgrBKgg/200w.gif',
    width: 480,
    height: 270,
    rating: 'g',
    category: 'badges',
    tags: ['winner', 'done', 'badge', 'achievement', 'badges'],
  },
  {
    id: 'giphy_xVoLz8hw2RyXvMReua',
    type: 'gif',
    title: 'Achievement Unlocked Dance GIF',
    sourceUrl: 'https://media.giphy.com/media/xVoLz8hw2RyXvMReua/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/xVoLz8hw2RyXvMReua/200w.gif',
    width: 480,
    height: 398,
    rating: 'g',
    category: 'badges',
    tags: ['yes', 'winner', 'badge', 'achievement', 'badges'],
  },
  {
    id: 'giphy_l4EpblDY4msVtKAOk',
    type: 'gif',
    title: 'Check Check Check GIF',
    sourceUrl: 'https://media.giphy.com/media/l4EpblDY4msVtKAOk/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/l4EpblDY4msVtKAOk/200w.gif',
    width: 480,
    height: 270,
    rating: 'g',
    category: 'badges',
    tags: ['success', 'badge', 'achievement', 'badges'],
  },
  {
    id: 'giphy_1xVhhfrZNVv2AEaYF6',
    type: 'gif',
    title: 'Confetti Burst GIF',
    sourceUrl: 'https://media.giphy.com/media/1xVhhfrZNVv2AEaYF6/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/1xVhhfrZNVv2AEaYF6/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'celebration',
    tags: ['confetti', 'celebrate', 'celebration', 'trending'],
  },
  {
    id: 'giphy_XzXjgGZOiTjF7d0JOp',
    type: 'gif',
    title: 'Happy Celebration GIF',
    sourceUrl: 'https://media.giphy.com/media/XzXjgGZOiTjF7d0JOp/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/XzXjgGZOiTjF7d0JOp/200w.gif',
    width: 480,
    height: 270,
    rating: 'g',
    category: 'celebration',
    tags: ['happy', 'celebrate', 'celebration'],
  },
  {
    id: 'giphy_879RsXB8GvEuY95LNl',
    type: 'gif',
    title: 'Well Done Script GIF',
    sourceUrl: 'https://media.giphy.com/media/879RsXB8GvEuY95LNl/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/879RsXB8GvEuY95LNl/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'celebration',
    tags: ['birthday', 'success', 'celebrate', 'celebration'],
  },
  {
    id: 'giphy_iJgoGwkqb1mmH1mES3',
    type: 'gif',
    title: 'Celebration Dance GIF',
    sourceUrl: 'https://media.giphy.com/media/iJgoGwkqb1mmH1mES3/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/iJgoGwkqb1mmH1mES3/200w.gif',
    width: 480,
    height: 270,
    rating: 'g',
    category: 'celebration',
    tags: ['dance', 'celebrate', 'celebration'],
  },
  {
    id: 'giphy_bOXnd3kig533u93OND',
    type: 'gif',
    title: 'Happy Cat Party GIF',
    sourceUrl: 'https://media.giphy.com/media/bOXnd3kig533u93OND/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/bOXnd3kig533u93OND/200w.gif',
    width: 498,
    height: 384,
    rating: 'g',
    category: 'celebration',
    tags: ['cat', 'happy', 'celebrate', 'celebration'],
  },
  {
    id: 'giphy_13n4Hd98ewKJsQ',
    type: 'gif',
    title: 'Diwali Fireworks GIF',
    sourceUrl: 'https://media.giphy.com/media/13n4Hd98ewKJsQ/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/13n4Hd98ewKJsQ/200w.gif',
    width: 166,
    height: 166,
    rating: 'g',
    category: 'celebration',
    tags: ['fireworks', 'diwali', 'celebrate', 'celebration', 'trending'],
  },
  {
    id: 'giphy_12BsLpSspuwW1q',
    type: 'gif',
    title: 'Fireworks Night GIF',
    sourceUrl: 'https://media.giphy.com/media/12BsLpSspuwW1q/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/12BsLpSspuwW1q/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'celebration',
    tags: ['fireworks', 'celebrate', 'celebration'],
  },
  {
    id: 'giphy_5xRlk4AAmFyakKsoym',
    type: 'gif',
    title: 'Time To Celebrate GIF',
    sourceUrl: 'https://media.giphy.com/media/5xRlk4AAmFyakKsoym/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/5xRlk4AAmFyakKsoym/200w.gif',
    width: 400,
    height: 400,
    rating: 'g',
    category: 'celebration',
    tags: ['party', 'celebrate', 'celebration'],
  },
  {
    id: 'giphy_11lVFn0Di6NOIU',
    type: 'gif',
    title: 'Sparkler GIF',
    sourceUrl: 'https://media.giphy.com/media/11lVFn0Di6NOIU/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/11lVFn0Di6NOIU/200w.gif',
    width: 500,
    height: 600,
    rating: 'g',
    category: 'celebration',
    tags: ['sparkler', 'fireworks', 'celebrate', 'celebration'],
  },
  {
    id: 'giphy_TyvBwmwvS0idi',
    type: 'gif',
    title: 'Fireworks Show GIF',
    sourceUrl: 'https://media.giphy.com/media/TyvBwmwvS0idi/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/TyvBwmwvS0idi/200w.gif',
    width: 200,
    height: 150,
    rating: 'g',
    category: 'celebration',
    tags: ['fireworks', 'celebrate', 'celebration'],
  },
  {
    id: 'giphy_vmon3eAOp1WfK',
    type: 'gif',
    title: 'Celebration Reaction GIF',
    sourceUrl: 'https://media.giphy.com/media/vmon3eAOp1WfK/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/vmon3eAOp1WfK/200w.gif',
    width: 500,
    height: 372,
    rating: 'g',
    category: 'celebration',
    tags: ['celebrate', 'yes', 'celebration'],
  },
  {
    id: 'giphy_WykUqckDqi95YIqtFZ',
    type: 'gif',
    title: 'Funny Cat GIF',
    sourceUrl: 'https://media.giphy.com/media/WykUqckDqi95YIqtFZ/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/WykUqckDqi95YIqtFZ/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'memes',
    tags: ['cat', 'funny', 'meme', 'memes', 'trending'],
  },
  {
    id: 'giphy_jGgC8JjZfLurTJSxQ8',
    type: 'gif',
    title: 'Sigma Cat GIF',
    sourceUrl: 'https://media.giphy.com/media/jGgC8JjZfLurTJSxQ8/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/jGgC8JjZfLurTJSxQ8/200w.gif',
    width: 480,
    height: 476,
    rating: 'g',
    category: 'memes',
    tags: ['cat', 'sigma', 'meme', 'memes', 'trending'],
  },
  {
    id: 'giphy_o8j17AwRaOrNKZZbuO',
    type: 'gif',
    title: 'Smiling Cat GIF',
    sourceUrl: 'https://media.giphy.com/media/o8j17AwRaOrNKZZbuO/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/o8j17AwRaOrNKZZbuO/200w.gif',
    width: 480,
    height: 448,
    rating: 'g',
    category: 'memes',
    tags: ['cat', 'smile', 'meme', 'memes'],
  },
  {
    id: 'giphy_AiFGUnZ7D3gM1rcEVb',
    type: 'gif',
    title: 'Dog With Candy GIF',
    sourceUrl: 'https://media.giphy.com/media/AiFGUnZ7D3gM1rcEVb/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/AiFGUnZ7D3gM1rcEVb/200w.gif',
    width: 480,
    height: 456,
    rating: 'g',
    category: 'memes',
    tags: ['dog', 'funny', 'meme', 'memes'],
  },
  {
    id: 'giphy_3T7WB64PW315Z8zhRg',
    type: 'gif',
    title: 'Cat Face GIF',
    sourceUrl: 'https://media.giphy.com/media/3T7WB64PW315Z8zhRg/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3T7WB64PW315Z8zhRg/200w.gif',
    width: 420,
    height: 420,
    rating: 'g',
    category: 'memes',
    tags: ['cat', 'face', 'meme', 'memes'],
  },
  {
    id: 'giphy_4qHUlfNwOdsg6T7WLM',
    type: 'gif',
    title: 'Tiger Watches GIF',
    sourceUrl: 'https://media.giphy.com/media/4qHUlfNwOdsg6T7WLM/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/4qHUlfNwOdsg6T7WLM/200w.gif',
    width: 336,
    height: 480,
    rating: 'g',
    category: 'memes',
    tags: ['tiger', 'watch', 'meme', 'memes'],
  },
  {
    id: 'giphy_lEqwjZv0Afce878HU4',
    type: 'gif',
    title: 'Man Stretching GIF',
    sourceUrl: 'https://media.giphy.com/media/lEqwjZv0Afce878HU4/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/lEqwjZv0Afce878HU4/200w.gif',
    width: 390,
    height: 480,
    rating: 'g',
    category: 'memes',
    tags: ['stretch', 'funny', 'meme', 'memes'],
  },
  {
    id: 'giphy_75ZaxapnyMp2w',
    type: 'gif',
    title: 'Mind Blown GIF',
    sourceUrl: 'https://media.giphy.com/media/75ZaxapnyMp2w/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/75ZaxapnyMp2w/200w.gif',
    width: 200,
    height: 200,
    rating: 'g',
    category: 'memes',
    tags: ['mind blown', 'meme', 'memes'],
  },
  {
    id: 'giphy_SDogLD4FOZMM8',
    type: 'gif',
    title: 'Mind Blown Classic GIF',
    sourceUrl: 'https://media.giphy.com/media/SDogLD4FOZMM8/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/SDogLD4FOZMM8/200w.gif',
    width: 320,
    height: 180,
    rating: 'g',
    category: 'memes',
    tags: ['mind blown', 'meme', 'memes'],
  },
  {
    id: 'giphy_dJD4xBczSSnEIbtd7u',
    type: 'gif',
    title: 'Mind Blown Text GIF',
    sourceUrl: 'https://media.giphy.com/media/dJD4xBczSSnEIbtd7u/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/dJD4xBczSSnEIbtd7u/200w.gif',
    width: 400,
    height: 400,
    rating: 'g',
    category: 'memes',
    tags: ['omg', 'meme', 'memes'],
  },
  {
    id: 'giphy_ALZ1PPM20REZ2',
    type: 'gif',
    title: 'Mind OMG GIF',
    sourceUrl: 'https://media.giphy.com/media/ALZ1PPM20REZ2/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/ALZ1PPM20REZ2/200w.gif',
    width: 196,
    height: 187,
    rating: 'g',
    category: 'memes',
    tags: ['omg', 'mind blown', 'meme', 'memes'],
  },
  {
    id: 'giphy_eRM47Z22ZXSNoVeM1c',
    type: 'gif',
    title: 'Subscribe Bell GIF',
    sourceUrl: 'https://media.giphy.com/media/eRM47Z22ZXSNoVeM1c/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/eRM47Z22ZXSNoVeM1c/200w.gif',
    width: 480,
    height: 370,
    rating: 'g',
    category: 'like_subscribe',
    tags: ['subscribe', 'bell', 'notification', 'like_subscribe', 'trending'],
  },
  {
    id: 'giphy_WUCEIcpIoZB9mpbwjt',
    type: 'gif',
    title: 'Like Share Subscribe GIF',
    sourceUrl: 'https://media.giphy.com/media/WUCEIcpIoZB9mpbwjt/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/WUCEIcpIoZB9mpbwjt/200w.gif',
    width: 480,
    height: 362,
    rating: 'g',
    category: 'like_subscribe',
    tags: ['share', 'youtube', 'subscribe', 'like_subscribe'],
  },
  {
    id: 'giphy_DTuioQ5ozMpDo62iGo',
    type: 'gif',
    title: 'Like And Subscribe GIF',
    sourceUrl: 'https://media.giphy.com/media/DTuioQ5ozMpDo62iGo/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/DTuioQ5ozMpDo62iGo/200w.gif',
    width: 498,
    height: 286,
    rating: 'g',
    category: 'like_subscribe',
    tags: ['like', 'subscribe', 'like_subscribe'],
  },
  {
    id: 'giphy_JMs2jIoD5VUnQSbmUs',
    type: 'gif',
    title: 'Like & Subscribe Pop GIF',
    sourceUrl: 'https://media.giphy.com/media/JMs2jIoD5VUnQSbmUs/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/JMs2jIoD5VUnQSbmUs/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'like_subscribe',
    tags: ['like', 'subscribe', 'like_subscribe'],
  },
  {
    id: 'giphy_DsOi9wQBxyPtNLYjnc',
    type: 'gif',
    title: 'Like Subscribe Channel GIF',
    sourceUrl: 'https://media.giphy.com/media/DsOi9wQBxyPtNLYjnc/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/DsOi9wQBxyPtNLYjnc/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'like_subscribe',
    tags: ['like', 'subscribe', 'channel', 'like_subscribe'],
  },
  {
    id: 'giphy_dXrWJ48LbYL0usC58v',
    type: 'gif',
    title: 'Call To Action GIF',
    sourceUrl: 'https://media.giphy.com/media/dXrWJ48LbYL0usC58v/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/dXrWJ48LbYL0usC58v/200w.gif',
    width: 480,
    height: 480,
    rating: 'g',
    category: 'like_subscribe',
    tags: ['cta', 'like', 'subscribe', 'like_subscribe'],
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
  { id: 'like_subscribe', label: 'Subscribe', query: 'subscribe' },
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
      // 'All' browses the whole library (trending first); the Trending chip filters to trending items.
      const isTrendingCategory = selectedCategory === 'all';

      let endpoint: string;
      if (debouncedQuery) {
        endpoint = `/elements/search?q=${encodeURIComponent(debouncedQuery)}&type=${activeType}&limit=30`;
      } else if (isTrendingCategory) {
        endpoint = `/elements/trending?type=${activeType}&limit=50`;
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
