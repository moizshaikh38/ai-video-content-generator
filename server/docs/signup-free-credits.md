# Initial Free signup credits

The authenticated `/profiles/me` bootstrap creates a new application profile, its configured initial Free credit allowance, and the signed credit-ledger receipt in one Mongo transaction. The default Free allowance remains 60. Configuration must be a positive safe integer.

The fixed `signup_free_<user-id>` receipt identifies one initial grant, not a recurring monthly grant. Retries, concurrent bootstrap requests, profile refreshes and later login do not refill a spent balance. A failure before commit leaves no partial new profile or grant. A retry after a lost successful response reads the committed profile.

Scope is new application-profile bootstrap after authentication. Existing profiles and previously funded wallets are not backfilled. Paid and developer entitlements do not receive this Free signup grant. This does not add a recurring reset, expiry, rollover, a new identity-verification rule, or a one-person-across-many-accounts guarantee. The existing authentication provider still controls session issuance and email confirmation. No client-supplied owner, credit amount or plan determines the grant.

Tests cover the real controller with a synthetic authenticated identity and local transactional Mongo, including concurrency, accounting deltas, rollback, replay, configuration refusal, and unchanged existing balances. A live authentication-provider signup and hosted rollout remain separate acceptance checks.
