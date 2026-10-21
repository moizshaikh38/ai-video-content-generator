import { Link } from "react-router-dom";
import { Sparkles, Flame, Zap, Film, ArrowRight, Play, Layers } from "lucide-react";
import { TiltedGridHero, type TiltedGridImage } from "@/components/ui/tilted-grid-hero";

const showcaseImages: TiltedGridImage[] = [
  {
    src: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=800&q=80",
    alt: "Studio podcast microphone and soundboard recording session",
  },
  {
    src: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=800&q=80",
    alt: "Professional video editor cutting multi-track cinematic timeline",
  },
  {
    src: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80",
    alt: "High-energy esports and creator live gaming broadcast setup",
  },
  {
    src: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
    alt: "Executive interview and dynamic podcast conversation",
  },
  {
    src: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=800&q=80",
    alt: "Cinematic 4K camera rig capturing documentary storytelling",
  },
  {
    src: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=800&q=80",
    alt: "Audio mastering suite and digital waveform visualization",
  },
  {
    src: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80",
    alt: "Creative strategy and viral short-form storyboard session",
  },
  {
    src: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80",
    alt: "Live stage performance under neon lighting and audience applause",
  },
  {
    src: "https://images.unsplash.com/photo-1593697821252-0c9137d9fc45?auto=format&fit=crop&w=800&q=80",
    alt: "Close-up studio condenser microphone with acoustic shockmount",
  },
  {
    src: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80",
    alt: "Vibrant neon motion graphics and dynamic digital visual art",
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
                    <div className="text-[11px] text-slate-400">98.4% retention spike detection</div>
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
