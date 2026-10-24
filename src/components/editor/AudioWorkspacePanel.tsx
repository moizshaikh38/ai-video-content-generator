import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Music,
  Volume2,
  Upload,
  Play,
  Pause,
  Plus,
  Search,
  Check,
  FileAudio,
} from 'lucide-react';
import { EditorProject } from '../../types';

export interface AudioTrackItem {
  id: string;
  title: string;
  artist: string;
  duration: number; // in seconds
  genre: string;
  mood?: string;
  url: string;
  bpm?: number;
}

export interface SoundEffectItem {
  id: string;
  title: string;
  category: string;
  duration: number; // in seconds
  url: string;
}

interface AudioWorkspacePanelProps {
  project: EditorProject;
  currentTime: number;
  onAddAudioTrack: (name: string, url: string, duration: number) => void;
  onUpdateProject?: (updater: (prev: EditorProject) => EditorProject) => void;
}

// Curated royalty-free stock music catalog (Creative Commons / Open Source soundscapes)
export const STOCK_MUSIC_CATALOG: AudioTrackItem[] = [
  {
    id: 'music_cinematic_pulse',
    title: 'Cinematic Horizon Pulse',
    artist: 'Vireo Audio Lab',
    duration: 45,
    genre: 'Cinematic',
    mood: 'Dramatic',
    url: '/artifacts/vireo-launch/soundtrack.wav',
    bpm: 118,
  },
  {
    id: 'music_lofi_midnight',
    title: 'Midnight Focus Beat',
    artist: 'Lo-Fi Chill Collective',
    duration: 60,
    genre: 'Lo-fi',
    mood: 'Relaxing',
    url: '/artifacts/vireo-launch/soundtrack.wav',
    bpm: 84,
  },
  {
    id: 'music_ambient_drift',
    title: 'Atmospheric Cloud Drift',
    artist: 'Ethereal Sounds',
    duration: 35,
    genre: 'Ambient',
    mood: 'Inspirational',
    url: '/artifacts/vireo-launch/soundtrack.wav',
    bpm: 72,
  },
  {
    id: 'music_electronic_velocity',
    title: 'Neon Velocity Sprint',
    artist: 'Future Pulse',
    duration: 30,
    genre: 'Electronic',
    mood: 'Upbeat',
    url: '/artifacts/vireo-launch/soundtrack.wav',
    bpm: 128,
  },
  {
    id: 'music_hiphop_groove',
    title: 'Street Cypher Bounce',
    artist: 'Urban Beats Lab',
    duration: 42,
    genre: 'Hip-hop',
    mood: 'Upbeat',
    url: '/artifacts/vireo-launch/soundtrack.wav',
    bpm: 92,
  },
  {
    id: 'music_acoustic_sunrise',
    title: 'Morning Glow Strings',
    artist: 'Acoustic Stories',
    duration: 50,
    genre: 'Acoustic',
    mood: 'Inspirational',
    url: '/artifacts/vireo-launch/soundtrack.wav',
    bpm: 96,
  },
  {
    id: 'music_corporate_inspire',
    title: 'Next Gen Tech Summit',
    artist: 'Innovator Studio',
    duration: 40,
    genre: 'Corporate',
    mood: 'Inspirational',
    url: '/artifacts/vireo-launch/soundtrack.wav',
    bpm: 110,
  },
];

