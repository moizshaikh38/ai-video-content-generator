# Unresolved context review experiment, 16 Nov 2026

Local experiment, not an accepted automatic-output policy. No production caller selects `unresolvedContextPolicy: 'shared-subject-window'`.

Default behavior is unchanged. `preserve` retains the widest required window across every shot. The explicit review candidate sizes the shared window from subject or crowd constraints, excluding shots with no stable subject anchor. If that crops an unresolved shot, the plan records `unresolved-review-required` and the reason. An all-unknown clip remains full source. Crowd evidence is not discarded as unknown.

The candidate avoids the universal thin-band consequence of one unresolved shot while keeping a constant source-window size. It DOES NOT establish important scene/object boundaries or safe framing. A centered crop of an unresolved shot needs review and must not silently become accepted automatic output.

Evidence generated from the actual crop-filter builder:
- 9s Blender scene-cut excerpt: shared width 0.637504 and height 1; the overhead scene is explicitly unresolved. Person shots are larger, but scene importance remains unqualified.
- 16s heldout Hichilema interview excerpt at source 72-88s: three shots, shared width 0.666489 and height 1, opposite-side subject anchors. Person boxes still do not prove hand containment.
- 12s Hichilema interview excerpt at source 114-126s: width 0.645481, height 0.9711. Visual samples show hand-edge risk, so not accepted quality.

The two heldout excerpts add new moments from an existing independent interview source. They are not two new independent source videos.

Source: VOA Africa, "VOA Interview, Part 2- Zambia's New President Hakainde Hichilema", 25 Aug 2021. Commons marks this particular file free of known copyright restrictions. It is separate from the Leon Panetta two-feed source.
https://commons.wikimedia.org/wiki/File:VOA_Interview%2C_Part_2-_Zambia%E2%80%99s_New_President_Hakainde_Hichilema.webm
Blender footage: (CC) Blender Foundation | mango.blender.org.

Checks: 16 shot-composition, associated-body and uncertainty tests pass; server TypeScript check passes. No production/default configuration change, model promotion or release. Actual rendered files remain review evidence, not product acceptance.
