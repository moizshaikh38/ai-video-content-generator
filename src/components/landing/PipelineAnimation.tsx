import "./pipeline-animation.css";

/**
 * Illustrative process animation for the 4-step section (v2, reference-led).
 * Mock product UI per stage - player window, editor timeline with a hook
 * chip, phone reframe with karaoke captions, platform clip cards - drawn in
 * SVG, no footage. Simplified illustration, not a recording of product
 * output. Stage internals live in local coordinates so the desktop row and
 * the mobile stack share one definition. Honors prefers-reduced-motion.
 */

const WAVE = [14, 26, 18, 34, 22, 40, 16, 30, 20, 36, 14, 26, 18, 24];

function StageSource() {
  return (
    <>
      <rect width="270" height="190" rx="18" className="plx-panel" />
      <rect width="270" height="190" rx="18" className="plx-glow" />
      {/* window chrome */}
      <rect x="14" y="14" width="242" height="20" rx="10" className="plx-chrome" />
      <circle cx="26" cy="24" r="3.5" className="plx-dot r" />
      <circle cx="38" cy="24" r="3.5" className="plx-dot y" />
      <circle cx="50" cy="24" r="3.5" className="plx-dot g" />
      <rect x="64" y="19" width="130" height="10" rx="5" className="plx-urlpill" />
      {/* video area */}
      <rect x="14" y="42" width="242" height="100" rx="10" className="plx-video" />
      <circle cx="135" cy="92" r="19" className="plx-playbtn" />
      <path d="M129 82 l18 10 -18 10 z" className="plx-playicon" />
      {/* progress */}
      <rect x="14" y="152" width="242" height="5" rx="2.5" className="plx-track" />
      <rect x="14" y="152" width="88" height="5" rx="2.5" className="plx-track-fill" />
      <circle cx="102" cy="154.5" r="5" className="plx-handle" />
      <text x="248" y="176" className="plx-time">02:14:44</text>
      <text x="22" y="176" className="plx-tag">SOURCE · 16:9</text>
    </>
  );
}

function StageMoments() {
  return (
    <>
      <rect width="270" height="190" rx="18" className="plx-panel" />
      <rect width="270" height="190" rx="18" className="plx-glow" />
      {/* toolbar */}
      <rect x="14" y="14" width="242" height="18" rx="9" className="plx-chrome" />
      <rect x="22" y="19" width="26" height="8" rx="4" className="plx-tool" />
      <rect x="54" y="19" width="26" height="8" rx="4" className="plx-tool" />
      <rect x="86" y="19" width="26" height="8" rx="4" className="plx-tool" />
      {/* ruler */}
      {Array.from({ length: 13 }, (_, i) => (
        <rect key={i} x={20 + i * 19} y="40" width="1.5" height={i % 3 === 0 ? 7 : 4} className="plx-tick" />
      ))}
      {/* track with clip blocks */}
      <rect x="14" y="54" width="242" height="66" rx="8" className="plx-trackbg" />
      <rect x="22" y="62" width="96" height="50" rx="6" className="plx-clipblk" />
      <rect x="124" y="62" width="78" height="50" rx="6" className="plx-clipblk b2" />
      <g className="plx-wave">
        {WAVE.map((h, i) => (
          <rect key={i} x={28 + i * 12} y={87 - h / 2} width="5" height={h} rx="2" />
        ))}
      </g>
      {/* selected moment + hook chip */}
      <rect x="60" y="58" width="46" height="58" rx="6" className="plx-select" />
      <g className="plx-chip">
        <rect x="58" y="36" width="54" height="16" rx="8" className="plx-chipbg" />
        <text x="85" y="47" className="plx-chiptext">Hook 92</text>
      </g>
      {/* playhead */}
      <g className="plx-playhead">
        <path d="M-4 54 h8 l-4 7 z" className="plx-ph-handle" />
        <rect x="-1" y="60" width="2" height="60" className="plx-ph-line" />
      </g>
      <text x="22" y="176" className="plx-tag">MOMENTS PICKED</text>
      <text x="248" y="176" className="plx-time">3 clips</text>
    </>
  );
}

function StageReframe() {
  return (
    <>
      <rect width="270" height="190" rx="18" className="plx-panel" />
      <rect width="270" height="190" rx="18" className="plx-glow" />
      {/* 16:9 ghost */}
      <rect x="26" y="44" width="150" height="84" rx="8" className="plx-ghost" />
      {/* crop corner brackets */}
      <g className="plx-crop">
        <path d="M22 52 v-12 h12" className="plx-corner" />
        <path d="M168 40 h12 v12" className="plx-corner" />
        <path d="M22 120 v12 h12" className="plx-corner" />
        <path d="M168 132 h12 v-12" className="plx-corner" />
      </g>
      {/* phone */}
      <g className="plx-vert">
        <rect x="100" y="14" width="80" height="150" rx="16" className="plx-phone" />
        <rect x="126" y="21" width="28" height="6" rx="3" className="plx-notch" />
        <rect x="107" y="27" width="66" height="106" rx="7" className="plx-video" />
        {/* karaoke caption words */}
        <rect x="111" y="104" width="26" height="9" rx="4.5" className="plx-word w1" />
        <rect x="140" y="104" width="20" height="9" rx="4.5" className="plx-word w2" />
        <rect x="118" y="117" width="32" height="9" rx="4.5" className="plx-word w3" />
      </g>
      <text x="22" y="176" className="plx-tag">9:16 + CAPTIONS</text>
      <text x="248" y="176" className="plx-time">auto</text>
    </>
  );
}

