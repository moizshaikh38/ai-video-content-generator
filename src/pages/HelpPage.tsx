import React from 'react';
import { Link } from 'react-router-dom';
import { Scissors, Film, Captions, Palette, Send, Keyboard, ArrowUpRight } from 'lucide-react';

const GUIDES = [
  {
    icon: Scissors,
    title: 'Create clips from a long video',
    steps: [
      'Open New Project and paste a YouTube link, or upload a file.',
      'Pick a genre and clip length, then press Continue.',
      'Clips appear on the project page when processing finishes — usually a few minutes.',
    ],
    cta: { label: 'Start a project', to: '/projects/new' },
  },
  {
    icon: Film,
    title: 'Edit a clip in the timeline',
    steps: [
      'Open any clip and choose Edit to load it in the editor.',
      'Trim on the timeline, delete words in the transcript to cut them, and drag captions on the preview.',
      'Use Export in the top bar when the clip looks right.',
    ],
    cta: { label: 'Browse your clips', to: '/history?tab=clips' },
  },
  {
    icon: Captions,
    title: 'Style captions',
    steps: [
      'In the editor, open Captions in the left rail.',
      'Pick a preset, then fine-tune font, colour and highlight under Typography and Effects.',
      'Click a single word on the preview to restyle just that word.',
    ],
  },
  {
    icon: Palette,
    title: 'Set up your Brand Kit',
    steps: [
      'Add your logo, colours and fonts once in Brand.',
      'Apply the kit from the editor so every clip matches.',
    ],
    cta: { label: 'Open Brand', to: '/brand' },
  },
  {
    icon: Send,
    title: 'Publish and schedule',
    steps: [
      'Connect your social accounts in Settings.',
      'From a finished clip, choose Publish to post now or schedule it.',
      'Track every post in Publishing.',
    ],
    cta: { label: 'Open Publishing', to: '/publishing' },
  },
];

// Mirrors src/hooks/useEditorShortcuts.ts and the dashboard search shortcut.
const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl / ⌘ K', 'Search projects (dashboard) · command palette (editor)'],
  ['Space', 'Play / pause'],
  ['S', 'Split at the playhead'],
  ['J / L', 'Jump back / forward 1 second'],
  ['← / →', 'Step one frame'],
  ['Delete', 'Remove the selected item'],
  ['Ctrl / ⌘ S', 'Save'],
  ['Ctrl / ⌘ Z', 'Undo'],
  ['Ctrl / ⌘ Shift Z', 'Redo'],
];

export const HelpPage: React.FC = () => (
  <div className="mx-auto max-w-5xl space-y-10">
    <header>
      <h1 className="text-2xl font-semibold tracking-tight text-vc-text-primary">Help &amp; tutorials</h1>
      <p className="mt-1.5 text-sm text-vc-text-secondary">Short guides for the things people do most.</p>
    </header>

    <section className="grid gap-4 sm:grid-cols-2">
      {GUIDES.map((g) => {
        const Icon = g.icon;
        return (
          <article key={g.title} className="rounded-2xl bg-vc-surface1 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-violet-500/15 text-violet-300">
                <Icon className="size-4.5" />
              </span>
              <h2 className="text-[15px] font-semibold text-vc-text-primary">{g.title}</h2>
            </div>
            <ol className="mt-4 space-y-2 text-sm text-vc-text-secondary">
              {g.steps.map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span className="mt-px font-mono text-xs text-vc-text-muted tabular-nums">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            {g.cta && (
              <Link
                to={g.cta.to}
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-violet-300 hover:text-violet-200 transition-colors"
              >
                {g.cta.label}
                <ArrowUpRight className="size-3.5" />
              </Link>
            )}
          </article>
        );
      })}
    </section>

    <section>
      <div className="flex items-center gap-2 text-vc-text-primary">
        <Keyboard className="size-4 text-vc-text-secondary" />
        <h2 className="text-[15px] font-semibold">Keyboard shortcuts</h2>
      </div>
      <dl className="mt-3 divide-y divide-white/[0.06]">
        {SHORTCUTS.map(([keys, action]) => (
          <div key={keys} className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-vc-text-secondary">{action}</dt>
            <dd>
              <kbd className="rounded-lg bg-white/[0.06] px-2 py-1 font-mono text-xs text-vc-text-primary">{keys}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  </div>
);
