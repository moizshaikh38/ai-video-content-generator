/**
 * VIREOCLIP PHASE 4B.3 — ATLAS DBADMIN WALLET VALIDATOR EMERGENCY ROLLBACK SCRIPT
 *
 * Target Database:   vireo_staging
 * Target Collection: credit_wallets
 * Required Role:     dbAdmin or dbOwner on vireo_staging (or atlasAdmin)
 * Generated From:    server/src/db/bootstrapMongo.ts & Audited Legacy Atlas State Baseline
 * Canonical SHA-256: fa19f3289812f8fff24ab6da86df0fa648aadd57e9a288107be9d9a2ad6eab9d
 *
 * DO NOT EXECUTE UNLESS AN EMERGENCY ROLLBACK TO THE LEGACY VALIDATOR IS REQUIRED.
 *
 * SAFETY GUARD RULES:
 * 1. Cluster Identity & Database Guard: Aborts if not connected to 'vireo_staging' on the authorized staging Atlas replica set.
 * 2. Already-Legacy Guard: Aborts if collection already has the legacy validator.
 * 3. Unexpected-Schema Guard: Aborts if collection does not match the expected target new schema.
 * 4. Validation Level/Action Guard: Aborts if validationLevel is not 'strict' or validationAction is not 'error'.
 * 5. Post-Rollback Verification: Asserts restored schema exactly matches audited legacy baseline.
 */

