# Unexpected coded server error disclosure

2026-11-19 approximately 02:37 IST. Actual local HTTP reproduction used the real error handler in production mode and synthetic error details, no real customer data.

Before the fix, an unexpected Error with code ENOENT and status 500 returned its synthetic private filesystem path and internal connection text in both top-level message and nested error.message. The code-presence branch treated the driver message as safe. A plain Error without a code was already generic.

`server/src/middleware/errorHandler.ts` now returns INTERNAL_ERROR and Internal server error for unexpected non-AppError status >=500 regardless of whether the driver error carries a code. Explicit application errors retain their deliberately authored status/code/message, so the tested AppError 409/REVISION_CONFLICT remained actionable. This does not certify every AppError message elsewhere as safe.

Actual after-fix HTTP checks passed for coded 500, plain 500 and explicit 409. Additional regression tests covered unexpected coded 500, 502 and 503, nested envelopes and request-ID retention. Two disclosure tests plus ten existing work-lifecycle tests passed, aggregate sampled RSS 218,030,080 bytes over 0.42 seconds. Actual fixed HTTP fixture sampled 179,752,960 bytes over 0.37 seconds. No guard breach, provider call, auth implementation change, media work, live-data mutation or deployment occurred.

Original error detail continues to be available in server-side logging/monitoring as before. This fix limits the client response; it does not redesign log access/redaction. Before/after local HTTP receipts are stored under evidence/20261119/error-disclosure-before.json and error-disclosure-after.json. Full source type checking and production build remain incomplete from the earlier resource-guard stops, separate from these passing bounded checks.
