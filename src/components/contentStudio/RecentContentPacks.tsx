import React, { useState } from 'react';
import {
  Layers,
  Clock,
  ArrowRight,
  RefreshCw,
  Film,
  FileVideo,
  UploadCloud,
  FileText,
  AlertCircle,
  FileCheck,
  Download,
  CheckSquare,
  Square,
  ChevronDown,
} from 'lucide-react';
import { ContentPack, ContentPackSourceType } from '../../types';
import { Button } from '../Button';

export interface RecentContentPacksProps {
  packs: ContentPack[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectPack: (pack: ContentPack) => void;
  activePackId?: string;
  selectedPackIds?: Set<string>;
  onToggleSelectPack?: (packId: string) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onBatchExport?: (format: 'json' | 'markdown' | 'csv') => void;
  isBatchExporting?: boolean;
}

export const RecentContentPacks: React.FC<RecentContentPacksProps> = ({
  packs,
  isLoading,
  error,
  onRefresh,
  onSelectPack,
  activePackId,
  selectedPackIds = new Set<string>(),
  onToggleSelectPack,
  onSelectAll,
  onClearSelection,
  onBatchExport,
  isBatchExporting = false,
}) => {
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  const getSourceIcon = (sourceType?: ContentPackSourceType) => {
    switch (sourceType) {
      case 'project':
        return <FileVideo className="size-3.5 text-blue-400" />;
      case 'upload':
        return <UploadCloud className="size-3.5 text-amber-400" />;
      case 'transcript':
        return <FileText className="size-3.5 text-emerald-400" />;
      case 'clip':
      default:
        return <Film className="size-3.5 text-violet-400" />;
    }
  };

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const hasPacks = packs.length > 0;
  const selectedCount = selectedPackIds.size;
  const isAllSelected = hasPacks && selectedCount === packs.length;

  return (
    <div className="bg-card/60 border border-border/70 rounded-2xl shadow-xl overflow-hidden backdrop-blur-md">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <Layers className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Recent Content Packs</h3>
            <p className="text-[11px] text-muted-foreground">
              {hasPacks ? `${packs.length} packages available` : 'Saved packages across all sources'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Batch Selection Controls */}
          {hasPacks && onSelectAll && onClearSelection && (
            <div className="flex items-center gap-1.5 bg-background/50 border border-border/50 rounded-xl px-2 py-1">
              <button
                type="button"
                onClick={isAllSelected ? onClearSelection : onSelectAll}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-lg"
              >
                {isAllSelected ? (
                  <CheckSquare className="size-3.5 text-violet-400" />
                ) : (
                  <Square className="size-3.5 text-muted-foreground" />
                )}
                <span>{isAllSelected ? 'Deselect All' : 'Select All'}</span>
              </button>

              {selectedCount > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  {selectedCount} selected
                </span>
              )}
            </div>
          )}

          {/* Batch Export Button */}
          {selectedCount > 0 && onBatchExport && (
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                disabled={isBatchExporting}
                className="h-8 px-2.5 text-xs border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
              >
                <Download className={`size-3.5 mr-1.5 ${isBatchExporting ? 'animate-bounce' : ''}`} />
                <span>Export Batch ({selectedCount})</span>
                <ChevronDown className="size-3 ml-1 opacity-70" />
              </Button>

              {exportDropdownOpen && (
                <div className="absolute right-0 mt-1 w-44 rounded-xl bg-popover/95 border border-border shadow-xl py-1 z-50 text-xs backdrop-blur-md">
                  <button
                    onClick={() => {
                      setExportDropdownOpen(false);
                      onBatchExport('json');
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-violet-500/10 hover:text-violet-300 transition-colors flex items-center justify-between"
                  >
                    <span>JSON Bundle</span>
                    <span className="text-[10px] text-muted-foreground font-mono">.json</span>
                  </button>
                  <button
                    onClick={() => {
                      setExportDropdownOpen(false);
                      onBatchExport('markdown');
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-violet-500/10 hover:text-violet-300 transition-colors flex items-center justify-between"
                  >
                    <span>Markdown Doc</span>
                    <span className="text-[10px] text-muted-foreground font-mono">.md</span>
                  </button>
                  <button
                    onClick={() => {
                      setExportDropdownOpen(false);
                      onBatchExport('csv');
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-violet-500/10 hover:text-violet-300 transition-colors flex items-center justify-between"
                  >
                    <span>CSV Spreadsheet</span>
                    <span className="text-[10px] text-muted-foreground font-mono">.csv</span>
                  </button>
                </div>
              )}
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-5">
        {isLoading ? (
          <div className="py-12 text-center space-y-2">
            <RefreshCw className="size-6 animate-spin mx-auto text-violet-400" />
            <p className="text-xs text-muted-foreground">Loading recent Content Packs...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center space-y-3">
            <AlertCircle className="size-6 mx-auto text-destructive" />
            <p className="text-xs text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={onRefresh} className="text-xs">
              Retry
            </Button>
          </div>
        ) : packs.length === 0 ? (
          <div className="py-12 text-center space-y-3 max-w-sm mx-auto">
            <div className="size-12 rounded-2xl bg-muted/40 border border-border/60 mx-auto flex items-center justify-center text-muted-foreground">
              <FileCheck className="size-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">No Content Packs Generated Yet</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Generate your first multi-platform publishing package from a clip, project, upload, or transcript above.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {packs.map((p) => {
              const isSelected = activePackId === p.id;
              const isChecked = selectedPackIds.has(p.id);
              const title = p.source?.transcript_source || (p as any).title || 'Content Pack';
              const sType = p.source?.source_type || (p as any).source_type || 'clip';

              return (
                <div
                  key={p.id}
                  onClick={() => onSelectPack(p)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between space-y-3 group ${
                    isSelected
                      ? 'bg-violet-600/15 border-violet-500 shadow-md shadow-violet-950/30'
                      : isChecked
                      ? 'bg-violet-600/10 border-violet-500/60'
                      : 'bg-background/40 hover:bg-background/80 border-border/50 hover:border-violet-500/40'
                  }`}
                >
                  <div className="space-y-1.5">
                    {/* Top Badges & Select Checkbox */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {onToggleSelectPack && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleSelectPack(p.id);
                            }}
                            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                          >
                            {isChecked ? (
                              <CheckSquare className="size-4 text-violet-400" />
                            ) : (
                              <Square className="size-4 text-muted-foreground/60 hover:text-muted-foreground" />
                            )}
                          </button>
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted/80 text-muted-foreground font-semibold flex items-center gap-1 uppercase tracking-wider">
                          {getSourceIcon(sType)}
                          <span>{sType}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                            p.status === 'APPROVED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-white/[0.04] text-zinc-300 border-white/20'
                          }`}
                        >
                          v{p.version || 1}
                        </span>
                      </div>
                    </div>

                    {/* Title */}
                    <h4 className="text-xs font-bold text-foreground line-clamp-2 group-hover:text-violet-300 transition-colors">
                      {title}
                    </h4>
                  </div>

                  {/* Bottom Stats */}
                  <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1 text-[10px]">
                      <Clock className="size-3 text-muted-foreground" />
                      {formatDate(p.created_at)}
                    </span>

                    <span className="text-violet-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 font-medium text-[10px]">
                      <span>Open Pack</span>
                      <ArrowRight className="size-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