// Curated sound effects catalog
export const STOCK_SFX_CATALOG: SoundEffectItem[] = [
  { id: 'sfx_whoosh_fast', title: 'Fast Air Whoosh', category: 'Whoosh', duration: 0.8, url: 'synthetic_whoosh' },
  { id: 'sfx_pop_bubble', title: 'Clean Pop Highlight', category: 'Pop', duration: 0.4, url: 'synthetic_pop' },
  { id: 'sfx_ding_bell', title: 'Viral Notification Ding', category: 'Ding', duration: 1.2, url: 'synthetic_ding' },
  { id: 'sfx_click_snap', title: 'Snappy UI Click', category: 'Click', duration: 0.3, url: 'synthetic_click' },
  { id: 'sfx_swoosh_cinematic', title: 'Deep Sub Swoosh', category: 'Swoosh', duration: 1.5, url: 'synthetic_swoosh' },
  { id: 'sfx_impact_boom', title: 'Bass Hook Impact', category: 'Impact', duration: 1.8, url: 'synthetic_impact' },
  { id: 'sfx_camera_shutter', title: 'Camera Flash Shutter', category: 'Camera Shutter', duration: 0.6, url: 'synthetic_camera' },
  { id: 'sfx_transition_riser', title: 'Short Transition Riser', category: 'Transition', duration: 2.0, url: 'synthetic_riser' },
];

const MUSIC_GENRES = [
  'All',
  'Cinematic',
  'Ambient',
  'Electronic',
  'Hip-hop',
  'Lo-fi',
  'Acoustic',
  'Corporate',
];

const SFX_CATEGORIES = [
  'All',
  'Whoosh',
  'Pop',
  'Ding',
  'Click',
  'Swoosh',
  'Impact',
  'Camera Shutter',
  'Transition',
];

