import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Share2,
  Film,
  Copy,
  Check,
  Play,
  Clock,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { YoutubeIcon } from '../components/SocialIcons';

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'transcript' | 'youtube' | 'social' | 'shorts'>('transcript');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // States to demonstrate LoadingState and ErrorState components
  const [simulatedState, setSimulatedState] = useState<'normal' | 'loading' | 'error'>('normal');

  const handleCopy = (key: string, _text: string) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Bar Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        {/* State preview triggers for Phase 1 verification */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 hidden sm:inline">UI Component States:</span>
          <Button
            variant={simulatedState === 'normal' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSimulatedState('normal')}
          >
            Normal
          </Button>
          <Button
            variant={simulatedState === 'loading' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSimulatedState('loading')}
          >
            Loading
          </Button>
          <Button
            variant={simulatedState === 'error' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSimulatedState('error')}
          >
            Error
          </Button>
        </div>
      </div>

      {simulatedState === 'loading' ? (
        <LoadingState
          size="lg"
          message="Synthesizing Content Packages"
          description="Extracting timestamps, generating YouTube SEO descriptions, and writing social drafts..."
        />
      ) : simulatedState === 'error' ? (
        <ErrorState
          title="Could Not Load Project"
          message="We encountered an issue fetching the video processing status. Please check your network connection and retry."
          onRetry={() => setSimulatedState('normal')}
        />
      ) : (
        <>
          {/* Project Header Banner */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-indigo-400 uppercase tracking-wider bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  {id || 'proj-01'}
                </span>
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Ready
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">
                Product Keynote & Architecture Walkthrough
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> 18m 42s Duration
                </span>
                <span>•</span>
                <span>1080p MP4</span>
                <span>•</span>
                <span>Source: /videos/keynote-2026.mp4</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Play className="w-3.5 h-3.5 text-indigo-400" />}
              >
                Preview Video
              </Button>
            </div>
          </div>

          {/* Package Tabs */}
          <div className="flex border-b border-slate-800 overflow-x-auto no-scrollbar gap-2">
            {[
              { id: 'transcript', label: 'AI Transcript', icon: FileText },
              { id: 'youtube', label: 'YouTube Package', icon: YoutubeIcon },
              { id: 'social', label: 'Social Content (X & LinkedIn)', icon: Share2 },
              { id: 'shorts', label: 'Shorts & Hooks', icon: Film },
            ].map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    isActive
                      ? 'border-indigo-500 text-indigo-400 bg-slate-900/50'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <TabIcon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Active Tab Content Display */}
          {activeTab === 'transcript' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Full Audio Transcription</CardTitle>
                  <CardDescription>
                    Speech-to-text transcript generated with timestamp intervals.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={copiedKey === 'transcript' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  onClick={() => handleCopy('transcript', 'Full Transcript content')}
                >
                  {copiedKey === 'transcript' ? 'Copied!' : 'Copy Transcript'}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 font-mono text-xs sm:text-sm bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                  <div className="text-slate-400">
                    <span className="text-indigo-400 font-bold">[00:00 - 00:45]</span> Welcome everyone. Today we are walking through the core architecture of our next generation content engine.
                  </div>
                  <div className="text-slate-400">
                    <span className="text-indigo-400 font-bold">[00:46 - 02:15]</span> The goal here is simple: turn one high-quality video into dozens of contextual assets without manual editing.
                  </div>
                  <div className="text-slate-400">
                    <span className="text-indigo-400 font-bold">[02:16 - 04:30]</span> Let&apos;s look at the pipeline: ingest, transcribe, analyze topics, and format for target networks.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'youtube' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>YouTube Optimization Package</CardTitle>
                  <CardDescription>
                    SEO title options, video description with chapters, and relevant tags.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={copiedKey === 'youtube' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  onClick={() => handleCopy('youtube', 'YouTube metadata')}
                >
                  {copiedKey === 'youtube' ? 'Copied!' : 'Copy Package'}
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <p className="text-xs uppercase font-bold text-indigo-400">Suggested Title</p>
                  <p className="text-sm font-semibold text-white">
                    Turn One Video Into Content Everywhere (System Architecture Breakdown)
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <p className="text-xs uppercase font-bold text-indigo-400">Description & Timestamps</p>
                  <pre className="text-xs text-slate-300 font-sans whitespace-pre-line leading-relaxed">
                    Learn how we built an automated omni-channel video distribution pipeline.{"\n\n"}
                    TIMESTAMPS:{"\n"}
                    00:00 - Introduction & Vision{"\n"}
                    02:15 - Pipeline Design & Ingest{"\n"}
                    07:40 - AI Transcription & Prompt Orchestraction{"\n"}
                    14:20 - Multi-Platform Output Engine{"\n"}
                    18:00 - Conclusion & Next Steps
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'social' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base">LinkedIn Thought Leadership Post</CardTitle>
                    <CardDescription>Professional angle focusing on efficiency.</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy('linkedin', 'LinkedIn text')}
                  >
                    {copiedKey === 'linkedin' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                    Most creators spend 80% of their time repurposing content instead of creating it.{"\n\n"}
                    Here is the 4-step framework we used to turn a single 18-minute video into 6 distinct platform packages...
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-base">X / Twitter Thread</CardTitle>
                    <CardDescription>Bite-sized punchy breakdown.</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy('x', 'X thread text')}
                  >
                    {copiedKey === 'x' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                    🧵 How to turn 1 video into 10+ high-performing posts across YouTube, LinkedIn, and Instagram:{"\n\n"}
                    1/ Focus on high-signal chapters{"\n"}
                    2/ Extract key quotes as visual hooks{"\n"}
                    3/ Adapt the voice per platform...
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'shorts' && (
            <Card>
              <CardHeader>
                <CardTitle>Shorts & Reels Hook Suggestions</CardTitle>
                <CardDescription>
                  Identified viral clips with timestamp windows and opening hook scripts.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  {
                    hook: '"Why 90% of content distribution fails"',
                    interval: '03:12 - 03:58',
                    format: '9:16 Vertical Reel',
                  },
                  {
                    hook: '"The secret to scaling video without hiring editors"',
                    interval: '08:45 - 09:30',
                    format: '9:16 Shorts',
                  },
                ].map((clip, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{clip.hook}</p>
                      <p className="text-xs text-indigo-400 mt-1 font-mono">
                        Clip Window: {clip.interval} • {clip.format}
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      Select Clip
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
