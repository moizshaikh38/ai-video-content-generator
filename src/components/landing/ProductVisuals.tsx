import {
  ArrowUpRight,
  AudioLines,
  Check,
  Clock3,
  FileText,
  Play,
  Sparkles,
} from "lucide-react";
import { Logo } from "../Logo";

export const channels = [
  "YouTube",
  "Instagram",
  "Shorts / Reels",
  "LinkedIn",
  "X",
] as const;

function VideoTile({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`lv-video ${compact ? "lv-video-compact" : ""}`}>
      <div className="lv-video-glow" />
      <div className="lv-video-orbit lv-video-orbit-one" />
      <div className="lv-video-orbit lv-video-orbit-two" />
      <div className="lv-video-content">
        <span className="lv-video-play">
          <Play size={18} fill="currentColor" />
        </span>
        <span className="lv-video-label">YOUR VIDEO</span>
      </div>
    </div>
  );
}

export function HeroVisual() {
  return (
    <div
      className="lv-hero-stage"
      aria-label="Illustration of one uploaded video becoming a transcript and five platform drafts"
    >
      <div className="lv-stage-halo" />
      <div className="lv-floating lv-floating-youtube">
        <span className="lv-floating-kicker">YOUTUBE · TITLE</span>
        <strong>
          Give your best ideas
          <br />a bigger audience.
        </strong>
        <span className="lv-floating-foot">
          Description + chapters <ArrowUpRight size={13} />
        </span>
      </div>
      <div className="lv-floating lv-floating-instagram">
        <span className="lv-floating-kicker">INSTAGRAM · CAPTION</span>
        <strong>
          One idea, a new angle
          <br />
          for your feed.
        </strong>
        <span className="lv-mini-tags">#creator #ideas #video</span>
      </div>
      <div className="lv-app-frame">
        <div className="lv-app-top">
          <Logo compact />
          <div className="lv-app-top-label">
            Content workspace <span> / </span> New project
          </div>
          <span className="lv-app-top-status">
            <Check size={11} /> Ready to review
          </span>
        </div>
        <div className="lv-app-inner">
          <div className="lv-app-heading">
            <div>
              <span className="lv-mini-eyebrow">YOUR CONTENT KIT</span>
              <h3>From your video, to everywhere.</h3>
            </div>
            <span className="lv-app-pill">Illustrative preview</span>
          </div>
          <div className="lv-app-columns">
            <VideoTile />
            <div className="lv-transcript">
              <div className="lv-panel-title">
                <AudioLines size={15} /> Transcript <span>Auto generated</span>
              </div>
              <p>
                <time>00:18</time> “The most useful ideas deserve more than one
                post.”
              </p>
              <p>
                <time>00:42</time> “Start with the message, then shape it for
                each channel.”
              </p>
              <p>
                <time>01:06</time> “One video can become a whole content kit.”
              </p>
            </div>
          </div>
          <div className="lv-app-divider" />
          <div className="lv-app-bottom">
            <span>
              <Sparkles size={14} /> Ready for your channels
            </span>
            <div>
              {channels.map((channel) => (
                <span key={channel}>{channel}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="lv-floating lv-floating-short">
        <span className="lv-floating-kicker">SHORTS / REELS · MOMENT</span>
        <strong>
          <Clock3 size={16} /> 00:42
        </strong>
        <small>Shape it for each channel</small>
      </div>
      <div className="lv-stage-caption">
        <span className="lv-stage-caption-dot" /> ONE VIDEO <span>→</span> FIVE
        WAYS TO SHARE
      </div>
    </div>
  );
}

export function TransformationVisual() {
  return (
    <div
      className="lv-transform"
      aria-label="A video is processed by Vireo into drafts for five content platforms"
    >
      <div className="lv-transform-source">
        <VideoTile compact />
        <div>
          <span className="lv-mini-eyebrow">THE INPUT</span>
          <strong>Your video</strong>
          <small>The story you already made.</small>
        </div>
      </div>
      <div className="lv-transform-connector">
        <span />
      </div>
      <div className="lv-transform-engine">
        <span className="lv-engine-icon">
          <Logo compact />
        </span>
        <strong>Vireo</strong>
        <small>Transcribe · Understand · Repurpose</small>
      </div>
      <div className="lv-transform-connector">
        <span />
      </div>
      <div className="lv-transform-outputs">
        <span className="lv-mini-eyebrow">THE OUTPUTS</span>
        {channels.map((channel, i) => (
          <div key={channel}>
            <span className="lv-output-index">0{i + 1}</span>
            <strong>{channel}</strong>
            <span>
              <ArrowUpRight size={15} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TranscriptPreview() {
  return (
    <div
      className="lv-product-window lv-transcript-preview"
      aria-label="Illustrative timestamped transcript preview"
    >
      <div className="lv-window-bar">
        <span className="lv-window-dots">
          <i />
          <i />
          <i />
        </span>
        <span>Transcript</span>
        <span className="lv-window-right">
          <FileText size={13} /> Video project
        </span>
      </div>
      <div className="lv-transcript-preview-body">
        <div className="lv-preview-top">
          <span>
            <AudioLines size={17} /> Transcript
          </span>
          <span className="lv-preview-badge">Ready to review</span>
        </div>
        <div className="lv-preview-meta">
          <span>
            Language <b>English</b>
          </span>
          <span>
            Duration <b>02:14</b>
          </span>
          <span>
            Words <b>Preview</b>
          </span>
        </div>
        <div className="lv-transcript-lines">
          <p>
            <time>00:00</time>
            <span>Every video starts with an idea worth sharing.</span>
          </p>
          <p className="lv-active-line">
            <time>00:18</time>
            <span>
              But getting that idea in front of people takes more than pressing
              publish.
            </span>
          </p>
          <p>
            <time>00:42</time>
            <span>
              Shape the same message for each place your audience spends time.
            </span>
          </p>
          <p>
            <time>01:06</time>
            <span>That is where your content kit comes together.</span>
          </p>
        </div>
        <div className="lv-transcript-wave">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

export function WorkspacePreview() {
  return (
    <div
      className="lv-product-window lv-workspace-preview"
      aria-label="Illustrative platform content workspace"
    >
      <div className="lv-window-bar">
        <span className="lv-window-dots">
          <i />
          <i />
          <i />
        </span>
        <span>Content workspace</span>
        <span className="lv-window-right">
          <Check size={13} /> Drafts ready
        </span>
      </div>
      <div className="lv-workspace-body">
        <div className="lv-workspace-sidebar">
          <Logo compact />
          <span className="active">Content kit</span>
          <span>Transcript</span>
          <span>Project history</span>
        </div>
        <div className="lv-workspace-main">
          <div className="lv-workspace-heading">
            <span className="lv-mini-eyebrow">VIDEO PROJECT</span>
            <h3>Your ideas, ready for every channel.</h3>
          </div>
          <div className="lv-workspace-tabs">
            {channels.map((c, i) => (
              <span className={i === 0 ? "active" : ""} key={c}>
                {c}
              </span>
            ))}
          </div>
          <div className="lv-workspace-drafts">
            <div>
              <small>TITLE</small>
              <strong>Make one idea work across every channel</strong>
              <span>Copy draft ↗</span>
            </div>
            <div>
              <small>DESCRIPTION</small>
              <p>
                A thoughtful starting point for sharing the idea behind your
                video with more people.
              </p>
            </div>
            <div>
              <small>CHAPTERS</small>
              <p>
                <b>00:00</b> The idea
                <br />
                <b>00:42</b> Finding the angle
                <br />
                <b>01:06</b> What to share next
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MomentsPreview() {
  const moments = [
    {
      time: "00:18",
      title: "The opening thought",
      line: "A hook that sets up your core idea.",
    },
    {
      time: "00:42",
      title: "The practical takeaway",
      line: "A focused moment worth revisiting.",
    },
    {
      time: "01:06",
      title: "The closing insight",
      line: "A natural ending for a short clip.",
    },
  ];
  return (
    <div
      className="lv-moments-preview"
      aria-label="Illustrative timestamped moments"
    >
      <div className="lv-moments-head">
        <div>
          <span className="lv-mini-eyebrow">SHORTS / REELS</span>
          <h3>Moments to revisit</h3>
        </div>
        <span>
          <Clock3 size={14} /> Timestamped
        </span>
      </div>
      {moments.map((m, i) => (
        <div className="lv-moment" key={m.time}>
          <div className={`lv-moment-thumb lv-moment-thumb-${i}`}>
            <Play size={14} fill="currentColor" />
          </div>
          <time>{m.time}</time>
          <div>
            <strong>{m.title}</strong>
            <p>{m.line}</p>
          </div>
          <ArrowUpRight size={16} />
        </div>
      ))}
    </div>
  );
}
