import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseEditorPlaybackOptions {
  initialDuration?: number;
  fps?: number;
  sourceOffset?: number;
  onTimeUpdate?: (time: number) => void;
}

export interface UseEditorPlaybackReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isLooping: boolean;
  showSafeGuides: boolean;
  previewQuality: 'auto' | '360p' | '540p' | '720p';
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  stepFrames: (frames: number) => void;
  setDuration: (dur: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  toggleLoop: () => void;
  toggleSafeGuides: () => void;
  setPreviewQuality: (q: 'auto' | '360p' | '540p' | '720p') => void;
  formatTime: (seconds: number) => string;
}

export function useEditorPlayback({
  initialDuration = 30,
  fps = 30,
  sourceOffset = 0,
  onTimeUpdate,
}: UseEditorPlaybackOptions = {}): UseEditorPlaybackReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDurationState] = useState<number>(initialDuration);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRateState] = useState<number>(1.0);
  const [volume, setVolumeState] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [showSafeGuides, setShowSafeGuides] = useState<boolean>(true);
  const [previewQuality, setPreviewQuality] = useState<'auto' | '360p' | '540p' | '720p'>('auto');

  const sourceOffsetRef = useRef<number>(sourceOffset);
  useEffect(() => {
    const prev = sourceOffsetRef.current;
    const next = Math.max(0, Number(sourceOffset || 0));
    sourceOffsetRef.current = next;
    // Re-align physical video time if offset changes while paused or if video is out of bounds
    if (videoRef.current && !isPlaying) {
      if (Math.abs(prev - next) > 0.05 || (next > 0 && videoRef.current.currentTime < next - 0.15)) {
        videoRef.current.currentTime = next + currentTime;
      }
    }
  }, [sourceOffset, currentTime, isPlaying]);

  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  const setDuration = useCallback((dur: number) => {
    if (dur > 0) {
      setDurationState(dur);
    }
  }, []);

  const play = useCallback(() => {
    if (videoRef.current) {
      const offset = sourceOffsetRef.current;
      // If at end of timeline, loop back to start before playing
      if (currentTime >= duration - 0.05) {
        videoRef.current.currentTime = offset;
        setCurrentTime(0);
      } else if (
        offset > 0 &&
        (videoRef.current.currentTime < offset - 0.15 ||
          videoRef.current.currentTime > offset + duration + 0.15)
      ) {
        videoRef.current.currentTime = offset + currentTime;
      }
      videoRef.current.play().catch(() => {});
    }
    setIsPlaying(true);
  }, [duration, currentTime]);

  const pause = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const seek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(duration, Number(time.toFixed(3))));
      setCurrentTime(clamped);
      if (videoRef.current) {
        videoRef.current.currentTime = sourceOffsetRef.current + clamped;
      }
      if (onTimeUpdateRef.current) {
        onTimeUpdateRef.current(clamped);
      }
    },
    [duration]
  );

  const stepFrames = useCallback(
    (frames: number) => {
      const frameDuration = 1 / fps;
      seek(currentTime + frames * frameDuration);
    },
    [fps, seek, currentTime]
  );

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    if (videoRef.current) {
      videoRef.current.volume = clamped;
    }
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
      if (videoRef.current) videoRef.current.muted = false;
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (videoRef.current) {
        videoRef.current.muted = next;
      }
      return next;
    });
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const safeRate = Math.max(0.25, Math.min(2.0, rate));
    setPlaybackRateState(safeRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = safeRate;
    }
  }, []);

  const toggleLoop = useCallback(() => {
    setIsLooping((prev) => {
      const next = !prev;
      if (videoRef.current) {
        videoRef.current.loop = next;
      }
      return next;
    });
  }, []);

  const toggleSafeGuides = useCallback(() => {
    setShowSafeGuides((prev) => !prev);
  }, []);

  // Format time display helper (MM:SS.ss)
  const formatTime = useCallback((secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }, []);

  // Attach native video listeners for high accuracy clock
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const handleLoadedMetadata = () => {
      const offset = sourceOffsetRef.current;
      if (offset > 0 && v.currentTime < offset - 0.15) {
        v.currentTime = offset + currentTime;
      }
    };

    const handleTimeUpdate = () => {
      const offset = sourceOffsetRef.current;
      if (offset > 0 && v.currentTime < offset - 0.25) {
        v.currentTime = offset + currentTime;
        return;
      }
      const rawTimeline = v.currentTime - offset;
      const timelineTime = Math.max(0, Math.min(duration, Number(rawTimeline.toFixed(3))));
      setCurrentTime(timelineTime);
      if (onTimeUpdateRef.current) {
        onTimeUpdateRef.current(timelineTime);
      }
      // Natural clip boundary enforcement: stop or loop when timeline reaches duration
      if (v.currentTime >= offset + duration - 0.03) {
        if (isLooping) {
          v.currentTime = offset;
          v.play().catch(() => {});
        } else {
          v.pause();
          setIsPlaying(false);
          setCurrentTime(duration);
        }
      }
    };

    const handleEnded = () => {
      const offset = sourceOffsetRef.current;
      if (isLooping) {
        v.currentTime = offset;
        v.play().catch(() => {});
      } else {
        setIsPlaying(false);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    v.addEventListener('loadedmetadata', handleLoadedMetadata);
    v.addEventListener('timeupdate', handleTimeUpdate);
    v.addEventListener('ended', handleEnded);
    v.addEventListener('play', handlePlay);
    v.addEventListener('pause', handlePause);

    return () => {
      v.removeEventListener('loadedmetadata', handleLoadedMetadata);
      v.removeEventListener('timeupdate', handleTimeUpdate);
      v.removeEventListener('ended', handleEnded);
      v.removeEventListener('play', handlePlay);
      v.removeEventListener('pause', handlePause);
    };
  }, [isLooping]);

  return {
    videoRef,
    currentTime,
    duration,
    isPlaying,
    playbackRate,
    volume,
    isMuted,
    isLooping,
    showSafeGuides,
    previewQuality,
    play,
    pause,
    togglePlay,
    seek,
    stepFrames,
    setDuration,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleLoop,
    toggleSafeGuides,
    setPreviewQuality,
    formatTime,
  };
}
