import {usesAutomaticSourceClock} from '../../server/src/shared/automaticSourceClock';
import {previewShotOwnedElsewhere} from '../../server/src/shared/automaticPreviewFallback';
import {flushSync} from 'react-dom';
import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import type { ClockSnapshot } from '../lib/presentationSeek';
import { PauseSettle, type PauseSettleCtx } from '../lib/pauseSettle';
import { commitPresentationClock, presentSeek, presentFromSnapshot, consumePresentationEcho, isPausedOnPresentation, clearPresentationSeek, onNativeSeeking } from '../lib/presentationSeek';
import { timelineToSourceTime, sourceToTimelineTime, playbackSliceAt, mediaTimeAdvanced, type PlaybackSlice } from '../lib/editorPlaybackTime';

export interface UseEditorPlaybackOptions {
  sourceClockCandidate?: boolean;
  initialDuration?: number;
  initialTime?: number;
  fps?: number;
  sourceOffset?: number;
  sourceSlices?: PlaybackSlice[];
  onTimeUpdate?: (time: number) => void;
}

export interface UseEditorPlaybackReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Clock identity of this render (slices|offset|mode); writers of presentation seeks pass the identity their target was computed under. */
  presentationClock: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isMediaAdvancing: boolean;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isLooping: boolean;
  showSafeGuides: boolean;
  previewQuality: 'auto' | '360p' | '540p' | '720p';
  play: () => void;
  pause: () => void;
  pauseForEdit: () => number | null;
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
  sourceClockCandidate = false,
  initialDuration = 30,
  initialTime = 0,
  fps = 30,
  sourceOffset = 0,
  sourceSlices = [],
  onTimeUpdate,
}: UseEditorPlaybackOptions = {}): UseEditorPlaybackReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState<number>(initialTime);
  const [duration, setDurationState] = useState<number>(initialDuration);
  // Auxiliary layers wait for observed primary-media progress, not Play intent.
  const [isMediaAdvancing, setIsMediaAdvancing] = useState(false);
  const lastMediaTime = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRateState] = useState<number>(1.0);
  const [volume, setVolumeState] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(false);
  const [showSafeGuides, setShowSafeGuides] = useState<boolean>(true);
  const [previewQuality, setPreviewQuality] = useState<'auto' | '360p' | '540p' | '720p'>('auto');

  const durationRef = useRef(duration); durationRef.current = duration;
  const sourceClockCandidateRef=useRef(sourceClockCandidate);sourceClockCandidateRef.current=sourceClockCandidate;
  const timeRef = useRef(currentTime); timeRef.current = currentTime;
  const slicesRef = useRef(sourceSlices); slicesRef.current = sourceSlices;
  // Clock identity binds presentation ownership (checked by every reader, see presentationSeek.ts):
  // slice map, offset and the automatic-clock mode all change what a held target means.
  const clockKey = JSON.stringify(sourceSlices) + '|' + sourceOffset + '|' + (sourceClockCandidate ? 1 : 0);
  // Commit-owned snapshot: key and mapping inputs together, published in the same layout effect as the key.
  const committedClockRef = useRef<ClockSnapshot>({ key: clockKey, slices: sourceSlices, offset: Math.max(0, Number(sourceOffset || 0)), time: currentTime });
  useLayoutEffect(() => {
    committedClockRef.current = { key: clockKey, slices: sourceSlices, offset: Math.max(0, Number(sourceOffset || 0)), time: currentTime };
    if (videoRef.current) commitPresentationClock(videoRef.current, clockKey);
  });
  const rateRef = useRef(playbackRate); rateRef.current = playbackRate;
  const toSource = (t: number) => timelineToSourceTime(slicesRef.current, t, sourceOffsetRef.current);
  useEffect(() => { if (initialDuration > 0) setDurationState(initialDuration); }, [initialDuration]);
  const sourceOffsetRef = useRef<number>(sourceOffset);
  useEffect(() => {
    const prev = sourceOffsetRef.current;
    const next = Math.max(0, Number(sourceOffset || 0));
    sourceOffsetRef.current = next;
    // Re-align physical video time if offset changes while paused or if video is out of bounds
    if (videoRef.current && !isPlaying) {
      if (Math.abs(prev - next) > 0.05 || (next > 0 && videoRef.current.currentTime < next - 0.15)) {
        presentSeek(videoRef.current, toSource(currentTime), clockKey);
      }
    }
  }, [sourceOffset, currentTime, isPlaying, clockKey]);

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
        presentSeek(videoRef.current, toSource(0), clockKey);
        setCurrentTime(0);
      } else if (
        offset > 0 &&
        (videoRef.current.currentTime < offset - 0.15 ||
          videoRef.current.currentTime > offset + duration + 0.15)
      ) {
        presentSeek(videoRef.current, toSource(currentTime), clockKey);
      }
      videoRef.current.play().catch(() => {});
    }
    setIsPlaying(true);
  }, [duration, currentTime, clockKey]);

  // Play-to-pause: during play the React playhead lags the video, so the paused presentation sync would otherwise
  // seek the video back to the stale playhead (measured 100-200 ms) before correcting. Settle the playhead from the
  // video time in the same batch as the pause, the same final clock native timeupdate would publish.
  // Single owner of the play-to-pause receipt (lib/pauseSettle.ts): once per play run, committed mapping only.
  const pauseSettle = useRef(new PauseSettle()).current;
  const publishSettled = useCallback((v: HTMLVideoElement, settled: number | null) => {
    if (settled === null) return;
    timeRef.current = settled; lastMediaTime.current = v.currentTime;
    setCurrentTime(settled);
    onTimeUpdateRef.current?.(settled);
  }, []);
  const settleCtx = (): PauseSettleCtx => {
    const c = committedClockRef.current;
    return { key: c.key, slices: c.slices as PlaybackSlice[], offset: c.offset, hint: timeRef.current, duration: durationRef.current };
  };
  const settleApiRef = useRef({ pauseSettle, publishSettled, settleCtx }); settleApiRef.current = { pauseSettle, publishSettled, settleCtx };

  const pause = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      const wasPlaying = !v.paused;
      v.pause();
      publishSettled(v, pauseSettle.onToolbarPause(v, wasPlaying, settleCtx()));
    }
    setIsPlaying(false);
  }, [publishSettled, pauseSettle]);

  // Crop-specific pause receipt: publish the same final clock native timeupdate
  // will publish, rather than letting an editor snapshot race that later event.
  const pauseForEdit = useCallback((): number | null => {
    const v=videoRef.current;
    if(!v)return null;
    // Already paused on a presented frame: the transport playhead is the authority, not the presentation target.
    const heldPresentation=v.paused&&!v.seeking&&isPausedOnPresentation(v);
    v.pause();
    pauseSettle.endRun(); // this call publishes its own receipt below; a later native pause must not publish a second one
    setIsMediaAdvancing(false);setIsPlaying(false);
    if(heldPresentation){
      const held=timeRef.current;
      if(Number.isFinite(held)&&Number.isFinite(durationRef.current)&&durationRef.current>0){lastMediaTime.current=v.currentTime;onTimeUpdateRef.current?.(held);return held;}
    }
    if(v.seeking || !Number.isFinite(v.currentTime))return null;
    const raw=sourceToTimelineTime(slicesRef.current,v.currentTime,timeRef.current,sourceOffsetRef.current);
    if(!Number.isFinite(raw) || !Number.isFinite(durationRef.current) || durationRef.current<=0)return null;
    const finalTime=Math.max(0,Math.min(durationRef.current,Number(raw.toFixed(3))));
    timeRef.current=finalTime;lastMediaTime.current=v.currentTime;
    setCurrentTime(finalTime);
    onTimeUpdateRef.current?.(finalTime);
    return finalTime;
  }, [pauseSettle]);

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
      timeRef.current = clamped;
      setCurrentTime(clamped);
      if (videoRef.current) {
        presentSeek(videoRef.current, toSource(clamped), clockKey);
      }
      if (onTimeUpdateRef.current) {
        onTimeUpdateRef.current(clamped);
      }
    },
    [duration, clockKey]
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

    const handleLoadedMetadata = () => { presentFromSnapshot(v, committedClockRef.current, timelineToSourceTime); };

    const handleTimeUpdate = (frameTime?: number) => {
      // Echo of a paused presentation seek: the transport already owns the playhead.
      // Rate, lastMediaTime and the end-of-clip boundary still apply; only the playhead write-back is skipped.
      if (typeof frameTime !== 'number' && timeRef.current < durationRef.current - 0.03 && consumePresentationEcho(v)) {
        lastMediaTime.current = v.currentTime;
        const echoSlice = playbackSliceAt(slicesRef.current, timeRef.current);
        v.playbackRate = rateRef.current * (echoSlice?.speed?.speed || 1);
        return;
      }
      const mediaTime=typeof frameTime==='number'?frameTime:v.currentTime;
      const offset = sourceOffsetRef.current;
      if (!slicesRef.current.length && offset > 0 && v.currentTime < offset - 0.25) {
        v.currentTime = toSource(timeRef.current);
        return;
      }
      const rawTimeline = sourceToTimelineTime(slicesRef.current, mediaTime, timeRef.current, offset);
      const timelineTime = Math.max(0, Math.min(durationRef.current, Number(rawTimeline.toFixed(3))));
      if (mediaTimeAdvanced(lastMediaTime.current, v.currentTime, v.paused)) setIsMediaAdvancing(true);
      lastMediaTime.current = v.currentTime;
      timeRef.current = timelineTime;
      const slice = playbackSliceAt(slicesRef.current, timelineTime);
      v.playbackRate = rateRef.current * (slice?.speed?.speed || 1);
      setCurrentTime(timelineTime);
      if (onTimeUpdateRef.current) {
        onTimeUpdateRef.current(timelineTime);
      }
      // Natural clip boundary enforcement: stop or loop when timeline reaches duration
      if (timelineTime >= durationRef.current - 0.03) {
        if (isLooping) {
          v.currentTime = toSource(0);
          v.play().catch(() => {});
        } else {
          v.pause();
          setIsPlaying(false);
          setCurrentTime(durationRef.current);
        }
      }
    };

    const handleEnded = () => {
      if (isLooping) {
        v.currentTime = toSource(0);
        v.play().catch(() => {});
      } else {
        setIsPlaying(false);
      }
    };

    const handlePlay = () => { settleApiRef.current.pauseSettle.onPlay(v);lastMediaTime.current=v.currentTime;setIsMediaAdvancing(false);setIsPlaying(true); };
    const handlePlayClear = () => clearPresentationSeek(v);
    // Source lifecycle only (never registered for 'play': play arms the pause owner and must not be reset after it).
    const handleSourceReset = () => { clearPresentationSeek(v); settleApiRef.current.pauseSettle.reset(); };
    const handleSeeking = () => onNativeSeeking(v);
    const handlePause = () => { if(!v.paused)return; /* stale pause event after a resume: media is playing, change nothing */ const a=settleApiRef.current;a.publishSettled(v,a.pauseSettle.onNativePause(v,a.settleCtx()));setIsMediaAdvancing(false);setIsPlaying(false); };

    v.addEventListener('loadedmetadata', handleLoadedMetadata);
    const timeupdate=()=>handleTimeUpdate();
    let disposed=false,frame=0;
    const hasFrameCallback=typeof v.requestVideoFrameCallback==='function';
    const tick=(_now:number,meta?:VideoFrameCallbackMetadata)=>{
      if(disposed)return;
      if(!v.paused&&!v.seeking){
        const slice=playbackSliceAt(slicesRef.current,timeRef.current);
        if(hasFrameCallback&&usesAutomaticSourceClock(slice as any,sourceClockCandidateRef.current)&&!previewShotOwnedElsewhere(slice))flushSync(()=>handleTimeUpdate(meta?.mediaTime));
        else handleTimeUpdate(meta?.mediaTime);
      }
      frame=hasFrameCallback?v.requestVideoFrameCallback(tick):requestAnimationFrame(tick);
    };
    frame=hasFrameCallback?v.requestVideoFrameCallback(tick):requestAnimationFrame(tick);
    v.addEventListener('timeupdate', timeupdate);
    v.addEventListener('ended', handleEnded);
    v.addEventListener('play', handlePlay);
    v.addEventListener('play', handlePlayClear);
    v.addEventListener('seeking', handleSeeking);
    v.addEventListener('emptied', handleSourceReset);
    v.addEventListener('loadstart', handleSourceReset);
    v.addEventListener('pause', handlePause);

    return () => {
      v.removeEventListener('loadedmetadata', handleLoadedMetadata);
      disposed=true;
      if(hasFrameCallback)v.cancelVideoFrameCallback(frame);else cancelAnimationFrame(frame);
      v.removeEventListener('timeupdate', timeupdate);
      v.removeEventListener('ended', handleEnded);
      v.removeEventListener('play', handlePlay);
      v.removeEventListener('play', handlePlayClear);
      v.removeEventListener('seeking', handleSeeking);
      v.removeEventListener('emptied', handleSourceReset);
      v.removeEventListener('loadstart', handleSourceReset);
      v.removeEventListener('pause', handlePause);
    };
  }, [isLooping]);

  return {
    videoRef,
    presentationClock: clockKey,
    currentTime,
    duration,
    isPlaying, isMediaAdvancing,
    playbackRate,
    volume,
    isMuted,
    isLooping,
    showSafeGuides,
    previewQuality,
    play,
    pause,
    pauseForEdit,
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
