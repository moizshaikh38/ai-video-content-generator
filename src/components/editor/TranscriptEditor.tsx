import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  Scissors,
  Trash2,
  Edit2,
  Check,
  X,
  Volume2,
  Copy,
  Play,
  ArrowDown,
  FileText,
  Loader2,
  Sparkles,
  Clock,
  MoreHorizontal,
  PanelRightClose,
  Download,
} from 'lucide-react';
import { TimedCaptionCue, CaptionPresetId, WordCustomStyle } from '../../types';
import { CAPTION_PRESETS } from '../../lib/captionPresets';
import { WordMicroToolbar } from './WordMicroToolbar';
import { SpeechCleanupTool, COMMON_FILLER_WORDS } from './SpeechCleanupTool';
import { detectFillerRanges, summarizeFillerRanges } from '../../lib/fillerDetection';
import {
  formatTranscriptTime,
  flattenTranscriptWords,
  getWordRangeSelection,
  validateClipSelection,
  FlattenedTranscriptWord,
} from '../../utils/transcriptUtils';

export interface TranscriptEditorProps {
  cues: TimedCaptionCue[];
  currentTime: number;
  onSeek: (time: number) => void;
  onUpdateCueText: (cueId: string, newText: string) => void;
  onDeleteCue: (cueId: string, cutMedia: boolean) => void;
  selectedCueId: string | null;
  onSelectCue: (cueId: string | null, wordIdx?: number | null) => void;
  onDeleteTimeRange?: (startSec: number, endSec: number) => void;
  onDeleteTimeRanges?: (ranges: Array<{ startSec: number; endSec: number }>) => void;
  onReplaceWordGlobally?: (targetWord: string, replacementWord: string) => void;
  onUpdateWordTiming?: (cueId: string, wordIndex: number, newStart: number, newEnd: number) => void;
  onPunchInZoom?: (wordStart: number) => void;
  isLoading?: boolean;
  onPlayRange?: (startSec: number, endSec: number) => void;
  onToggleCollapse?: () => void;
  onUpdateCuePreset?: (cueId: string, presetId?: CaptionPresetId) => void;
  onUpdateWordCustomStyle?: (cueId: string, wordIndex: number, style: WordCustomStyle) => void;
}

interface ActiveWordSelection {
  word: {
    word?: string;
    text?: string;
    start: number;
    end: number;
    confidence?: number;
  };
  cue: TimedCaptionCue;
  wordIdx: number;
  anchorRect: DOMRect;
}

