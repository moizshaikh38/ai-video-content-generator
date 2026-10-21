import React from 'react';
import {
  Subtitles,
  Type,
  Sparkles,
  BookOpen,
  Globe,
  Layers,
  Wand2,
  FlaskConical,
  Image as ImageIcon,
  Film,
  CloudUpload,
  Music,
  Infinity as InfinityIcon,
  Flame,
  Brain,
  Sticker,
  Crop,
  RectangleHorizontal,
} from 'lucide-react';
import { SidebarTab, AiToolType } from '../../hooks/useEditorSelection';

interface EditorSidebarProps {
  activeTab: SidebarTab;
  onChangeTab: (tab: SidebarTab) => void;
  activeAiTool: AiToolType;
  onSelectAiTool: (tool: AiToolType) => void;
}

interface TabItem {
  id: SidebarTab;
  label: string;
  icon: any;
  isAi?: boolean;
}

/**
 * Signature Opus.pro B-Roll icon:
 * A sleek rounded square housing a bold capital 'B'
 */
export const OpusBRollIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <path d="M9 7.5h4a2.25 2.25 0 0 1 0 4.5H9V7.5z" />
    <path d="M9 12h4.5a2.25 2.25 0 0 1 0 4.5H9V12z" />
  </svg>
);

const PRIMARY_TABS: TabItem[] = [
  { id: 'captions', label: 'Captions', icon: Subtitles },
  { id: 'media', label: 'Library', icon: CloudUpload },
  { id: 'elements', label: 'Elements', icon: Sticker },
  { id: 'brand', label: 'Brand', icon: BookOpen },
  { id: 'broll', label: 'B-Roll', icon: Film },
  { id: 'layout', label: 'Motion', icon: InfinityIcon },
  { id: 'framing', label: 'Framing', icon: Crop },
  { id: 'aspect_ratio', label: 'Ratio', icon: RectangleHorizontal },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'translate', label: 'Translate', icon: Globe },
  { id: 'copilot', label: 'AI Copilot', icon: Brain, isAi: true },
  { id: 'ai_tools', label: 'AI Tools', icon: Sparkles, isAi: true },
];

export const AI_TOOLS_LIST: { id: AiToolType; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { id: 'copilot', label: 'AI Copilot', icon: Brain, description: 'Natural language edits, hook improvements, pause cuts' },
  { id: 'producer', label: 'Producer AI', icon: Sparkles, description: 'Auto-detect punch-in zooms, b-roll, and hooks' },
  { id: 'hook_lab', label: 'Hook Lab', icon: Flame, description: 'AI viral hook variations with scoring' },
  { id: 'thumbnail_lab', label: 'Thumbnail Lab', icon: ImageIcon, description: 'Generate high-CTR video thumbnail covers' },
  { id: 'ab_studio', label: 'A/B Studio', icon: FlaskConical, description: 'Test title, thumbnail, and caption variations' },
  { id: 'translate', label: 'Dub & Translate', icon: Globe, description: 'Translate captions and dub spoken audio' },
  { id: 'content_pack', label: 'Content Pack', icon: Layers, description: 'Generate multi-platform social kits & carousels' },
  { id: 'autopilot', label: 'Autopilot', icon: Wand2, description: 'Automated clipping and publishing schedule' },
];

export const EditorSidebar: React.FC<EditorSidebarProps> = ({
  activeTab,
  onChangeTab,
  activeAiTool,
  onSelectAiTool: _onSelectAiTool,
}) => {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = React.useState(false);
  const [canScrollDown, setCanScrollDown] = React.useState(false);

  const checkScrollability = React.useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    setCanScrollUp(scrollTop > 4);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 4);
  }, []);

  React.useEffect(() => {
    checkScrollability();
    const el = scrollContainerRef.current;
    if (!el) return;

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        checkScrollability();
      });
      resizeObserver.observe(el);
    }

    window.addEventListener('resize', checkScrollability);
    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', checkScrollability);
    };
  }, [checkScrollability, activeTab]);

  // Ensure active tab is visible when switched
  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const activeButton = el.querySelector<HTMLButtonElement>('[data-active="true"]');
    if (activeButton) {
      activeButton.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeTab]);

  return (
    <aside className="w-[68px] h-full max-h-full bg-[#090B10] border-r border-white/[0.08] flex flex-col items-center select-none z-20 shrink-0 relative overflow-hidden">
      {/* Top scroll fade effect */}
      <div
        className={`pointer-events-none absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-[#07080D] via-[#07080D]/90 to-transparent z-10 transition-opacity duration-200 ${
          canScrollUp ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />

      {/* Main vertical scrollable rail */}
      <div
        ref={scrollContainerRef}
        onScroll={checkScrollability}
        className="flex-1 w-full min-h-0 overflow-y-auto overflow-x-hidden scrollbar-none no-scrollbar overscroll-contain py-2 px-1 flex flex-col items-center gap-1.5 scroll-smooth"
      >
        {PRIMARY_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const isAi = tab.id === 'ai_tools' || tab.id === 'copilot';
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              data-active={isActive ? 'true' : 'false'}
              className={`group relative flex flex-col items-center justify-center w-[50px] h-[50px] rounded-xl transition-all duration-150 shrink-0 ${
                isActive
                  ? isAi
                    ? 'bg-violet-500/20 text-violet-200 shadow-[0_2px_12px_rgba(139,92,246,0.2)] ring-1 ring-violet-500/40'
                    : 'bg-white/[0.12] text-white shadow-sm ring-1 ring-white/10'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
              }`}
              title={tab.label}
            >
              {isActive && (
                <span
                  className={`absolute left-0 w-0.5 h-5 rounded-r ${
                    isAi ? 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]' : 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]'
                  }`}
                />
              )}
              {tab.id === 'broll' ? (
                <OpusBRollIcon
                  className={`w-5 h-5 transition-transform group-hover:scale-105 ${
                    isActive ? 'text-white' : 'text-neutral-400 group-hover:text-white'
                  }`}
                />
              ) : (
                <Icon
                  className={`w-5 h-5 transition-transform group-hover:scale-105 ${
                    isActive ? (isAi ? 'text-violet-300' : 'text-white') : 'text-neutral-400 group-hover:text-white'
                  }`}
                  strokeWidth={1.8}
                />
              )}
              <span
                className={`text-[10px] mt-1 font-medium tracking-tight truncate max-w-full leading-none ${
                  isActive ? (isAi ? 'text-violet-200' : 'text-white') : 'text-neutral-400 group-hover:text-neutral-200'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bottom scroll fade effect */}
      <div
        className={`pointer-events-none absolute ${activeTab === 'ai_tools' ? 'bottom-9' : 'bottom-0'} left-0 right-0 h-6 bg-gradient-to-t from-[#07080D] via-[#07080D]/90 to-transparent z-10 transition-opacity duration-200 ${
          canScrollDown ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      />

      {/* If AI tools is selected, display pinned active AI tool badge */}
      {activeTab === 'ai_tools' && (
        <div className="shrink-0 w-full px-1.5 pb-2 pt-1.5 border-t border-white/[0.06] bg-[#07080D] text-center z-20">
          <div className="text-[9px] font-mono uppercase tracking-wider text-violet-400/90 bg-violet-950/40 border border-violet-800/30 py-1 rounded truncate px-0.5 shadow-sm">
            {activeAiTool.replace('_', ' ')}
          </div>
        </div>
      )}
    </aside>
  );
};


