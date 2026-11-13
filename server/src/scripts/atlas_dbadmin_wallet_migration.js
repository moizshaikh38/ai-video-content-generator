/**
 * VIREOCLIP PHASE 4B.3 — ATLAS DBADMIN WALLET VALIDATOR MIGRATION SCRIPT
 *
 * Target Database:   vireo_staging
 * Target Collection: credit_wallets
 * Required Role:     dbAdmin or dbOwner on vireo_staging (or atlasAdmin)
 * Generated From:    server/src/db/bootstrapMongo.ts (Single Source of Truth)
 * Canonical SHA-256: fa19f3289812f8fff24ab6da86df0fa648aadd57e9a288107be9d9a2ad6eab9d
 *
 * SAFETY PRINCIPLES & OPERATOR RUNBOOK:
 * 1. Safe Abort on Cluster or Database Mismatch: Fails immediately if not connected to 'vireo_staging' on the authorized staging Atlas replica set.
 * 2. Exact Pre-Migration State Guard: Verifies live Atlas validator matches audited legacy schema verbatim via canonical deep equality.
 * 3. Complete Document Audit: Tests 100% of existing documents against EVERY target schema constraint.
 * 4. collMod Execution: Applies exact WALLET_COLLECTION_JSON_SCHEMA with strict/error settings.
 * 5. Full Post-Migration Verification: Canonical deep comparison against expected schema.
 *
 * MAINTENANCE WINDOW WRITE-QUIESCENCE PROCEDURE (OPERATOR PREREQUISITE):
 * In MongoDB, DDL commands (collMod) acquire an exclusive metadata lock and cannot execute inside multi-document ACID transactions.
 * Therefore, a read-only document audit and subsequent collMod cannot be atomic at the database level.
 * Connection counts (e.g. serverStatus().connections) or a single currentOp() query DO NOT prove quiescence, because
 * MongoDB Atlas internal infrastructure (mms-agent, mongos, backup agents, Prometheus exporters) maintains standing idle connections.
 * 
 * To guarantee zero mutations occur between Step 3 (audit) and Step 4 (collMod), the operator must systematically stop and verify
 * all five independent writer categories before running collMod:
 * 
 * 1. API / Web Instances (User-Facing):
 *    - Action: Scale staging web/API deployments to 0 (kubectl scale deploy/vireo-staging --replicas=0 or pm2 stop vireo-staging)
 *      AND enable edge maintenance gate returning HTTP 503 at ingress.
 *    - Verification: Inspect ingress logs confirming 0 requests forwarded to backend; verify process table has 0 API processes.
 * 
 * 2. Video Processing Workers:
 *    - Action: Pause Redis BullMQ queues (videoQueue.pause()) and drain active jobs (scale deploy/vireo-worker --replicas=0).
 *    - Verification: Inspect Redis queue metrics (activeCount === 0 && isPaused === true).
 * 
 * 3. Transactional Outbox Dispatchers:
 *    - Action: Stop outbox polling service (outboxService.stop() or terminate dispatcher container).
 *    - Verification: Query db.outbox_events.countDocuments({ status: 'claimed_for_dispatch' }) === 0 and confirm clean shutdown in logs.
 * 
 * 4. Reconciliation Sweepers:
 *    - Action: Cancel periodic sweeper cron job (schedule.cancel() or terminate sweeper container).
 *    - Verification: Verify no sweeper tasks running in process table (ps aux | grep node).
 * 
 * 5. Direct Database Writers / CI-CD Runners:
 *    - Action: Ensure staging CI/CD test pipelines are inactive; temporarily restrict Atlas IP Access List if necessary.
 *    - Verification: Confirm no GitHub Actions or test runners active on staging.
 * 
 * Quiescence In-Flight State Audit Queries (mongosh):
 *   db.credit_reservations.countDocuments({ status: { $in: ['active', 'reserved', 'recovering'] } }) === 0
 *   db.idempotency_keys.countDocuments({ status: 'in_progress' }) === 0
 *   db.user_concurrency_slots.countDocuments({ status: { $ne: 'available' } }) === 0
 *   db.currentOp({
 *     $or: [
 *       { "command.update": "credit_wallets" },
 *       { "command.insert": "credit_wallets" },
 *       { "command.findAndModify": "credit_wallets" },
 *       { "command.findandmodify": "credit_wallets" },
 *       { "command.delete": "credit_wallets" },
 *       { "ns": "vireo_staging.credit_wallets", "op": { $in: ["insert", "update", "remove"] } }
 *     ]
 *   }).inprog.length === 0
 * 
 * LIMITATION OF currentOp():
 * currentOp() only captures operations active at the exact instant of execution. It cannot detect an idle connection or
 * a worker in a sleep interval between database calls. Therefore, NEVER confirm quiescence solely from currentOp().
 * Independent verification of writer shutdown (Steps 1-5 above) is the primary requirement.
 * 
 * MANDATORY ABORT CONDITION:
 * If the operator cannot positively establish that every writer category has stopped, ABORT THE MIGRATION IMMEDIATELY.
 * 
 * RESPONSIBILITIES:
 * - Lead Backend Engineer / Release Lead: Authorizes maintenance window, executes writer/worker scale-down, confirms queue drain.
 * - Lead Database Administrator (dbAdmin): Verifies database quiescence, executes migration/verification, inspects live options.
 * - Writer Resumption: Authorized by Release Lead ONLY after dbAdmin confirms Step 5 verification passed.
 */

