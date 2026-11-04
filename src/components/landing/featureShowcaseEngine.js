/* Motion choreography ported from reference/landing/hero-v1/feature-showcase.html. */
export function mountFeatureShowcase(root) {
/* =====================================================================
   ★ CONFIG — everything you'd want to change lives here ★

   ASSETS: every `src` accepts
     • an image  (.jpg .png .webp .gif .svg)
     • a video   (.mp4 .webm .mov)   → plays muted + looped automatically
     • null      → a neutral placeholder is drawn so you can see the layout
   Put your files in the  /assets  folder and write e.g.  "assets/resort-1.jpg"
   ===================================================================== */
const CONFIG = {
  accent: "#8b5cf6",          // highlight colour (labels, karaoke words, progress line)
  autoplay: true,             // false = only moves when visitor clicks
  heading: "",
  subheading: "",

  slides: [
    /* ───────────── SLIDE 1 : real VireoClip clips, same choreography ───────────── */
    {
      type: "clips",
      tab: "AI Clips", icon: "scissors",
      glow: ["rgba(124,58,237,.22)", "rgba(196,181,253,.10)"],
      inputPlaceholder: "Paste a YouTube or video link…",
      typedText: "youtube.com/watch?v=long-video",
      button: "Get clips",
      sets: [
        {
          source: { src: "/demo/landing/clips/mrbeast-clip-01.mp4", duration: "00:24 sample" },
          clips: [
            { src: "/demo/landing/clips/mrbeast-clip-01.mp4", label: "HOOK", badge: { icon: "youtube", c: "#ff0033" } },
            { src: "/demo/landing/clips/mrbeast-clip-02.mp4", label: "MOMENT", badge: { icon: "instagram", c: "#c13584" } },
            { src: "/demo/landing/clips/mrbeast-clip-03.mp4", label: "PAYOFF", badge: { icon: "tiktok", c: "#101010" } },
            { src: "/demo/landing/clips/ishowspeed-clip-01.mp4", label: "REACTION", badge: { icon: "facebook", c: "#1877f2" } },
            { src: "/demo/landing/clips/lex-fridman-clip-01.mp4", label: "INSIGHT", badge: { icon: "linkedin", c: "#0a66c2" } },
            { src: "/demo/landing/clips/joe-rogan-clip-01.mp4", label: "PODCAST", badge: { icon: "x", c: "#111111" } }
          ]
        }
      ]
    },

    /* ───────────── SLIDE 2 : "pick a caption style" ───────────── */
    {
      type: "captions",
      tab: "Captions", icon: "caption",
      glow: ["rgba(124,58,237,.20)", "rgba(196,181,253,.08)"],
      media: { src: "/demo/landing/clips/ishowspeed-clip-01.mp4" },
      logo: "VireoClip",
      previewText: "NO WAY",
      lines: [
        "No no way",
        "Why did I fall",
        "I was literally right at the top",
        "I was right there"
      ],
      presets: [
        { name: "Karaoke", style: "karaoke" },
        { name: "Bold Pop",  style: "beasty"  },
        { name: "Minimal", style: "pill" },
        { name: "Podcast",   style: "pod"     }
      ]
    },

    /* ───────────── SLIDE 3 : "before → after" ───────────── */
    {
      type: "compare",
      tab: "Reframe", icon: "crop",
      glow: ["rgba(99,102,241,.18)", "rgba(139,92,246,.14)"],
      beforeLabel: "Original 16:9",
      items: [
        { before: { src: "/demo/landing/reframe/ronaldo-before.mp4" }, after: { src: "/demo/landing/clips/ronaldo-clip-01.mp4" }, label: "9:16 Smart Reframe" }
      ]
    },

    /* ───────────── SLIDE 4 : "AI B-roll" ───────────── */
    {
      type: "broll",
      tab: "AI B-roll", icon: "layers",
      glow: ["rgba(124,58,237,.18)", "rgba(99,102,241,.10)"],
      media: { src: "/demo/landing/clips/joe-rogan-clip-01.mp4" },
      chipText: "AI B-roll",
      panelTitle: "AI B-roll",
      searching: "Exploring sample visuals…",
      items: [
        { src: "/demo/landing/clips/mrbeast-clip-02.mp4", label: "High-energy challenge", keyword: "challenge", state: "Suggested", line: "Add visual context to the challenge" },
        { src: "/demo/landing/clips/ronaldo-clip-01.mp4", label: "Sports reaction", keyword: "reaction", state: "Relevant", line: "Cut to a focused reaction" },
        { src: "/demo/landing/clips/lex-fridman-clip-01.mp4", label: "Thought-leadership cutaway", keyword: "insight", state: "Suggested", line: "Support the insight with a clean cutaway" }
      ]
    }

    /* Want another slide?  Copy any block above, paste it here, change the text/assets.
       Icons available: scissors, caption, crop, layers, audio, mic                      */
  ]
};

/* =====================================================================
   ENGINE  (you shouldn't need to touch anything below)
   ===================================================================== */
return (() => {
  root.style.setProperty('--accent', CONFIG.accent);

  const DW = 1280, DH = 620, CARD_W = 960, STEP = 1010;           // larger effective desktop stage; choreography unchanged
  const CANCEL = Symbol('cancel');
  const ICONS = {
    scissors:'<path d="M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    caption:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 11h4M13 11h4M7 15h2M12 15h5"/>',
    crop:'<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>',
    layers:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16c-1 0-2-1-2-2V4c0-1 1-2 2-2h10c1 0 2 1 2 2"/>',
    audio:'<path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>'
  };
  const svgI = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]||ICONS.layers}</svg>`;
  const CURSOR_SVG = '<svg viewBox="0 0 24 24"><path d="M5 2.5v17l4.6-4.1 3 6.6 2.9-1.3-3-6.5 6.2-.5z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';

  // Lightweight, self-contained platform marks. No third-party icon library required.
  const BRAND_ICONS = {
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4L15.8 12l-6.2 3.6Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5.3 7.7H1.7V22h3.6V7.7ZM3.5 2A2.1 2.1 0 1 0 3.5 6.2 2.1 2.1 0 0 0 3.5 2ZM22 13.2c0-4.3-2.3-6.3-5.4-6.3-2.5 0-3.6 1.4-4.2 2.3V7.7H8.8V22h3.6v-7.1c0-1.9.4-3.7 2.7-3.7 2.3 0 2.3 2.1 2.3 3.8V22H22v-8.8Z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 8h3V4.5c-.5-.1-2-.2-3.4-.2-3.3 0-5.5 2-5.5 5.7V13H4.5v4H8v7h4.5v-7h3.7l.6-4h-4.3v-2.6c0-1.2.3-2.4 1.5-2.4Z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.6 2c.4 2.2 1.7 3.6 4.1 3.8v3.6c-1.4.1-2.7-.3-4-1.1v7.3c0 4.6-5 7.5-9 5.1-4.3-2.4-3.8-9 1-10.8 1-.4 2-.5 3-.3v3.7c-.4-.1-.8-.1-1.2 0-1.8.4-2.4 2.8-1 4.1 1.7 1.7 4.4.5 4.4-1.8V2h2.7Z"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23.2 22H17l-4.8-6.3L6.7 22H3.6l7.1-8.1L3 2h6.4l4.4 5.8L18.9 2Zm-1.1 17.9h1.7L8.5 4H6.7l11.1 15.9Z"/></svg>'
  };
  const brandIcon = n => BRAND_ICONS[n] || '';

  /* ---------- tiny helpers ---------- */
  const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
  const A = (e, kf, o = {}) => e.animate(kf, { duration: 600, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both', ...o });
  const clearAnims = root => root.getAnimations({ subtree: true }).forEach(a => a.cancel());
  const SPRING = 'cubic-bezier(.3,1.22,.5,1)';

  // neutral placeholder picture (so layout is visible before you add assets)
  function placeholder(seed) {
    const h = [205, 335, 38, 160, 270, 8, 100, 235][seed % 8];
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300' preserveAspectRatio='xMidYMid slice'>
      <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${h},58%,46%)'/><stop offset='1' stop-color='hsl(${h + 40},55%,16%)'/></linearGradient></defs>
      <rect width='400' height='300' fill='url(#g)'/>
      <circle cx='130' cy='95' r='70' fill='rgba(255,255,255,.07)'/>
      <circle cx='205' cy='118' r='42' fill='rgba(255,255,255,.2)'/>
      <path d='M95 300c0-80 50-122 110-122s110 42 110 122z' fill='rgba(255,255,255,.2)'/></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  let seedN = 0;
  function posterFor(src) {
    return src === '/demo/landing/reframe/ronaldo-before.mp4'
      ? '/demo/landing/reframe/ronaldo-before-poster.jpg'
      : src.replace(/\.mp4(\?.*)?$/i, '-poster.jpg');
  }
  function mediaEl(src, seed, playVideo = false) {
    if (src && playVideo && /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(src)) {
      const v = el('video', 'media');
      v.src = src; v.poster = posterFor(src); v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', '');
      v.preload = 'none';
      return v;
    }
    const i = el('img', 'media'); i.alt = ''; i.draggable = false;
    i.src = src ? (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(src) ? posterFor(src) : src) : placeholder(seed != null ? seed : seedN++);
    i.loading = 'lazy';
    return i;
  }

  /* ---------- DOM scaffolding ---------- */
  const viewport = root.querySelector('#scViewport');
  const design = root.querySelector('#scDesign');
  const tabsEl = root.querySelector('#scTabs');
  const head = root.querySelector('#scHead');
  if (CONFIG.heading) head.innerHTML = `<h2>${CONFIG.heading}</h2>${CONFIG.subheading ? `<p>${CONFIG.subheading}</p>` : ''}`;

  const prevBtn = el('button', 'nav', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>');
  const nextBtn = el('button', 'nav', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>');
  prevBtn.setAttribute('aria-label', 'Previous'); nextBtn.setAttribute('aria-label', 'Next');

  /* ---------- cursor toolkit (per card) ---------- */
  function makeCursor(card) {
    const cur = el('div', 'cursor', CURSOR_SVG); card.appendChild(cur);
    const rip = el('div', 'ripple'); card.appendChild(rip);
    let x = 0, y = 0;
    const rel = e => { let ox = 0, oy = 0, n = e; while (n && n !== card) { ox += n.offsetLeft; oy += n.offsetTop; n = n.offsetParent; } return [ox + e.offsetWidth / 2, oy + e.offsetHeight / 2]; };
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    return {
      el: cur, rel,
      place(px, py) { cur.getAnimations().forEach(a => a.cancel()); cur.style.transform = `translate(${px}px,${py}px)`; x = px; y = py; },
      show(v) { cur.style.opacity = v ? 1 : 0; },
      // glides along a gentle arc with ease-in-out, like a real hand
      to(target, { dx = 0, dy = 0, ms = 1000 } = {}) {
        const [cx, cy] = rel(target); const nx = cx + dx - 6, ny = cy + dy - 3, sx = x, sy = y;
        const qx = (sx + nx) / 2 - (ny - sy) * .16, qy = (sy + ny) / 2 + (nx - sx) * .16;   // bezier control point
        const kf = []; const N = 30;
        for (let i = 0; i <= N; i++) { const e = ease(i / N), u = 1 - e;
          kf.push({ transform: `translate(${u * u * sx + 2 * u * e * qx + e * e * nx}px,${u * u * sy + 2 * u * e * qy + e * e * ny}px)` }); }
        cur.animate(kf, { duration: ms, easing: 'linear', fill: 'forwards' });
        x = nx; y = ny; return ms;
      },
      click() {
        cur.classList.add('click'); setTimeout(() => cur.classList.remove('click'), 160);
        rip.style.left = (x + 6) + 'px'; rip.style.top = (y + 3) + 'px';
        A(rip, [{ opacity: .9, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 650, easing: 'cubic-bezier(.2,.7,.3,1)' });
      },
      reset() { cur.style.opacity = 0; cur.classList.remove('click'); }
    };
  }

  /* =================================================================
     SCENES  — each returns { root, reset(), run(ctx) }
     ================================================================= */

  /* ---------- scene: clips ---------- */
  function sceneClips(cfg, card) {
    card.classList.add('s-clips');
    const source = el('div', 'source'); const dur = el('div', 'dur'); source.append(dur);
    const bar = el('div', 'bar',
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>`);
    const txt = el('div', 'txt', cfg.inputPlaceholder || ''); const btn = el('div', 'btn', cfg.button || 'Go');
    bar.append(txt, btn);
    const tiles = el('div', 'tiles');
    card.append(source, bar, tiles);
    const cur = makeCursor(card);
    const WIDTHS = [250, 86, 150, 86, 86, 86];

    function fill(set) {
      source.querySelectorAll('.media').forEach(m => m.remove());
      source.prepend(mediaEl(set.source && set.source.src, 0, true)); dur.textContent = (set.source && set.source.duration) || '';
      tiles.innerHTML = '';
      set.clips.forEach((c, i) => {
        const t = el('div', 'tile'); t.style.width = (c.w || WIDTHS[i % WIDTHS.length]) + 'px';
        const clip = el('div', 'clip'); clip.append(mediaEl(c.src));
        const b = el('div', 'badge', c.badge ? brandIcon(c.badge.icon) : '');
        if (c.badge) b.style.background = c.badge.c;
        const tag = el('div', 'score', `<small>VIREOCLIP</small><b>${c.label || 'CLIP'}</b>`);
        clip.append(tag); t.append(clip, b); tiles.append(t);
      });
    }
    const reset = () => { clearAnims(card); cur.reset(); txt.textContent = cfg.inputPlaceholder || ''; txt.classList.remove('typed'); bar.classList.remove('work'); btn.classList.remove('press'); tiles.innerHTML = ''; };

    return {
      reset,
      async run({ wait }) {
        for (const set of cfg.sets) {
          reset(); fill(set); syncVideos();
          A(source, [{ opacity: 0, transform: 'translateY(-30px) scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 1000 });
          await wait(450);
          // type the link
          const full = cfg.typedText || 'yoursite.com/video'; txt.classList.add('typed'); txt.textContent = '';
          for (let i = 1; i <= full.length; i++) { txt.textContent = full.slice(0, i); await wait(42); }
          await wait(250);
          // cursor glides in and clicks
          cur.place(btn.offsetLeft + bar.offsetLeft + 180, bar.offsetTop + 150); cur.show(true);
          await wait(30);
          await wait(cur.to(btn, { dx: 10, dy: 10, ms: 1150 }) + 140);
          cur.click(); btn.classList.add('press'); bar.classList.add('work');
          await wait(160); btn.classList.remove('press');
          // source "gets swallowed" by the bar
          A(source, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(170px) scale(.4)' }], { duration: 750, easing: 'cubic-bezier(.5,0,.75,.2)' });
          await wait(560);
          const sourceVideo = source.querySelector('video');
          if (sourceVideo) { sourceVideo.dataset.demoInactive = 'true'; sourceVideo.pause(); }
          [...tiles.children].slice(0, 3).forEach((tile, index) => {
            const poster = tile.querySelector('.media');
            poster?.replaceWith(mediaEl(set.clips[index].src, index, true));
          });
          syncVideos();
          // results fan out
          [...tiles.children].forEach((t, i) => {
            A(t, [{ opacity: 0, transform: 'translateY(-90px) scale(.5) rotate(-4deg)' }, { opacity: 1, transform: 'none' }], { duration: 950, delay: i * 80, easing: SPRING });
          });
          await wait(950 + tiles.children.length * 80);
          cur.to(tiles, { dx: 360, dy: 120, ms: 1400 }); cur.show(false);
          await wait(1800);
          // exit
          A(tiles, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(20px)' }], { duration: 600, easing: 'cubic-bezier(.4,0,.6,1)' });
          await wait(640);
        }
      }
    };
  }

  /* ---------- scene: captions ---------- */
  function sceneCaptions(cfg, card) {
    card.classList.add('s-captions');
    const stage = el('div', 'stage'); stage.append(mediaEl(cfg.media && cfg.media.src, 0, true));
    if (cfg.logo) stage.append(el('div', 'logo', cfg.logo));
    const wrap = el('div', 'capwrap'); const cap = el('div', 'cap'); cap.dataset.s = 'none'; wrap.append(cap); stage.append(wrap);
    const panel = el('div', 'panel', `<div class="ptabs"><b>Presets</b><span>Font</span><span>Effects</span></div>`);
    const rows = [];
    const none = el('div', 'row', `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg><small>No captions</small>`);
    panel.append(none); rows.push({ row: none, preset: null });
    cfg.presets.forEach(p => {
      const r = el('div', 'row'); const c = el('div', 'cap'); c.dataset.s = p.style;
      c.innerHTML = (cfg.previewText || 'Get started').toUpperCase().split(' ').map(w => `<span class="on">${w}</span>`).join('');
      r.append(c, el('small', '', p.name)); panel.append(r); rows.push({ row: r, preset: p });
    });
    card.append(stage, panel);
    const cur = makeCursor(card);

    const select = r => rows.forEach(x => x.row.classList.toggle('sel', x === r));
    async function speak(style, line, wait) {
      cap.dataset.s = style; cap.innerHTML = line.split(' ').map(w => `<span>${w}</span>`).join('');
      A(cap, [{ opacity: 0, transform: 'translateY(10px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 380 });
      const w = [...cap.children];
      for (const s of w) { s.classList.add('on'); await wait(320); if (style === 'karaoke' || style === 'pill') { /* keep highlight on current only */ s.classList.remove('on'); } }
    }
    const reset = () => { clearAnims(card); cur.reset(); select(null); cap.dataset.s = 'none'; cap.innerHTML = ''; };

    return {
      reset,
      async run({ wait }) {
        reset(); let li = 0;
        cur.place(560, 470); cur.show(true); await wait(500);
        for (const r of rows.slice(1)) {
          await wait(cur.to(r.row, { dx: 60, dy: 8, ms: 1100 }) + 100);
          r.row.classList.add('hot'); cur.click(); select(r); await wait(160); r.row.classList.remove('hot');
          const line = cfg.lines[li++ % cfg.lines.length];
          await speak(r.preset.style, line, wait);
          // second line so every style is seen in motion
          await wait(300);
          await speak(r.preset.style, cfg.lines[li++ % cfg.lines.length], wait);
          await wait(550);
        }
        cur.show(false); await wait(500);
      }
    };
  }

  /* ---------- scene: compare ---------- */
  function sceneCompare(cfg, card) {
    card.classList.add('s-compare');
    const before = el('div', 'before'); const crop = el('div', 'crop', '<i>AI</i>'); before.append(crop);
    const lblB = el('div', 'pill lbl-b', cfg.beforeLabel || 'Before');
    const dots = el('div', 'dots'); cfg.items.forEach(() => dots.append(el('i')));
    const stack = el('div', 'stack'); const layers = [el('div', 'layer'), el('div', 'layer'), el('div', 'layer')]; stack.append(...layers);
    const lblA = el('div', 'pill lbl-a');
    card.append(before, lblB, dots, stack, lblA);

    const POSE = [
      { t: 'translate(-34px,4px) rotate(-7deg) scale(.94)', o: .35 },
      { t: 'translate(22px,8px) rotate(5deg) scale(.97)', o: .6 },
      { t: 'none', o: 1 }
    ];
    const reset = () => { clearAnims(card); dots.querySelectorAll('i').forEach(i => i.classList.remove('on')); before.style.opacity = 0; lblB.style.opacity = 0; lblA.style.opacity = 0; layers.forEach(l => l.style.opacity = 0); };

    return {
      reset,
      async run({ wait }) {
        reset();
        for (let k = 0; k < cfg.items.length; k++) {
          const it = cfg.items[k];
          [...dots.children].forEach((d, i) => d.classList.toggle('on', i === k));
          // build media
          [before, ...layers].forEach(n => n.querySelectorAll('.media').forEach(m => m.remove()));
          before.prepend(mediaEl(it.before && it.before.src, 0, true));
          layers.forEach((l, i) => { const m = mediaEl(it.after && it.after.src, 0, i === 2); if (i < 2) m.style.objectPosition = i ? '70% 50%' : '20% 50%'; l.append(m); });
          syncVideos();
          lblA.textContent = it.label || '';
          // before slides in
          A(before, [{ opacity: 0, transform: 'translateX(-40px) scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 950 });
          A(lblB, [{ opacity: 0, transform: 'translate(-50%,8px)' }, { opacity: 1, transform: 'translate(-50%,0)' }], { duration: 600, delay: 250 });
          await wait(800);
          // crop frame scans then locks on
          A(crop, [{ opacity: 0, transform: 'translateX(0px)' }, { opacity: 1, transform: 'translateX(0px)', offset: .15 }, { opacity: 1, transform: 'translateX(215px)', offset: .6 }, { opacity: 1, transform: 'translateX(95px)' }], { duration: 1900, easing: 'cubic-bezier(.45,0,.25,1)' });
          await wait(1700);
          // stack fans out
          layers.forEach((l, i) => A(l, [{ opacity: 0, transform: 'translate(0,24px) scale(.8)' }, { opacity: POSE[i].o, transform: POSE[i].t }], { duration: 1000, delay: i * 120, easing: SPRING }));
          A(lblA, [{ opacity: 0, transform: 'translate(-50%,10px)' }, { opacity: 1, transform: 'translate(-50%,0)' }], { duration: 700, delay: 550 });
          await wait(3000);
          // exit (unless last)
          const out = { duration: 560, easing: 'cubic-bezier(.4,0,.6,1)' };
          A(before, [{ opacity: 1 }, { opacity: 0, transform: 'translateX(-30px)' }], out);
          A(crop, [{ opacity: 1 }, { opacity: 0 }], out);
          A(lblB, [{ opacity: 1 }, { opacity: 0 }], out); A(lblA, [{ opacity: 1 }, { opacity: 0 }], out);
          layers.forEach(l => A(l, [{ opacity: 1 }, { opacity: 0, transform: 'translateX(40px) scale(.94)' }], out));
          await wait(600);
        }
      }
    };
  }

  /* ---------- scene: b-roll ---------- */
  function sceneBroll(cfg, card) {
    card.classList.add('s-broll');
    const items = (cfg.items || []).slice(0, 4);
    // preview player
    const pv = el('div', 'pv'); pv.append(mediaEl(cfg.media && cfg.media.src, 0, true));
    const bl = el('div', 'bl'); const chip = el('div', 'chip', `<i></i>${cfg.chipText || 'AI B-roll'}`); const sub = el('div', 'sub');
    pv.append(bl, chip, sub);
    // timeline
    const tl = el('div', 'tl'); const laneA = el('div', 'lane a'); const laneB = el('div', 'lane b');
    [92, 58, 120, 70, 96, 60].forEach(w => { const g = el('div', 'seg'); g.style.flex = w; laneA.append(g); });
    const scan = el('div', 'scan'); laneA.append(scan);
    const slots = items.map((it, k) => { const sl = el('div', 'slot'); sl.style.left = (18 + k * 122) + 'px'; sl.append(mediaEl(it.src, 20 + k)); laneB.append(sl); return sl; });
    const head = el('div', 'playhead'); tl.append(laneA, laneB, head);
    // suggestions panel
    const panel = el('div', 'panel', `<div class="ph">${cfg.panelTitle || 'AI B-roll'}</div>`);
    const ps = el('div', 'ps'); panel.append(ps);
    const rows = items.map(it => {
      const r = el('div', 'brow'); const th = el('div', 'th'); th.append(mediaEl(it.src, 20 + items.indexOf(it)));
      const tx = el('div', 'tx', `<b>${it.label || ''}</b><small>Sample visual · ${it.keyword || 'idea'}</small><em>${it.state || 'Suggested'}</em>`);
      r.append(th, tx); panel.append(r); return { r, th, em: tx.querySelector('em') };
    });
    card.append(pv, tl, panel);
    const cur = makeCursor(card); let hx = 16;
    const html = it => (it.line || '').replace(it.keyword || '\u0000', m => `<mark>${m}</mark>`);
    const SLOT_X = k => 16 + 18 + k * 122 + 53;                 // playhead x inside the timeline
    const reset = () => {
      clearAnims(card); cur.reset();
      rows.forEach(x => x.r.classList.remove('sel')); bl.innerHTML = '';
      head.style.transform = 'translateX(16px)'; hx = 16; sub.innerHTML = items[0] ? html(items[0]) : '';
      ps.textContent = cfg.searching || 'Reading your script…';
    };

    return {
      reset,
      async run({ wait }) {
        reset(); if (!items.length) return;
        // 1 · AI scans the timeline while "reading" the script
        await wait(300);
        A(scan, [{ transform: 'translateX(-100%)', opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .85 }, { transform: 'translateX(100%)', opacity: 0 }], { duration: 1500, easing: 'cubic-bezier(.45,0,.25,1)' });
        A(head, [{ transform: 'translateX(16px)' }, { transform: 'translateX(500px)' }, { transform: 'translateX(16px)' }], { duration: 1500, easing: 'cubic-bezier(.45,0,.25,1)' });
        await wait(1500);
        ps.textContent = `${items.length} illustrative cutaways`;
        // 2 · suggestions glide in
        rows.forEach((x, i) => {
          A(x.r, [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: i * 110 });
          x.em.textContent = items[i].state || 'Suggested';
        });
        await wait(900 + rows.length * 110);
        cur.place(520, 500); cur.show(true); await wait(50);
        // 3 · pick each suggestion → it flies onto the B-roll track
        for (let k = 0; k < items.length; k++) {
          const it = items[k], row = rows[k];
          A(head, [{ transform: `translateX(${hx}px)` }, { transform: `translateX(${SLOT_X(k)}px)` }], { duration: 800, easing: 'cubic-bezier(.45,0,.25,1)' }); hx = SLOT_X(k);
          sub.innerHTML = html(it);
          await wait(cur.to(row.th, { dx: 24, dy: 12, ms: 1100 }) + 60);
          cur.click(); row.r.classList.add('sel'); await wait(180);
          // ghost thumbnail flight (arc)
          const [tx, ty] = cur.rel(row.th), [sx, sy] = cur.rel(slots[k]);
          const ghost = el('div', 'ghost'); ghost.style.left = (tx - 48) + 'px'; ghost.style.top = (ty - 29) + 'px'; ghost.append(mediaEl(it.src, 20 + k)); card.append(ghost);
          const dx = sx - tx, dy = sy - ty;
          const fl = ghost.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: `translate(${dx * .5}px,${dy * .5 - 60}px) scale(1.12)`, opacity: 1, offset: .5 },
            { transform: `translate(${dx}px,${dy}px) scale(1,.7)`, opacity: 1 }
          ], { duration: 850, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' });
          cur.to(slots[k], { dx: 30, dy: 70, ms: 1000 });
          await wait(760);
          A(slots[k], [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: SPRING });
          await wait(120); ghost.remove();
          // 4 · preview cross-dissolves into the B-roll shot
          bl.querySelectorAll('video').forEach(v => v.pause());
          bl.innerHTML = ''; bl.append(mediaEl(it.src, 20 + k, true)); syncVideos();
          A(bl, [{ opacity: 0 }, { opacity: 1 }], { duration: 650, easing: 'ease-out' });
          A(bl.firstChild, [{ transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 3000, easing: 'linear' });
          A(chip, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 500 });
          await wait(1900);
          A(bl, [{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: 'ease-in-out' });
          A(chip, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
          await wait(450);
        }
        cur.show(false); await wait(1100);
      }
    };
  }

  const BUILDERS = { clips: sceneClips, captions: sceneCaptions, compare: sceneCompare, broll: sceneBroll };

  /* =================================================================
     CAROUSEL
     ================================================================= */
  const slides = CONFIG.slides.map((cfg, i) => {
    const card = el('div', 'card');
    card.style.setProperty('--glow1', cfg.glow ? cfg.glow[0] : '');
    card.style.setProperty('--glow2', cfg.glow ? cfg.glow[1] : '');
    const scene = BUILDERS[cfg.type](cfg, card);
    design.append(card);
    const tab = el('button', 'sc-tab', svgI(cfg.icon) + `<span>${cfg.tab}</span>`); tab.setAttribute('role', 'tab');
    tab.onclick = () => { tab.classList.remove('pulse'); void tab.offsetWidth; tab.classList.add('pulse'); go(i, true); };
    tabsEl.append(tab);
    card.addEventListener('click', () => { if (card.classList.contains('side')) go(i, true); });
    return { cfg, card, scene, tab };
  });
  design.append(prevBtn, nextBtn);

  let active = 0, token = 0, narrow = false, scale = 1, inView = false;

  function syncVideos() {
    root.getAnimations({ subtree: true }).forEach(animation => {
      if (inView && !document.hidden && animation.playState === 'paused') animation.play();
      else if ((!inView || document.hidden) && animation.playState === 'running') animation.pause();
    });
    root.querySelectorAll('video').forEach(video => {
      if (inView && !document.hidden && video.dataset.demoInactive !== 'true' && video.closest('.card') === slides[active].card) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }

  function fit() {
    const w = viewport.clientWidth; narrow = w < 760;
    const dw = narrow ? CARD_W + 40 : DW;
    scale = w / dw;
    const left = (dw - CARD_W) / 2;
    design.style.width = dw + 'px'; design.style.height = DH + 'px';
    design.style.transform = `scale(${scale})`;
    viewport.style.height = (DH * scale) + 'px';
    viewport.classList.toggle('narrow', narrow);
    // shift design-space so that centred card matches the narrow width
    slides.forEach(s => s.card.style.left = left + 'px');
    prevBtn.style.left = '40px'; nextBtn.style.left = (dw - 84) + 'px';
    prevBtn.style.display = nextBtn.style.display = narrow ? 'none' : '';
    layoutKeep(left);
  }
  function layoutKeep(left) { // layout() with the right centre when narrow
    const n = slides.length, half = Math.floor(n / 2);
    slides.forEach((s, i) => {
      let d = ((i - active + n + half) % n) - half;
      const vis = Math.abs(d) <= 1 && !(narrow && d !== 0);
      s.card.style.left = left + 'px';
      s.card.style.transform = `translateX(${d * STEP}px) scale(${d === 0 ? 1 : .9})`;
      s.card.style.opacity = d === 0 ? 1 : (vis ? .5 : 0);
      s.card.style.pointerEvents = vis ? 'auto' : 'none';
      s.card.classList.toggle('side', d !== 0 && vis);
      s.tab.classList.toggle('on', d === 0);
      s.tab.setAttribute('aria-selected', String(d === 0));
      s.tab.tabIndex = d === 0 ? 0 : -1;
    });
  }

  const ctxFor = tok => ({
    wait: async ms => {
      await new Promise(r => setTimeout(r, ms));
      while (tok === token && (!inView || document.hidden)) await new Promise(r => setTimeout(r, 250));
      if (tok !== token) throw CANCEL;
    }
  });

  async function go(i, user) {
    const n = slides.length; i = (i + n) % n;
    const prev = slides[active]; active = i; const tok = ++token;
    root.dataset.activeScene = slides[i].cfg.type;
    if (prev !== slides[i]) setTimeout(() => { if (tok === token) prev.scene.reset(); }, 1200);
    fit(); // re-applies layout
    syncVideos();
    slides.forEach(s => s.tab.style.removeProperty('--dur'));
    try {
      slides[i].scene.reset();
      await ctxFor(tok).wait(user ? 800 : 850);
      // estimate for the progress line is set once the scene reports; use a generous default
      slides[i].tab.classList.remove('on'); void slides[i].tab.offsetWidth; slides[i].tab.classList.add('on');
      const t0 = performance.now();
      const durationMs = slides[i].lastDur || (({ clips: 17, captions: 19, compare: 22, broll: 24 }[slides[i].cfg.type] || 12) * 1000);
      slides[i].tab.style.setProperty('--dur', durationMs + 'ms');
      await slides[i].scene.run(ctxFor(tok));
      slides[i].lastDur = performance.now() - t0;
      if (tok === token && CONFIG.autoplay) go(i + 1);
    } catch (e) { if (e !== CANCEL) console.error(e); }
  }

  prevBtn.onclick = () => go(active - 1, true);
  nextBtn.onclick = () => go(active + 1, true);
  const onKeydown = e => {
    if (!inView || !tabsEl.contains(document.activeElement)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(active - 1, true); slides[(active + slides.length) % slides.length].tab.focus(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(active + 1, true); slides[(active + slides.length) % slides.length].tab.focus(); }
  };
  document.addEventListener('keydown', onKeydown);

  // swipe
  let sx = null;
  const onPointerDown = e => { sx = e.clientX; };
  const onPointerUp = e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 60) go(active + (dx < 0 ? 1 : -1), true); };
  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointerup', onPointerUp);

  const resizeObserver = new ResizeObserver(fit);
  resizeObserver.observe(viewport);
  const intersectionObserver = new IntersectionObserver(es => { inView = es[0].isIntersecting; syncVideos(); }, { threshold: .15 });
  intersectionObserver.observe(viewport);
  document.addEventListener('visibilitychange', syncVideos);
  if (CONFIG.autoplay && matchMedia('(prefers-reduced-motion:reduce)').matches) CONFIG.autoplay = false;

  fit(); go(0);
  window.addEventListener('load', fit);
  return () => {
    token++;
    inView = false;
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('visibilitychange', syncVideos);
    viewport.removeEventListener('pointerdown', onPointerDown);
    viewport.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('load', fit);
    root.querySelectorAll('video').forEach(video => video.pause());
    slides.forEach(slide => clearAnims(slide.card));
    design.replaceChildren();
    tabsEl.replaceChildren();
  };
})();
}
