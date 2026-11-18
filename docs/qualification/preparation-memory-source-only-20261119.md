# Source-only preparation memory investigation

2026-11-19 02:24 IST. No additional build, browser, CV or encode was run.

The failed current build exceeded the 512 MiB aggregate build process-group RSS limit at a sampled 538,931,200 bytes while transforming. Its unconstrained peak is unknown. This is not evidence that a particular higher cap would suffice.

Static dependency inspection of the unchanged Studio entry found 148 reachable local source files, about 1.96 MB. This is a regex-based dependency estimate that includes type and dynamic imports, not a Rollup graph or allocation profile. EditorShell statically imports tool workspaces as well as core editing components.

A concrete avoidable graph expansion is the installed lucide-react barrel. Fifty reachable import statements refer to it. The barrel has 1,862 export lines and imports the complete icon index. The installed ESM tree contains 2,137 module files totaling about 2.02 MB of JavaScript. Used runtime named icon bindings resolve to 121 concrete icon files totaling about 84 KB, plus their shared support modules. One unmatched binding in the raw inspection was the type-only LucideIcon import, not a missing runtime icon. Package disk size including types/maps is about 45 MB and is not runtime or build RSS.

A possible lower-load preparation route is an exact build-time named-import resolver to those existing concrete icon modules. It must preserve aliases, leave type imports type-only, reject unsupported namespace/star/dynamic shapes, validate all bindings against the installed barrel, and use the unchanged ordinary page/hooks/components. Direct mapping would avoid requesting the unused icon module graph rather than increase resource limits. It is not implemented or measured here. The graph reduction is a source fact; whether it brings aggregate RSS below 512 MiB is unknown until a separately authorized bounded preparation run.

Lazy-loading tool workspaces could reduce initial browser loading, but a production build may still traverse all dynamic chunks, so that alone is not a credible preparation-memory fix. Disabling minification alone is likewise not supported by this failure, which occurred in transformation before a reported output/minification stage.

No new capacity route was executed after the stop. No full export is qualified by this investigation.