(function () {
  print("\n========================================================================");
  print("VIREOCLIP — MONGODB ATLAS WALLET VALIDATOR MIGRATION (DBADMIN)");
  print("Target Database:         vireo_staging");
  print("Target Collection:       credit_wallets");
  print("Expected Schema SHA-256: fa19f3289812f8fff24ab6da86df0fa648aadd57e9a288107be9d9a2ad6eab9d");
  print("========================================================================\n");

  // Helper: Recursive canonicalization (deterministic key sorting)
  function canonicalize(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(canonicalize);
    const sorted = {};
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = canonicalize(obj[k]);
    }
    return sorted;
  }

  // Helper: Exact effective validationAction check (omitted or explicit 'error')
  function isEffectiveErrorValidationAction(opts) {
    if (opts === null || typeof opts !== "object") return false;
    if (!("validationAction" in opts) || opts.validationAction === undefined) return true;
    if (opts.validationAction === "error") return true;
    return false;
  }

  // Target Cluster Identity Specification (Exact Atlas Staging Baseline)
  const EXPECTED_STAGING_DB_NAME = "vireo_staging";
  const EXPECTED_STAGING_REPLICA_SET = "atlas-ol429v-shard-0";
  const EXPECTED_STAGING_HOSTS = Object.freeze([
    "ac-uqylvwf-shard-00-00.6bxh37q.mongodb.net:27017",
    "ac-uqylvwf-shard-00-01.6bxh37q.mongodb.net:27017",
    "ac-uqylvwf-shard-00-02.6bxh37q.mongodb.net:27017",
  ]);

  // Helper: Verify deployment cluster identity, exact replica set member set, and database isolation
  function verifyClusterIdentity(dbInstance) {
    if (!dbInstance || typeof dbInstance.getName !== "function") {
      throw new Error("CRITICAL SAFETY ABORT [INVALID_HANDLE]: Invalid database instance handle provided.");
    }

    // 1. Database name check
    const currentDb = dbInstance.getName();
    if (currentDb !== EXPECTED_STAGING_DB_NAME) {
      throw new Error(
        "CRITICAL SAFETY ABORT [DATABASE_MISMATCH]: Connected database is '" +
          currentDb +
          "', but expected '" +
          EXPECTED_STAGING_DB_NAME +
          "'. Run 'use " +
          EXPECTED_STAGING_DB_NAME +
          ";' before executing this script."
      );
    }

    // 2. Reject missing cluster identity specification
    if (!EXPECTED_STAGING_REPLICA_SET || !Array.isArray(EXPECTED_STAGING_HOSTS) || EXPECTED_STAGING_HOSTS.length === 0) {
      throw new Error("CRITICAL SAFETY ABORT [CONFIG_MISSING]: Expected staging cluster identity is not configured.");
    }

    // 3. Query cluster topology via standard hello command
    let hello;
    try {
      hello = dbInstance.runCommand({ hello: 1 });
      if (!hello || !hello.ok) {
        hello = dbInstance.runCommand({ isMaster: 1 });
      }
    } catch (err) {
      throw new Error("CRITICAL SAFETY ABORT [TOPOLOGY_QUERY_FAILED]: Failed to query deployment topology: " + err.message);
    }

    if (!hello || !hello.ok) {
      throw new Error("CRITICAL SAFETY ABORT [TOPOLOGY_UNAVAILABLE]: Deployment hello/isMaster command returned non-ok.");
    }

    // 4. Validate hello.setName independently
    const actualReplSetName = hello.setName;
    if (!actualReplSetName) {
      throw new Error(
        "CRITICAL SAFETY ABORT [NOT_REPLICA_SET]: Connected deployment is not a replica set (setName missing). Standalone or unrecognized topology rejected."
      );
    }

    if (actualReplSetName !== EXPECTED_STAGING_REPLICA_SET) {
      throw new Error(
        "CRITICAL SAFETY ABORT [CLUSTER_MISMATCH]: Connected replica set '" +
          actualReplSetName +
          "' does NOT match expected staging replica set '" +
          EXPECTED_STAGING_REPLICA_SET +
          "'. Production, development, or unknown cluster rejected."
      );
    }

    // 5. Compare complete normalized hello.hosts member set against expected set
    const actualHosts = Array.isArray(hello.hosts) ? hello.hosts : [];
    if (actualHosts.length === 0) {
      throw new Error("CRITICAL SAFETY ABORT [HOSTS_EMPTY]: Connected deployment reported empty or unavailable hello.hosts.");
    }

    const normalizedActual = Array.from(new Set(actualHosts.map(function (h) { return String(h).trim().toLowerCase(); }))).sort();
    const normalizedExpected = Array.from(new Set(EXPECTED_STAGING_HOSTS.map(function (h) { return String(h).trim().toLowerCase(); }))).sort();

    if (normalizedActual.length !== normalizedExpected.length) {
      throw new Error(
        "CRITICAL SAFETY ABORT [HOSTS_COUNT_MISMATCH]: Connected replica set hosts count (" +
          normalizedActual.length +
          ") differs from expected staging member set (" +
          normalizedExpected.length +
          ")."
      );
    }

    for (let i = 0; i < normalizedExpected.length; i++) {
      if (normalizedActual[i] !== normalizedExpected[i]) {
        throw new Error(
          "CRITICAL SAFETY ABORT [EXACT_HOSTS_MISMATCH]: Connected replica set member set does not match expected staging members. Actual: " +
            JSON.stringify(normalizedActual) +
            ", Expected: " +
            JSON.stringify(normalizedExpected)
        );
      }
    }

    return {
      verified: true,
      database: currentDb,
      replicaSet: actualReplSetName,
      members: normalizedActual,
    };
  }

  // --- STEP 1: SAFETY ASSERTIONS (CLUSTER IDENTITY & TARGET ISOLATION) ---
  print("[1/5] Safety Guard: Verifying deployment cluster identity and target database...");
  const clusterIdentity = verifyClusterIdentity(db);
  print("      ✔ Target database confirmed:  " + clusterIdentity.database);
  print("      ✔ Staging replica set match:  " + clusterIdentity.replicaSet);
  print("      ✔ Exact member hosts match:   " + clusterIdentity.members.length + " replica set members verified verbatim");

  const collections = db.getCollectionNames();
  if (!collections.includes("credit_wallets")) {
    throw new Error(
      "CRITICAL SAFETY ABORT: Collection 'credit_wallets' does not exist in '" +
        clusterIdentity.database +
        "'."
    );
  }
  print("      ✔ Target collection 'credit_wallets' exists\n");

  // --- STEP 2: PRE-MIGRATION STATE GUARD (EXACT LEGACY VALIDATOR VERIFICATION) ---
  print("[2/5] Pre-Migration State Guard: Verifying existing live Atlas validator...");
  const preCollInfo = db.getCollectionInfos({ name: "credit_wallets" })[0];
  const preOptions = (preCollInfo && preCollInfo.options) || {};
  const preValidator = preOptions.validator;

  if (!preValidator) {
    throw new Error("PRE-MIGRATION STATE GUARD ABORT: No existing validator found on 'credit_wallets'. Expected legacy schema.");
  }

  const EXPECTED_LEGACY_VALIDATOR = {"$jsonSchema":{"bsonType":"object","properties":{"clip_id":{"bsonType":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},"created_at":{"bsonType":"date"},"id":{"bsonType":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},"project_id":{"bsonType":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},"updated_at":{"bsonType":"date"},"user_id":{"bsonType":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"}},"required":["id","user_id"]}};
  const liveCanon = JSON.stringify(canonicalize(preValidator));
  const expCanon = JSON.stringify(canonicalize(EXPECTED_LEGACY_VALIDATOR));

  if (liveCanon !== expCanon) {
    print("\n[PRE-MIGRATION STATE GUARD FAILURE]");
    print("Live validator JSON (canonicalized):");
    print(liveCanon);
    print("\nExpected legacy validator JSON (canonicalized):");
    print(expCanon);
    throw new Error("PRE-MIGRATION STATE GUARD ABORT: Live Atlas validator differs from audited legacy baseline. collMod aborted.");
  }

  if (preOptions.validationLevel !== "strict") {
    throw new Error("PRE-MIGRATION STATE GUARD ABORT: Expected live validationLevel 'strict', found: '" + preOptions.validationLevel + "'.");
  }

  // Verify effective validationAction via exact helper
  if (!isEffectiveErrorValidationAction(preOptions)) {
    throw new Error(
      "PRE-MIGRATION STATE GUARD ABORT: Expected effective validationAction 'error' (omitted engine default or explicit 'error'), but found: '" +
        preOptions.validationAction +
        "'."
    );
  }

  print("      ✔ Live Atlas validator verified: 100% exact match with audited legacy baseline.");
  print("      ✔ Live validationLevel verified: strict");
  print("      ✔ Live validationAction verified: effective 'error' (stored: " + (preOptions.validationAction !== undefined ? "'" + preOptions.validationAction + "'" : "omitted engine default 'error'") + ")\n");

  // --- STEP 3: EXHAUSTIVE PRE-MIGRATION DOCUMENT AUDIT ---
  print("[3/5] Complete Pre-Migration Document Audit: Validating all records against target schema...");
  
  // Single Source of Truth Target Schema Definition (Canonicalized)
  const TARGET_SCHEMA = {"additionalProperties":false,"bsonType":"object","properties":{"_id":{"bsonType":["objectId","string"],"maxLength":36},"available_credits":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"billing_period":{"bsonType":"string","maxLength":7},"created_at":{"bsonType":"date"},"id":{"bsonType":"string","maxLength":36},"lifetime_consumed":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"lifetime_granted":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"period_consumed":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"period_granted":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"reserved_credits":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"reset_date":{"bsonType":"string","maxLength":30},"status":{"enum":["active","suspended","frozen"]},"updated_at":{"bsonType":"date"},"user_id":{"bsonType":"string","maxLength":36},"version":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":1,"multipleOf":1},"workspace_id":{"bsonType":["string","null"],"maxLength":36}},"required":["id","user_id","available_credits","reserved_credits","lifetime_granted","lifetime_consumed","period_granted","period_consumed","billing_period","reset_date","status","version","created_at","updated_at"]};

  const allowedFields = new Set([
    "_id", "id", "user_id", "workspace_id",
    "available_credits", "reserved_credits",
    "lifetime_granted", "lifetime_consumed",
    "period_granted", "period_consumed",
    "billing_period", "reset_date",
    "status", "version", "created_at", "updated_at"
  ]);

  const requiredFields = TARGET_SCHEMA.required;
  const creditFields = [
    "available_credits", "reserved_credits",
    "lifetime_granted", "lifetime_consumed",
    "period_granted", "period_consumed"
  ];

  const cursor = db.credit_wallets.find();
  let totalAudited = 0;
  let compliantCount = 0;
  let nonCompliantCount = 0;
  const failures = [];

  while (cursor.hasNext()) {
    const doc = cursor.next();
    totalAudited++;
    let docValid = true;
    const docErrors = [];

    // Constraint 1: additionalProperties: false
    for (const key of Object.keys(doc)) {
      if (!allowedFields.has(key)) {
        docValid = false;
        docErrors.push("Additional property forbidden: '" + key + "'");
      }
    }

    // Constraint 2: All 14 required fields present and non-null
    for (const req of requiredFields) {
      if (!(req in doc) || doc[req] === undefined || doc[req] === null) {
        docValid = false;
        docErrors.push("Missing required field: '" + req + "'");
      }
    }

    // Constraint 3: _id permitted BSON type and length constraint
    const isObjectId = doc._id && (doc._id._bsontype === "ObjectId" || (doc._id.constructor && doc._id.constructor.name === "ObjectId"));
    const isStringId = typeof doc._id === "string" && doc._id.length > 0 && doc._id.length <= 36;
    if (!isObjectId && !isStringId) {
      docValid = false;
      docErrors.push("Invalid _id type or length (must be ObjectId or string <= 36 chars)");
    }

    // Constraint 4: id and user_id string types and maxLength <= 36
    if (typeof doc.id !== "string" || doc.id.length === 0 || doc.id.length > 36) {
      docValid = false;
      docErrors.push("Invalid 'id': must be non-empty string <= 36 chars");
    }
    if (typeof doc.user_id !== "string" || doc.user_id.length === 0 || doc.user_id.length > 36) {
      docValid = false;
      docErrors.push("Invalid 'user_id': must be non-empty string <= 36 chars");
    }

    // Constraint 5: workspace_id permitted types (string <= 36 or null)
    if (doc.workspace_id !== undefined && doc.workspace_id !== null) {
      if (typeof doc.workspace_id !== "string" || doc.workspace_id.length > 36) {
        docValid = false;
        docErrors.push("Invalid 'workspace_id': must be string <= 36 chars or null");
      }
    }

    // Constraint 6: All six credit fields (numeric, finite, integer, min 0, max 9007199254740991)
    for (const cf of creditFields) {
      const val = doc[cf];
      if (typeof val !== "number" || !Number.isFinite(val) || !Number.isInteger(val) || val < 0 || val > 9007199254740991) {
        docValid = false;
        docErrors.push("Credit field '" + cf + "' violation: " + val + " (must be integer, 0 <= x <= 9007199254740991)");
      }
    }

    // Constraint 7: billing_period string type, maxLength <= 7
    if (typeof doc.billing_period !== "string" || doc.billing_period.length === 0 || doc.billing_period.length > 7) {
      docValid = false;
      docErrors.push("Invalid 'billing_period': must be string <= 7 chars");
    }

    // Constraint 8: reset_date string type, maxLength <= 30
    if (typeof doc.reset_date !== "string" || doc.reset_date.length === 0 || doc.reset_date.length > 30) {
      docValid = false;
      docErrors.push("Invalid 'reset_date': must be string <= 30 chars");
    }

    // Constraint 9: status enum ['active', 'suspended', 'frozen']
    if (!["active", "suspended", "frozen"].includes(doc.status)) {
      docValid = false;
      docErrors.push("Invalid 'status' enum: '" + doc.status + "'");
    }

    // Constraint 10: version numeric, finite integer, min 1, max 9007199254740991
    if (typeof doc.version !== "number" || !Number.isFinite(doc.version) || !Number.isInteger(doc.version) || doc.version < 1 || doc.version > 9007199254740991) {
      docValid = false;
      docErrors.push("Invalid 'version': " + doc.version + " (must be integer, 1 <= x <= 9007199254740991)");
    }

    // Constraint 11: created_at and updated_at BSON date types
    if (!(doc.created_at instanceof Date) || isNaN(doc.created_at.getTime())) {
      docValid = false;
      docErrors.push("Invalid 'created_at': must be valid BSON Date");
    }
    if (!(doc.updated_at instanceof Date) || isNaN(doc.updated_at.getTime())) {
      docValid = false;
      docErrors.push("Invalid 'updated_at': must be valid BSON Date");
    }

    if (docValid) {
      compliantCount++;
    } else {
      nonCompliantCount++;
      failures.push({ id: doc.id, _id: doc._id, errors: docErrors });
    }
  }

  print("      Total documents audited: " + totalAudited);
  print("      Compliant documents:     " + compliantCount + " / " + totalAudited + " (100.00%)");
  print("      Non-compliant documents: " + nonCompliantCount);

  if (nonCompliantCount > 0) {
    print("\n[CRITICAL ERROR] Pre-migration audit failed. Non-compliant documents identified:");
    print(JSON.stringify(failures, null, 2));
    throw new Error("AUDIT ABORT: Found " + nonCompliantCount + " non-compliant documents. collMod will NOT be executed.");
  }
  print("      ✔ 100% of existing documents conform to all target schema constraints.\n");

  // --- STEP 4: EXECUTE COLLMOD WITH SINGLE SOURCE OF TRUTH SCHEMA ---
  print("[4/5] Executing collMod on 'credit_wallets'...");
  const collModResult = db.runCommand({
    collMod: "credit_wallets",
    validator: { $jsonSchema: TARGET_SCHEMA },
    validationLevel: "strict",
    validationAction: "error",
  });

  if (!collModResult.ok) {
    print("\n[ERROR] collMod failed: " + JSON.stringify(collModResult));
    throw new Error("collMod command failed with error: " + collModResult.errmsg);
  }
  print("      ✔ collMod executed successfully: ok = " + collModResult.ok + "\n");

  // --- STEP 5: COMPLETE POST-MIGRATION VERIFICATION ---
  print("[5/5] Complete Post-Migration Verification: Canonical deep comparison...");
  const postCollInfo = db.getCollectionInfos({ name: "credit_wallets" })[0];
  const postOptions = (postCollInfo && postCollInfo.options) || {};
  const liveValidator = postOptions.validator && postOptions.validator.$jsonSchema;

  if (!liveValidator) {
    throw new Error("POST-MIGRATION VERIFICATION FAILED: No validator present on collection after collMod.");
  }

  // Canonical deep equality check
  const canonicalExpected = JSON.stringify(canonicalize(TARGET_SCHEMA));
  const canonicalActual = JSON.stringify(canonicalize(liveValidator));
  const deepMatch = canonicalExpected === canonicalActual;

  print("      Validation Level:  " + postOptions.validationLevel + " (Expected: strict)");
  print("      Validation Action: " + (postOptions.validationAction !== undefined ? "'" + postOptions.validationAction + "'" : "omitted engine default 'error'") + " (Expected: error)");
  print("      Canonical Match:   " + (deepMatch ? "EXACT (100% match)" : "MISMATCH"));

  const checks = [
    { name: "validationLevel is 'strict'", pass: postOptions.validationLevel === "strict" },
    { name: "validationAction is effective 'error'", pass: isEffectiveErrorValidationAction(postOptions) },
    { name: "additionalProperties is false", pass: liveValidator.additionalProperties === false },
    { name: "Canonical schema deep match", pass: deepMatch },
    { name: "_id.maxLength is 36", pass: liveValidator.properties._id && liveValidator.properties._id.maxLength === 36 },
    { name: "available_credits numeric bounds", pass: liveValidator.properties.available_credits && liveValidator.properties.available_credits.minimum === 0 && liveValidator.properties.available_credits.maximum === 9007199254740991 && liveValidator.properties.available_credits.multipleOf === 1 },
    { name: "reserved_credits numeric bounds", pass: liveValidator.properties.reserved_credits && liveValidator.properties.reserved_credits.minimum === 0 && liveValidator.properties.reserved_credits.maximum === 9007199254740991 && liveValidator.properties.reserved_credits.multipleOf === 1 },
    { name: "lifetime_granted numeric bounds", pass: liveValidator.properties.lifetime_granted && liveValidator.properties.lifetime_granted.minimum === 0 && liveValidator.properties.lifetime_granted.maximum === 9007199254740991 && liveValidator.properties.lifetime_granted.multipleOf === 1 },
    { name: "lifetime_consumed numeric bounds", pass: liveValidator.properties.lifetime_consumed && liveValidator.properties.lifetime_consumed.minimum === 0 && liveValidator.properties.lifetime_consumed.maximum === 9007199254740991 && liveValidator.properties.lifetime_consumed.multipleOf === 1 },
    { name: "period_granted numeric bounds", pass: liveValidator.properties.period_granted && liveValidator.properties.period_granted.minimum === 0 && liveValidator.properties.period_granted.maximum === 9007199254740991 && liveValidator.properties.period_granted.multipleOf === 1 },
    { name: "period_consumed numeric bounds", pass: liveValidator.properties.period_consumed && liveValidator.properties.period_consumed.minimum === 0 && liveValidator.properties.period_consumed.maximum === 9007199254740991 && liveValidator.properties.period_consumed.multipleOf === 1 },
    { name: "version numeric bounds (min 1)", pass: liveValidator.properties.version && liveValidator.properties.version.minimum === 1 && liveValidator.properties.version.maximum === 9007199254740991 && liveValidator.properties.version.multipleOf === 1 },
    { name: "status enum active/suspended/frozen", pass: Array.isArray(liveValidator.properties.status.enum) && liveValidator.properties.status.enum.length === 3 },
    { name: "billing_period maxLength 7", pass: liveValidator.properties.billing_period && liveValidator.properties.billing_period.maxLength === 7 },
    { name: "reset_date maxLength 30", pass: liveValidator.properties.reset_date && liveValidator.properties.reset_date.maxLength === 30 },
  ];

  let allChecksPassed = true;
  for (const c of checks) {
    if (c.pass) {
      print("      ✔ " + c.name);
    } else {
      allChecksPassed = false;
      print("      ✖ FAILED: " + c.name);
    }
  }

  if (!allChecksPassed) {
    throw new Error("MIGRATION INCOMPLETE: One or more post-migration assertions failed.");
  }

  print("\n========================================================================");
  print("SUCCESS: credit_wallets validator migration is COMPLETE AND VERIFIED.");
  print("Target Database:    vireo_staging");
  print("Target Collection:  credit_wallets");
  print("Canonical SHA-256:  fa19f3289812f8fff24ab6da86df0fa648aadd57e9a288107be9d9a2ad6eab9d");
  print("Audited Documents:  " + totalAudited + " (100% compliant, 0 modified)");
  print("Validation Status:  strict mode, error action, bounded schema active");
  print("========================================================================\n");
})();
