import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { Button } from '../components/Button';

const steps = [
  { num: '01', title: 'Upload', desc: 'Drop a clip or paste a supported video URL.' },
  { num: '02', title: 'AI Analysis', desc: 'Transcribes audio and extracts topics, core insights, and key moments.' },
  { num: '03', title: 'Generate', desc: 'Drafts native content for YouTube, Instagram, Shorts, LinkedIn, and X.' },
  { num: '04', title: 'Edit', desc: 'Fine-tune and customize any copy directly inline in your workspace.' },
  { num: '05', title: 'Copy', desc: 'One-click copy to clipboard, formatted and ready for publishing.' },
];

const plans = [
  {
    name: 'Free',
    price: '$0',
    desc: '3 videos a month',
    perks: ['YouTube, IG & Shorts', 'LinkedIn & X posts', 'Inline editor & one-tap copy'],
    featured: false,
  },
  {
    name: 'Creator',
    price: '$19',
    desc: '30 videos a month',
    perks: [
      'Everything in Free',
      'Unlimited AI regenerations',
      'Custom creator niche & voice tone',
      'Priority video transcription',
    ],
    featured: true,
  },
  {
    name: 'Studio',
    price: '$49',
    desc: 'Unlimited videos',
    perks: [
      'Everything in Creator',
      'Unlimited video processing',
      'Multi-creator profiles',
      'Export to social schedulers',
    ],
    featured: false,
  },
];