(function () {
  print("\n========================================================================");
  print("VIREOCLIP — WALLET VALIDATOR EMERGENCY ROLLBACK TO LEGACY SCHEMA");
  print("Target Database:         vireo_staging");
  print("Target Collection:       credit_wallets");
  print("Expected Target SHA-256: fa19f3289812f8fff24ab6da86df0fa648aadd57e9a288107be9d9a2ad6eab9d");
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
  print("[1/4] Safety Guard: Verifying deployment cluster identity and target database...");
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

  // --- STEP 2: ROLLBACK STATE GUARD ---
  print("[2/4] Rollback State Guard: Verifying live validator is the expected new schema...");
  const preCollInfo = db.getCollectionInfos({ name: "credit_wallets" })[0];
  const preOptions = (preCollInfo && preCollInfo.options) || {};
  const liveValidator = preOptions.validator;

  if (!liveValidator) {
    throw new Error("ROLLBACK STATE GUARD ABORT: No validator present on collection 'credit_wallets'.");
  }

  const TARGET_NEW_VALIDATOR = { $jsonSchema: {"additionalProperties":false,"bsonType":"object","properties":{"_id":{"bsonType":["objectId","string"],"maxLength":36},"available_credits":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"billing_period":{"bsonType":"string","maxLength":7},"created_at":{"bsonType":"date"},"id":{"bsonType":"string","maxLength":36},"lifetime_consumed":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"lifetime_granted":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"period_consumed":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"period_granted":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"reserved_credits":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":0,"multipleOf":1},"reset_date":{"bsonType":"string","maxLength":30},"status":{"enum":["active","suspended","frozen"]},"updated_at":{"bsonType":"date"},"user_id":{"bsonType":"string","maxLength":36},"version":{"bsonType":["int","long","double"],"maximum":9007199254740991,"minimum":1,"multipleOf":1},"workspace_id":{"bsonType":["string","null"],"maxLength":36}},"required":["id","user_id","available_credits","reserved_credits","lifetime_granted","lifetime_consumed","period_granted","period_consumed","billing_period","reset_date","status","version","created_at","updated_at"]} };
  const EXPECTED_LEGACY_VALIDATOR = {"$jsonSchema":{"bsonType":"object","properties":{"clip_id":{"bsonType":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},"created_at":{"bsonType":"date"},"id":{"bsonType":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},"project_id":{"bsonType":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"},"updated_at":{"bsonType":"date"},"user_id":{"bsonType":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"}},"required":["id","user_id"]}};

  const liveCanon = JSON.stringify(canonicalize(liveValidator));
  const newCanon = JSON.stringify(canonicalize(TARGET_NEW_VALIDATOR));
  const legacyCanon = JSON.stringify(canonicalize(EXPECTED_LEGACY_VALIDATOR));

  // Check A: Is it already legacy?
  if (liveCanon === legacyCanon) {
    throw new Error(
      "ROLLBACK STATE GUARD ABORT: Collection 'credit_wallets' is ALREADY using the legacy validator. Rollback will not be executed."
    );
  }

  // Check B: Does it match the expected new schema?
  if (liveCanon !== newCanon) {
    print("\n[ROLLBACK STATE GUARD FAILURE: UNEXPECTED LIVE VALIDATOR]");
    print("Live validator JSON (canonicalized):");
    print(liveCanon);
    print("\nExpected new validator JSON (canonicalized):");
    print(newCanon);
    throw new Error(
      "ROLLBACK STATE GUARD ABORT: Live validator does not match the expected new schema. Cannot rollback an unexpected or corrupted schema state."
    );
  }

  // Check C: validationLevel must be strict
  if (preOptions.validationLevel !== "strict") {
    throw new Error(
      "ROLLBACK STATE GUARD ABORT: Expected live validationLevel 'strict', found: '" + preOptions.validationLevel + "'."
    );
  }

  // Check D: validationAction must be effective 'error' via exact helper
  if (!isEffectiveErrorValidationAction(preOptions)) {
    throw new Error(
      "ROLLBACK STATE GUARD ABORT: Expected live validationAction 'error' (omitted engine default or explicit 'error'), but found: '" +
        preOptions.validationAction +
        "'."
    );
  }

  print("      ✔ Confirmed: Live collection is currently enforcing the expected new schema.");
  print("      ✔ Confirmed: validationLevel is 'strict' and effective validationAction is 'error'.");
  print("      ✔ Rollback State Guard passed: Permitted to revert to legacy baseline.\n");

  // --- STEP 3: EXECUTE ROLLBACK COLLMOD ---
  print("[3/4] Reverting collection 'credit_wallets' to exact legacy Atlas validator...");
  const rollbackResult = db.runCommand({
    collMod: "credit_wallets",
    validator: EXPECTED_LEGACY_VALIDATOR,
    validationLevel: "strict",
  });

  if (!rollbackResult.ok) {
    throw new Error("Rollback collMod failed: " + rollbackResult.errmsg);
  }
  print("      ✔ Rollback collMod acknowledged: ok = " + rollbackResult.ok + "\n");

  // --- STEP 4: POST-ROLLBACK VERIFICATION ---
  print("[4/4] Verifying reverted collection options...");
  const postCollInfo = db.getCollectionInfos({ name: "credit_wallets" })[0];
  const postOptions = (postCollInfo && postCollInfo.options) || {};
  const revertedCanon = JSON.stringify(canonicalize(postOptions.validator));

  if (revertedCanon !== legacyCanon) {
    throw new Error("POST-ROLLBACK VERIFICATION FAILED: Reverted validator does not match audited legacy baseline.");
  }
  if (postOptions.validationLevel !== "strict") {
    throw new Error("POST-ROLLBACK VERIFICATION FAILED: Reverted validationLevel is not 'strict'.");
  }

  if (!isEffectiveErrorValidationAction(postOptions)) {
    throw new Error(
      "POST-ROLLBACK VERIFICATION FAILED: Reverted validationAction is not effective 'error'. Found: '" +
        postOptions.validationAction +
        "'."
    );
  }

  print("      ✔ Reverted validator matches legacy baseline 100%.");
  print("      ✔ Reverted validationLevel is 'strict'.");
  print("      ✔ Reverted validationAction verified: effective 'error' (stored: " + (postOptions.validationAction !== undefined ? "'" + postOptions.validationAction + "'" : "omitted engine default 'error'") + ").\n");

  print("========================================================================");
  print("SUCCESS: EMERGENCY ROLLBACK TO LEGACY VALIDATOR COMPLETED AND VERIFIED.");
  print("Target Database:   vireo_staging");
  print("Target Collection: credit_wallets");
  print("Status:            Restored to legacy baseline successfully.");
  print("========================================================================\n");
})();
