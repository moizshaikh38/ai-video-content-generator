# VIREOCLIP PHASE 4B.3 — CANONICAL ARCHITECTURE SPECIFICATION

**Status:** Canonical & Production Implemented  
**Author:** Google DeepMind Advanced Agentic Coding Pair  
**Effective Date:** November 6, 2026  
**Topology Requirement:** MongoDB Replica Set or Sharded Cluster (Standalone fails closed with HTTP 503)  

---

## 1. System Topology & Fail-Closed Gating

Standalone MongoDB deployments are permanently retired for financial credit transactions. 

All financial operations invoke `assertTransactionalTopology()` at initialization:
- Queries `admin.command({ hello: 1 })`.
- Validates `setName` (Replica Set) or `msg === 'isdbgrid'` (Mongos).
- If neither is present, immediately throws `AppError('Financial operations require a transactional MongoDB topology...', 503, 'TRANSACTIONAL_TOPOLOGY_REQUIRED')`.
- Zero silent fallback to standalone operations.

---

## 2. Mathematical 5-Delta Accounting Model

All mutations to user credit wallets record explicit signed deltas across 5 independent dimensions:
1. `available_delta`: Net change to liquid, spendable balance.
2. `reserved_delta`: Net change to in-flight locked credits.
3. `lifetime_granted_delta`: Net change to cumulative granted credits.
4. `lifetime_consumed_delta`: Net change to cumulative permanently consumed credits.
5. `net_adjustments_delta`: Net change to manual/administrative adjustments.

### Invariant Equations
1. **Conservation Law:**
   $$\text{available\_delta} + \text{reserved\_delta} \equiv \text{lifetime\_granted\_delta} - \text{lifetime\_consumed\_delta} + \text{net\_adjustments\_delta}$$
2. **Current Equity Balance:**
   $$\text{available\_credits} + \text{reserved\_credits} \equiv \text{lifetime\_granted} - \text{lifetime\_consumed} + \text{net\_adjustments}$$
3. **Audit History Equivalence:**
   $$\text{available\_credits} \equiv \sum \text{available\_delta}$$
   $$\text{reserved\_credits} \equiv \sum \text{reserved\_delta}$$

---

## 3. Permanent Tenant-Scoped Idempotency

- Collection: `idempotency_keys`
- Document structure:
  ```json
  {
    "_id": "${user_id}:${operation_id}:${client_key}",
    "user_id": "UUID",
    "operation_type": "string",
    "client_key": "string",
    "request_payload_sha256": "64-char hex",
    "status": "in_progress | committed | refunded | reconciliation_required",
    "transaction_id": "UUID",
    "attempt_id": "UUID",
    "created_at": "ISODate",
    "updated_at": "ISODate"
  }
  ```
- **Rules:**
  - Zero TTL index. Permanent retention.
  - Replay with identical payload returns idempotent success.
  - Replay with modified payload throws `409 IDEMPOTENCY_KEY_COLLISION_WITH_DIFFERENT_PAYLOAD`.

---

## 4. Distributed Concurrency Engine (20 Slots/User)

- Collection: `user_concurrency_slots`
- Pre-allocated 20 slots per tenant: `${userId}:slot_1` to `${userId}:slot_20`.
- **Three-Phase Protocol:**
  1. *Phase 1 (Pre-Tx):* Worker atomically acquires available slot via `findOneAndUpdate` with a 15-second lease (`status: 'reserved_pending_tx'`) and generates a UUID `slot_token`.
  2. *Phase 2 (Tx 1):* Transaction 1 commits financial reservation, wallet lock, ledger entry, permanent idempotency key, and outbox event.
  3. *Phase 3 (Post-Tx):* Worker promotes slot to `status: 'active'` with a 45-second heartbeat lease.
- **Heartbeat:** Dynamic aggregation pipeline clamps extension to hard deadline:
  `worker_leased_until = min(now + 45s, hard_deadline_at)`.
- **Release:** Token-matched CAS (`slot_token` must match). Stale workers cannot release reassigned slots.
- **Sweeper:** Detects expired slots; verifies authoritative reservation before recycling.

---

## 5. Duplicate-Safe Transactional Outbox

- Collection: `outbox_events`
- Co-created inside Transaction 1:
  ```json
  {
    "_id": "${user_id}:${attempt_id}:outbox",
    "event_type": "DISPATCH_CONTENT_PACK_JOB",
    "aggregate_type": "credit_reservation",
    "aggregate_id": "attemptId",
    "user_id": "userId",
    "payload": { ... },
    "status": "pending",
    "attempts": 0,
    "max_attempts": 5,
    "next_attempt_at": "ISODate"
  }
  ```
- **Ownership Decoupling:** Dispatcher claim token is separate from worker execution token. Stale dispatchers cannot advance or complete worker records.

---

## 6. Document Size & BSON Invariants

MongoDB `$jsonSchema` collection validator enforces:
- Maximum UUID lengths: 36 characters.
- Maximum billing period length: 7 characters.
- Maximum reset date length: 30 characters.
- Minimum numeric balances: 0 (negative balances impossible).
- `additionalProperties: false` (zero unbounded array growth).
- **Nominal Document Size:** ~403 bytes.
- **Enforced Maximum Size:** 476 bytes (Int32) / 504 bytes (Int64/Double upper bound).

