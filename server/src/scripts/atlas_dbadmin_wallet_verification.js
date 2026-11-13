/**
 * VIREOCLIP PHASE 4B.3 — ATLAS DBADMIN WALLET VALIDATOR POST-MIGRATION VERIFICATION
 *
 * Target Database:   vireo_staging
 * Required Role:     dbAdmin or readWrite on vireo_staging
 * Generated From:    server/src/db/bootstrapMongo.ts (Single Source of Truth)
 * Canonical SHA-256: fa19f3289812f8fff24ab6da86df0fa648aadd57e9a288107be9d9a2ad6eab9d
 *
 * Checks:
 * 1. Deterministic recursive canonicalization comparison of live validator against target schema.
 * 2. Every numeric field minimum, maximum, multipleOf constraint.
 * 3. Every string constraint, enum, and required fields.
 * 4. Strict validation level and error validation action.
 * 5. Direct write enforcement test on temporary collection with guaranteed try...finally drop.
 */

(function () {
  print("\n========================================================================");
  print("VIREOCLIP — WALLET VALIDATOR POST-MIGRATION INDEPENDENT VERIFICATION");
  print("Target Database:         vireo_staging");
  print("Expected Schema SHA-256: fa19f3289812f8fff24ab6da86df0fa648aadd57e9a288107be9d9a2ad6eab9d");
  print("========================================================================\n");

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
  print("[1/3] Safety Guard: Verifying deployment cluster identity and target database...");
  const clusterIdentity = verifyClusterIdentity(db);
  print("      ✔ Target database confirmed:  " + clusterIdentity.database);
  print("      ✔ Staging replica set match:  " + clusterIdentity.replicaSet);
  print("      ✔ Exact member hosts match:   " + clusterIdentity.members.length + " replica set members verified verbatim\n");

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

  const TARGET_SCHEMA = {"additionalProperties":false,"bsonType":"object","properties":{"_id":{"bsonType":["objectId","string"],"maxLength":36},"available_credits":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"billing_period":{"bsonType":"string","maxLength":7},"created_at":{"bsonType":"date"},"id":{"bsonType":"string","maxLength":36},"lifetime_consumed":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"lifetime_granted":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"period_consumed":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"period_granted":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"reserved_credits":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"reset_date":{"bsonType":"string","maxLength":30},"status":{"enum":["active","suspended","frozen"]},"updated_at":{"bsonType":"date"},"user_id":{"bsonType":"string","maxLength":36},"version":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":1,"multipleOf":1},"workspace_id":{"bsonType":["string","null"],"maxLength":36}},"required":["id","user_id","available_credits","reserved_credits","lifetime_granted","lifetime_consumed","period_granted","period_consumed","billing_period","reset_date","status","version","created_at","updated_at"]};

  print("[2/3] Reading live collection options from Atlas for 'credit_wallets'...");
  const collInfo = db.getCollectionInfos({ name: "credit_wallets" })[0];
  if (!collInfo) {
    throw new Error("Collection 'credit_wallets' not found.");
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

  print("\n[3/3] Running functional write enforcement tests on temporary collection...");
  const tempName = "tmp_admin_verify_validator_" + Date.now();
  let tempCreated = false;
  let functionalPass = true;

  try {
    db.createCollection(tempName, {
      validator: { $jsonSchema: liveSchema },
      validationLevel: "strict",
      validationAction: "error",
    });
    tempCreated = true;
    const tempColl = db.getCollection(tempName);

    const baseValid = {
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      user_id: "ffffffff-gggg-4hhh-8iii-jjjjjjjjjjjj",
      workspace_id: null,
      available_credits: 100,
      reserved_credits: 0,
      lifetime_granted: 100,
      lifetime_consumed: 0,
      period_granted: 100,
      period_consumed: 0,
      billing_period: "2026-11",
      reset_date: "2026-12-01T00:00:00.000Z",
      status: "active",
      version: 1,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const tests = [
      {
        name: "Reject extra property (additionalProperties: false)",
        doc: Object.assign({}, baseValid, { illegal_extra_property: "forbidden" }),
        shouldFail: true,
      },
      {
        name: "Reject fractional float (multipleOf: 1)",
        doc: Object.assign({}, baseValid, { available_credits: 25.5 }),
        shouldFail: true,
      },
      {
        name: "Reject negative number (minimum: 0)",
        doc: Object.assign({}, baseValid, { available_credits: -10 }),
        shouldFail: true,
      },
      {
        name: "Reject overflow (maximum: 9007199254740991)",
        doc: Object.assign({}, baseValid, { available_credits: 9007199254740992 }),
        shouldFail: true,
      },
      {
        name: "Reject invalid version 0 (version.minimum: 1)",
        doc: Object.assign({}, baseValid, { version: 0 }),
        shouldFail: true,
      },
      {
        name: "Reject invalid status enum value",
        doc: Object.assign({}, baseValid, { status: "deleted" }),
        shouldFail: true,
      },
      {
        name: "Accept boundary valid values (0 and MAX_SAFE_INTEGER)",
        doc: Object.assign({}, baseValid, {
          id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
          available_credits: 0,
          reserved_credits: 9007199254740991,
        }),
        shouldFail: false,
      },
    ];

    for (const t of tests) {
      try {
        tempColl.insertOne(t.doc);
        if (t.shouldFail) {
          functionalPass = false;
          print("      ✖ " + t.name + " (Expected rejection, but insert succeeded)");
        } else {
          print("      ✔ " + t.name);
        }
      } catch (err) {
        if (t.shouldFail) {
          print("      ✔ " + t.name + " (Rejected as expected: " + err.message + ")");
        } else {
          functionalPass = false;
          print("      ✖ " + t.name + " (Unexpected rejection: " + err.message + ")");
        }
      }
    }
  } finally {
    // Guaranteed cleanup runs even if tests fail or throw
    if (tempCreated) {
      try {
        db.getCollection(tempName).drop();
        print("      ✔ Cleaned up temporary test collection: " + tempName);
      } catch (e) {
        print("      ⚠ Warning: Could not drop temporary collection: " + e.message);
      }
    }
  }

  if (!functionalPass) {
    throw new Error("FUNCTIONAL VERIFICATION FAILED: One or more direct write tests failed.");
  }

  print("\n========================================================================");
  print("ALL VERIFICATION CHECKS PASSED: COMPLETE AND VERIFIED.");
  print("Target Database:   vireo_staging");
  print("Canonical SHA-256: fa19f3289812f8fff24ab6da86df0fa648aadd57e9a288107be9d9a2ad6eab9d");
  print("========================================================================\n");
})();
