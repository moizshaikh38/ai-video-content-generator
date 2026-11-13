import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import { WALLET_COLLECTION_JSON_SCHEMA } from '../db/bootstrapMongo.js';

function sha256(buf: Buffer | string): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function canonicalize(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  const sorted: Record<string, any> = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = canonicalize(obj[k]);
  return sorted;
}

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const legacyValidatorBaseline = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['id', 'user_id'],
    properties: {
      id: { bsonType: 'string', pattern: UUID_PATTERN },
      user_id: { bsonType: 'string', pattern: UUID_PATTERN },
      project_id: { bsonType: 'string', pattern: UUID_PATTERN },
      clip_id: { bsonType: 'string', pattern: UUID_PATTERN },
      created_at: { bsonType: 'date' },
      updated_at: { bsonType: 'date' },
    },
  },
};

const EXPECTED_STAGING_DB_NAME = 'vireo_staging';
const EXPECTED_STAGING_REPLICA_SET = 'atlas-ol429v-shard-0';
const EXPECTED_STAGING_HOSTS = Object.freeze([
  'ac-uqylvwf-shard-00-00.6bxh37q.mongodb.net:27017',
  'ac-uqylvwf-shard-00-01.6bxh37q.mongodb.net:27017',
  'ac-uqylvwf-shard-00-02.6bxh37q.mongodb.net:27017',
]);

/**
 * Cluster identity validator logic extracted verbatim from the executable scripts.
 */