export const AudioWorkspacePanel: React.FC<AudioWorkspacePanelProps> = ({
  project: _project,
  currentTime: _currentTime,
  onAddAudioTrack,
  onUpdateProject: _onUpdateProject,
}) => {
  const [subSection, setSubSection] = useState<'music' | 'sfx' | 'upload'>('music');

  // Music state
  const [musicSearch, setMusicSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [durationFilter, setDurationFilter] = useState<'all' | 'short' | 'long'>('all');

  // SFX state
  const [sfxSearch, setSfxSearch] = useState('');
  const [selectedSfxCategory, setSelectedSfxCategory] = useState('All');

  // Upload state
  const [uploadedTracks, setUploadedTracks] = useState<AudioTrackItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio preview playback state
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Stop preview on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Web Audio tone generator for synthetic SFX previews
  const playSyntheticSfx = (type: string) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioContextRef.current || new AudioCtx();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type.includes('whoosh') || type.includes('swoosh')) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.3);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.7);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.start(now);
        osc.stop(now + 0.7);
      } else if (type.includes('ding')) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        osc.start(now);
        osc.stop(now + 1.0);
      } else if (type.includes('pop') || type.includes('click')) {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type.includes('impact')) {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.9);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        osc.start(now);
        osc.stop(now + 0.9);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch {
      // AudioContext fallback
    }
  };

  // Preview play/pause toggle
  const togglePreview = (id: string, url: string) => {
    if (previewingId === id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPreviewingId(null);
      setPreviewProgress(0);
      return;
    }

    if (url.startsWith('synthetic_')) {
      setPreviewingId(id);
      playSyntheticSfx(url);
      setTimeout(() => {
        setPreviewingId(null);
      }, 900);
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current && audioRef.current.duration) {
          setPreviewProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
        }
      };
      audioRef.current.onended = () => {
        setPreviewingId(null);
        setPreviewProgress(0);
      };
    }

    audioRef.current.src = url;
    audioRef.current.currentTime = 0;
    audioRef.current
      .play()
      .then(() => {
        setPreviewingId(id);
      })
      .catch(() => {
        setPreviewingId(null);
      });
  };

  // Add to project timeline
  const handleAddToProject = (title: string, url: string, duration: number, id: string) => {
    onAddAudioTrack(title, url, duration);
    setJustAddedId(id);
    setTimeout(() => setJustAddedId(null), 2500);
  };

  // Handle user audio upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      setUploadError('Please select a valid audio file (.mp3, .wav, .aac, .m4a)');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    const objectUrl = URL.createObjectURL(file);
    const tempAudio = new Audio(objectUrl);

    tempAudio.onloadedmetadata = () => {
      const dur = Math.round(tempAudio.duration) || 30;
      const newTrack: AudioTrackItem = {
        id: `upload_${Date.now()}`,
        title: file.name.replace(/\.[^/.]+$/, ''),
        artist: 'My Uploads',
        duration: dur,
        genre: 'User Audio',
        url: objectUrl,
      };

      setUploadedTracks((prev) => [newTrack, ...prev]);
      setIsUploading(false);
      handleAddToProject(newTrack.title, newTrack.url, newTrack.duration, newTrack.id);
    };

    tempAudio.onerror = () => {
      setUploadError('Failed to decode audio file duration');
      setIsUploading(false);
    };
  };

  // Filtered Music List
  const filteredMusic = useMemo(() => {
    return STOCK_MUSIC_CATALOG.filter((track) => {
      const matchesSearch =
        !musicSearch.trim() ||
        track.title.toLowerCase().includes(musicSearch.toLowerCase()) ||
        track.genre.toLowerCase().includes(musicSearch.toLowerCase()) ||
        track.artist.toLowerCase().includes(musicSearch.toLowerCase());

      const matchesGenre = selectedGenre === 'All' || track.genre.toLowerCase() === selectedGenre.toLowerCase();

      const matchesDuration =
        durationFilter === 'all' ||
        (durationFilter === 'short' && track.duration <= 35) ||
        (durationFilter === 'long' && track.duration > 35);

      return matchesSearch && matchesGenre && matchesDuration;
    });
  }, [musicSearch, selectedGenre, durationFilter]);

  // Filtered SFX List
  const filteredSfx = useMemo(() => {
    return STOCK_SFX_CATALOG.filter((sfx) => {
      const matchesSearch =
        !sfxSearch.trim() ||
        sfx.title.toLowerCase().includes(sfxSearch.toLowerCase()) ||
        sfx.category.toLowerCase().includes(sfxSearch.toLowerCase());

      const matchesCategory =
        selectedSfxCategory === 'All' ||
        sfx.category.toLowerCase() === selectedSfxCategory.toLowerCase();

      return matchesSearch && matchesCategory;
    });
  }, [sfxSearch, selectedSfxCategory]);

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex flex-col h-full bg-vc-surface1 text-vc-text-secondary text-xs select-none overflow-hidden animate-panelSlideIn">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.08] shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-white">
              <Music className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Audio Studio</h3>
              <p className="text-[10px] text-vc-text-secondary">Stock music, SFX & voice tracks</p>
            </div>
          </div>
        </div>

        {/* Music / SFX / Upload */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-vc-canvas ">
          <button
            type="button"
            onClick={() => setSubSection('music')}
            className={`py-1.5 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1.5 ${
              subSection === 'music'
                ? 'bg-white/[0.14] text-white shadow-sm'
                : 'text-vc-text-secondary hover:text-white'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            <span>Music</span>
          </button>

          <button
            type="button"
            onClick={() => setSubSection('sfx')}
            className={`py-1.5 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1.5 ${
              subSection === 'sfx'
                ? 'bg-white/[0.14] text-white shadow-sm'
                : 'text-vc-text-secondary hover:text-white'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>SFX</span>
          </button>

          <button
            type="button"
            onClick={() => setSubSection('upload')}
            className={`py-1.5 text-xs font-medium rounded-lg transition flex items-center justify-center gap-1.5 ${
              subSection === 'upload'
                ? 'bg-white/[0.14] text-white shadow-sm'
                : 'text-vc-text-secondary hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>
        </div>
      </div>

      {/* SUBSECTION 1: MUSIC */}
      {subSection === 'music' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search & Genre Chips */}
          <div className="p-3 border-b border-vc-border space-y-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-vc-text-muted" />
              <input
                type="text"
                value={musicSearch}
                onChange={(e) => setMusicSearch(e.target.value)}
                placeholder="Search music, genre, or mood..."
                className="w-full bg-vc-canvas border border-vc-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/30 transition"
              />
            </div>

            {/* Genre filter chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
              {MUSIC_GENRES.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => setSelectedGenre(genre)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition ${
                    selectedGenre === genre
                      ? 'bg-white text-black font-semibold'
                      : 'bg-white/[0.05] border border-vc-border text-vc-text-secondary hover:text-white'
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>

            {/* Duration filter pills */}
            <div className="flex items-center gap-1.5 pt-1">
              {(['all', 'short', 'long'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setDurationFilter(filter)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                    durationFilter === filter
                      ? 'bg-white/20 text-white font-semibold'
                      : 'text-vc-text-secondary hover:text-neutral-200'
                  }`}
                >
                  {filter === 'all' ? 'Any Length' : filter === 'short' ? '≤ 35s' : '> 35s'}
                </button>
              ))}
            </div>
          </div>

          {/* Music Track Cards List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredMusic.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-vc-text-muted text-xs">
                <Music className="w-8 h-8 mb-2 opacity-30 text-neutral-600" />
                <p className="font-medium text-vc-text-secondary">No tracks found</p>
                <p className="text-[11px] mt-1 text-neutral-600">Try adjusting your search or genre filter</p>
              </div>
            ) : (
              filteredMusic.map((track) => {
                const isPreviewing = previewingId === track.id;
                const isJustAdded = justAddedId === track.id;

                return (
                  <div
                    key={track.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isPreviewing
                        ? 'bg-white/[0.08] border-white/30 shadow-[0_4px_20px_rgba(0,0,0,0.5)] ring-1 ring-white/10'
                        : 'bg-vc-canvas/80 border-vc-border hover:border-white/20 hover:bg-vc-canvas'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Play/Preview Button */}
                      <button
                        type="button"
                        onClick={() => togglePreview(track.id, track.url)}
                        className={`w-9 h-9 rounded-full flex items-center justify-center transition shrink-0 ${
                          isPreviewing
                            ? 'bg-white text-black shadow-lg scale-105'
                            : 'bg-white/[0.1] text-white hover:bg-white/20 hover:scale-105'
                        }`}
                        title={isPreviewing ? 'Pause Preview' : 'Play Preview'}
                      >
                        {isPreviewing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
                      </button>

                      {/* Track Details */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-white text-xs truncate">{track.title}</h4>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-vc-text-secondary">
                          <span className="truncate">{track.artist}</span>
                          <span>•</span>
                          <span className="px-1.5 py-0.2 rounded bg-white/[0.06] text-vc-text-secondary">
                            {track.genre}
                          </span>
                          <span>•</span>
                          <span className="font-mono">{formatSeconds(track.duration)}</span>
                        </div>
                      </div>

                      {/* Add Button */}
                      <button
                        type="button"
                        onClick={() => handleAddToProject(track.title, track.url, track.duration, track.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 flex items-center gap-1 ${
                          isJustAdded
                            ? 'bg-emerald-500 text-white'
                            : 'bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] text-white hover:bg-vc-ai active:scale-95 shadow-sm'
                        }`}
                        title="Add to Timeline"
                      >
                        {isJustAdded ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Added</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Progress Bar when previewing */}
                    {isPreviewing && (
                      <div className="mt-2.5 pt-2 border-t border-vc-border">
                        <div className="w-full h-1 bg-white/[0.1] rounded-full overflow-hidden">
                          <div
                            style={{ width: `${previewProgress}%` }}
                            className="h-full bg-white transition-all duration-150"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUBSECTION 2: SOUND EFFECTS */}
      {subSection === 'sfx' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search & Category Chips */}
          <div className="p-3 border-b border-vc-border space-y-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-vc-text-muted" />
              <input
                type="text"
                value={sfxSearch}
                onChange={(e) => setSfxSearch(e.target.value)}
                placeholder="Search sound effects..."
                className="w-full bg-vc-canvas border border-vc-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/30 transition"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
              {SFX_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedSfxCategory(cat)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition ${
                    selectedSfxCategory === cat
                      ? 'bg-white text-black font-semibold'
                      : 'bg-white/[0.05] border border-vc-border text-vc-text-secondary hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* SFX List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredSfx.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-vc-text-muted text-xs">
                <Volume2 className="w-8 h-8 mb-2 opacity-30 text-neutral-600" />
                <p className="font-medium text-vc-text-secondary">No sound effects found</p>
              </div>
            ) : (
              filteredSfx.map((sfx) => {
                const isPreviewing = previewingId === sfx.id;
                const isJustAdded = justAddedId === sfx.id;

                return (
                  <div
                    key={sfx.id}
                    className="p-3 rounded-xl bg-vc-canvas/80 transition flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => togglePreview(sfx.id, sfx.url)}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition shrink-0 ${
                        isPreviewing
                          ? 'bg-white text-black shadow-lg scale-105'
                          : 'bg-white/[0.1] text-white hover:bg-white/20'
                      }`}
                      title="Preview SFX"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white text-xs truncate">{sfx.title}</h4>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-vc-text-secondary">
                        <span className="px-1.5 py-0.2 rounded bg-white/[0.06] text-vc-text-secondary">
                          {sfx.category}
                        </span>
                        <span>•</span>
                        <span className="font-mono">{sfx.duration.toFixed(1)}s</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddToProject(sfx.title, sfx.url, sfx.duration, sfx.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 flex items-center gap-1 ${
                        isJustAdded
                          ? 'bg-emerald-500 text-white'
                          : 'bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] text-white hover:bg-vc-ai active:scale-95'
                      }`}
                    >
                      {isJustAdded ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Added</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUBSECTION 3: UPLOAD */}
      {subSection === 'upload' && (
        <div className="flex-1 flex flex-col p-4 space-y-4 overflow-y-auto">
          {/* Drag & Drop Upload Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="p-6 rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 bg-vc-canvas/60 hover:bg-vc-canvas transition cursor-pointer flex flex-col items-center justify-center text-center group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-xl bg-white/[0.08] group-hover:bg-white/[0.14] border border-white/10 flex items-center justify-center text-white mb-3 transition group-hover:scale-105">
              <Upload className="w-5 h-5 text-neutral-200 group-hover:text-white" />
            </div>
            <h4 className="font-semibold text-white text-xs">Upload Audio File</h4>
            <p className="text-[11px] text-vc-text-secondary mt-1">MP3, WAV, AAC, M4A up to 50MB</p>
            <span className="mt-3 px-3 py-1.5 rounded-lg bg-white/[0.1] text-neutral-200 text-xs font-medium group-hover:bg-white group-hover:text-black transition">
              {isUploading ? 'Decoding audio...' : 'Browse Files'}
            </span>
          </div>

          {/* Upload Error Banner */}
          {uploadError && (
            <div className="p-2.5 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs">
              {uploadError}
            </div>
          )}

          {/* Uploaded Tracks List */}
          <div>
            <h4 className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider mb-2">
              Uploaded Audio ({uploadedTracks.length})
            </h4>

            {uploadedTracks.length === 0 ? (
              <div className="p-4 rounded-xl bg-vc-canvas/40 text-center text-vc-text-muted text-xs">
                No custom audio uploaded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {uploadedTracks.map((track) => (
                  <div
                    key={track.id}
                    className="p-3 rounded-xl bg-vc-canvas flex items-center justify-between gap-3"
                  >
                    <FileAudio className="w-4 h-4 text-vc-text-secondary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h5 className="font-medium text-white text-xs truncate">{track.title}</h5>
                      <span className="text-[10px] text-vc-text-muted font-mono">
                        {formatSeconds(track.duration)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddToProject(track.title, track.url, track.duration, track.id)}
                      className="px-2.5 py-1 rounded-lg bg-white text-black font-semibold text-xs hover:bg-neutral-200"
                    >
                      Insert
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
