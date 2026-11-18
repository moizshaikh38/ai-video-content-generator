# Editor controller failure projection

2026-11-19 approximately 02:39 IST. The earlier central-handler fix did not cover local controller catch blocks. Actual editor GET HTTP with a synthetic ProEditorService failure returned a synthetic private database path and driver code in its 500 response before this change. The service fault was a deliberate local test double, with no real database or authentication call.

All eleven local catches in ProEditorController now use `sendSafeControllerError`. For server failures, including AppError wrappers of downstream details, it returns generic INTERNAL_ERROR and Internal server error. Valid 4xx status/code/message remain actionable. Existing inferred filler-removal 400/404 behavior is retained. Invalid status values fall back to 500 instead of breaking response construction. The change does not intentionally change successful editor responses or execute renders.

Actual editor GET HTTP after the change returned generic 500 for the synthetic driver error and preserved known PROJECT_NOT_FOUND/404. Four safe-projection regressions, two central-handler regressions and ten existing lifecycle tests passed, sampled group RSS 211,533,824 bytes over 0.52 seconds. Full application type checking/build remain uncompleted from earlier independent resource stops.

Clip/media controller raw-error catch patterns and some other explicit AppError messages remain unaudited source findings, not closed by this focused editor fix. Login/auth, payment and billing implementation were not changed. This is a backup-only local hardening change, not deployment or a systemwide error-disclosure assurance.
