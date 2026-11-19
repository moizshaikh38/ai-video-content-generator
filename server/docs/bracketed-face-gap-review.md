# Bracketed face-gap review candidate

`SMART_REFRAME_BRACKETED_GAP_REVIEW=1` enables an offline qualification candidate. It is off by default. Do not enable it as a production-quality claim.

Within an existing shot, repeated nearby, similarly sized face detections on both sides of a detection gap can support a bounded framing interpolation. The gap must be no longer than five seconds. Competing detections, a one-off reappearance, low-confidence boxes, or a missing endpoint refuse the bridge. Missing detections alone do not authorize a hold. Geometry continuity does not establish person identity or semantic importance.

The candidate changes newly computed keyframes only. Existing saved tracks and manual item geometry are not rewritten. It makes no provider call and adds no model download. It does not choose an embedded camera or gameplay role, infer HUD importance, fix captions, or select highlights.

Qualification is incomplete. A retained short source with recorded detections demonstrated a center-drift failure and a candidate correction in a low-resolution moving render. This does not validate fresh detection, diverse sources, full-resolution output, or hosted behavior. Keep the flag off until those checks support a wider rollout.