export const TranscriptEditor: React.FC<TranscriptEditorProps> = ({
  cues,
  currentTime,
  onSeek,
  onUpdateCueText,
  onDeleteCue,
  selectedCueId,
  onSelectCue,
  onDeleteTimeRange,
  onDeleteTimeRanges,
  onReplaceWordGlobally,
  onUpdateWordTiming,
  onPunchInZoom,
  isLoading = false,
  onPlayRange,
  onToggleCollapse,
  onUpdateCuePreset,
  onUpdateWordCustomStyle,
}) => {
  // Search & Drawer State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCleanupOpen, setIsCleanupOpen] = useState(false);
  const [showTimings, setShowTimings] = useState(true);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);

  // Cue Editing & Modal State
  const [editingCueId, setEditingCueId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [inlineEditingWordKey, setInlineEditingWordKey] = useState<string | null>(null);
  const [inlineEditingWordText, setInlineEditingWordText] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pauseThreshold, setPauseThreshold] = useState<number>(0.5);
  const [activeWord, setActiveWord] = useState<ActiveWordSelection | null>(null);

  // Range Selection State
  const [selectedWordKeys, setSelectedWordKeys] = useState<Set<string>>(new Set());
  const [anchorWordIndex, setAnchorWordIndex] = useState<number | null>(null);
  const [isDraggingSelection, setIsDraggingSelection] = useState<boolean>(false);
  const [showRangeCutModal, setShowRangeCutModal] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);

  // Auto-scroll management
  const [isAutoScrollPaused, setIsAutoScrollPaused] = useState<boolean>(false);
  const listRef = useRef<HTMLDivElement>(null);
  const activeCueRef = useRef<HTMLDivElement>(null);
  const activeWordRef = useRef<HTMLSpanElement>(null);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Flatten words across all cues with contiguous global indices
  const allWords = useMemo(() => flattenTranscriptWords(cues), [cues]);

  // Detected pause and filler stats for subtle badges
  const detectedStats = useMemo(() => {
    let pauseCount = 0;
    for (let i = 0; i < cues.length; i++) {
      if (i > 0) {
        const prev = cues[i - 1];
        if (cues[i].start - prev.end >= pauseThreshold) pauseCount++;
      }
      const words = cues[i].words;
      if (Array.isArray(words)) {
        for (let j = 0; j < words.length - 1; j++) {
          if (words[j + 1].start - words[j].end >= pauseThreshold) pauseCount++;
        }
      }
    }

    let fillerCount = 0;
    for (const cue of cues) {
      const words = cue.text.toLowerCase().split(/\s+/);
      for (const w of words) {
        if (COMMON_FILLER_WORDS.has(w.replace(/[^a-z]/g, ''))) fillerCount++;
      }
    }

    return { pauseCount, fillerCount, totalIssues: pauseCount + fillerCount };
  }, [cues, pauseThreshold]);

  // Close overflow menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setIsOverflowOpen(false);
      }
    };
    if (isOverflowOpen) {
      document.addEventListener('pointerdown', handleClickOutside);
      return () => document.removeEventListener('pointerdown', handleClickOutside);
    }
  }, [isOverflowOpen]);

  // Filtered cues based on search query
  const filteredCues = useMemo(() => {
    if (!searchQuery.trim()) return cues;
    const query = searchQuery.toLowerCase();
    return cues.filter((c) => c.text.toLowerCase().includes(query));
  }, [cues, searchQuery]);

  // Flattened words for filtered view
  const filteredWords = useMemo(() => flattenTranscriptWords(filteredCues), [filteredCues]);

  // Selected words and range statistics
  const selectedWords = useMemo(() => {
    if (selectedWordKeys.size === 0) return [];
    return allWords.filter((w) => selectedWordKeys.has(w.key));
  }, [allWords, selectedWordKeys]);

  const selectionRange = useMemo(() => {
    if (selectedWords.length === 0) return null;
    const start = selectedWords[0].start;
    const end = selectedWords[selectedWords.length - 1].end;
    const validation = validateClipSelection(start, end);
    const text = selectedWords.map((w) => w.text).join(' ');
    return {
      start,
      end,
      duration: validation.duration,
      isValid: validation.isValid,
      message: validation.message,
      text,
      count: selectedWords.length,
    };
  }, [selectedWords]);

  // Clear selection helper
  const clearSelection = useCallback(() => {
    setSelectedWordKeys(new Set());
    setAnchorWordIndex(null);
    setShowRangeCutModal(false);
  }, []);

  // Window pointerup listener to finish mouse-drag selection
  useEffect(() => {
    const handleWindowPointerUp = () => {
      setIsDraggingSelection(false);
    };
    window.addEventListener('pointerup', handleWindowPointerUp);
    return () => window.removeEventListener('pointerup', handleWindowPointerUp);
  }, []);

  // Keyboard navigation & selection shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'Escape') {
        clearSelection();
        setActiveWord(null);
        setEditingCueId(null);
        setConfirmDeleteId(null);
        setIsOverflowOpen(false);
        return;
      }

      // Copy selected text (Cmd+C / Ctrl+C)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && selectionRange) {
        e.preventDefault();
        navigator.clipboard.writeText(selectionRange.text);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 2000);
        return;
      }

      // Arrow navigation
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && anchorWordIndex !== null) {
        e.preventDefault();
        const delta = e.key === 'ArrowRight' ? 1 : -1;
        const targetIdx = Math.max(0, Math.min(allWords.length - 1, anchorWordIndex + delta));

        if (e.shiftKey) {
          // Range expansion
          const { keys } = getWordRangeSelection(allWords, anchorWordIndex, targetIdx);
          setSelectedWordKeys(keys);
          setActiveWord(null);
        } else {
          // Move single word anchor and seek
          setAnchorWordIndex(targetIdx);
          const targetWord = allWords[targetIdx];
          if (targetWord) {
            setSelectedWordKeys(new Set([targetWord.key]));
            onSeek(targetWord.start);
            onSelectCue(targetWord.cueId, targetWord.wordIdx);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, selectionRange, anchorWordIndex, allWords, onSeek, onSelectCue]);

  // Smooth auto-scroll following playback
  useEffect(() => {
    if (isAutoScrollPaused || !listRef.current) return;

    const activeElement = activeWordRef.current || activeCueRef.current;
    if (activeElement) {
      isProgrammaticScrollRef.current = true;
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const timeout = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [currentTime, isAutoScrollPaused]);

  // Detect manual user scrolling to pause auto-scroll without fighting the user
  const handleUserScroll = useCallback(() => {
    if (!isProgrammaticScrollRef.current) {
      setIsAutoScrollPaused(true);
    }
  }, []);

  // Word Click & Drag Selection Handlers
  const handleWordPointerDown = (
    e: React.PointerEvent<HTMLSpanElement>,
    word: FlattenedTranscriptWord
  ) => {
    e.stopPropagation();

    if (e.shiftKey && anchorWordIndex !== null) {
      // Shift-click range selection
      const { keys } = getWordRangeSelection(allWords, anchorWordIndex, word.globalIndex);
      setSelectedWordKeys(keys);
      setActiveWord(null);
    } else {
      // Start drag selection
      setIsDraggingSelection(true);
      setAnchorWordIndex(word.globalIndex);
      setSelectedWordKeys(new Set([word.key]));
      onSeek(word.start);
      onSelectCue(word.cueId, word.wordIdx);
      setIsAutoScrollPaused(false);
    }
  };

  const handleWordPointerEnter = (word: FlattenedTranscriptWord) => {
    if (isDraggingSelection && anchorWordIndex !== null) {
      const { keys } = getWordRangeSelection(allWords, anchorWordIndex, word.globalIndex);
      setSelectedWordKeys(keys);
      if (keys.size > 1) {
        setActiveWord(null);
      }
    }
  };

  const handleWordClick = (
    e: React.MouseEvent<HTMLSpanElement>,
    cue: TimedCaptionCue,
    word: FlattenedTranscriptWord
  ) => {
    e.stopPropagation();
    if (selectedWordKeys.size <= 1) {
      const rect = e.currentTarget.getBoundingClientRect();
      setActiveWord({
        word,
        cue,
        wordIdx: word.wordIdx,
        anchorRect: rect,
      });
    }
  };

  // Copy selected words to clipboard
  const handleCopySelectedText = () => {
    if (!selectionRange) return;
    navigator.clipboard.writeText(selectionRange.text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  // Cut selected words: text only vs ripple cut media
  const handleExecuteRangeCut = (cutMedia: boolean) => {
    if (!selectionRange) return;

    if (cutMedia && onDeleteTimeRange) {
      onDeleteTimeRange(selectionRange.start, selectionRange.end);
    } else {
      // Group selected words by cue and delete tokens
      const wordsByCue = new Map<string, Set<number>>();
      for (const w of selectedWords) {
        if (!wordsByCue.has(w.cueId)) {
          wordsByCue.set(w.cueId, new Set());
        }
        wordsByCue.get(w.cueId)!.add(w.wordIdx);
      }

      for (const [cueId, wordIndices] of wordsByCue.entries()) {
        const cue = cues.find((c) => c.id === cueId);
        if (!cue) continue;

        if (Array.isArray(cue.words)) {
          const remainingWords = cue.words.filter((_, idx) => !wordIndices.has(idx));
          const updatedText = remainingWords.map((w) => w.text || (w as any).word).join(' ');
          onUpdateCueText(cue.id, updatedText || ' ');
        } else {
          const wordsToDelete = selectedWords.filter((w) => w.cueId === cueId).map((w) => w.text);
          let newText = cue.text;
          for (const wordText of wordsToDelete) {
            newText = newText.replace(new RegExp(`\\b${wordText}\\b`, 'i'), '').trim();
          }
          onUpdateCueText(cue.id, newText || ' ');
        }
      }
    }

    clearSelection();
  };

  // Play selection range
  const handlePlaySelectionRange = () => {
    if (!selectionRange) return;
    onSeek(selectionRange.start);
    if (onPlayRange) {
      onPlayRange(selectionRange.start, selectionRange.end);
    }
  };

  // Inline Cue Editing Handlers
  const handleStartEdit = (cue: TimedCaptionCue) => {
    setEditingCueId(cue.id);
    setEditingText(cue.text);
  };

  const handleSaveEdit = (cueId: string) => {
    if (editingText.trim()) {
      onUpdateCueText(cueId, editingText.trim());
    }
    setEditingCueId(null);
  };

  // Batch filler cleaner
  // Filler cleanup: when the ripple-cut hook is available, remove fillers
  // temporally (video + audio + captions together) after an explicit confirm
  // that reports exactly what will be cut. Falls back to text-only cleanup
  // for hosts without timeline-cut wiring.
  const handleCleanAllFillers = () => {
    if (onDeleteTimeRanges) {
      const words = cues.flatMap((cue) =>
        (Array.isArray(cue.words) ? cue.words : []).map((w: any) => ({
          text: String(w.text ?? w.word ?? ''),
          start: Number(w.start),
          end: Number(w.end),
        }))
      );
      if (words.length === 0) {
        window.alert('Filler removal needs word-level timings. Re-analyze captions first.');
        return;
      }
      const summary = summarizeFillerRanges(detectFillerRanges(words));
      if (summary.totalRanges === 0) {
        window.alert('No filler words detected.');
        return;
      }
      const ok = window.confirm(
        `Remove ${summary.totalRanges} filler moment(s), ~${summary.totalDurationSec.toFixed(1)}s total?\n` +
          `(${summary.tier1Ranges} disfluencies, ${summary.tier2Ranges} discourse markers)\n` +
          'This cuts video, audio, and captions together.'
      );
      if (!ok) return;
      onDeleteTimeRanges(summary.ranges.map((r) => ({ startSec: r.start, endSec: r.end })));
      return;
    }

    for (const cue of cues) {
      const words = cue.text.split(/\s+/);
      const cleaned = words
        .filter((w) => !COMMON_FILLER_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, '')))
        .join(' ');
      if (cleaned !== cue.text && cleaned.trim().length > 0) {
        onUpdateCueText(cue.id, cleaned);
      }
    }
  };

  // Export transcript as .srt
  const handleExportSrt = () => {
    const srtContent = cues
      .map((c, i) => {
        const formatSrtTime = (sec: number) => {
          const hrs = Math.floor(sec / 3600).toString().padStart(2, '0');
          const mins = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
          const secs = Math.floor(sec % 60).toString().padStart(2, '0');
          const millis = Math.floor((sec % 1) * 1000).toString().padStart(3, '0');
          return `${hrs}:${mins}:${secs},${millis}`;
        };
        return `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}\n`;
      })
      .join('\n');
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transcript.srt';
    a.click();
    URL.revokeObjectURL(url);
    setIsOverflowOpen(false);
  };

  // Copy entire transcript text
  const handleCopyFullTranscript = () => {
    const fullText = cues.map((c) => c.text).join('\n\n');
    navigator.clipboard.writeText(fullText);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
    setIsOverflowOpen(false);
  };

  // Micro-toolbar single-word actions
  const handleUpdateWordText = (newWord: string, applyToAll: boolean) => {
    if (!activeWord) return;
    const oldWordText = activeWord.word.word || activeWord.word.text || '';

    if (applyToAll && onReplaceWordGlobally) {
      onReplaceWordGlobally(oldWordText, newWord);
    } else {
      const cue = activeWord.cue;
      if (Array.isArray(cue.words)) {
        const updatedWords = [...cue.words];
        updatedWords[activeWord.wordIdx] = {
          ...updatedWords[activeWord.wordIdx],
          text: newWord,
          word: newWord,
        };
        const updatedText = updatedWords.map((w) => w.text || (w as any).word).join(' ');
        onUpdateCueText(cue.id, updatedText);
      } else {
        const regex = new RegExp(`\\b${oldWordText}\\b`, 'i');
        onUpdateCueText(cue.id, cue.text.replace(regex, newWord));
      }
    }
    setActiveWord(null);
  };

  const handleWordDoubleClick = (
    e: React.MouseEvent<HTMLSpanElement>,
    _cue: TimedCaptionCue,
    word: FlattenedTranscriptWord
  ) => {
    e.stopPropagation();
    setActiveWord(null);
    setInlineEditingWordKey(word.key);
    setInlineEditingWordText(word.text);
  };

  const handleSaveInlineWord = (cue: TimedCaptionCue, word: FlattenedTranscriptWord) => {
    const trimmed = inlineEditingWordText.trim();
    setInlineEditingWordKey(null);
    if (!trimmed || trimmed === word.text) return;

    if (Array.isArray(cue.words) && cue.words.length > 0) {
      const updatedWords = cue.words.map((w, idx) => {
        if (idx === word.wordIdx) {
          return {
            ...w,
            text: trimmed,
            word: trimmed,
          };
        }
        return w;
      });
      const updatedText = updatedWords.map((w) => w.text || (w as any).word).join(' ');
      onUpdateCueText(cue.id, updatedText);
    } else {
      const words = cue.text.split(/\s+/);
      if (words[word.wordIdx] !== undefined) {
        words[word.wordIdx] = trimmed;
      }
      onUpdateCueText(cue.id, words.join(' '));
    }
  };

  const handleDeleteWord = (cutMedia: boolean) => {
    if (!activeWord) return;
    const { word, cue, wordIdx } = activeWord;

    if (cutMedia && onDeleteTimeRange) {
      onDeleteTimeRange(word.start, word.end);
    } else {
      if (Array.isArray(cue.words)) {
        const updatedWords = cue.words.filter((_, idx) => idx !== wordIdx);
        const updatedText = updatedWords.map((w) => w.text || (w as any).word).join(' ');
        onUpdateCueText(cue.id, updatedText || ' ');
      } else {
        const oldWord = word.text || word.word || '';
        const regex = new RegExp(`\\b${oldWord}\\b`, 'i');
        onUpdateCueText(cue.id, cue.text.replace(regex, '').trim());
      }
    }
    setActiveWord(null);
  };

  const handleInsertEmoji = (emoji: string) => {
    if (!activeWord) return;
    const { word, cue, wordIdx } = activeWord;
    const currentText = word.text || word.word || '';
    const newWord = `${currentText} ${emoji}`;

    if (Array.isArray(cue.words)) {
      const updatedWords = [...cue.words];
      updatedWords[wordIdx] = {
        ...updatedWords[wordIdx],
        text: newWord,
        word: newWord,
      };
      const updatedText = updatedWords.map((w) => w.text || (w as any).word).join(' ');
      onUpdateCueText(cue.id, updatedText);
    }
    setActiveWord(null);
  };

  const handleApplyHighlightColor = (colorHex: string) => {
    if (!activeWord) return;
    const { word, cue, wordIdx } = activeWord;
    const currentText = word.text || word.word || '';
    const coloredText = `<c:${colorHex}>${currentText}</c>`;
    if (Array.isArray(cue.words)) {
      const updatedWords = [...cue.words];
      updatedWords[wordIdx] = {
        ...updatedWords[wordIdx],
        text: coloredText,
        word: coloredText,
      };
      const updatedText = updatedWords.map((w) => w.text || (w as any).word).join(' ');
      onUpdateCueText(cue.id, updatedText);
    }
    setActiveWord(null);
  };

  // Count occurrences of a word across all cues
  const getWordMatchCount = (targetWord: string): number => {
    const clean = targetWord.trim().toLowerCase();
    if (!clean) return 0;
    let count = 0;
    for (const cue of cues) {
      if (Array.isArray(cue.words)) {
        for (const w of cue.words) {
          const text = (w.text || (w as any).word || '').toLowerCase();
          if (text === clean) count++;
        }
      } else {
        const words = cue.text.toLowerCase().split(/\s+/);
        for (const w of words) {
          if (w.replace(/[^a-z]/g, '') === clean) count++;
        }
      }
    }
    return count;
  };

  return (
    <div
      className="flex flex-col h-full bg-vc-canvas text-neutral-200 select-none relative"
      onClick={clearSelection}
    >
      {/* 1. OPUS-STYLE ELEVATED HEADER WITH SPEECH CLEANUP & ACTIONS */}
      <div
        className="h-11 px-3 shrink-0 flex items-center justify-between border-b border-white/[0.06] bg-vc-surface1/95 backdrop-blur-md z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Speech Cleanup Action Pill */}
        <button
          onClick={() => setIsCleanupOpen((prev) => !prev)}
          className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all ${
            isCleanupOpen
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 border border-white/[0.08]'
          }`}
          title={`Speech Cleanup & Silence Cut (${detectedStats.totalIssues} detected)`}
        >
          <Sparkles className="w-3.5 h-3.5 text-white" />
          <span>Speech cleanup</span>
          {detectedStats.totalIssues > 0 && !isCleanupOpen && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-0.5" />
          )}
        </button>

        {/* Right: Search, Filter/Timings, Download, Overflow, Collapse */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Search Toggle */}
          <button
            onClick={() => {
              setIsSearchOpen((prev) => !prev);
              if (isSearchOpen && searchQuery) setSearchQuery('');
            }}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
              isSearchOpen || searchQuery
                ? 'bg-white/[0.1] text-white'
                : 'text-neutral-400 hover:text-white hover:bg-white/[0.06]'
            }`}
            title="Search spoken dialog"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* Timings Toggle */}
          <button
            onClick={() => setShowTimings((prev) => !prev)}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
              showTimings
                ? 'text-neutral-200 hover:text-white hover:bg-white/[0.06]'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.04]'
            }`}
            title={showTimings ? 'Hide timestamps' : 'Show timestamps'}
          >
            <Clock className="w-3.5 h-3.5" />
          </button>

          {/* Download Transcript */}
          <button
            onClick={handleExportSrt}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Download Transcript (.srt)"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Overflow Menu */}
          <div className="relative" ref={overflowRef}>
            <button
              onClick={() => setIsOverflowOpen((prev) => !prev)}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                isOverflowOpen
                  ? 'bg-white/[0.1] text-white'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.06]'
              }`}
              title="More options"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {isOverflowOpen && (
              <div className="absolute right-0 top-8 w-48 rounded-lg bg-vc-surface2 shadow-xl py-1 text-xs z-30 animate-fadeIn">
                <button
                  onClick={handleCleanAllFillers}
                  className="w-full px-3 py-1.5 text-left text-neutral-300 hover:text-white hover:bg-white/[0.06] flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Clean Filler Words ({detectedStats.fillerCount})</span>
                </button>
                <button
                  onClick={handleCopyFullTranscript}
                  className="w-full px-3 py-1.5 text-left text-neutral-300 hover:text-white hover:bg-white/[0.06] flex items-center gap-2"
                >
                  <Copy className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Copy Full Transcript</span>
                </button>
                <button
                  onClick={handleExportSrt}
                  className="w-full px-3 py-1.5 text-left text-neutral-300 hover:text-white hover:bg-white/[0.06] flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Export Subtitles (.srt)</span>
                </button>
              </div>
            )}
          </div>

          {/* Panel Collapse Action */}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="w-7 h-7 rounded-lg text-neutral-500 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors ml-0.5"
              title="Hide transcript dock"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. COLLAPSIBLE SEARCH BAR */}
      {isSearchOpen && (
        <div
          className="px-3 py-2 border-b border-white/[0.06] bg-vc-surface1/80 backdrop-blur-sm animate-fadeIn"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2.5 text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search words in transcript..."
              autoFocus
              className="w-full bg-vc-surface2 border border-white/[0.08] rounded-lg pl-8 pr-7 py-1 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-neutral-500 hover:text-neutral-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. COLLAPSIBLE SPEECH CLEANUP DRAWER */}
      <div onClick={(e) => e.stopPropagation()}>
        <SpeechCleanupTool
          isOpen={isCleanupOpen}
          onClose={() => setIsCleanupOpen(false)}
          cues={cues}
          threshold={pauseThreshold}
          onThresholdChange={setPauseThreshold}
          onCleanAllPauses={(pauses) => {
            if (onDeleteTimeRanges) {
              onDeleteTimeRanges(pauses);
            } else if (onDeleteTimeRange) {
              pauses.forEach((p) => onDeleteTimeRange(p.startSec, p.endSec));
            }
          }}
          onCleanSinglePause={(startSec, endSec) => {
            if (onDeleteTimeRange) onDeleteTimeRange(startSec, endSec);
          }}
          onCleanAllFillers={handleCleanAllFillers}
          onSeek={onSeek}
        />
      </div>

      {/* 4. REFINED EDITORIAL TRANSCRIPT LIST */}
      <div
        ref={listRef}
        onWheel={handleUserScroll}
        onTouchMove={handleUserScroll}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2 relative"
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-500 space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            <span className="text-xs font-medium text-neutral-400">Loading transcript words...</span>
          </div>
        ) : filteredCues.length === 0 ? (
          <div className="text-center py-16 text-neutral-500 text-xs space-y-2">
            {searchQuery ? (
              <>
                <Search className="w-7 h-7 mx-auto opacity-30 text-neutral-400" />
                <p className="text-neutral-300 font-medium">No words matching &quot;{searchQuery}&quot;</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-3 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white text-[11px] transition"
                >
                  Clear search
                </button>
              </>
            ) : (
              <>
                <FileText className="w-8 h-8 mx-auto opacity-30 text-neutral-400" />
                <p className="text-neutral-300 font-semibold text-sm">No Transcript Available</p>
                <p className="text-neutral-500 max-w-xs mx-auto text-[11px] leading-relaxed">
                  Transcribe your audio or load caption cues to view and edit spoken dialog.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Opus.pro Style Extend a Clip Button */}
            <div className="pb-1 select-none">
              <button
                type="button"
                onClick={() => {
                  if (cues.length > 0) onSeek(cues[cues.length - 1].end);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-neutral-300 hover:text-white text-xs font-medium transition shadow-sm"
              >
                <span className="text-sm leading-none">+</span>
                <span>Extend a clip</span>
              </button>
            </div>

            {filteredCues.map((cue, cueIdx) => {
            const isActiveCue = currentTime >= cue.start && currentTime <= cue.end;
            const isCueSelected = selectedCueId === cue.id;

            // Check silence gap between this cue and previous cue
            const prevCue = cueIdx > 0 ? filteredCues[cueIdx - 1] : null;
            const interCueGap = prevCue ? Number((cue.start - prevCue.end).toFixed(3)) : 0;

            // Words for this cue from the flattened array
            const cueWords = filteredWords.filter((w) => w.cueId === cue.id);

            return (
              <div key={cue.id} className="mv-cv-auto group/cue">
                {/* Subtle Inter-cue pause divider */}
                {interCueGap >= 0.35 && (
                  <div className="py-1 flex items-center justify-center gap-2 group/gap select-none">
                    <div className="h-px flex-1 bg-white/[0.04] group-hover/gap:bg-amber-500/20 transition-colors" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onDeleteTimeRange && prevCue) {
                          onDeleteTimeRange(prevCue.end, cue.start);
                        }
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.03] hover:bg-amber-500/15 text-neutral-500 hover:text-amber-300 border border-white/[0.06] hover:border-amber-500/30 text-[10px] font-mono transition-colors shadow-sm"
                      title={`Click to ripple cut ${interCueGap.toFixed(2)}s pause between sentences`}
                    >
                      <Scissors className="w-2.5 h-2.5 text-neutral-500 group-hover/gap:text-amber-400 transition-colors" />
                      <span>{interCueGap.toFixed(2)}s pause</span>
                    </button>
                    <div className="h-px flex-1 bg-white/[0.04] group-hover/gap:bg-amber-500/20 transition-colors" />
                  </div>
                )}

                {/* Editorial Sentence Block */}
                <div
                  ref={isActiveCue ? activeCueRef : null}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCue(cue.id);
                  }}
                  className={`relative pl-3 pr-2 py-2 rounded-lg transition-colors ${
                    isActiveCue
                      ? 'bg-white/[0.04]'
                      : isCueSelected
                      ? 'bg-white/[0.02]'
                      : 'hover:bg-white/[0.015]'
                  }`}
                >
                  {/* Subtle vertical indicator bar on the left */}
                  <div
                    className={`absolute left-0 top-2 bottom-2 w-[2px] rounded-full transition-all ${
                      isActiveCue
                        ? 'bg-violet-400'
                        : isCueSelected
                        ? 'bg-white/50'
                        : 'bg-transparent group-hover/cue:bg-white/10'
                    }`}
                  />

                  {/* Sentence Metadata Header (Speaker + Timings + Quiet Actions) */}
                  <div className="flex items-center justify-between text-[11px] mb-1.5 select-none">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-semibold tracking-wider uppercase text-neutral-400 bg-white/[0.04] px-1.5 py-0.5 rounded ">
                        Speaker 1
                      </span>
                      {showTimings && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSeek(cue.start);
                            setIsAutoScrollPaused(false);
                          }}
                          className="font-mono text-[10px] text-neutral-500 hover:text-neutral-300 flex items-center gap-1 transition-colors"
                          title="Click to seek to this sentence"
                        >
                          <Volume2 className="w-2.5 h-2.5 text-neutral-500" />
                          <span>
                            {formatTranscriptTime(cue.start)} – {formatTranscriptTime(cue.end)}
                          </span>
                        </button>
                      )}

                      {/* Line-by-Line Preset Override Selector */}
                      <div className="relative inline-block ml-1" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={cue.presetOverride || ''}
                          onChange={(e) => {
                            const val = e.target.value as CaptionPresetId | '';
                            onUpdateCuePreset?.(cue.id, val ? val : undefined);
                          }}
                          className={`bg-vc-surface1 border text-[9px] font-mono rounded px-1.5 py-0.5 cursor-pointer focus:outline-none transition-colors ${
                            cue.presetOverride
                              ? 'border-violet-500/50 text-violet-300 bg-violet-950/20'
                              : 'border-white/[0.08] text-neutral-500 hover:text-neutral-300'
                          }`}
                          title="Line-by-Line Preset Override"
                        >
                          <option value="">Preset: Inherit</option>
                          {Object.entries(CAPTION_PRESETS).map(([id, preset]) => (
                            <option key={id} value={id}>
                              {preset.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Quiet Hover-revealed Sentence Actions */}
                    <div
                      className="flex items-center gap-0.5 opacity-0 group-hover/cue:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          onSeek(cue.start);
                          if (onPlayRange) onPlayRange(cue.start, cue.end);
                        }}
                        className="p-1 text-neutral-500 hover:text-white rounded hover:bg-white/[0.06] transition-colors"
                        title="Play sentence"
                      >
                        <Play className="w-3 h-3 fill-current" />
                      </button>
                      <button
                        onClick={() => handleStartEdit(cue)}
                        className="p-1 text-neutral-500 hover:text-white rounded hover:bg-white/[0.06] transition-colors"
                        title="Edit Full Sentence"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(cue.id)}
                        className="p-1 text-neutral-500 hover:text-rose-400 rounded hover:bg-rose-500/10 transition-colors"
                        title="Delete Caption or Cut Video"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Editing Mode */}
                  {editingCueId === cue.id ? (
                    <div className="space-y-2 mt-1" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            handleSaveEdit(cue.id);
                          }
                          if (e.key === 'Escape') {
                            setEditingCueId(null);
                          }
                        }}
                        rows={2}
                        className="w-full bg-vc-surface1 border border-white/20 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-white/40 leading-relaxed resize-none"
                        autoFocus
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-neutral-500 font-mono">
                          Press ⌘+Enter to save, Esc to cancel
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setEditingCueId(null)}
                            className="px-2 py-1 rounded bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 text-xs transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit(cue.id)}
                            className="px-2.5 py-1 rounded bg-white text-black text-xs hover:bg-neutral-200 flex items-center gap-1 font-semibold transition"
                          >
                            <Check className="w-3 h-3 text-black" />
                            <span>Save</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Interactive Word Tokens with Restrained Highlights */
                    <div className="text-[13px] leading-[1.75] font-normal text-neutral-300 flex flex-wrap items-center">
                      {cueWords.length > 0 ? (
                        cueWords.map((w, wIdx) => {
                          const wordText = w.text;
                          const isWordPlaying = currentTime >= w.start && currentTime <= w.end;
                          const isWordSelected = selectedWordKeys.has(w.key);
                          const cleanWord = wordText.toLowerCase().replace(/[^a-z]/g, '');
                          const isFiller = COMMON_FILLER_WORDS.has(cleanWord);

                          // Check pause between this word and next word
                          const nextWord = cueWords[wIdx + 1];
                          const intraWordGap = nextWord
                            ? Number((nextWord.start - w.end).toFixed(3))
                            : 0;

                          // Inline editing input for single word
                          if (inlineEditingWordKey === w.key) {
                            return (
                              <input
                                key={`inline-edit-${w.key}`}
                                type="text"
                                value={inlineEditingWordText}
                                onChange={(e) => setInlineEditingWordText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveInlineWord(cue, w);
                                  if (e.key === 'Escape') setInlineEditingWordKey(null);
                                }}
                                onBlur={() => handleSaveInlineWord(cue, w)}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                                className="bg-vc-surface2 border border-white/60 text-white rounded px-1.5 py-0.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-white/90 inline-block min-w-[50px] shadow-sm mr-1 select-text"
                              />
                            );
                          }

                          // Keyword styling inspired by Opus.pro
                          const isKeywordGreen = /^(balance|universe|boon|humanity|brink|kingdom|destiny|promise|viral|growth|secret|money|power|success)$/i.test(cleanWord);
                          const isKeywordYellow = /^(god|brahma|demon|powerful|then|first|never|always|best|top|win)$/i.test(cleanWord);

                          let wordClass = 'hover:bg-white/[0.08] text-neutral-200';
                          if (isWordPlaying && isWordSelected) {
                            wordClass =
                              'bg-white/[0.16] text-white font-medium ring-1 ring-violet-400/80 border-b-2 border-white/70 shadow-sm';
                          } else if (isWordSelected) {
                            wordClass =
                              'bg-white/[0.12] text-white border-b-2 border-white/60 font-medium shadow-sm';
                          } else if (isWordPlaying) {
                            wordClass =
                              'bg-violet-500/25 text-white border-b border-violet-400 font-medium shadow-sm';
                          } else if (isFiller) {
                            wordClass =
                              'text-rose-300/90 underline decoration-rose-500/40 decoration-dotted underline-offset-4 hover:bg-rose-500/10';
                          } else if (isKeywordGreen) {
                            wordClass = 'text-emerald-400 font-medium hover:text-emerald-300';
                          } else if (isKeywordYellow) {
                            wordClass = 'text-amber-300 font-medium hover:text-amber-200';
                          }

                          const wordDur = Number((w.end - w.start).toFixed(2));

                          return (
                            <React.Fragment key={w.key}>
                              <span
                                ref={isWordPlaying ? activeWordRef : null}
                                onPointerDown={(e) => handleWordPointerDown(e, w)}
                                onPointerEnter={() => handleWordPointerEnter(w)}
                                onClick={(e) => handleWordClick(e, cue, w)}
                                onDoubleClick={(e) => handleWordDoubleClick(e, cue, w)}
                                className={`cursor-pointer px-1 py-0.5 rounded transition text-xs select-none mr-0.5 ${wordClass}`}
                                title={`"${wordText}" (${w.start.toFixed(2)}s – ${w.end.toFixed(2)}s) • Double-click to edit`}
                              >
                                {wordText}
                              </span>

                              {/* Duration Badge (Opus.pro style) */}
                              {showTimings && wordDur > 0.3 && (
                                <span className="inline-flex items-center text-[9px] font-mono px-1 py-0.2 rounded bg-white/[0.06] text-neutral-400 mx-0.5 select-none opacity-80 hover:opacity-100">
                                  {wordDur}s
                                </span>
                              )}

                              {/* Opus.pro Dotted Inline Pause Indicator */}
                              {intraWordGap >= 0.35 && nextWord && (
                                <span className="inline-flex items-center gap-1 mx-1 select-none">
                                  <span className="text-neutral-600 font-mono text-[9px] tracking-widest select-none">········</span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onDeleteTimeRange) {
                                        onDeleteTimeRange(w.end, nextWord.start);
                                      }
                                    }}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-amber-500/20 text-neutral-300 hover:text-amber-200 border border-white/[0.08] hover:border-amber-500/30 font-mono text-[9px] transition-colors cursor-pointer"
                                    title={`Click to ripple cut ${intraWordGap.toFixed(2)}s pause`}
                                  >
                                    <span className="opacity-70">✂️</span>
                                    <span>{intraWordGap.toFixed(2)}s</span>
                                  </button>
                                </span>
                              )}
                            </React.Fragment>
                          );
                        })
                      ) : (
                        <span
                          onClick={() => {
                            onSeek(cue.start);
                            setIsAutoScrollPaused(false);
                          }}
                          className="cursor-pointer hover:text-neutral-200 text-xs text-neutral-400"
                        >
                          {cue.text}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Confirm Delete / Cut Modal Strip */}
                  {confirmDeleteId === cue.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 p-2 rounded-lg bg-vc-surface2 border border-rose-500/30 flex items-center justify-between text-xs animate-fadeIn"
                    >
                      <span className="text-neutral-300 text-[11px]">Delete cue:</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            onDeleteCue(cue.id, false);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1 rounded bg-white/[0.06] text-neutral-300 hover:text-white text-[11px] transition"
                        >
                          Text Only
                        </button>
                        <button
                          onClick={() => {
                            onDeleteCue(cue.id, true);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1 rounded bg-rose-600 text-white hover:bg-rose-500 text-[11px] flex items-center gap-1 font-medium shadow-sm transition"
                        >
                          <Scissors className="w-3 h-3" />
                          <span>Ripple Cut</span>
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="p-1 text-neutral-500 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

        {/* 5. Quiet Floating Follow-Playhead Pill */}
        {isAutoScrollPaused && (
          <div className="sticky bottom-3 left-0 right-0 flex justify-center pointer-events-none z-20">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsAutoScrollPaused(false);
                const activeElement = activeWordRef.current || activeCueRef.current;
                if (activeElement) {
                  activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-vc-surface2/90 hover:bg-vc-surface3 text-neutral-200 hover:text-white text-[11px] font-medium shadow-lg border border-white/[0.12] backdrop-blur-md transition-all select-none group"
              title="Resume following playback"
            >
              <ArrowDown className="w-3 h-3 text-neutral-400 group-hover:text-white transition-colors" />
              <span>Follow Playhead</span>
              <span className="text-[10px] font-mono text-neutral-500">
                {formatTranscriptTime(currentTime)}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* 6. Clean Multi-Word Range Selection Action Bar */}
      {selectionRange && selectionRange.count >= 2 && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="p-2.5 border-t border-white/[0.08] bg-vc-surface1/95 backdrop-blur-md z-30 flex flex-col gap-2 select-none shadow-2xl"
        >
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white text-[12px]">
                {selectionRange.count} words • {selectionRange.duration}s
              </span>
              {selectionRange.isValid ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300 font-medium">
                  Valid Clip
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300 font-medium">
                  &lt; 0.5s
                </span>
              )}
            </div>

            <button
              onClick={clearSelection}
              className="p-1 rounded-lg text-neutral-400 hover:text-white transition-colors"
              title="Clear Selection (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePlaySelectionRange}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/[0.1] hover:bg-white/[0.16] text-white text-xs font-medium flex items-center justify-center gap-1 transition shadow-sm"
              title="Play selection from start to end"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Play Range</span>
            </button>

            <button
              onClick={handleCopySelectedText}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-200 text-xs font-medium flex items-center gap-1 transition border border-white/[0.06]"
              title="Copy selected text to clipboard (Cmd+C)"
            >
              {copyFeedback ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-300">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>

            <button
              onClick={() => setShowRangeCutModal(true)}
              className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-rose-200 border border-rose-500/30 text-xs font-medium flex items-center gap-1 transition"
              title="Cut or ripple delete selected range"
            >
              <Scissors className="w-3 h-3" />
              <span>Cut</span>
            </button>
          </div>

          {showRangeCutModal && (
            <div className="mt-1 p-2 rounded-lg bg-vc-surface2 flex flex-col gap-2 text-xs">
              <span className="text-neutral-300 text-[11px]">
                Cut {selectionRange.count} words ({selectionRange.duration}s):
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    handleExecuteRangeCut(false);
                    setShowRangeCutModal(false);
                  }}
                  className="flex-1 px-2 py-1 rounded bg-white/[0.06] text-neutral-300 hover:text-white text-[11px] transition"
                >
                  Text Only
                </button>
                <button
                  onClick={() => {
                    handleExecuteRangeCut(true);
                    setShowRangeCutModal(false);
                  }}
                  className="flex-1 px-2 py-1 rounded bg-rose-600 text-white hover:bg-rose-500 text-[11px] font-semibold flex items-center justify-center gap-1 shadow-sm transition"
                >
                  <Scissors className="w-3 h-3" />
                  <span>Ripple Cut Video</span>
                </button>
                <button
                  onClick={() => setShowRangeCutModal(false)}
                  className="p-1 text-neutral-500 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. Anchored Word Micro-Toolbar Popover (for Single Word Actions) */}
      {activeWord && selectedWordKeys.size <= 1 && (
        <WordMicroToolbar
          word={activeWord.word}
          cue={activeWord.cue}
          wordIdx={activeWord.wordIdx}
          anchorRect={activeWord.anchorRect}
          onClose={() => setActiveWord(null)}
          onUpdateWordText={handleUpdateWordText}
          onUpdateWordTiming={(newStart, newEnd) => {
            if (onUpdateWordTiming) {
              onUpdateWordTiming(activeWord.cue.id, activeWord.wordIdx, newStart, newEnd);
            }
          }}
          onApplyHighlightColor={handleApplyHighlightColor}
          onApplyWordCustomStyle={(style) => {
            if (onUpdateWordCustomStyle && activeWord) {
              onUpdateWordCustomStyle(activeWord.cue.id, activeWord.wordIdx, style);
            }
          }}
          onInsertEmoji={handleInsertEmoji}
          onPunchInZoom={(wordStart) => {
            if (onPunchInZoom) onPunchInZoom(wordStart);
          }}
          onDeleteWord={handleDeleteWord}
          onSeek={onSeek}
          matchCount={getWordMatchCount(activeWord.word.word || activeWord.word.text || '')}
        />
      )}
    </div>
  );
};
