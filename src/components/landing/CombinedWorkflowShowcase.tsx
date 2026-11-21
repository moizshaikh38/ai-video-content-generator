import { useEffect, useState } from "react";
import {
  Film,
  Scissors,
  Crop,
  Share2,
  Sparkles,
  Captions,
  Layers,
  Wand2,
  Music4,
} from "lucide-react";
import ytShortsLogo from "../../assets/landing/platforms/youtubeshorts.svg";
import tiktokLogo from "../../assets/landing/platforms/tiktok.svg";
import instagramLogo from "../../assets/landing/platforms/instagram.svg";
import "../../styles/combined-workflow.css";

// Same-source sample: IShowSpeed GTA stream capture (YouTube kR8bhkVAgBY,
// 20s segment) and a 9:16 facecam+gameplay layout composed from it locally.
// See public/demo/landing/clips/manifest.json for provenance and rights note.
// Local preview only - public use rights not established.
const SRC_VIDEO = "/demo/landing/clips/ishowspeed-gta-raw-169.mp4";
const ZOOM_VIDEO = "/demo/landing/clips/ishowspeed-gta-facecam-916.mp4";
const SRC_POSTER = "/demo/landing/clips/ishowspeed-gta-raw-169-poster.jpg";
const ZOOM_POSTER = "/demo/landing/clips/ishowspeed-gta-facecam-916-poster.jpg";

type Mode = "source" | "moments" | "framing" | "captions" | "clips";
const MODES: Mode[] = ["source", "moments", "framing", "captions", "clips"];

const STAGES: { mode: Mode; icon: typeof Film; label: string; sub: string }[] = [
  { mode: "source", icon: Film, label: "Stream source", sub: "Original 16:9 capture, landscape" },
  { mode: "moments", icon: Scissors, label: "Moment markers", sub: "Choose start and end points" },
  { mode: "framing", icon: Crop, label: "Reframe + captions", sub: "9:16 layout with captions" },
  { mode: "clips", icon: Share2, label: "Platform-ready clips", sub: "Shorts, TikTok, Reels" },
];

const TABS: { id: Mode; label: string }[] = [
  { id: "moments", label: "Moments" },
  { id: "framing", label: "Framing" },
  { id: "captions", label: "Captions" },
];

const FEATURES = [
  { icon: Sparkles, label: "AI Virality Scoring" },
  { icon: Captions, label: "Kinetic Captions" },
  { icon: Crop, label: "Smart 9:16 Reframe" },
  { icon: Layers, label: "Multi-Track Editor" },
  { icon: Wand2, label: "AI B-Roll Overlays" },
  { icon: Music4, label: "Audio Ducking & Polish" },
];

const stageIndexFor = (mode: Mode) =>
  mode === "captions" ? 2 : STAGES.findIndex((s) => s.mode === mode);

