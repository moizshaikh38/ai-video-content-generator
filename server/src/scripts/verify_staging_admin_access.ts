import { MongoClient } from 'mongodb';
import { execSync } from 'child_process';

const EXPECTED_DATABASE = 'vireo_staging';
const EXPECTED_SET_NAME = 'atlas-ol429v-shard-0';
const EXPECTED_HOSTS = [
  'ac-uqylvwf-shard-00-00.6bxh37q.mongodb.net:27017',
  'ac-uqylvwf-shard-00-01.6bxh37q.mongodb.net:27017',
  'ac-uqylvwf-shard-00-02.6bxh37q.mongodb.net:27017',
].sort();
const EXPECTED_USER = 'vireo_staging_migration_admin';

function sanitizeUri(uri: string): string {
  return uri.replace(/:([^:@]+)@/, ':***@');
}

function resolveAdminCredential(): { uri?: string; password?: string } {
  if (process.env.MONGODB_ADMIN_URI) {
    return { uri: process.env.MONGODB_ADMIN_URI };
  }
  if (process.env.MIGRATION_ADMIN_PASSWORD) {
    return { password: process.env.MIGRATION_ADMIN_PASSWORD };
  }
  // On Windows, if set in User registry environment (persistent across shell sessions)
  if (process.platform === 'win32') {
    try {
      const userUri = execSync(
        'powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable(\'MONGODB_ADMIN_URI\', \'User\')"',
        { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }
      ).trim();
      if (userUri) return { uri: userUri };

      const userPass = execSync(
        'powershell -NoProfile -Command "[System.Environment]::GetEnvironmentVariable(\'MIGRATION_ADMIN_PASSWORD\', \'User\')"',
        { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }
      ).trim();
      if (userPass) return { password: userPass };
    } catch {
      // Ignored
    }
  }
  return {};
}

