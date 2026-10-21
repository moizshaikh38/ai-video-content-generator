/**
 * AI Tools registry — the single source of truth for the guided AI Tools panel.
 *
 * This module is intentionally dependency-free (no React, no icon imports) so it can be
 * unit-tested under the backend node:test runner, the same cross-tree pattern used by the
 * caption/waveform shared modules. The panel maps each tool id to its icon and preview visual.
 *
 * `status` drives what a tool is allowed to do:
 *   - 'ready'   → fully implemented; clicking opens the real workflow named by `target`.
 *   - 'limited' → partially supported; it still opens a real workflow, but `limitation`
 *                 explains what the shortcut cannot yet do on its own.
 *   - 'soon'    → not supported in this build; it NEVER applies anything. `missing` says what
 *                 is required. No Apply/target is exposed for these.
 */

export type AiToolStatus = 'ready' | 'limited' | 'soon';

export type AiToolGroupId = 'audio_cleanup' | 'broll_voice' | 'visual_enhance';

/** Where a tool click routes. Strings (not the editor's own unions) keep this module pure. */
export interface AiToolTarget {
  /** A sidebar tab id (e.g. 'transcript', 'audio', 'broll', 'elements', 'captions'). */
  tab?: string;
  /** An AI workspace id (e.g. 'producer', 'hook_lab', 'translate'). Opens the studio overlay. */
  aiTool?: string;
}

export interface AiToolDef {
  id: string;
  label: string;
  /** One concise line shown in the row and preview header. */
  description: string;
  status: AiToolStatus;
  /** Preview discriminator the panel uses to pick a lightweight CSS/SVG demo. */
  preview: string;
  /** What the user should expect to happen / see. */
  expectedResult: string;
  /** Action button label — only meaningful for 'ready' / 'limited'. */
  actionLabel?: string;
  /** Navigation intent — present for 'ready' / 'limited', absent for 'soon'. */
  target?: AiToolTarget;
  /** For 'limited': what the one-click shortcut cannot fully do yet. */
  limitation?: string;
  /** For 'soon': what capability is missing to make it real. */
  missing?: string;
}

export interface AiToolGroup {
  id: AiToolGroupId;
  label: string;
  tools: AiToolDef[];
}