function StageClips() {
  return (
    <>
      <rect width="270" height="190" rx="18" className="plx-panel" />
      <rect width="270" height="190" rx="18" className="plx-glow" />
      <g transform="translate(48,40) rotate(-6 26 46)">
        <g className="plx-mini k1">
          <rect width="52" height="92" rx="9" className="plx-clipcard" />
          <rect x="5" y="6" width="42" height="62" rx="5" className="plx-video" />
          <rect x="5" y="74" width="42" height="12" rx="4" className="plx-plat red" />
        </g>
      </g>
      <g transform="translate(109,32)">
        <g className="plx-mini k2">
          <rect width="52" height="92" rx="9" className="plx-clipcard" />
          <rect x="5" y="6" width="42" height="62" rx="5" className="plx-video" />
          <rect x="5" y="74" width="42" height="12" rx="4" className="plx-plat dark" />
          <g className="plx-check">
            <circle cx="52" cy="0" r="9" className="plx-checkbg" />
            <path d="M47.5 0 l3 3 6-6" className="plx-checkmark" />
          </g>
        </g>
      </g>
      <g transform="translate(170,40) rotate(6 26 46)">
        <g className="plx-mini k3">
          <rect width="52" height="92" rx="9" className="plx-clipcard" />
          <rect x="5" y="6" width="42" height="62" rx="5" className="plx-video" />
          <rect x="5" y="74" width="42" height="12" rx="4" className="plx-plat ig" />
        </g>
      </g>
      <text x="22" y="176" className="plx-tag">READY TO POST</text>
      <text x="248" y="176" className="plx-time">Shorts · TikTok · Reels</text>
    </>
  );
}

const STAGES = [
  { key: "s1", Content: StageSource },
  { key: "s2", Content: StageMoments },
  { key: "s3", Content: StageReframe },
  { key: "s4", Content: StageClips },
];

/* Desktop: panels 270x190 at x = 30, 330, 640, 930 (y=20); labels under each. */
const DESKTOP_POS = [30, 330, 640, 930].map((x) => `translate(${x},20)`);
/* Mobile: stacked at x=65, y = 10, 235, 460, 685. */
const MOBILE_POS = [10, 235, 460, 685].map((y) => `translate(65,${y})`);

export function PipelineAnimation() {
  return (
    <div className="plx-wrap lv-reveal" role="img" aria-label="Animated diagram: a long video is trimmed on a timeline, reframed vertically with captions, then exported as platform-ready clips">
      <svg className="plx plx-desktop" viewBox="0 0 1230 260" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="plx-accent" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8753e3" />
            <stop offset="1" stopColor="#20E3A2" />
          </linearGradient>
        </defs>
        {/* connectors with traveling dots */}
        <path className="plx-wire" d="M300 115 H 330" />
        <path className="plx-wire" d="M610 115 H 640" />
        <path className="plx-wire" d="M910 115 H 930" />
        <circle className="plx-packet p1" r="4" cy="115" cx="300" />
        <circle className="plx-packet p2" r="4" cy="115" cx="610" />
        <circle className="plx-packet p3" r="4" cy="115" cx="910" />
        {STAGES.map(({ key, Content }, i) => (
          <g key={key} className={`plx-stage ${key}`} transform={DESKTOP_POS[i]}>
            <Content />
          </g>
        ))}
      </svg>

      <svg className="plx plx-mobile" viewBox="0 0 400 900" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="plx-accent-m" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8753e3" />
            <stop offset="1" stopColor="#20E3A2" />
          </linearGradient>
        </defs>
        <path className="plx-wire" d="M200 202 V 233" />
        <path className="plx-wire" d="M200 427 V 458" />
        <path className="plx-wire" d="M200 652 V 683" />
        <circle className="plx-packet-v v1" r="4" cx="200" cy="202" />
        <circle className="plx-packet-v v2" r="4" cx="200" cy="427" />
        <circle className="plx-packet-v v3" r="4" cx="200" cy="652" />
        {STAGES.map(({ key, Content }, i) => (
          <g key={key} className={`plx-stage ${key}`} transform={MOBILE_POS[i]}>
            <Content />
          </g>
        ))}
      </svg>
      <p className="plx-note">Illustrative process animation, simplified. Not a recording of product output.</p>
    </div>
  );
}
export default PipelineAnimation;