export function CombinedWorkflowShowcase() {
  const [mode, setMode] = useState<Mode>("source");
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Honor prefers-reduced-motion: no auto-advance timers, videos render as
  // poster frames instead of playing.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // Auto-advance the journey; pauses briefly when the user picks a tab.
  useEffect(() => {
    if (paused || reduceMotion) return;
    const t = setInterval(() => {
      setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]);
    }, 2800);
    return () => clearInterval(t);
  }, [paused, reduceMotion]);

  useEffect(() => {
    if (!paused) return;
    const t = setTimeout(() => setPaused(false), 9000);
    return () => clearTimeout(t);
  }, [paused, mode]);

  const activeStage = stageIndexFor(mode);

  // One playing video at a time; everything else renders as poster frames so
  // mobile never decodes several loops at once.
  const videoFor = (src: string, poster: string, label: string, cls: string) =>
    reduceMotion ? (
      <img key={poster + mode} className={cls} src={poster} alt={label} />
    ) : (
    <video
      key={src + mode}
      className={cls}
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      disableRemotePlayback
      preload="metadata"
      aria-label={label}
    />
    );

  return (
    <section
      id="major-features"
      className="cw-section relative w-full bg-[#000000] text-white overflow-hidden py-16 lg:py-24"
      aria-label="Combined workflow preview"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] backdrop-blur-md mb-4 shadow-[0_0_20px_rgba(139,92,246,0.15)]">
            <Sparkles className="w-3.5 h-3.5 text-[#bba9e8] animate-pulse" />
            <span className="text-[11px] font-mono font-bold tracking-widest text-[#bba9e8] uppercase">
              One Connected Workflow
            </span>
          </div>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-3 sm:mb-4 leading-tight">
            From One Long Video to{" "}
            <span className="bg-gradient-to-r from-[#bba9e8] via-white to-[#c4b5fd] bg-clip-text text-transparent">
              Platform-Ready Clips
            </span>
          </h2>
          <p className="text-sm sm:text-lg text-slate-300 leading-relaxed">
            The same sample video travels the whole VireoClip workflow: source,
            moment markers, vertical reframe, captions and clip cards.
          </p>
        </div>

        {/* Journey rail: 4 stages, one animated connector */}
        <div className="cw-rail" role="list">
          {STAGES.map((stage, i) => (
            <div className="cw-rail-item" key={stage.mode} role="listitem">
              <div className={`cw-stage ${i === activeStage ? "active" : ""} ${i < activeStage ? "done" : ""}`}>
                <div className="cw-stage-head">
                  <stage.icon size={15} className="text-[#bba9e8]" aria-hidden="true" />
                  <span className="cw-stage-label">{stage.label}</span>
                </div>
                <div className="cw-stage-thumb">
                  {stage.mode === "clips" ? (
                    <div className="cw-mini-clips">
                      {[ytShortsLogo, tiktokLogo, instagramLogo].map((logo, j) => (
                        <div className="cw-mini-clip" key={j}>
                          <img src={ZOOM_POSTER} alt="Illustrative clip card frame from the sample video" />
                          <img className="cw-mini-logo" src={logo} alt={["YouTube Shorts", "TikTok", "Instagram Reels"][j]} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <img
                      src={stage.mode === "framing" ? ZOOM_POSTER : SRC_POSTER}
                      alt={`Sample video frame for the ${stage.label} step`}
                      className={stage.mode === "framing" ? "cw-thumb-vertical" : "cw-thumb-wide"}
                    />
                  )}
                  {stage.mode === "moments" && (
                    <div className="cw-mini-timeline" aria-hidden="true">
                      <span className="cw-marker" style={{ left: "18%" }} />
                      <span className={`cw-marker ${i === activeStage ? "pulse" : ""}`} style={{ left: "46%" }} />
                      <span className="cw-marker" style={{ left: "74%" }} />
                    </div>
                  )}
                </div>
                <span className="cw-stage-sub">{stage.sub}</span>
              </div>
              {i < STAGES.length - 1 && (
                <div className={`cw-connector ${i < activeStage ? "filled" : ""}`} aria-hidden="true">
                  <span />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Focus panel: the same clip, in the selected workflow state */}
        <div className="cw-panel">
          <div className="cw-tabs" role="tablist" aria-label="Workflow steps">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={mode === tab.id}
                className={`cw-tab ${mode === tab.id ? "on" : ""}`}
                onClick={() => {
                  setMode(tab.id);
                  setPaused(true);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="cw-stage-view" aria-live="polite">
            {mode === "source" && (
              <div className="cw-view">
                {videoFor(SRC_VIDEO, SRC_POSTER, "Sample video playing: IShowSpeed GTA stream capture, original 16:9 landscape frame", "cw-view-wide")}
              </div>
            )}

            {mode === "moments" && (
              <div className="cw-view">
                <div className="cw-moments-wrap">
                  {videoFor(SRC_VIDEO, SRC_POSTER, "Sample video playing with illustrative moment markers", "cw-view-wide")}
                  <div className="cw-timeline" aria-hidden="true">
                    <span className="cw-marker" style={{ left: "18%" }} />
                    <span className="cw-marker pulse" style={{ left: "46%" }} />
                    <span className="cw-marker" style={{ left: "74%" }} />
                  </div>
                </div>
              </div>
            )}

            {mode === "framing" && (
              <div className="cw-view cw-view-split">
                <div className="cw-crop-demo">
                  {videoFor(SRC_VIDEO, SRC_POSTER, "Sample video playing with an illustrative crop region", "cw-view-wide")}
                  <div className="cw-cropbox" aria-hidden="true" />
                </div>
                <img src={ZOOM_POSTER} alt="Static frame of the 9:16 sample layout (facecam plus gameplay panels) from the same source" className="cw-view-poster" />
              </div>
            )}

            {mode === "captions" && (
              <div className="cw-view cw-view-split">
                <div className="cw-caption-demo">
                  {videoFor(ZOOM_VIDEO, ZOOM_POSTER, "9:16 layout playing with synced captions", "cw-view-poster")}
                </div>
              </div>
            )}

            {mode === "clips" && (
              <div className="cw-view">
                <div className="cw-clips-row">
                  {[
                    { logo: ytShortsLogo, name: "YouTube Shorts" },
                    { logo: tiktokLogo, name: "TikTok" },
                    { logo: instagramLogo, name: "Instagram Reels" },
                  ].map((c) => (
                    <div className="cw-clip-card" key={c.name}>
                      <img src={ZOOM_POSTER} alt={`Illustrative clip card for ${c.name} using the sample 9:16 layout`} />
                      <div className="cw-clip-meta">
                        <img src={c.logo} alt={c.name} />
                        <span>{c.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="cw-credit">
            Footage: IShowSpeed on YouTube
          </p>
        </div>

        {/* Static capability chips (no second animation) */}
        <div className="cw-features">
          {FEATURES.map((f) => (
            <div className="cw-feature" key={f.label}>
              <f.icon size={14} className="text-[#bba9e8]" aria-hidden="true" />
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