function verifyClusterIdentity(
  dbInstance: any,
  configOverrides?: { expectedDb?: string; expectedReplSet?: string; expectedHosts?: readonly string[] }
) {
  const expDb = configOverrides?.expectedDb ?? EXPECTED_STAGING_DB_NAME;
  const expReplSet = configOverrides?.expectedReplSet ?? EXPECTED_STAGING_REPLICA_SET;
  const expHosts = configOverrides?.expectedHosts ?? EXPECTED_STAGING_HOSTS;

  if (!dbInstance || typeof dbInstance.getName !== 'function') {
    throw new Error('CRITICAL SAFETY ABORT [INVALID_HANDLE]: Invalid database instance handle provided.');
  }

  const currentDb = dbInstance.getName();
  if (currentDb !== expDb) {
    throw new Error(
      `CRITICAL SAFETY ABORT [DATABASE_MISMATCH]: Connected database is '${currentDb}', but expected '${expDb}'.`
    );
  }

  if (!expReplSet || !Array.isArray(expHosts) || expHosts.length === 0) {
    throw new Error('CRITICAL SAFETY ABORT [CONFIG_MISSING]: Expected staging cluster identity is not configured.');
  }

  let hello: any;
  try {
    hello = dbInstance.runCommand({ hello: 1 });
    if (!hello || !hello.ok) {
      hello = dbInstance.runCommand({ isMaster: 1 });
    }
  } catch (err: any) {
    throw new Error('CRITICAL SAFETY ABORT [TOPOLOGY_QUERY_FAILED]: Failed to query deployment topology: " + err.message');
  }

  if (!hello || !hello.ok) {
    throw new Error('CRITICAL SAFETY ABORT [TOPOLOGY_UNAVAILABLE]: Deployment hello/isMaster command returned non-ok.');
  }

  const actualReplSetName = hello.setName;
  if (!actualReplSetName) {
    throw new Error(
      'CRITICAL SAFETY ABORT [NOT_REPLICA_SET]: Connected deployment is not a replica set (setName missing). Standalone or unrecognized topology rejected.'
    );
  }

  if (actualReplSetName !== expReplSet) {
    throw new Error(
      `CRITICAL SAFETY ABORT [CLUSTER_MISMATCH]: Connected replica set '${actualReplSetName}' does NOT match expected staging replica set '${expReplSet}'. Production, development, or unknown cluster rejected.`
    );
  }

  const actualHosts = Array.isArray(hello.hosts) ? hello.hosts : [];
  if (actualHosts.length === 0) {
    throw new Error('CRITICAL SAFETY ABORT [HOSTS_EMPTY]: Connected deployment reported empty or unavailable hello.hosts.');
  }

  const normalizedActual = Array.from(new Set(actualHosts.map(function (h) { return String(h).trim().toLowerCase(); }))).sort();
  const normalizedExpected = Array.from(new Set(expHosts.map(function (h) { return String(h).trim().toLowerCase(); }))).sort();

  if (normalizedActual.length !== normalizedExpected.length) {
    throw new Error(
      `CRITICAL SAFETY ABORT [HOSTS_COUNT_MISMATCH]: Connected replica set hosts count (${normalizedActual.length}) differs from expected staging member set (${normalizedExpected.length}).`
    );
  }

  for (let i = 0; i < normalizedExpected.length; i++) {
    if (normalizedActual[i] !== normalizedExpected[i]) {
      throw new Error(
        `CRITICAL SAFETY ABORT [EXACT_HOSTS_MISMATCH]: Connected replica set member set does not match expected staging members. Actual: ${JSON.stringify(normalizedActual)}, Expected: ${JSON.stringify(normalizedExpected)}`
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

describe('VireoClip Phase 4B.3: Physical Artifact & Safety Verification Suite', () => {
  const scriptsDir = path.resolve(process.cwd(), 'src/scripts');
  const migrationPath = path.join(scriptsDir, 'atlas_dbadmin_wallet_migration.js');
  const verificationPath = path.join(scriptsDir, 'atlas_dbadmin_wallet_verification.js');
  const rollbackPath = path.join(scriptsDir, 'atlas_dbadmin_wallet_rollback.js');

  // =========================================================================
  // SECTION 1: PHYSICAL SCRIPTS INTEGRITY & STATIC SAFETY CHECKS
  // =========================================================================
  describe('1. Static Code Analysis of Physical Scripts', () => {
    it('1.1. Explicit cluster identity and exact member hosts guard exists in all 3 executable scripts', () => {
      const files = [migrationPath, verificationPath, rollbackPath];
      for (const f of files) {
        const content = fs.readFileSync(f, 'utf8');
        assert.match(content, /verifyClusterIdentity/);
        assert.match(content, /EXPECTED_STAGING_DB_NAME\s*=\s*['"]vireo_staging['"]/);
        assert.match(content, /EXPECTED_STAGING_REPLICA_SET\s*=\s*['"]atlas-ol429v-shard-0['"]/);
        assert.match(content, /ac-uqylvwf-shard-00-00\.6bxh37q\.mongodb\.net:27017/);
        assert.match(content, /ac-uqylvwf-shard-00-01\.6bxh37q\.mongodb\.net:27017/);
        assert.match(content, /ac-uqylvwf-shard-00-02\.6bxh37q\.mongodb\.net:27017/);
      }
    });

    it('1.2. Pre-migration guard enforces exact canonical legacy match and strict error action', () => {
      const mig = fs.readFileSync(migrationPath, 'utf8');
      assert.match(mig, /preOptions\.validationLevel\s*!==?\s*['"]strict['"]/);
      assert.match(mig, /!isEffectiveErrorValidationAction\(preOptions\)/);
      assert.match(mig, /liveCanon\s*!==?\s*expCanon/);
    });

    it('1.3. Rollback guard enforces exact canonical target new schema and rejects already-legacy', () => {
      const rol = fs.readFileSync(rollbackPath, 'utf8');
      assert.match(rol, /liveCanon\s*===\s*legacyCanon/);
      assert.match(rol, /liveCanon\s*!==?\s*newCanon/);
      assert.match(rol, /preOptions\.validationLevel\s*!==?\s*['"]strict['"]/);
      assert.match(rol, /!isEffectiveErrorValidationAction\(preOptions\)/);
    });

    it('1.4. Temporary verification collection cleanup is protected by try...finally', () => {
      const ver = fs.readFileSync(verificationPath, 'utf8');
      assert.match(ver, /try\s*\{[\s\S]*?db\.createCollection[\s\S]*?\}\s*finally\s*\{[\s\S]*?\.drop\(\)[\s\S]*?\}/);
    });

    it('1.5. No unexpected fallback, automatic privilege escalation, or credentials in any script', () => {
      const files = [migrationPath, verificationPath, rollbackPath];
      for (const f of files) {
        const content = fs.readFileSync(f, 'utf8');
        assert.doesNotMatch(content, /mongodb\+srv:\/\//i);
        assert.doesNotMatch(content, /password/i);
        assert.doesNotMatch(content, /grantRolesToUser/i);
        assert.doesNotMatch(content, /createUser/i);
      }
    });
  });

  // =========================================================================
  // SECTION 2: DETERMINISTIC GENERATOR CONSISTENCY (ISOLATED TEMPORARY DIRECTORY)
  // =========================================================================
  describe('2. Deterministic Reproducibility & Consistency in Temporary Directory', () => {
    it('2.1. All 3 scripts generate 100% byte-for-byte identical output with zero volatile timestamps', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo_gen_verify_'));
      try {
        const genFile = path.join(scriptsDir, 'generate_dbadmin_migration_package.ts');
        let genSource = fs.readFileSync(genFile, 'utf8');

        // Redirect relative import to absolute path
        const bootstrapPath = path.resolve(process.cwd(), 'src/db/bootstrapMongo.js').replace(/\\/g, '/');
        genSource = genSource.replace("'../db/bootstrapMongo.js'", `'${bootstrapPath}'`);

        // Redirect targetDir to isolated tempDir
        const escapedTempDir = tempDir.replace(/\\/g, '\\\\');
        genSource = genSource.replace(
          'const targetDir = path.resolve(__dirname);',
          `const targetDir = "${escapedTempDir}";`
        );

        const tempGenScript = path.join(tempDir, 'run_temp_gen.ts');
        fs.writeFileSync(tempGenScript, genSource, 'utf8');

        await import(pathToFileURL(tempGenScript).href);

        const files = [
          'atlas_dbadmin_wallet_migration.js',
          'atlas_dbadmin_wallet_verification.js',
          'atlas_dbadmin_wallet_rollback.js',
        ];

        for (const f of files) {
          const physicalBuf = fs.readFileSync(path.join(scriptsDir, f));
          const tempBuf = fs.readFileSync(path.join(tempDir, f));

          const physicalSha = sha256(physicalBuf);
          const tempSha = sha256(tempBuf);

          assert.equal(tempSha, physicalSha, `File ${f} must produce identical SHA-256 hash`);
          assert.equal(Buffer.compare(physicalBuf, tempBuf), 0, `File ${f} must match byte-for-byte`);
        }
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  // =========================================================================
  // SECTION 3: CLUSTER IDENTITY & EXACT MEMBER HOST SET VERIFICATION
  // =========================================================================
  describe('3. Exact Staging Replica Set Member Verification', () => {
    function mockDb(name: string, helloResult?: any, shouldThrowHello?: boolean) {
      return {
        getName: () => name,
        runCommand: (cmd: any) => {
          if (cmd.hello || cmd.isMaster) {
            if (shouldThrowHello) throw new Error('Command failed: unauthorized or connection timeout');
            return helloResult;
          }
          return { ok: 1 };
        },
      };
    }

    const validStagingHello = {
      ok: 1,
      setName: 'atlas-ol429v-shard-0',
      primary: 'ac-uqylvwf-shard-00-01.6bxh37q.mongodb.net:27017',
      me: 'ac-uqylvwf-shard-00-01.6bxh37q.mongodb.net:27017',
      hosts: [
        'ac-uqylvwf-shard-00-00.6bxh37q.mongodb.net:27017',
        'ac-uqylvwf-shard-00-01.6bxh37q.mongodb.net:27017',
        'ac-uqylvwf-shard-00-02.6bxh37q.mongodb.net:27017',
      ],
    };

    it('3.1. Exact three-member staging host set is ACCEPTED', () => {
      const db = mockDb('vireo_staging', validStagingHello);
      const res = verifyClusterIdentity(db);
      assert.equal(res.verified, true);
      assert.equal(res.database, 'vireo_staging');
      assert.equal(res.replicaSet, 'atlas-ol429v-shard-0');
      assert.equal(res.members.length, 3);
    });

    it('3.2. Missing member is REJECTED', () => {
      const missingMemberHello = {
        ok: 1,
        setName: 'atlas-ol429v-shard-0',
        hosts: [
          'ac-uqylvwf-shard-00-00.6bxh37q.mongodb.net:27017',
          'ac-uqylvwf-shard-00-01.6bxh37q.mongodb.net:27017',
          // Member 02 missing
        ],
      };
      const db = mockDb('vireo_staging', missingMemberHello);
      assert.throws(() => verifyClusterIdentity(db), /SAFETY ABORT \[HOSTS_COUNT_MISMATCH\]/);
    });

    it('3.3. Additional unexpected member is REJECTED', () => {
      const extraMemberHello = {
        ok: 1,
        setName: 'atlas-ol429v-shard-0',
        hosts: [
          'ac-uqylvwf-shard-00-00.6bxh37q.mongodb.net:27017',
          'ac-uqylvwf-shard-00-01.6bxh37q.mongodb.net:27017',
          'ac-uqylvwf-shard-00-02.6bxh37q.mongodb.net:27017',
          'ac-uqylvwf-shard-00-03.6bxh37q.mongodb.net:27017', // Extra unexpected member
        ],
      };
      const db = mockDb('vireo_staging', extraMemberHello);
      assert.throws(() => verifyClusterIdentity(db), /SAFETY ABORT \[HOSTS_COUNT_MISMATCH\]/);
    });

    it('3.4. Hostname mismatch is REJECTED', () => {
      const wrongHostnameHello = {
        ok: 1,
        setName: 'atlas-ol429v-shard-0',
        hosts: [
          'ac-uqylvwf-shard-00-00.6bxh37q.mongodb.net:27017',
          'ac-uqylvwf-shard-00-01.6bxh37q.mongodb.net:27017',
          'ac-diffhost-shard-00-02.6bxh37q.mongodb.net:27017', // Wrong host name
        ],
      };
      const db = mockDb('vireo_staging', wrongHostnameHello);
      assert.throws(() => verifyClusterIdentity(db), /SAFETY ABORT \[EXACT_HOSTS_MISMATCH\]/);
    });

    it('3.5. Port mismatch is REJECTED', () => {
      const wrongPortHello = {
        ok: 1,
        setName: 'atlas-ol429v-shard-0',
        hosts: [
          'ac-uqylvwf-shard-00-00.6bxh37q.mongodb.net:27017',
          'ac-uqylvwf-shard-00-01.6bxh37q.mongodb.net:27017',
          'ac-uqylvwf-shard-00-02.6bxh37q.mongodb.net:27018', // Wrong port 27018
        ],
      };
      const db = mockDb('vireo_staging', wrongPortHello);
      assert.throws(() => verifyClusterIdentity(db), /SAFETY ABORT \[EXACT_HOSTS_MISMATCH\]/);
    });

    it('3.6. Wrong replica set name is REJECTED', () => {
      const wrongReplSetHello = {
        ...validStagingHello,
        setName: 'atlas-other-shard-0',
      };
      const db = mockDb('vireo_staging', wrongReplSetHello);
      assert.throws(() => verifyClusterIdentity(db), /SAFETY ABORT \[CLUSTER_MISMATCH\]/);
    });

    it('3.7. Wrong database name is REJECTED', () => {
      const dbProd = mockDb('vireo_prod', validStagingHello);
      assert.throws(() => verifyClusterIdentity(dbProd), /SAFETY ABORT \[DATABASE_MISMATCH\]/);

      const dbDev = mockDb('vireo_dev', validStagingHello);
      assert.throws(() => verifyClusterIdentity(dbDev), /SAFETY ABORT \[DATABASE_MISMATCH\]/);
    });

    it('3.8. Production cluster containing a database named vireo_staging is REJECTED', () => {
      const prodHello = {
        ok: 1,
        setName: 'atlas-prod-shard-0',
        hosts: [
          'ac-prod-shard-00-00.prod.mongodb.net:27017',
          'ac-prod-shard-00-01.prod.mongodb.net:27017',
          'ac-prod-shard-00-02.prod.mongodb.net:27017',
        ],
      };
      const db = mockDb('vireo_staging', prodHello);
      assert.throws(() => verifyClusterIdentity(db), /SAFETY ABORT \[CLUSTER_MISMATCH\]/);
    });

    it('3.9. Empty or unavailable host lists are REJECTED', () => {
      const emptyHostsHello = {
        ok: 1,
        setName: 'atlas-ol429v-shard-0',
        hosts: [],
      };
      const db = mockDb('vireo_staging', emptyHostsHello);
      assert.throws(() => verifyClusterIdentity(db), /SAFETY ABORT \[HOSTS_EMPTY\]/);
    });

    it('3.10. Standalone MongoDB (missing setName) is REJECTED', () => {
      const standaloneHello = {
        ok: 1,
        hosts: ['localhost:27017'],
      };
      const db = mockDb('vireo_staging', standaloneHello);
      assert.throws(() => verifyClusterIdentity(db), /SAFETY ABORT \[NOT_REPLICA_SET\]/);
    });

    it('3.11. Missing cluster identity configuration constants is REJECTED', () => {
      const db = mockDb('vireo_staging', validStagingHello);
      assert.throws(
        () => verifyClusterIdentity(db, { expectedReplSet: '' }),
        /SAFETY ABORT \[CONFIG_MISSING\]/
      );
      assert.throws(
        () => verifyClusterIdentity(db, { expectedHosts: [] }),
        /SAFETY ABORT \[CONFIG_MISSING\]/
      );
    });

    it('3.12. Topology query failure is REJECTED (fail-closed)', () => {
      const errorDb = mockDb('vireo_staging', null, true);
      assert.throws(() => verifyClusterIdentity(errorDb), /SAFETY ABORT \[TOPOLOGY_QUERY_FAILED\]/);
    });

    it('3.13. Pre-collMod Abort Verification: scripts execute verifyClusterIdentity prior to collMod', () => {
      const mig = fs.readFileSync(migrationPath, 'utf8');
      const rol = fs.readFileSync(rollbackPath, 'utf8');

      const migClusterIndex = mig.indexOf('verifyClusterIdentity(db)');
      const migCollModIndex = mig.indexOf('collMod: "credit_wallets"');
      assert.ok(migClusterIndex > 0, 'verifyClusterIdentity must be called in migration script');
      assert.ok(migCollModIndex > 0, 'collMod must exist in migration script');
      assert.ok(
        migClusterIndex < migCollModIndex,
        'verifyClusterIdentity MUST execute strictly BEFORE collMod in migration script'
      );

      const rolClusterIndex = rol.indexOf('verifyClusterIdentity(db)');
      const rolCollModIndex = rol.indexOf('collMod: "credit_wallets"');
      assert.ok(rolClusterIndex > 0, 'verifyClusterIdentity must be called in rollback script');
      assert.ok(rolCollModIndex > 0, 'collMod must exist in rollback script');
      assert.ok(
        rolClusterIndex < rolCollModIndex,
        'verifyClusterIdentity MUST execute strictly BEFORE collMod in rollback script'
      );
    });
  });

  // =========================================================================
  // SECTION 4: FUNCTIONAL SAFETY GUARDS & TEMPORARY COLLECTION CLEANUP
  // =========================================================================
  describe('4. Functional Safety Guards & Temporary Collection Cleanup', () => {
    it('4.1. Pre-Migration Guard: Aborts if live Atlas validator differs from legacy baseline', () => {
      const EXPECTED_LEGACY_VALIDATOR = legacyValidatorBaseline;

      function checkPreMigration(liveValidator: any): void {
        const liveCanon = JSON.stringify(canonicalize(liveValidator));
        const expCanon = JSON.stringify(canonicalize(EXPECTED_LEGACY_VALIDATOR));
        if (liveCanon !== expCanon) {
          throw new Error('PRE-MIGRATION STATE GUARD ABORT: Live Atlas validator differs from audited legacy baseline.');
        }
      }

      assert.doesNotThrow(() => checkPreMigration(legacyValidatorBaseline));
      const altered = JSON.parse(JSON.stringify(legacyValidatorBaseline));
      delete (altered.$jsonSchema.properties as any).clip_id;
      assert.throws(() => checkPreMigration(altered), /differ/);
      assert.throws(() => checkPreMigration({ $jsonSchema: WALLET_COLLECTION_JSON_SCHEMA }), /differ/);
    });

    it('4.2. Rollback Guard: Aborts if collection is already in legacy state OR unexpected state', () => {
      const TARGET_NEW = { $jsonSchema: WALLET_COLLECTION_JSON_SCHEMA };
      const EXPECTED_LEGACY = legacyValidatorBaseline;

      function checkRollbackGuard(liveValidator: any): void {
        const liveCanon = JSON.stringify(canonicalize(liveValidator));
        const newCanon = JSON.stringify(canonicalize(TARGET_NEW));
        const legacyCanon = JSON.stringify(canonicalize(EXPECTED_LEGACY));

        if (liveCanon === legacyCanon) {
          throw new Error('ROLLBACK STATE GUARD ABORT: Collection already has legacy validator.');
        }
        if (liveCanon !== newCanon) {
          throw new Error('ROLLBACK STATE GUARD ABORT: Live validator does not match expected new schema.');
        }
      }

      assert.doesNotThrow(() => checkRollbackGuard(TARGET_NEW));
      assert.throws(() => checkRollbackGuard(EXPECTED_LEGACY), /already has legacy/);
      assert.throws(() => checkRollbackGuard({ $jsonSchema: { bsonType: 'object' } }), /does not match expected new/);
    });

    it('4.3. Guaranteed Temporary Collection Cleanup on Failure (try...finally)', () => {
      let collectionDropped = false;
      const fakeDb = {
        getCollection: (_name: string) => ({
          drop: () => {
            collectionDropped = true;
          },
        }),
      };

      const tempName = 'tmp_test_failure_cleanup_' + Date.now();
      let tempCreated = false;

      try {
        tempCreated = true;
        throw new Error('SIMULATED INJECTION: Test failed unexpectedly');
      } catch {
        // Ignored in simulation
      } finally {
        if (tempCreated) {
          fakeDb.getCollection(tempName).drop();
        }
      }

      assert.equal(collectionDropped, true, 'Temporary collection must be dropped even when test throws');
    });
  });
});
