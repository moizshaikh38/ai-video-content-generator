import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  FileVideo,
  Film,
  UploadCloud,
  FileText,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Search,
} from 'lucide-react';
import { Button } from '../Button';
import { Input } from '../Input';
import { Textarea } from '../Textarea';
import {
  ContentPackSourceType,
  ContentPackGenerationMode,
  ContentPackTemplate,
  OutputPlatform,
  Project,
  ClipCandidate,
} from '../../types';
import { projectService } from '../../services/projectService';
import { clipService } from '../../services/clipService';
import { uploadVideoFile, validateVideoFile } from '../../services/storageService';
import { GenerateContentPackParams } from '../../services/contentPackService';

export interface SourcePickerProps {
  onGenerate: (params: GenerateContentPackParams) => Promise<void>;
  isGenerating: boolean;
}

const SUPPORTED_PLATFORMS: { id: OutputPlatform; label: string }[] = [
  { id: 'youtube', label: 'YouTube' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'x', label: 'X (Twitter)' },
];

const TEMPLATES: ContentPackTemplate[] = [
  'Creator',
  'Podcast',
  'Education',
  'Business',
  'Interview',
  'Gaming',
  'Vlog',
];

export const SourcePicker: React.FC<SourcePickerProps> = ({ onGenerate, isGenerating }) => {
  const [sourceType, setSourceType] = useState<ContentPackSourceType>('clip');

  // Generation options
  const [generationMode, setGenerationMode] = useState<ContentPackGenerationMode>('BALANCED');
  const [template, setTemplate] = useState<ContentPackTemplate>('Creator');
  const [selectedPlatforms, setSelectedPlatforms] = useState<OutputPlatform[]>([
    'youtube',
    'shorts',
    'instagram',
    'tiktok',
    'linkedin',
    'x',
  ]);
  const [userInstruction, setUserInstruction] = useState('');
  const [tone, setTone] = useState('');
  const [targetAudience, setTargetAudience] = useState('');

  // Source: Project & Clip states
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectSearch, setProjectSearch] = useState('');

  const [clips, setClips] = useState<ClipCandidate[]>([]);
  const [loadingClips, setLoadingClips] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string>('');
  const [selectedClipTitle, setSelectedClipTitle] = useState<string>('');

  // Source: Upload states
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedProjectId, setUploadedProjectId] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const activeUploadIdRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  // Source: Transcript states
  const [transcriptText, setTranscriptText] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');

  // Form error
  const [formError, setFormError] = useState<string | null>(null);

  // Component mount tracking & cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (uploadAbortControllerRef.current) {
        uploadAbortControllerRef.current.abort();
        uploadAbortControllerRef.current = null;
      }
    };
  }, []);

  // Load projects when needed
  useEffect(() => {
    if (sourceType === 'clip' || sourceType === 'project') {
      loadProjects();
    }
  }, [sourceType]);

  // Load clips when selectedProjectId changes
  useEffect(() => {
    if (sourceType === 'clip' && selectedProjectId) {
      loadClips(selectedProjectId);
    } else {
      setClips([]);
      setSelectedClipId('');
      setSelectedClipTitle('');
    }
  }, [selectedProjectId, sourceType]);

  const loadProjects = async () => {
    setLoadingProjects(true);
    setFormError(null);
    try {
      const list = await projectService.fetchProjects();
      setProjects(list || []);
      if (list && list.length > 0 && !selectedProjectId) {
        setSelectedProjectId(list[0].id);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to load projects.');
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadClips = async (projId: string) => {
    setLoadingClips(true);
    try {
      const candidates = await clipService.getClipCandidates(projId);
      setClips(candidates || []);
      if (candidates && candidates.length > 0) {
        setSelectedClipId(candidates[0].id);
        setSelectedClipTitle(candidates[0].title || '');
      } else {
        setSelectedClipId('');
        setSelectedClipTitle('');
      }
    } catch {
      setClips([]);
      setSelectedClipId('');
      setSelectedClipTitle('');
    } finally {
      setLoadingClips(false);
    }
  };

  // Platform selection helpers
  const handleTogglePlatform = (p: OutputPlatform) => {
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter((item) => item !== p));
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  const handleSelectAllPlatforms = () => {
    setSelectedPlatforms(SUPPORTED_PLATFORMS.map((p) => p.id));
  };

  // Upload handlers
  const handleFileSelect = (file: File) => {
    // Cancel any in-flight upload if user picks a different file
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      uploadAbortControllerRef.current = null;
    }
    setUploadError(null);
    const validation = validateVideoFile(file);
    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid video file.');
      return;
    }
    setSelectedFile(file);
    setUploadedProjectId('');
    setUploadProgress(0);
    setIsUploading(false);
  };

  const handleClearSelectedFile = () => {
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      uploadAbortControllerRef.current = null;
    }
    setSelectedFile(null);
    setUploadedProjectId('');
    setUploadProgress(0);
    setIsUploading(false);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCancelUpload = () => {
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      uploadAbortControllerRef.current = null;
    }
    setIsUploading(false);
    setUploadProgress(0);
    // Note: Do not clear uploadedProjectId here so a retry can reuse the project container if intended,
    // or the user can click 'Choose different file' to start completely fresh.
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const performUpload = async (): Promise<string> => {
    if (!selectedFile) throw new Error('Please select a file to upload.');

    // Cancel any previous in-flight upload controller
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    uploadAbortControllerRef.current = abortController;
    const currentUploadSeq = ++activeUploadIdRef.current;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    let targetProjectId = uploadedProjectId;

    try {
      // 1. If we don't have an existing project ID for this upload, create one immediately
      if (!targetProjectId) {
        const newProject = await projectService.createProjectAsync({
          title: selectedFile.name.replace(/\.[^/.]+$/, ''),
          sourceType: 'upload',
        });
        targetProjectId = newProject.id;
        // Immediately persist the created project ID to state and reference before starting upload
        // so that any subsequent retry reuses this exact project and never duplicates it
        if (isMountedRef.current) {
          setUploadedProjectId(newProject.id);
        }
      }

      if (abortController.signal.aborted) {
        throw new DOMException('Upload cancelled.', 'AbortError');
      }

      // 2. Upload file through existing storageService with abort signal
      await uploadVideoFile({
        file: selectedFile,
        projectId: targetProjectId,
        signal: abortController.signal,
        onProgress: (pct) => {
          // Guard: Only update state if still mounted and this is still the active upload attempt
          if (isMountedRef.current && activeUploadIdRef.current === currentUploadSeq && !abortController.signal.aborted) {
            setUploadProgress(pct);
          }
        },
      });

      if (isMountedRef.current && activeUploadIdRef.current === currentUploadSeq) {
        setUploadedProjectId(targetProjectId);
        setIsUploading(false);
      }
      return targetProjectId;
    } catch (err: any) {
      // Intentional aborts (user cancel or component unmount) should NOT show an error
      const isAbort = err?.name === 'AbortError' || err?.message?.includes('cancelled') || abortController.signal.aborted;
      if (isAbort) {
        if (isMountedRef.current && activeUploadIdRef.current === currentUploadSeq) {
          setIsUploading(false);
        }
        throw new DOMException('Upload cancelled.', 'AbortError');
      }

      const msg = err.message || 'File upload failed.';
      if (isMountedRef.current && activeUploadIdRef.current === currentUploadSeq) {
        setUploadError(msg);
        setIsUploading(false);
      }
      throw new Error(msg);
    } finally {
      if (uploadAbortControllerRef.current === abortController) {
        uploadAbortControllerRef.current = null;
      }
    }
  };

  // Submit generation request
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    try {
      const basePayload: GenerateContentPackParams = {
        mode: generationMode,
        template,
        platforms: selectedPlatforms,
        platform: selectedPlatforms.length === 1 ? selectedPlatforms[0] : undefined,
        userInstruction: userInstruction.trim() || undefined,
        tone: tone.trim() || undefined,
        targetAudience: targetAudience.trim() || undefined,
      };

      if (sourceType === 'clip') {
        if (!selectedProjectId) {
          setFormError('Please select a project containing clips.');
          return;
        }
        if (!selectedClipId) {
          setFormError('Please select a clip from the selected project.');
          return;
        }
        await onGenerate({
          ...basePayload,
          sourceType: 'clip',
          projectId: selectedProjectId,
          clipId: selectedClipId,
          sourceTitle: selectedClipTitle || undefined,
        });
      } else if (sourceType === 'project') {
        if (!selectedProjectId) {
          setFormError('Please select a project.');
          return;
        }
        const proj = projects.find((p) => p.id === selectedProjectId);
        await onGenerate({
          ...basePayload,
          sourceType: 'project',
          projectId: selectedProjectId,
          sourceTitle: proj?.title || 'Project Content Pack',
        });
      } else if (sourceType === 'upload') {
        let pId = uploadedProjectId;
        if (!pId) {
          pId = await performUpload();
        }
        await onGenerate({
          ...basePayload,
          sourceType: 'upload',
          projectId: pId,
          sourceTitle: selectedFile?.name.replace(/\.[^/.]+$/, '') || 'Uploaded Video',
        });
      } else if (sourceType === 'transcript') {
        if (!transcriptText.trim()) {
          setFormError('Please enter transcript or speech text.');
          return;
        }
        await onGenerate({
          ...basePayload,
          sourceType: 'transcript',
          transcriptText: transcriptText.trim(),
          sourceTitle: sourceTitle.trim() || 'Raw Transcript Content Pack',
        });
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to start generation.');
    }
  };

  const filteredProjects = projects.filter((p) =>
    p.title?.toLowerCase().includes(projectSearch.toLowerCase())
  );

  return (
    <div>
      {/* Top Source Tabs */}
      <div className="border-b border-border/60 bg-muted/20 p-2 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:overflow-x-auto no-scrollbar">
          {(
            [
              { type: 'clip' as const, label: 'Clip', icon: Film, desc: 'Single rendered clip' },
              { type: 'project' as const, label: 'Project', icon: FileVideo, desc: 'Full project video' },
              { type: 'upload' as const, label: 'Direct Upload', icon: UploadCloud, desc: 'Drop new video file' },
              { type: 'transcript' as const, label: 'Raw Transcript', icon: FileText, desc: 'Paste lecture/notes' },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = sourceType === tab.type;
            return (
              <button
                key={tab.type}
                type="button"
                onClick={() => {
                  setSourceType(tab.type);
                  setFormError(null);
                }}
                className={`sm:flex-1 sm:min-w-[140px] px-3.5 py-2.5 rounded-xl text-left transition-all border ${
                  active
                    ? 'bg-violet-600 text-white border-violet-500 shadow-md shadow-violet-900/30'
                    : 'bg-background/40 hover:bg-background/80 text-muted-foreground hover:text-foreground border-border/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`size-4 ${active ? 'text-white' : 'text-violet-400'}`} />
                  <span className="font-semibold text-xs tracking-tight">{tab.label}</span>
                </div>
                <p className={`text-[11px] mt-0.5 truncate ${active ? 'text-violet-100' : 'text-muted-foreground'}`}>
                  {tab.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
        {formError && (
          <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* 1. SOURCE SELECTION SECTION */}
        <div className="space-y-4">
          <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
              Step 1: Choose Source Asset
            </span>
            <span className="text-[11px] text-emerald-400 font-medium">Standard Free (0 Credits)</span>
          </div>

          {/* Source 1: CLIP */}
          {sourceType === 'clip' && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Project Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Select Project</label>
                  {loadingProjects ? (
                    <div className="h-10 rounded-xl bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin mr-2 text-violet-400" />
                      Loading projects...
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="p-3 rounded-xl bg-background/50 border border-border text-xs text-muted-foreground">
                      No video projects found. Create a project first or use Direct Upload.
                    </div>
                  ) : (
                    <select
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} {p.duration_seconds ? `(${Math.round(p.duration_seconds)}s)` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Clip Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Select Clip</label>
                  {loadingClips ? (
                    <div className="h-10 rounded-xl bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin mr-2 text-violet-400" />
                      Loading clips...
                    </div>
                  ) : clips.length === 0 ? (
                    <div className="p-3 rounded-xl bg-background/50 border border-border text-xs text-muted-foreground">
                      {selectedProjectId ? 'No clips generated for this project yet.' : 'Select a project first.'}
                    </div>
                  ) : (
                    <select
                      value={selectedClipId}
                      onChange={(e) => {
                        setSelectedClipId(e.target.value);
                        const c = clips.find((item) => item.id === e.target.value);
                        setSelectedClipTitle(c?.title || '');
                      }}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500"
                    >
                      {clips.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title || `Clip (${c.start_seconds}s - ${c.end_seconds}s)`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Source 2: PROJECT */}
          {sourceType === 'project' && (
            <div className="space-y-3">
              <label className="text-xs font-medium text-foreground">Select Video Project</label>
              {loadingProjects ? (
                <div className="h-12 rounded-xl bg-muted/40 flex items-center justify-center text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin mr-2 text-violet-400" />
                  Loading projects...
                </div>
              ) : projects.length === 0 ? (
                <div className="p-4 rounded-xl bg-background/50 border border-border text-xs text-muted-foreground">
                  No projects available. Upload a video first to get started.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="size-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                    <Input
                      placeholder="Search projects..."
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      className="text-xs pl-8 h-8 bg-background/60"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {filteredProjects.map((p) => {
                      const isSelected = selectedProjectId === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => setSelectedProjectId(p.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-violet-500/10 border-violet-500 text-foreground'
                              : 'bg-background/40 hover:bg-background/80 border-border/40 text-muted-foreground'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <FileVideo className={`size-4 shrink-0 ${isSelected ? 'text-violet-400' : 'text-muted-foreground'}`} />
                            <span className="text-xs font-medium truncate">{p.title}</span>
                          </div>
                          {p.duration_seconds && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                              {Math.round(p.duration_seconds)}s
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Source 3: UPLOAD */}
          {sourceType === 'upload' && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 rounded-2xl border-2 border-dashed cursor-pointer text-center transition-all ${
                  dragActive
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-border/60 hover:border-violet-500/50 bg-background/30'
                }`}
              >
                <UploadCloud className="size-8 mx-auto text-violet-400 mb-2" />
                <p className="text-xs font-semibold text-foreground">
                  {selectedFile ? selectedFile.name : 'Click to select or drag & drop video'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Supported formats: MP4, MOV, WEBM, AVI, MKV (up to 2 GiB)
                </p>
                {selectedFile && (
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <span className="text-[10px] text-emerald-400 font-medium">
                      {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB ready
                    </span>
                    {uploadedProjectId && !isUploading && (
                      <span className="text-[10px] text-violet-400 font-medium bg-violet-500/10 px-1.5 py-0.5 rounded">
                        Container ready
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearSelectedFile();
                      }}
                      className="text-[10px] text-muted-foreground hover:text-destructive underline ml-1"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              {isUploading && (
                <div className="space-y-1.5 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-violet-300 font-medium flex items-center gap-1.5">
                      <Loader2 className="size-3.5 animate-spin" /> Uploading source video...
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-violet-300 font-semibold">{uploadProgress}%</span>
                      <button
                        type="button"
                        onClick={handleCancelUpload}
                        className="text-[11px] text-rose-400 hover:text-rose-300 underline font-medium ml-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  <div className="w-full bg-violet-950/60 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-violet-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs">
                  {uploadError}
                </div>
              )}
            </div>
          )}

          {/* Source 4: TRANSCRIPT */}
          {sourceType === 'transcript' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Content Title (Optional)</label>
                <Input
                  placeholder="e.g. Keynote on Distributed Systems"
                  value={sourceTitle}
                  onChange={(e) => setSourceTitle(e.target.value)}
                  className="text-xs h-8 bg-background/60"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">
                  Paste Transcript, Spoken Script, or Speech Notes *
                </label>
                <Textarea
                  placeholder="Paste your source text here. Content Studio will ground titles, hooks, social copy, and hashtags in these exact claims..."
                  value={transcriptText}
                  onChange={(e) => setTranscriptText(e.target.value)}
                  rows={5}
                  className="text-xs bg-background/60"
                />
              </div>
            </div>
          )}
        </div>

        {/* 2. GENERATION CONFIGURATION SECTION */}
        <div className="space-y-4 pt-2 border-t border-border/40">
          <span className="text-xs font-bold tracking-wider uppercase text-muted-foreground">
            Step 2: Generation Options & Platforms
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Mode */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Generation Mode</label>
              <select
                value={generationMode}
                onChange={(e) => setGenerationMode(e.target.value as ContentPackGenerationMode)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500"
              >
                <option value="BALANCED">Balanced Pack (Recommended)</option>
                <option value="QUICK">Quick Pack (Lightweight)</option>
                <option value="FULL">Full Pack (Comprehensive)</option>
              </select>
            </div>

            {/* Template */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Template Tone</label>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value as ContentPackTemplate)}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-violet-500"
              >
                {TEMPLATES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Tone Override */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Voice / Tone (Optional)</label>
              <Input
                placeholder="e.g. Punchy, witty"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="text-xs h-9 bg-background/60"
              />
            </div>

            {/* Target Audience */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Audience (Optional)</label>
              <Input
                placeholder="e.g. Founders, students"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="text-xs h-9 bg-background/60"
              />
            </div>
          </div>

          {/* Platform Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">Target Platforms</label>
              <button
                type="button"
                onClick={handleSelectAllPlatforms}
                className="text-[11px] text-violet-400 hover:text-violet-300 font-medium"
              >
                Select All
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {SUPPORTED_PLATFORMS.map((p) => {
                const active = selectedPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleTogglePlatform(p.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium transition-all border flex items-center justify-between ${
                      active
                        ? 'bg-violet-600/15 border-violet-500/50 text-violet-300'
                        : 'bg-background/40 hover:bg-background/80 border-border/40 text-muted-foreground'
                    }`}
                  >
                    <span>{p.label}</span>
                    {active && <CheckCircle2 className="size-3 text-violet-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Instruction */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Custom Instructions (Optional)</label>
            <Input
              placeholder="e.g. Focus on technical audience, make titles under 60 chars, avoid emojis..."
              value={userInstruction}
              onChange={(e) => setUserInstruction(e.target.value)}
              className="text-xs h-9 bg-background/60"
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2 flex justify-end">
          <Button
            type="submit"
            variant="clay"
            disabled={isGenerating || isUploading}
            className="w-full sm:w-auto px-6 py-2.5 text-xs shadow-md shadow-violet-950/40"
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Crafting Content Pack...
              </>
            ) : (
              <>
                <Sparkles className="size-4 mr-2" />
                Generate Content Pack
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};