export async function verifyStagingAdminAccess(customUri?: string) {
  let uri = customUri;
  if (!uri) {
    const cred = resolveAdminCredential();
    if (cred.uri) {
      uri = cred.uri;
    } else if (cred.password) {
      const encodedPassword = encodeURIComponent(cred.password);
      uri = `mongodb+srv://${EXPECTED_USER}:${encodedPassword}@vireo-stagging.6bxh37q.mongodb.net/${EXPECTED_DATABASE}?retryWrites=true&w=majority`;
    }
  }

  if (!uri) {
    throw new Error(
      'MISSING_ADMIN_CREDENTIALS: Set MIGRATION_ADMIN_PASSWORD or MONGODB_ADMIN_URI in process environment to run this check.'
    );
  }

  console.log(`[VERIFY-ADMIN] Connecting to target cluster (URI: ${sanitizeUri(uri)})...`);

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  });

  try {
    await client.connect();
    console.log('[VERIFY-ADMIN] Successfully connected to deployment.');

    const db = client.db(EXPECTED_DATABASE);

    // 1. Cluster Identity & Replica Set Check (hello command)
    console.log('[VERIFY-ADMIN] Running "hello" check...');
    const hello = await db.command({ hello: 1 });
    const liveSetName = hello.setName;
    const liveHosts = Array.isArray(hello.hosts) ? [...hello.hosts].map(h => h.toLowerCase()).sort() : [];

    console.log(`[VERIFY-ADMIN] Replica Set Name: "${liveSetName}"`);
    console.log(`[VERIFY-ADMIN] Replica Set Members (${liveHosts.length}):`, liveHosts);

    if (liveSetName !== EXPECTED_SET_NAME) {
      throw new Error(
        `CLUSTER_GUARD_FAILED: Replica set mismatch. Expected "${EXPECTED_SET_NAME}", got "${liveSetName}".`
      );
    }

    if (
      liveHosts.length !== EXPECTED_HOSTS.length ||
      !EXPECTED_HOSTS.every((h, i) => h === liveHosts[i])
    ) {
      throw new Error(
        `CLUSTER_GUARD_FAILED: Exact host list mismatch. Expected [${EXPECTED_HOSTS.join(', ')}], got [${liveHosts.join(', ')}].`
      );
    }
    console.log('[VERIFY-ADMIN] Exact staging replica set identity confirmed.');

    // 2. Auth & Role Inspection (connectionStatus command)
    console.log('[VERIFY-ADMIN] Running "connectionStatus" check...');
    const connStatus = await db.command({ connectionStatus: 1 });
    const authUsers = connStatus.authInfo?.authenticatedUsers || [];
    const authRoles = connStatus.authInfo?.authenticatedUserRoles || [];

    console.log('[VERIFY-ADMIN] Authenticated Users:', authUsers);
    console.log('[VERIFY-ADMIN] Authenticated User Roles:', authRoles);

    const userMatch = authUsers.some((u: { user: string }) => u.user === EXPECTED_USER);
    if (!userMatch) {
      throw new Error(
        `USER_VERIFICATION_FAILED: Expected authenticated user "${EXPECTED_USER}", got ${JSON.stringify(authUsers)}.`
      );
    }

    const hasDbAdmin = authRoles.some(
      (r: { role: string; db: string }) =>
        (r.role === 'dbAdmin' || r.role === 'dbOwner') &&
        (r.db === EXPECTED_DATABASE || r.db === 'admin')
    );
    if (!hasDbAdmin) {
      throw new Error(
        `ROLE_VERIFICATION_FAILED: User "${EXPECTED_USER}" does not possess dbAdmin/dbOwner privileges scoped to "${EXPECTED_DATABASE}". Roles: ${JSON.stringify(authRoles)}.`
      );
    }
    console.log(`[VERIFY-ADMIN] User "${EXPECTED_USER}" holds verified administrative role for "${EXPECTED_DATABASE}".`);

    // 3. Collection Listing (listCollections)
    console.log('[VERIFY-ADMIN] Running "listCollections" check...');
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const collectionNames = collections.map(c => c.name);
    console.log(`[VERIFY-ADMIN] Accessible Collections count: ${collectionNames.length}`);
    if (!collectionNames.includes('credit_wallets')) {
      throw new Error('COLLECTION_VERIFICATION_FAILED: "credit_wallets" collection not found in listCollections.');
    }
    console.log('[VERIFY-ADMIN] "credit_wallets" collection confirmed accessible.');

    // 4. Current Validator Inspection
    console.log('[VERIFY-ADMIN] Reading live "credit_wallets" validator & options...');
    const collInfos = await db.listCollections({ name: 'credit_wallets' }).toArray();
    if (!collInfos.length) {
      throw new Error('COLLECTION_VERIFICATION_FAILED: Failed to retrieve "credit_wallets" collection info.');
    }
    const options = (collInfos[0] as any).options || {};
    const validator = options.validator || null;
    const validationLevel = options.validationLevel || 'strict';
    const validationAction = options.validationAction || 'error (effective default)';

    console.log('[VERIFY-ADMIN] Validation Level:', validationLevel);
    console.log('[VERIFY-ADMIN] Validation Action:', validationAction);
    console.log('[VERIFY-ADMIN] Has Validator:', Boolean(validator));

    return {
      success: true,
      database: EXPECTED_DATABASE,
      replicaSet: liveSetName,
      hosts: liveHosts,
      authenticatedUser: EXPECTED_USER,
      roles: authRoles,
      validationLevel,
      validationAction,
      hasValidator: Boolean(validator),
    };
  } finally {
    await client.close();
    console.log('[VERIFY-ADMIN] Connection closed.');
  }
}

if (process.argv[1]?.endsWith('verify_staging_admin_access.ts')) {
  verifyStagingAdminAccess()
    .then((result) => {
      console.log('[VERIFY-ADMIN] Access verification successful:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[VERIFY-ADMIN] Access verification error:', err.message);
      process.exit(1);
    });
}

