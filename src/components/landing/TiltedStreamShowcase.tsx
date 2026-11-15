import { Link } from "react-router-dom";
import { Sparkles, Flame, Zap, Film, ArrowRight, Play, Layers } from "lucide-react";
import { TiltedGridHero, type TiltedGridImage } from "@/components/ui/tilted-grid-hero";
import streamPodcastCaptions from "../../assets/landing/stream-podcast-captions.webp";
import streamRoverCaption from "../../assets/landing/stream-rover-caption.webp";
import streamRawPresenter from "../../assets/landing/stream-raw-presenter.webp";
import streamInterviewCaption from "../../assets/landing/stream-interview-caption.webp";
import streamRawRig from "../../assets/landing/stream-raw-rig.webp";
import streamLabCaption from "../../assets/landing/stream-lab-caption.webp";
import streamRoverScene from "../../assets/landing/stream-rover-scene.webp";
import streamTitleCaption from "../../assets/landing/stream-title-caption.webp";
import editorUi from "../../assets/landing/editor-ui.webp";
import stepHooks from "../../assets/landing/step-hooks.webp";

// Genuine product imagery: frames from actual Vireo renders (captioned 9:16
// outputs), raw source footage, the editor UI, and a real audio waveform.
const showcaseImages: TiltedGridImage[] = [
  {
    src: streamPodcastCaptions,
    alt: "Vireo render of a podcast clip with word-by-word captions",
  },
  {
    src: streamRoverCaption,
    alt: "Vireo 9:16 render of a lunar rover scene with burned-in captions",
  },
  {
    src: streamRawPresenter,
    alt: "Raw 16:9 source footage frame of a presenter",
  },
  {
    src: streamInterviewCaption,
    alt: "Vireo render of an interview moment with captions",
  },
  {
    src: streamRawRig,
    alt: "Raw source footage frame of a rover wheel test rig",
  },
  {
    src: streamLabCaption,
    alt: "Vireo render of a workshop scene with burned-in captions",
  },
  {
    src: streamRoverScene,
    alt: "Vireo render of a lunar rover scene",
  },
  {
    src: streamTitleCaption,
    alt: "Vireo render of a title moment with captions",
  },
  {
    src: editorUi,
    alt: "VireoClip multi-track editor interface",
  },
  {
    src: stepHooks,
    alt: "Real audio waveform analyzed by VireoClip",
  },
];

export function TiltedStreamShowcase() {
  return (
    <section className="relative w-full bg-[#000000] text-white overflow-hidden py-16 lg:py-24">
      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[500px] bg-gradient-to-r from-[#6734c9]/15 via-[#8753e3]/12 to-[#20E3A2]/10 blur-[140px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] backdrop-blur-md mb-4 shadow-[0_0_20px_rgba(139,92,246,0.15)]">
          <Sparkles className="w-3.5 h-3.5 text-[#bba9e8] animate-pulse" />
          <span className="text-[11px] font-mono font-bold tracking-widest text-[#bba9e8] uppercase">
            Cylindrical Infinite Stream
          </span>
        </div>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
          Turn Raw Footage Into a{" "}
          <span className="bg-gradient-to-r from-[#bba9e8] via-white to-[#c4b5fd] bg-clip-text text-transparent">
            Continuous Stream of Viral Clips
          </span>
        </h2>
        <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-300 leading-relaxed">
          Watch long-form videos bend into an endless carousel of high-retention vertical highlights, complete with active-speaker framing and kinetic captions.
        </p>
      </div>

      {/* Free-Floating Cylindrical Band (NO BOX, NO CARD) */}
      <div className="relative w-full max-w-[1500px] mx-auto px-2 sm:px-4">
        <TiltedGridHero
          images={showcaseImages}
          speed={4.5}
          tileHeight={32}
          aspectRatio={16 / 9}
          gap={7}
          axis={50}
          curve={72}
          fade={16}
          className="w-full h-[500px] sm:h-[560px] md:h-[620px] lg:h-[660px] relative overflow-hidden"
        >
          {/* Overlay center interactive controls */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-6 sm:p-10 z-20">
            {/* Top row status indicators */}
            <div className="w-full flex items-center justify-between pointer-events-auto">
              <div className="flex items-center gap-2.5 bg-black/40 backdrop-blur-xl px-4 py-1.5 rounded-full text-xs font-medium text-slate-200 shadow-md">
                <span className="w-2 h-2 rounded-full bg-[#20E3A2] animate-ping" />
                <span>Live Rendering Engine Active</span>
              </div>
              <div className="hidden sm:flex items-center gap-2.5 bg-black/40 backdrop-blur-xl px-4 py-1.5 rounded-full text-xs text-slate-300">
                <Layers className="w-3.5 h-3.5 text-[#bba9e8]" />
                <span>16-Facet Curvature Mapping</span>
              </div>
            </div>

            {/* Bottom floating feature bar */}
            <div className="w-full max-w-4xl pointer-events-auto bg-[#070914]/75 backdrop-blur-2xl rounded-2xl p-4 sm:p-5 shadow-[0_20px_60px_rgba(0,0,0,0.7)]">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02]">
                  <div className="w-8 h-8 rounded-lg bg-[#8753e3]/20 flex items-center justify-center shrink-0">
                    <Flame className="w-4 h-4 text-[#bba9e8]" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">Viral Hook Engine</div>
                    <div className="text-[11px] text-slate-400">Hook moments ranked from your footage</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02]">
                  <div className="w-8 h-8 rounded-lg bg-[#20E3A2]/15 flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4 text-[#20E3A2]" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">Sub-Second Captions</div>
                    <div className="text-[11px] text-slate-400">Kinetic word-by-word ASS tags</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.02]">
                  <div className="w-8 h-8 rounded-lg bg-[#c4b5fd]/20 flex items-center justify-center shrink-0">
                    <Film className="w-4 h-4 text-[#c4b5fd]" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">Smart 9:16 Reframe</div>
                    <div className="text-[11px] text-slate-400">Multi-speaker facial tracker</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/[0.04]">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-[#bba9e8] fill-[#bba9e8]" />
                  Continuous 3D hardware-accelerated preview loop
                </span>
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold text-white bg-gradient-to-r from-[#6734c9] to-[#8753e3] hover:brightness-110 transition shadow-[0_0_20px_rgba(139,92,246,0.35)]"
                >
                  Generate Your Clip Stream
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </TiltedGridHero>
      </div>
    </section>
  );
}

export default TiltedStreamShowcase;
