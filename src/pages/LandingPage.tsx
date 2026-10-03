import React from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Sparkles,
  Film,
  Share2,
  Upload,
  Brain,
  Layers,
  Copy,
  ArrowRight,
  CheckCircle2,
  Activity,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/Card';
import { Container } from '../components/Container';
import { useHealth } from '../hooks/useHealth';
import { YoutubeIcon, InstagramIcon } from '../components/SocialIcons';

export const LandingPage: React.FC = () => {
  const { health, isLoading: isHealthLoading } = useHealth();

  const features = [
    {
      title: 'AI Transcription',
      description: 'Accurate speech-to-text with automatic timestamping and speaker detection.',
      icon: FileText,
      badge: 'Transcription',
    },
    {
      title: 'AI Content Generation',
      description: 'Synthesize core takeaways, summaries, blog drafts, and action items in seconds.',
      icon: Sparkles,
      badge: 'Core Engine',
    },
    {
      title: 'YouTube Content',
      description: 'Optimized video titles, SEO descriptions, chapters, and community posts.',
      icon: YoutubeIcon,
      badge: 'Long-Form',
    },
    {
      title: 'Instagram Content',
      description: 'Engaging captions, carousels, hashtags, and story ideas tailored for IG audience.',
      icon: InstagramIcon,
      badge: 'Visual Feeds',
    },
    {
      title: 'Shorts & Reels',
      description: 'Key clip ideas, punchy vertical hooks, and dynamic subtitle templates.',
      icon: Film,
      badge: 'Vertical Video',
    },
    {
      title: 'LinkedIn & X Content',
      description: 'Thought leadership posts, viral threads, and bite-sized insights ready to share.',
      icon: Share2,
      badge: 'Social Networks',
    },
  ];

  const steps = [
    {
      num: '01',
      title: 'Upload',
      description: 'Provide a video file or link to any MP4, MOV, or web video stream.',
      icon: Upload,
    },
    {
      num: '02',
      title: 'AI Understands',
      description: 'Our engine parses audio, extracts transcripts, and structures topic highlights.',
      icon: Brain,
    },
    {
      num: '03',
      title: 'Generate Content',
      description: 'Tailored content packages for every social channel are automatically drafted.',
      icon: Layers,
    },
    {
      num: '04',
      title: 'Edit & Copy',
      description: 'Review the generated drafts, tweak where needed, and copy straight to clipboard.',
      icon: Copy,
    },
  ];

  return (
    <div className="relative overflow-hidden">
      {/* Background Glow Accents */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[550px] bg-gradient-to-b from-indigo-600/15 via-purple-600/5 to-transparent blur-3xl pointer-events-none -z-10"
        aria-hidden="true"
      />
      <div
        className="absolute top-96 right-0 w-96 h-96 bg-cyan-500/10 blur-3xl pointer-events-none -z-10"
        aria-hidden="true"
      />

      {/* Hero Section */}
      <section className="pt-12 sm:pt-20 pb-16 sm:pb-24">
        <Container size="lg">
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
            {/* Live Backend Connection Indicator */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 mb-6 shadow-sm">
              <span className="flex h-2 w-2 relative">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isHealthLoading
                      ? 'bg-amber-400'
                      : health?.status === 'ok'
                      ? 'bg-emerald-400'
                      : 'bg-red-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isHealthLoading
                      ? 'bg-amber-500'
                      : health?.status === 'ok'
                      ? 'bg-emerald-500'
                      : 'bg-red-500'
                  }`}
                />
              </span>
              <Activity className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Backend API:{' '}
                {isHealthLoading
                  ? 'Connecting...'
                  : health?.status === 'ok'
                  ? 'Online (/api/health)'
                  : 'Offline'}
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-[1.15] sm:leading-[1.12]">
              Turn One Video Into{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent">
                Content Everywhere
              </span>
            </h1>

            {/* Description */}
            <p className="mt-6 text-base sm:text-xl text-slate-300 max-w-2xl leading-relaxed font-normal">
              Upload one video and use AI to transform it into useful content for multiple platforms.
            </p>

            {/* CTA Buttons */}
            <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4 w-full sm:w-auto">
              <Link to="/signup" className="w-full sm:w-auto">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto font-semibold px-8"
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Get Started
                </Button>
              </Link>
              <a href="#how-it-works" className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto font-semibold px-8"
                >
                  See How It Works
                </Button>
              </a>
            </div>

            {/* Visual Workflow Preview Mockup */}
            <div className="mt-14 sm:mt-16 w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 backdrop-blur shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  <span className="text-xs text-slate-400 ml-2 font-mono hidden sm:inline">
                    OmniVid Studio — Pipeline Preview
                  </span>
                </div>
                <span className="text-xs text-indigo-400 font-medium bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
                  Phase 1 Ready
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Input Source
                  </div>
                  <div className="text-sm font-medium text-white flex items-center gap-2">
                    <Upload className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="truncate">Single Raw Video (MP4)</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Intelligence Engine
                  </div>
                  <div className="text-sm font-medium text-white flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>Transcript + Highlights</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Omni-Channel Output
                  </div>
                  <div className="text-sm font-medium text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>6 Content Packages</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 sm:py-24 border-t border-slate-900 bg-slate-950/50">
        <Container size="lg">
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <h2 className="text-xs sm:text-sm font-bold tracking-widest text-indigo-400 uppercase mb-2">
              Capabilities
            </h2>
            <h3 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              One Recording. Every Medium.
            </h3>
            <p className="mt-3 text-sm sm:text-base text-slate-400 leading-relaxed">
              Designed to transform any raw presentation, podcast, interview, or tutorial into tailored content.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={idx}
                  hoverable
                  className="flex flex-col justify-between transition-all duration-200"
                >
                  <CardHeader>
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {feature.badge}
                      </span>
                    </div>
                    <CardTitle className="text-lg text-white font-semibold">
                      {feature.title}
                    </CardTitle>
                    <CardDescription className="text-slate-400 text-sm mt-1.5">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2 text-xs text-indigo-400/90 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Modular Generation Ready</span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </Container>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-16 sm:py-24 border-t border-slate-900">
        <Container size="lg">
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <h2 className="text-xs sm:text-sm font-bold tracking-widest text-indigo-400 uppercase mb-2">
              Workflow
            </h2>
            <h3 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              How It Works
            </h3>
            <p className="mt-3 text-sm sm:text-base text-slate-400">
              A smooth 4-step pipeline that takes your video from raw footage to published copy.
            </p>
          </div>

          {/* Stepper Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, idx) => {
              const StepIcon = step.icon;
              return (
                <div
                  key={idx}
                  className="relative flex flex-col p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-sm">
                      <StepIcon className="w-5 h-5" />
                    </div>
                    <span className="text-2xl font-black text-slate-700 font-mono">
                      {step.num}
                    </span>
                  </div>

                  <h4 className="text-lg font-bold text-white mb-2">{step.title}</h4>
                  <p className="text-sm text-slate-400 leading-relaxed flex-1">
                    {step.description}
                  </p>

                  {idx < steps.length - 1 && (
                    <div className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-slate-600">
                      <ArrowRight className="w-5 h-5 text-slate-600" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Mobile Flow Indicator */}
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400 font-medium sm:hidden">
            <span>Upload</span>
            <span>→</span>
            <span>AI Understands</span>
            <span>→</span>
            <span>Generate</span>
            <span>→</span>
            <span>Copy</span>
          </div>
        </Container>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-20 border-t border-slate-900 bg-gradient-to-b from-indigo-950/20 via-slate-950 to-slate-950">
        <Container size="md">
          <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-900/80 p-8 sm:p-12 text-center shadow-xl shadow-indigo-950/20">
            <h3 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Create Your First Content Package
            </h3>
            <p className="mt-3 text-sm sm:text-base text-slate-300 max-w-xl mx-auto">
              Get started now and build an omni-channel distribution machine from your existing video library.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/signup" className="w-full sm:w-auto">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full sm:w-auto px-8"
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Get Started
                </Button>
              </Link>
              <Link to="/dashboard" className="w-full sm:w-auto">
                <Button variant="secondary" size="lg" className="w-full sm:w-auto px-8">
                  Open Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
};
