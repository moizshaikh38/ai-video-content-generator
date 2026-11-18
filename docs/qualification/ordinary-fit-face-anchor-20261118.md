# Ordinary scene-local Fit face anchoring, November18

## Proven negative and repair

On the mixed live-action/animation12s source, fresh ordinary Auto UI controls and normal queued export produced a centered4:3 Fit in the last shot. At9.6s the right character's face was visibly cut at the sharp band's edge, despite repeatedly measured face boxes.

The scene-local ordinary Auto bridge now reuses the existing repeated-face Fit anchor after converting its default presentation to4:3. When a static4:3 window can contain those repeated boxes, it translates the window without changing its size. When exactly two repeated measured face identities cannot fit, the existing anchor's full-source Fit fallback is used for that shot. Planner-protected windows, portrait proposals and split shots are not changed. Manual ownership and no-cut legacy behavior are unchanged.

This does not choose a speaker, infer scene meaning or promise detector truth. Existing confidence, size and repetition thresholds remain. Transient or tiny detections do not gain authority. Other source objects, hands, words and detector misses remain unverified.

## Actual outputs

- Before: vireo-offcenter-fit-old-job-1104/layout-auto-job.mp4
- After: vireo-offcenter-fit-fixed-job-1106/layout-auto-job.mp4
- Comparison: vireo-offcenter-fit-before-after-1106.mp4, silent12s, inspected decoded frames across the output and9.6s in particular
- Fresh UI Auto controls: vireo-offcenter-fit-ui-1103 and vireo-offcenter-fit-fixed-ui-1105

Both outputs used fresh normal analysis, saved editor state and normal queued render/upload/download with isolated account/storage/entitlement fixtures. Full-source manual interval, not genuine automatic clip selection. The last shot widens from4:3 to source aspect. Both repeated face boxes are retained; the sharp band is consequently smaller. This is a containment repair with a visible readability tradeoff, not a universal composition win.

An independent normal yacht12s holdout was rendered and inspected, including6.54s. Its feasible off-center measured face receives translation at the same4:3 size rather than fallback. No need to redeliver unchanged yacht examples.

A read-only audit of11 distinct existing source tracks found three sampled lateral face-loss cases before and one after. The remaining game/b-roll case has transient/small faces and is explicitly not fixed. This audit is a sample, not full corpus coverage or semantic safety proof.

## Tests

-124 related tests pass before final protected-window negative
-25 final focused tests pass, including the new protected-window negative
-Frontend/backend types pass
-safe421 pass,0 fail,1 skip

Regression tests cover scene-local translation, two-face incompatibility, transient flashes, planner-protected window preservation, existing explicit Auto gates/manual ownership, crop scope and source clock. No provider calls, deployment or full4K attempt.
