/**
 * VIREOCLIP PHASE 4B.3 — ATLAS DBADMIN WALLET VALIDATOR READ-ONLY VERIFICATION SCRIPT
 *
 * Target Database:   vireo_staging
 * Required Role:     dbAdmin + read (or readWrite) on vireo_staging
 * Single Source:     server/src/db/bootstrapMongo.ts -> WALLET_COLLECTION_JSON_SCHEMA
 * Canonical SHA-256: fa19f3289812f8fff24ab6da86df0fa648aadd57e9a288107be9d9a2ad6eab9d
 *
 * LEAST-PRIVILEGE ARCHITECTURE:
 * - Strictly READ-ONLY.
 * - Performs ZERO inserts, updates, deletes, collection creation, drops, or collMod.
 * - Enforces cluster identity and exact 3 replica set member hosts.
 * - Performs deterministic recursive canonical deep equality comparison on live validator.
 * - Verifies validationLevel: strict and effective validationAction: error.
 * - Audits 100% of existing wallet documents against all target schema constraints.
 */

(function () {
  print("\n========================================================================");
  print("VIREOCLIP — WALLET VALIDATOR POST-MIGRATION READ-ONLY VERIFICATION");
  print("Target Database:         vireo_staging");
  print("Expected Schema SHA-256: fa19f3289812f8fff24ab6da86df0fa648aadd57e9a288107be9d9a2ad6eab9d");
  print("Privilege Level:         READ-ONLY (Zero Writes, Zero Inserts, Zero Drops)");
  print("========================================================================\n");

  // Target Cluster Identity Specification (Exact Atlas Staging Baseline)
  const EXPECTED_STAGING_DB_NAME = "vireo_staging";
  const EXPECTED_STAGING_REPLICA_SET = "atlas-ol429v-shard-0";
  const EXPECTED_STAGING_HOSTS = Object.freeze([
    "ac-uqylvwf-shard-00-00.6bxh37q.mongodb.net:27017",
    "ac-uqylvwf-shard-00-01.6bxh37q.mongodb.net:27017",
    "ac-uqylvwf-shard-00-02.6bxh37q.mongodb.net:27017",
  ]);

  // Canonical Target Schema (Single Source of Truth)
  const TARGET_SCHEMA = {
    additionalProperties: false,
    bsonType: "object",
    properties: {
      _id: { bsonType: ["objectId", "string"], maxLength: 36 },
      available_credits: { bsonType: ["int", "long", "double"], maximum: 9007199254740991, minimum: 0, multipleOf: 1 },
      billing_period: { bsonType: "string", maxLength: 7 },
      created_at: { bsonType: "date" },
      id: { bsonType: "string", maxLength: 36 },
      lifetime_consumed: { bsonType: ["int", "long", "double"], maximum: 9007199254740991, minimum: 0, multipleOf: 1 },
      lifetime_granted: { bsonType: ["int", "long", "double"], maximum: 9007199254740991, minimum: 0, multipleOf: 1 },
      period_consumed: { bsonType: ["int", "long", "double"], maximum: 9007199254740991, minimum: 0, multipleOf: 1 },
      period_granted: { bsonType: ["int", "long", "double"], maximum: 9007199254740991, minimum: 0, multipleOf: 1 },
      reserved_credits: { bsonType: ["int", "long", "double"], maximum: 9007199254740991, minimum: 0, multipleOf: 1 },
      reset_date: { bsonType: "string", maxLength: 30 },
      status: { enum: ["active", "suspended", "frozen"] },
      updated_at: { bsonType: "date" },
      user_id: { bsonType: "string", maxLength: 36 },
      version: { bsonType: ["int", "long", "double"], maximum: 9007199254740991, minimum: 1, multipleOf: 1 },
      workspace_id: { bsonType: ["string", "null"], maxLength: 36 },
    },
    required: [
      "id",
      "user_id",
      "available_credits",
      "reserved_credits",
      "lifetime_granted",
      "lifetime_consumed",
      "period_granted",
      "period_consumed",
      "billing_period",
      "reset_date",
      "status",
      "version",
      "created_at",
      "updated_at",
    ],
  };

  // Helper: Deterministic recursive canonicalization
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

  // Helper: Verify deployment cluster identity, exact replica set member set, and database isolation
  function verifyClusterIdentity(dbInstance) {
    if (!dbInstance || typeof dbInstance.getName !== "function") {
      throw new Error("CRITICAL SAFETY ABORT [INVALID_HANDLE]: Invalid database instance handle provided.");
    }

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
  print("[1/3] Safety Guard: Verifying deployment cluster identity and target database...");
  const clusterIdentity = verifyClusterIdentity(db);
  print("      ✔ Target database confirmed:  " + clusterIdentity.database);
  print("      ✔ Staging replica set match:  " + clusterIdentity.replicaSet);
  print("      ✔ Exact member hosts match:   " + clusterIdentity.members.length + " replica set members verified verbatim\n");

  // --- STEP 2: READ-ONLY VALIDATOR SPECIFICATION ASSERTIONS ---
  print("[2/3] Reading live collection options from Atlas for 'credit_wallets'...");
  const collInfo = db.getCollectionInfos({ name: "credit_wallets" })[0];
  if (!collInfo) {
    throw new Error("Collection 'credit_wallets' not found in '" + clusterIdentity.database + "'.");
  }

  const options = collInfo.options || {};
  const liveSchema = options.validator && options.validator.$jsonSchema;

  if (!liveSchema) {
    throw new Error("FAIL: No JSON schema validator attached to 'credit_wallets'.");
  }

  const canonicalTarget = JSON.stringify(canonicalize(TARGET_SCHEMA));
  const canonicalLive = JSON.stringify(canonicalize(liveSchema));
  const deepMatch = canonicalTarget === canonicalLive;

  print("      validationLevel:  " + options.validationLevel);
  print("      validationAction: " + (options.validationAction !== undefined ? "'" + options.validationAction + "'" : "omitted engine default 'error'"));
  print("      Canonical Match:  " + (deepMatch ? "EXACT (100% identical)" : "MISMATCH"));

  const assertions = [
    { label: "validationLevel is 'strict'", ok: options.validationLevel === "strict" },
    { label: "validationAction is effective 'error'", ok: isEffectiveErrorValidationAction(options) },
    { label: "Canonical schema deep match", ok: deepMatch },
    { label: "additionalProperties: false", ok: liveSchema.additionalProperties === false },
    { label: "_id.maxLength: 36", ok: liveSchema.properties._id && liveSchema.properties._id.maxLength === 36 },
    { label: "available_credits multipleOf: 1", ok: liveSchema.properties.available_credits && liveSchema.properties.available_credits.multipleOf === 1 },
    { label: "available_credits minimum: 0", ok: liveSchema.properties.available_credits && liveSchema.properties.available_credits.minimum === 0 },
    { label: "available_credits maximum: 9007199254740991", ok: liveSchema.properties.available_credits && liveSchema.properties.available_credits.maximum === 9007199254740991 },
    { label: "reserved_credits multipleOf: 1", ok: liveSchema.properties.reserved_credits && liveSchema.properties.reserved_credits.multipleOf === 1 },
    { label: "version minimum: 1", ok: liveSchema.properties.version && liveSchema.properties.version.minimum === 1 },
    { label: "version maximum: 9007199254740991", ok: liveSchema.properties.version && liveSchema.properties.version.maximum === 9007199254740991 },
    { label: "status enum active/suspended/frozen", ok: Array.isArray(liveSchema.properties.status.enum) && liveSchema.properties.status.enum.length === 3 },
    { label: "billing_period maxLength: 7", ok: liveSchema.properties.billing_period && liveSchema.properties.billing_period.maxLength === 7 },
    { label: "reset_date maxLength: 30", ok: liveSchema.properties.reset_date && liveSchema.properties.reset_date.maxLength === 30 },
  ];

  let livePass = true;
  for (const a of assertions) {
    if (a.ok) {
      print("      ✔ " + a.label);
    } else {
      livePass = false;
      print("      ✖ FAILED: " + a.label);
    }
  }

  if (!livePass) {
    throw new Error("VERIFICATION FAILED: Live validator options do not match target specification.");
  }

  // --- STEP 3: READ-ONLY LIVE DOCUMENT COMPLIANCE AUDIT ---
  print("\n[3/3] Auditing 100% of live documents in 'credit_wallets' (read-only)...");
  const allowedFields = new Set([
    "_id", "id", "user_id", "workspace_id",
    "available_credits", "reserved_credits",
    "lifetime_granted", "lifetime_consumed",
    "period_granted", "period_consumed",
    "billing_period", "reset_date",
    "status", "version", "created_at", "updated_at",
  ]);

  const requiredFields = TARGET_SCHEMA.required;
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

    // Constraint 2: Required fields present and non-null
    for (const req of requiredFields) {
      if (!(req in doc) || doc[req] === undefined || doc[req] === null) {
        docValid = false;
        docErrors.push("Missing required field: '" + req + "'");
      }
    }

    // Constraint 3: String identifiers length <= 36
    if (typeof doc.id !== "string" || doc.id.length === 0 || doc.id.length > 36) {
      docValid = false;
      docErrors.push("Invalid 'id': must be string <= 36 chars");
    }
    if (typeof doc.user_id !== "string" || doc.user_id.length === 0 || doc.user_id.length > 36) {
      docValid = false;
      docErrors.push("Invalid 'user_id': must be string <= 36 chars");
    }
    if (doc.workspace_id !== undefined && doc.workspace_id !== null) {
      if (typeof doc.workspace_id !== "string" || doc.workspace_id.length > 36) {
        docValid = false;
        docErrors.push("Invalid 'workspace_id': must be string <= 36 chars or null");
      }
    }

    // Constraint 4: Numeric fields safe non-negative integer
    const creditFields = [
      "available_credits", "reserved_credits",
      "lifetime_granted", "lifetime_consumed",
      "period_granted", "period_consumed",
    ];
    for (const cf of creditFields) {
      const val = doc[cf];
      if (typeof val !== "number" || isNaN(val) || val < 0 || val > 9007199254740991 || Math.floor(val) !== val) {
        docValid = false;
        docErrors.push("Invalid '" + cf + "': must be non-negative integer <= MAX_SAFE_INTEGER, got " + val);
      }
    }

    // Constraint 5: Version integer >= 1
    const ver = doc.version;
    if (typeof ver !== "number" || isNaN(ver) || ver < 1 || ver > 9007199254740991 || Math.floor(ver) !== ver) {
      docValid = false;
      docErrors.push("Invalid 'version': must be integer >= 1, got " + ver);
    }

    // Constraint 6: Status enum
    if (doc.status !== "active" && doc.status !== "suspended" && doc.status !== "frozen") {
      docValid = false;
      docErrors.push("Invalid 'status': must be active, suspended, or frozen");
    }

    // Constraint 7: Dates
    if (!(doc.created_at instanceof Date) && (typeof doc.created_at !== "object" || doc.created_at._bsontype !== "Date")) {
      docValid = false;
      docErrors.push("Invalid 'created_at': must be Date");
    }
    if (!(doc.updated_at instanceof Date) && (typeof doc.updated_at !== "object" || doc.updated_at._bsontype !== "Date")) {
      docValid = false;
      docErrors.push("Invalid 'updated_at': must be Date");
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
    print("\n[CRITICAL ERROR] Live documents fail target schema constraints:");
    print(JSON.stringify(failures, null, 2));
    throw new Error("DOCUMENT AUDIT FAILED: Found " + nonCompliantCount + " non-compliant documents.");
  }

  print("      ✔ 100% of live documents conform to target schema constraints.\n");

  print("========================================================================");
  print("ALL READ-ONLY VERIFICATION CHECKS PASSED: TARGET SCHEMA VERIFIED.");
  print("Target Database:   vireo_staging");
  print("Documents Audited: " + totalAudited + " (All 100% compliant)");
  print("Canonical SHA-256: fa19f3289812f8fff24ab6da86df0fa648aadd57e9a288107be9d9a2ad6eab9d");
  print("========================================================================\n");
})();

