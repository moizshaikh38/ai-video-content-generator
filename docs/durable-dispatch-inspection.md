# Read-only durable dispatch inspection

From the server directory, an operator can inspect one known saved job:

```
npx tsx src/scripts/inspectDurableDispatch.ts --stage core --owner OWNER_ID --project PROJECT_ID --job-key EXACT_64_HEX_KEY
```

Use `selection` for a clip-selection job. All four arguments are mandatory,
unique and exact. The command uses the configured Mongo database. Obtain the
saved key from the original request/project record through an authorized
operational workflow. The command does not discover keys or scan job history.
Run it only against data you are authorized to inspect. Its existence does not
permit a production database connection.

Output is one JSON object with minimal job lifecycle identifiers. Wrong owner,
wrong project and missing key return `found:false`, never success or completion.
Unknown status is `unknown`. Read errors exit nonzero with a generic message and
no record output. Source URLs, transcript/context, options, notes, arbitrary
error text and provider responses are not printed.

`stopVerified:false` and `automaticRecoveryAllowed:false` always apply, including
completed, failed or missing records. `capacityMayBeHeld` is conservative for
processing, review-required and unknown states, not an authoritative capacity
measurement. No record change, provider call, cancellation, retry, replay,
capacity release, credit refund or financial reconciliation is performed.
An external operator still needs separate verified worker/provider stop and
financial/publication evidence before any recovery decision. This tool does
not supply that evidence or a recovery command.

Project deletion redacts durable core/selection payload and removes continuation
outbox separately. Financial completion snapshots remain under the existing
audit/recovery contract. Neither inspection nor that narrow deletion change is
an all-storage erasure or retention-policy solution.
