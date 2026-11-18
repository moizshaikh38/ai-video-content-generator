# Authentication owner boundary, actual local HTTP integration

2026-11-19 02:15 IST. Script: `server/scripts/local-qualification/auth-owner-http.mts`. Receipt: `evidence/20261119/auth-owner-http.json`.

The application authentication middleware called the actual Supabase SDK over HTTP against a local synthetic authentication service. The real controller, service and retained Mongo database `vireo_auth_owner_http_20261119_0214` handled reads and edits. External network was blocked in the fixture.

Missing, malformed and explicitly invalid authorization returned 401. A valid synthetic other-owner identity received 404 for the protected project on GET and PATCH, including a body attempting to supply the real owner's ID. A legitimate synthetic owner received 200 and committed an edit from version 1 to 2. A conflicting owner ID supplied in that owner's body did not change stored ownership.

This checks the real middleware/SDK HTTP/owner-filter wiring and database result. It does not qualify real hosted Supabase JWT signature verification, token refresh, live identity-provider availability, production secrets or deployment configuration. The local auth endpoint is a deliberate test double, not production authentication.
