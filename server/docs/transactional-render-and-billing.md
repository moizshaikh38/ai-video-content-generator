# Transactional render admission and billing events

This describes the current code contracts. It is not deployment approval or evidence that a hosted environment has passed these checks.

## Deployment prerequisites

- Use MongoDB replica-set or sharded topology with multi-document transaction support. Standalone MongoDB must fail closed.
- Review `bootstrapMongo.ts` changes using the deployment's normal migration process. The application role must be able to read and write the required collections; the migration role needs collection/index permissions.
- Render admission requires `render_quota_fences`, its unique built-in `_id` index, and the `render_jobs` account/date index. Provisioning the fence is not quota consumption.
- Billing requires the unique `billing_events` `(provider, provider_event_id)` index, plus the customer, subscription, invoice and account/billing-period unique indexes declared in bootstrap. An index creation failure is not a successful migration. Inspect existing duplicates before attempting a unique index.
- Retire all older nontransactional writers before relying on these guarantees. A mixed-version deployment can bypass an account fence or continue writing an old billing claim. Do not automatically recover old claims while such a writer may still be active.
- Do not enable render admission or remove a deployment guard based only on narrow local tests. Verify authenticated routes, hosted storage, worker/API version agreement, environment configuration, actual output and rollback procedures separately.

## Render allowance

`renderQuotaRepository.ts` serializes each new admission through one contention row per account, then counts retained current-UTC-month render jobs inside the same transaction that creates the new job. All job statuses count. BSON dates and parseable legacy date strings are compared by UTC instant. Initial, Quick, Studio and Producer paths supply an explicit server-derived finite or unlimited policy.

Read-only preflight uses the same usage function. It is not a reservation and does not replace the transaction. Same-intent receipt replay is not a new admission. Workers require a committed job and may not create one as an implicit fallback.

A finite account with missing, malformed or non-date historical usage clocks receives `RENDER_USAGE_UNAVAILABLE`. Before rollout, identify these records and review them using trustworthy source data. Do not invent dates, remove usage or weaken validation to clear the refusal. Unlimited accounts retain their explicit unlimited policy.

### Unresolved deletion policy

Current deletion repositories remove related `render_jobs`. Consequently deleting a clip/project can restore counted monthly allowance. This is existing behavior, not repaired by the account contention row. The row is not a nonrefundable consumption ledger.

A durable ledger surviving deletion would require an explicit product decision covering successful/failed jobs, retries, cancellations, refunds and plan changes. Do not silently adopt that policy as a concurrency fix. Credit wallets and source-processing reservations are separate from this monthly render allowance.

## Verified billing event application

The HTTP controller verifies the provider signature and normalizes the event before calling `applyVerifiedBillingEvent`. Normalized identity keys, dates, enums and numeric values are checked before database queries. Provider normalizers express monetary amounts in major units; legitimate fractional totals must remain valid. Signature verification does not replace payload-schema validation.

A single transaction writes the event receipt, customer/subscription/limits/invoice changes, and terminal receipt. The new path does not commit a separate processing claim before its effects. Subscription and entitlement reads share its session, including cancellation read-after-write. Matching processed/ignored terminal receipts are idempotent; changed payload hashes are refused. Ownership mismatches produce an ignored receipt without changing another account.

The transaction has a 10-second driver timeout budget. The duplicate-key fallback receipt read has a 2-second timeout. These do not bound initial connection or topology checks, so they are not an end-to-end HTTP latency guarantee. Unfinished or timed-out attempts must produce a non-2xx response, leaving the provider able to retry. Check actual ingress timeout settings and provider retry behavior in staging.

### Legacy processing receipts

An existing nonterminal receipt that is not explicitly `failed` receives `BILLING_EVENT_RECOVERY_REQUIRED`, not a 200 duplicate acknowledgment. There is deliberately no automatic timeout reclaim: an older worker might still write outside the new transaction. Review these only after old writers are retired and reconcile provider state, subscription state and receipt state before choosing a recovery action. This document does not authorize clearing or replaying production billing records.

### Process loss and uncertain responses

A killed process can leave an uncommitted Mongo transaction holding locks until normal transaction cleanup. Local testing observed invisible uncommitted effects, an immediate retry exceeding a 30-second diagnostic budget, and a later retry succeeding after natural cleanup. Recovery is not instant. No manual database abort was needed in that test.

A separate synthetic test commits successfully, then raises a driver error instead of returning the commit response. Redelivery reads the terminal receipt and does not create another subscription. This is not a real network-partition/unknown-commit qualification.

## Test scope

- `renderQuotaAtomic.test.ts`: actual local Mongo concurrency, finite limits, cross-entry-point contention, replay, rollback, malformed dates and UTC-offset boundaries.
- `producerApplyAdmission.test.ts`: actual local Mongo transactional edits/admission, same-plan receipts and refusal cases.
- `billingEventAtomic.test.ts`: actual local Mongo event races, rollback, ownership, terminal receipt replay, lock timeout/retry and synthetic postcommit response loss. Synthetic signed callbacks exercise the real controller/verifier without calling payment providers.
- Existing billing security tests also include source assertions and in-memory stand-ins. Passing them does not establish live payment-provider, hosted webhook, production-data migration or full application acceptance.

The full build/typecheck, automatic fresh-source output quality, hosted authenticated end-to-end path and deployment/rollback checks remain separate release gates.
