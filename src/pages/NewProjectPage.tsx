import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, UploadCloud, Link as LinkIcon, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/Card';

export const NewProjectPage: React.FC = () => {
  const [title, setTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [uploadMode, setUploadMode] = useState<'url' | 'file'>('file');
  const navigate = useNavigate();

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    // In Phase 1: placeholder routing to demonstration project detail
    navigate('/projects/proj-01');
  };

  return (
    <div className="max-w-3xl mx-auto py-4">
      {/* Back button */}
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Projects
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Create New Content Project</CardTitle>
          <CardDescription>
            Import a video via link or upload to generate transcriptions and cross-platform content packages.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Phase 1 Notice */}
          <div className="mb-6 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs text-indigo-200 leading-relaxed">
              <span className="font-semibold text-indigo-300">Phase 1 Foundation:</span> Video storage,
              cloud transcoding, and AI generation are reserved for future phases. Submitting this form
              navigates to the project view layout.
            </div>
          </div>

          <form onSubmit={handleCreate} className="space-y-6">
            <Input
              label="Project Title"
              placeholder="e.g. Masterclass on System Design & Microservices"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              helperText="Give your project a recognizable title"
              required
            />

            {/* Input Mode Selector */}
            <div>
              <label className="text-sm font-medium text-slate-200 block mb-2">
                Video Source
              </label>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setUploadMode('file')}
                  className={`p-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                    uploadMode === 'file'
                      ? 'border-indigo-500 bg-indigo-600/15 text-white'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>File Upload</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('url')}
                  className={`p-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                    uploadMode === 'url'
                      ? 'border-indigo-500 bg-indigo-600/15 text-white'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <LinkIcon className="w-4 h-4" />
                  <span>Video URL</span>
                </button>
              </div>

              {uploadMode === 'file' ? (
                <div className="border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-2xl p-8 text-center bg-slate-950/40 cursor-pointer transition-colors">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 mx-auto mb-3">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-medium text-white mb-1">
                    Click to select or drag and drop a video file
                  </p>
                  <p className="text-xs text-slate-500">
                    MP4, MOV, WEBM up to 2GB (Upload backend in Phase 2)
                  </p>
                </div>
              ) : (
                <Input
                  label="Public Video URL"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  leftIcon={<LinkIcon className="w-4 h-4" />}
                  helperText="Supports YouTube, Vimeo, Loom, or direct video file links"
                />
              )}
            </div>

            {/* Target Channels Selection */}
            <div>
              <label className="text-sm font-medium text-slate-200 block mb-2">
                Target Output Channels
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  'YouTube (SEO & Timestamps)',
                  'Instagram (Reels & Captions)',
                  'LinkedIn Posts',
                  'X / Twitter Threads',
                  'Full AI Transcript',
                  'Shorts Hook Clips',
                ].map((channel, i) => (
                  <label
                    key={i}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-300 cursor-pointer hover:border-slate-700"
                  >
                    <input
                      type="checkbox"
                      defaultChecked
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>{channel}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3">
              <Link to="/dashboard">
                <Button variant="outline" size="md">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                variant="primary"
                size="md"
                rightIcon={<Sparkles className="w-4 h-4" />}
              >
                Create Project
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
