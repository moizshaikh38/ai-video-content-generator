# Atomic selection candidate/job completion receipt

For a durable worker only, candidate replacement and exact job/worker completion
now share the same Mongo transaction. The job context must equal the selection
context, the job must still be processing under that worker, and existing
source/context/deletion fences still apply. Failure rolls back both suggestion
replacement and completion, preserving selected and suggested rows.

The worker does not infer completion from a returned array. It reads the exact
owned committed publication receipt. If the selector throws after publication
committed, that receipt can reconcile completion without replaying a provider.
If no receipt can be verified, existing conservative review/quarantine applies.
A receipt is not a statement about editorial quality, current candidate edits,
source availability or provider accuracy. Current-job readback still validates
source/context/transcript and exact candidate ids separately.

Legacy synchronous selection has no job owner and retains existing behavior.
No stale-claim timeout, automatic worker-stop recovery, rollout switch or live
configuration is added. Old completed jobs without receipts are not migrated or
promoted. Production index/resource/handshake/recovery and mounted-client proof
requirements remain. Local tests use disposable Mongo and synthetic provider
responses only, no remote provider or final-clip quality evidence.