export const LandingPage: React.FC = () => {
  const [quickUrl, setQuickUrl] = useState('');
  const navigate = useNavigate();

  const handleQuickStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickUrl.trim()) {
      navigate(`/projects/new?url=${encodeURIComponent(quickUrl.trim())}`);
    } else {
      navigate('/projects/new');
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero Header */}
      <header className="mx-auto max-w-6xl px-4 sm:px-6 pb-10 pt-12 text-center md:pt-16">
        <span className="inline-block rounded-full bg-sage/15 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-sage">
          One upload, every platform
        </span>
        <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-7xl font-display">
          Turn One Video Into Content Everywhere
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-muted-foreground">
          Upload a video or paste a URL. Our AI transcribes, analyzes, and crafts platform-native titles, captions, hooks, and posts in seconds.
        </p>
      </header>

      {/* Interactive Quick-Start Input Bar */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6">
        <form
          onSubmit={handleQuickStart}
          className="flex flex-col items-stretch gap-2 rounded-[2rem] bg-card p-2.5 sm:p-3 shadow-lift border border-border sm:flex-row"
        >
          <div className="flex flex-1 items-center gap-3 rounded-2xl bg-cream/80 px-4 py-3 text-muted-foreground border border-border/50">
            <span className="text-2xl select-none">🎬</span>
            <input
              type="text"
              placeholder="Paste YouTube/video URL or click to upload clip…"
              value={quickUrl}
              onChange={(e) => setQuickUrl(e.target.value)}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <Button type="submit" variant="clay" size="lg" className="shrink-0">
            Get Started
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          MP4, MOV, YouTube, or web video links · No credit card required
        </p>
      </section>

      {/* Content Kit Preview Mockup */}
      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <div className="rounded-[2.5rem] bg-card p-6 shadow-soft border border-border md:p-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="size-2.5 animate-pulse rounded-full bg-sage" />
              <span className="font-display text-lg font-semibold text-foreground">Your content kit</span>
            </div>
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-mono">
              Live Example
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SampleCard label="YouTube Titles & Chapters" meta="SEO Optimized">
              <div className="space-y-2 font-medium text-foreground">
                <p>• How I Built a $1M SaaS in 18 Months (No Investors)</p>
                <p>• The Bootstrapping Playbook: Zero to 7 Figures</p>
                <p>• Why We Rejected VC Money and Grew Faster</p>
              </div>
              <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground font-mono">
                0:00 Intro • 2:15 Validation • 5:40 First 10 Customers • 9:22 PLG
              </div>
            </SampleCard>

            <SampleCard label="Instagram Caption & Hooks" meta="Ready to post">
              <p className="text-xs font-semibold text-clay mb-1.5">Hook Option 1:</p>
              <p className="text-sm font-medium mb-2">
                "Stop looking for investors. Here's why bootstrapping is your unfair advantage:"
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Bootstrapping taught me one brutal truth: when you have no funding, you can't buy your way out of bad product-market fit. 💡
              </p>
              <p className="mt-2 text-[11px] text-sage font-medium">
                #saas #buildinpublic #bootstrapping #techfounder
              </p>
            </SampleCard>

            <SampleCard label="Shorts & Reels Moments" meta="3 clip cut-points">
              <div className="flex gap-2.5">
                {[
                  { time: '0:45–1:15', label: 'VC vs Bootstrap' },
                  { time: '5:40–6:25', label: 'Cold DM Script' },
                  { time: '13:10–14:02', label: 'Hiring Mistake' },
                ].map((clip) => (
                  <div key={clip.time} className="flex-1 rounded-2xl bg-card p-2.5 border border-border text-center">
                    <div className="grid aspect-[9/16] place-items-center rounded-xl bg-cream">
                      <div className="px-1">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-clay font-semibold block">
                          {clip.time}
                        </span>
                        <span className="text-[9px] text-muted-foreground font-medium block mt-1">
                          {clip.label}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SampleCard>

            <SampleCard label="LinkedIn & X Formats" meta="Thought Leadership">
              <div className="text-xs leading-relaxed space-y-2">
                <p className="font-medium text-foreground">
                  "Most founders think they need $1,000,000 in seed money. What they actually need is 10 customers who care deeply."
                </p>
                <p className="text-muted-foreground">
                  → Sell the problem before writing code<br />
                  → Manually onboard your first 75 signups<br />
                  → Optimize for retention over vanity hype
                </p>
                <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-clay font-medium">
                  <span>+ 7-part X Thread Structure</span>
                  <span className="text-muted-foreground">Formatted with emojis</span>
                </div>
              </div>
            </SampleCard>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how" className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-clay">Workflow</span>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl font-display">
            How it works
          </h2>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground">
            From single raw video to multi-channel distribution in 5 steps.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-5">
          {steps.map((s) => (
            <div key={s.num} className="card-soft p-5 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-[0.15em] text-clay font-mono">
                  {s.num}
                </span>
                <h3 className="mt-2 text-lg font-semibold font-display">{s.title}</h3>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="mx-auto mt-24 grid max-w-6xl gap-6 px-4 sm:px-6 md:grid-cols-3">
        <div className="card-soft p-7">
          <div className="mb-4 grid size-12 place-items-center rounded-2xl text-2xl bg-sage/15">
            ⚡
          </div>
          <h3 className="mb-2 text-xl font-semibold font-display">Seconds, not hours</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Every format drafted in one pass — a single recording yields a full week of scheduled posts across all platforms.
          </p>
        </div>

        <div className="card-soft p-7">
          <div className="mb-4 grid size-12 place-items-center rounded-2xl text-2xl bg-clay/15">
            🎯
          </div>
          <h3 className="mb-2 text-xl font-semibold font-display">Native to each platform</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            YouTube, Instagram, Shorts, LinkedIn, and X — each piece is authored with the specific tone, formatting, and reader psychology of that network.
          </p>
        </div>

        <div className="card-soft p-7">
          <div className="mb-4 grid size-12 place-items-center rounded-2xl text-2xl bg-ink/10">
            ✍️
          </div>
          <h3 className="mb-2 text-xl font-semibold font-display">Yours to edit</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Full control over every generated word. Tweak copy inline, regenerate specific sections, and configure your target niche and audience voice.
          </p>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-clay">Plans</span>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl font-display">
            Simple pricing
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start free, upgrade when your publishing volume expands.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`card-soft flex flex-col p-7 ${
                p.featured ? 'border-2 border-sage shadow-lift' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold uppercase tracking-[0.15em] text-clay">
                  {p.name}
                </p>
                {p.featured && (
                  <span className="rounded-full bg-sage/15 px-2.5 py-0.5 text-[10px] font-semibold text-sage">
                    Most Popular
                  </span>
                )}
              </div>
              <p className="mt-3 font-display text-4xl font-semibold">
                {p.price}
                <span className="text-base font-normal text-muted-foreground">/mo</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>

              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                {p.perks.map((k) => (
                  <li key={k} className="flex items-center gap-2.5">
                    <Check className="size-4 text-sage shrink-0" />
                    <span>{k}</span>
                  </li>
                ))}
              </ul>

              <Button
                className="mt-8 w-full"
                variant={p.featured ? 'sage' : 'outline'}
                asChild
              >
                <Link to="/dashboard">Get Started</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="mx-auto mt-24 max-w-4xl px-4 sm:px-6">
        <div className="card-soft p-8 sm:p-12 text-center bg-card shadow-lift border border-border">
          <span className="inline-block rounded-full bg-clay/15 px-3 py-1 text-xs font-semibold text-clay mb-3">
            Start Generating
          </span>
          <h2 className="text-3xl sm:text-4xl font-semibold font-display tracking-tight text-foreground">
            Ready to turn your videos into viral content?
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-lg mx-auto">
            Upload your first video today and experience an end-to-end content kit in under 60 seconds.
          </p>
          <div className="mt-8 flex justify-center">
            <Button variant="clay" size="lg" asChild>
              <Link to="/projects/new">
                Create New Project <ArrowRight className="size-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

function SampleCard({
  label,
  meta,
  children,
}: {
  label: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-cream/70 p-5 border border-border">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-clay">
          {label}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">{meta}</span>
      </div>
      <div className="text-sm leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}
