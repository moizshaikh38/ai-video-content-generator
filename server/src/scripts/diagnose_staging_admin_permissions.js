/**
 * VIREOCLIP PHASE 4B.3 — MIGRATION ADMIN PERMISSION DIAGNOSTIC HARNESS
 *
 * Target Database:   vireo_staging
 * Target Collection: credit_wallets
 * User:              vireo_staging_migration_admin
 * 
 * STRICT RESTRICTIONS:
 * - 100% Read-Only inspection.
 * - Zero database writes, zero collMod, zero schema changes.
 * - Inspects connectionStatus (roles, privileges), topology, and runs a single findOne().
 */

(function () {
  print("\n========================================================================");
  print("VIREOCLIP — MIGRATION ADMIN AUTHENTICATION & PERMISSIONS DIAGNOSIS");
  print("Target Database: vireo_staging");
  print("User:            vireo_staging_migration_admin");
  print("========================================================================\n");

  // 1. Inspect Topology and Current Connection
  print("[1] Topology & Connection Context:");
  let hello;
  try {
    hello = db.runCommand({ hello: 1 });
  } catch (e) {
    hello = db.runCommand({ isMaster: 1 });
  }
  print("    Connected Database: " + db.getName());
  print("    Replica Set:        " + (hello.setName || "N/A"));
  print("    Primary Host:       " + (hello.primary || "N/A"));
  print("    Connected Host (me):" + (hello.me || "N/A"));
  print("    Cluster Hosts:      " + JSON.stringify(hello.hosts || []));

  // 2. Run connectionStatus with showPrivileges: true
  print("\n[2] Authenticated Connection Status (connectionStatus):");
  const connStatus = db.runCommand({ connectionStatus: 1, showPrivileges: true });
  const authInfo = connStatus.authInfo || {};
  const authUsers = authInfo.authenticatedUsers || [];
  const authRoles = authInfo.authenticatedUserRoles || [];
  const authPrivileges = authInfo.authenticatedUserPrivileges || [];

  print("    Authenticated Users:");
  print(JSON.stringify(authUsers, null, 2));

  print("\n    Authenticated User Roles:");
  print(JSON.stringify(authRoles, null, 2));

  // 3. Analyze Roles for vireo_staging
  print("\n[3] Role Verification Analysis:");
  const hasDbAdminStaging = authRoles.some(function (r) {
    return r.role === "dbAdmin" && r.db === "vireo_staging";
  });
  const hasReadStaging = authRoles.some(function (r) {
    return r.role === "read" && r.db === "vireo_staging";
  });
  const hasReadWriteStaging = authRoles.some(function (r) {
    return r.role === "readWrite" && r.db === "vireo_staging";
  });
  const hasReadAnyDb = authRoles.some(function (r) {
    return r.role === "readAnyDatabase";
  });
  const hasDbAdminAnyDb = authRoles.some(function (r) {
    return r.role === "dbAdminAnyDatabase";
  });

  print("    - dbAdmin @ vireo_staging:  " + (hasDbAdminStaging ? "YES ✅" : "NO ❌"));
  print("    - read @ vireo_staging:     " + (hasReadStaging ? "YES ✅" : "NO ❌"));
  print("    - readWrite @ vireo_staging:" + (hasReadWriteStaging ? "YES" : "NO"));
  print("    - readAnyDatabase:          " + (hasReadAnyDb ? "YES" : "NO"));
  print("    - dbAdminAnyDatabase:       " + (hasDbAdminAnyDb ? "YES" : "NO"));

  // Check for common scoping errors
  const rolesInOtherDbs = authRoles.filter(function (r) {
    return r.db !== "vireo_staging";
  });
  if (rolesInOtherDbs.length > 0) {
    print("\n    ⚠️ Roles scoped to OTHER databases:");
    for (const r of rolesInOtherDbs) {
      print("       • Role '" + r.role + "' on database '" + r.db + "'");
    }
  }

  // 4. Action Privilege Audit for 'find'
  print("\n[4] Effective Privilege Audit for action [find]:");
  let canFindOnWallets = false;
  let canFindAnywhereInStaging = false;

  for (const priv of authPrivileges) {
    const resource = priv.resource || {};
    const actions = priv.actions || [];
    const hasFindAction = actions.includes("find");

    if (hasFindAction) {
      if (resource.db === "vireo_staging" && (resource.collection === "credit_wallets" || resource.collection === "")) {
        canFindOnWallets = true;
        if (resource.collection === "") canFindAnywhereInStaging = true;
      }
      if (resource.cluster === true || resource.db === "") {
        canFindOnWallets = true;
      }
    }
  }
  print("    - 'find' on vireo_staging.credit_wallets: " + (canFindOnWallets ? "PERMITTED ✅" : "DENIED ❌"));
  print("    - 'find' on any collection in vireo_staging: " + (canFindAnywhereInStaging ? "PERMITTED ✅" : "DENIED ❌"));

  // 5. Harmless Read Test (findOne)
  print("\n[5] Harmless Live Read Test: db.credit_wallets.findOne({}, { _id: 1 }):");
  try {
    const sample = db.credit_wallets.findOne({}, { _id: 1, id: 1 });
    if (sample) {
      print("    ✔ SUCCESS: findOne() succeeded!");
      print("    Sample record ID: " + (sample.id || String(sample._id)));
    } else {
      print("    ✔ SUCCESS: findOne() returned null (collection empty)");
    }
  } catch (err) {
    print("    ❌ FAILED: findOne() threw exception:");
    print("       Name:    " + err.name);
    print("       Message: " + err.message);
    print("       Code:    " + err.code);
    print("       CodeName:" + (err.codeName || "N/A"));
  }

  // 6. Test listCollections (dbAdmin capability)
  print("\n[6] dbAdmin Capabilities Test (db.getCollectionNames()):");
  try {
    const colls = db.getCollectionNames();
    print("    ✔ SUCCESS: Accessible collections (" + colls.length + "): " + colls.join(", "));
  } catch (err) {
    print("    ❌ FAILED: listCollections failed: " + err.message);
  }

  print("\n========================================================================");
  print("DIAGNOSIS COMPLETE");
  print("========================================================================\n");
})();

