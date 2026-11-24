# Automatic one-export validation correction

Backup commit 470383770a776367cbf4e367c49941940378868d is integrated with the feature disabled by default. Main/live is unchanged.

The commit message says the client typecheck was clean. That statement was too strong. The client typecheck produced no diagnostics but timed out, including a 90-second attempt. It has not been confirmed to pass. The server typecheck completed successfully.

Confirmed tests: 12 focused tests pass, including automatic handoff mechanics, a synthetic actual FFmpeg render, status, deletion, index and client polling behavior. Another 15 runtime/durable-worker regression tests pass. Synthetic transcript and admission data do not prove semantic quality or fresh end-to-end success. The original fresh unattended export goal remains open.

A focused client check of HomeClippingWorkflow, projectService and their imported dependencies completed with exit 0 using the project's TypeScript compiler and strict/no-unused settings. The whole-project client check still times out; the focused result does not replace it.
