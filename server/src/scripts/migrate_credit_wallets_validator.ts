import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { WALLET_COLLECTION_JSON_SCHEMA, auditWalletCollectionValidator } from '../db/bootstrapMongo.js';
import { validateWalletDocument, WALLET_ALLOWED_FIELDS } from '../db/repositories/creditRepository.js';
import { BSON } from 'mongodb';

/**
 * VireoClip Phase 4B.3 — Problem 3: Atlas credit_wallets Validator Migration & Audit Script
 *
 * This script provides:
 * 1. Read-only pre-migration audit of all existing documents against the bounded schema.
 * 2. Exact collMod command with the final schema for execution by an administrator with dbAdmin.
 * 3. Exact verification instructions via listCollections / getCollectionInfos.
 * 4. Exact rollback command to revert if ever necessary.
 */
async function main() {
  const db = await getMongoDb();

  console.log('========================================================================');
  console.log('VIREOCLIP PHASE 4B.3 — CREDIT_WALLETS VALIDATOR MIGRATION & AUDIT');
  console.log('========================================================================\n');

  // STEP 1: Read-Only Pre-Migration Audit
  console.log('--- 1. READ-ONLY PRE-MIGRATION AUDIT ---');
  const walletsColl = db.collection('credit_wallets');
  const allWallets = await walletsColl.find().toArray();
  console.log(`Total wallet documents in database: ${allWallets.length}`);

  let conformingCount = 0;
  let nonConformingCount = 0;
  const sizeList: number[] = [];

  for (const doc of allWallets) {
    const check = validateWalletDocument(doc);
    const size = BSON.calculateObjectSize(doc);
    sizeList.push(size);

    if (check.valid && size <= 504) {
      conformingCount++;
    } else {
      nonConformingCount++;
      console.error(`Non-conforming document found: ${doc.id}, error: ${check.error}, size: ${size}`);
    }
  }

  console.log(`Conforming documents: ${conformingCount} / ${allWallets.length}`);
  console.log(`Non-conforming documents: ${nonConformingCount}`);
  if (sizeList.length > 0) {
    console.log(`BSON sizes: min = ${Math.min(...sizeList)}B, max = ${Math.max(...sizeList)}B, avg = ${(sizeList.reduce((a, b) => a + b, 0) / sizeList.length).toFixed(1)}B`);
  }
  console.log('Pre-migration audit verdict: ' + (nonConformingCount === 0 ? 'READY FOR MIGRATION (100% compliant)' : 'BLOCKED - manual review required'));
  console.log('');

  // STEP 2: Current Validator Status on Atlas
  console.log('--- 2. CURRENT ATLAS VALIDATOR STATUS ---');
  const auditResult = await auditWalletCollectionValidator(db);
  console.log(`Status: ${auditResult.status}`);
  console.log(`Message: ${auditResult.message}`);
  console.log(`Has collMod permission with current app user: ${auditResult.hasCollModPermission}`);
  console.log('');

  // STEP 3: Required Atlas Privileges
  console.log('--- 3. REQUIRED ATLAS PRIVILEGES ---');
  console.log('Running collMod requires one of the following MongoDB built-in roles:');
  console.log('  - dbAdmin on the application database (e.g., vireo_staging or vireo_prod)');
  console.log('  - dbOwner on the application database');
  console.log('  - Atlas admin / project owner credentials');
  console.log('The standard application connection user uses readWrite role only (principle of least privilege).\n');

  // STEP 4: Exact Migration collMod Command (mongosh / Admin Execution)
  console.log('--- 4. EXACT COLLMOD COMMAND FOR CLUSTER OPERATOR ---');
  console.log('Execute this command in mongosh connected as a dbAdmin / cluster admin:\n');

  const collModCommand = {
    collMod: 'credit_wallets',
    validator: {
      $jsonSchema: WALLET_COLLECTION_JSON_SCHEMA,
    },
    validationLevel: 'strict',
    validationAction: 'error',
  };

  console.log(`db.runCommand(${JSON.stringify(collModCommand, null, 2)});\n`);

  // STEP 5: Verification Command
  console.log('--- 5. POST-MIGRATION VERIFICATION COMMAND ---');
  console.log('To verify the validator in mongosh:');
  console.log('  db.getCollectionInfos({ name: "credit_wallets" })[0].options.validator;\n');

  // STEP 6: Exact Rollback Command
  console.log('--- 6. ROLLBACK PROCEDURE ---');
  console.log('If the validator ever needs to be reverted to the exact legacy state on Atlas:');
  const rollbackCommand = {
    collMod: 'credit_wallets',
    validator: {
      $jsonSchema: {
        bsonType: 'object',
        required: ['id', 'user_id'],
        properties: {
          id: {
            bsonType: 'string',
            pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
          },
          user_id: {
            bsonType: 'string',
            pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
          },
          project_id: {
            bsonType: 'string',
            pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
          },
          clip_id: {
            bsonType: 'string',
            pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$',
          },
          created_at: {
            bsonType: 'date',
          },
          updated_at: {
            bsonType: 'date',
          },
        },
      },
    },
    validationLevel: 'strict',
  };
  console.log(`db.runCommand(${JSON.stringify(rollbackCommand, null, 2)});\n`);
  console.log('========================================================================\n');

  await closeMongo(true);
}

main().catch(console.error);