export const AI_TOOL_GROUPS: AiToolGroup[] = [
  {
    id: 'audio_cleanup',
    label: 'Audio & Speech Cleanup',
    tools: [
      {
        id: 'remove_filler',
        label: 'Remove Filler Words',
        description: 'Strip “um”, “uh”, and other crutch words.',
        status: 'ready',
        preview: 'filler',
        expectedResult: 'Filler words are detected across the transcript and cut in one undo-able pass.',
        actionLabel: 'Open in Transcript',
        target: { tab: 'transcript' },
      },
      {
        id: 'remove_pauses',
        description: 'Tighten dead air and long silences.',
        label: 'Remove Pauses',
        status: 'ready',
        preview: 'pauses',
        expectedResult: 'Silences above your threshold are listed and ripple-cut together.',
        actionLabel: 'Open in Transcript',
        target: { tab: 'transcript' },
      },
      {
        id: 'remove_bad_takes',
        label: 'Remove Bad Takes',
        description: 'Flag repeated phrases and retried lines.',
        status: 'limited',
        preview: 'badtakes',
        expectedResult: 'Repeated phrases are surfaced in the transcript so you can cut the weaker take.',
        actionLabel: 'Open in Transcript',
        target: { tab: 'transcript' },
        limitation: 'Detects repeated phrases to review; it does not auto-pick which take to keep.',
      },
      {
        id: 'speech_enhancement',
        label: 'Speech Enhancement',
        description: 'Reduce noise and even out voice levels.',
        status: 'ready',
        preview: 'enhance',
        expectedResult: 'Preview a denoise + leveling filter chain before applying it to the mix.',
        actionLabel: 'Open Audio Studio',
        target: { tab: 'audio' },
      },
    ],
  },
  {
    id: 'broll_voice',
    label: 'B-Roll & Voice',
    tools: [
      {
        id: 'ai_video_broll',
        label: 'AI Video B-Roll',
        description: 'Auto-suggest video B-roll for key moments.',
        status: 'ready',
        preview: 'broll_video',
        expectedResult: 'Opportunities are detected and a B-roll plan is inserted on review.',
        actionLabel: 'Open B-Roll Studio',
        target: { tab: 'broll' },
      },
      {
        id: 'ai_image_broll',
        label: 'AI Image B-Roll',
        description: 'Drop in relevant images over dialogue.',
        status: 'ready',
        preview: 'broll_image',
        expectedResult: 'Image assets are placed as overlay cutaways from the same B-roll plan.',
        actionLabel: 'Open B-Roll Studio',
        target: { tab: 'broll' },
      },
      {
        id: 'stock_video_broll',
        label: 'Stock Video B-Roll',
        description: 'Search and insert muted stock clips.',
        status: 'ready',
        preview: 'broll_stock',
        expectedResult: 'Stock clips are added muted as cutaways you can trim on the timeline.',
        actionLabel: 'Open B-Roll Studio',
        target: { tab: 'broll' },
      },
      {
        id: 'video_dubbing',
        label: 'Video Dubbing',
        description: 'Translate and dub the spoken audio.',
        status: 'ready',
        preview: 'dub',
        expectedResult: 'Create a dub project, generate the voice, and inject the dubbed track.',
        actionLabel: 'Open Dub & Translate',
        target: { aiTool: 'translate' },
      },
      {
        id: 'voiceover_hook',
        label: 'Voiceover Hook',
        description: 'Generate a spoken hook intro.',
        status: 'limited',
        preview: 'voiceover',
        expectedResult: 'Preview an AI voiceover line in Audio Studio and add it to the timeline.',
        actionLabel: 'Open Audio Studio',
        target: { tab: 'audio' },
        limitation: 'Generates a voiceover preview; writing the hook copy for you is not automated.',
      },
    ],
  },
  {
    id: 'visual_enhance',
    label: 'Visual Enhancements',
    tools: [
      {
        id: 'auto_zoom',
        label: 'Auto Zoom',
        description: 'Add punch-in emphasis on peak moments.',
        status: 'ready',
        preview: 'zoom',
        expectedResult: 'Producer AI detects climax moments and proposes punch-in zoom operations.',
        actionLabel: 'Open Producer AI',
        target: { aiTool: 'producer' },
      },
      {
        id: 'ai_emoji',
        label: 'AI Emoji',
        description: 'Add animated emoji and stickers.',
        status: 'ready',
        preview: 'emoji',
        expectedResult: 'Browse emoji, GIF and sticker elements and drop them onto the canvas.',
        actionLabel: 'Open Elements',
        target: { tab: 'elements' },
      },
      {
        id: 'keyword_highlighter',
        label: 'AI Keyword Highlighter',
        description: 'Emphasize key words in captions.',
        status: 'limited',
        preview: 'keywords',
        expectedResult: 'Active-word highlight caption styles emphasize spoken words as they land.',
        actionLabel: 'Open Caption Styles',
        target: { tab: 'captions' },
        limitation: 'Uses highlight caption presets; choosing which keywords to color is manual.',
      },
      {
        id: 'auto_headline',
        label: 'Auto Headline',
        description: 'Generate a headline / hook title.',
        status: 'limited',
        preview: 'headline',
        expectedResult: 'Hook Lab proposes scored headline variations you can apply as a title.',
        actionLabel: 'Open Hook Lab',
        target: { aiTool: 'hook_lab' },
        limitation: 'Generates hook/title variations; it does not auto-place a headline overlay.',
      },
    ],
  },
];

/** Flat list of every tool, in group order. */
export const ALL_AI_TOOLS: AiToolDef[] = AI_TOOL_GROUPS.flatMap((g) => g.tools);

export function findAiTool(id: string): AiToolDef | undefined {
  return ALL_AI_TOOLS.find((t) => t.id === id);
}

/** A tool can be activated (routes somewhere) only when it is not 'soon'. */
export function isActivatable(tool: AiToolDef): boolean {
  return tool.status !== 'soon';
}
