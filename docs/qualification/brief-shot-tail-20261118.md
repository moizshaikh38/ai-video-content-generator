# Preserve a distinct last frame in a brief shot

## Failure and scope

Fresh ordinary Auto analysis of a28.462s source retained18dense cuts, including .133467s and28.395033s. The earlier corpus's6s entry described its analyzed interval, not the full source asset duration. This fresh full-source run remains within the bounded30s decodedbudget. Source854x48029.97fps has853frames; output30fps has854frames. No paid providers, new source selection or release.

Exact decoded frames showed source851 brightmagenta then852 darker interior. Old direct export852/853 both repeated the bright frame. The bright frame exists in the source, so this was not evidence of a color transform bug. The scene existed in the export; its second distinct frame was lost.

## Repair

The per-shot FPS stage now passes EOF frames. Concatenated shots are placed on exact1/30 frame ticks before the final FPS stage rather than retaining concat's microsecond timestamps. Bounded tail hold and requested total frame trim remain. Moving a tailpad alone or adding EOF pass alone did not fix the full pipeline, so those partial trials were not committed.

A causal12frame29.97fps MP4 fixture ends with grey220 then30. The former graph returned12frames but last two measured means187.625/187.625 after backdrop composition. Current graph returns12frames with187.625/10. The new executable test requires the final darkframe, not merely the correct frame count. InitialMKV fixture introduced millisecond timestamp quantization and was replaced with the precise MP4 fixture; it is not claimed fixed.

## Actual verification

Fresh normal analysis, saved/reloaded Auto project, queued render and downloaded MP4 now retain the two distinct actual finalframes at output852/853, with854totalframes and28.467s outputduration. Exact source/old/new board and full moving output inspected. Local storage/auth/entitlement adapters remain; empty transcript protocol fixture does not qualify transcript accuracy or selection.

Independent fresh normal queued holdouts inspected:24fps animation preserves360outputframes, per-shot4:3Fit and existing sidecrop/smallband limitations; pair source preserves360frames and stackedSplit, with unequal sidebars and shoulder crops. These are regression checks, not new composition-quality wins. UI0 was inspected on the original full-source run; this repair changes export frame timing, not planner/preview geometry. No full-frame exhaustive semantic claim.

158expandedTS tests including render tests pass; current safe421pass/0fail/1skip; front/backendtypes pass.44Python tests were last checked before these TS-only changes, not rerun here. Original rawclock/transcript/AutoGenre/missingbody/full4K blockers remain.
