import test from 'node:test';
import assert from 'node:assert/strict';
import { auditWalletCollectionValidator, WALLET_COLLECTION_JSON_SCHEMA } from '../db/bootstrapMongo.js';

const current = () => ({ validator: { $jsonSchema: structuredClone(WALLET_COLLECTION_JSON_SCHEMA) }, validationLevel: 'strict', validationAction: 'error' });
function database(options: any, denied = false) {
  const commands: any[] = [];
  return { commands, db: {
    listCollections: () => ({ toArray: async () => options === null ? [] : [{ options }] }),
    command: async (command: any) => { commands.push(command); if (denied) throw new Error('fixture no collMod privilege'); return { ok: 1 }; },
  } as any };
}

test('wallet validator audit checks full schema and effective enforcement', async (t) => {
  await t.test('missing collection remains missing without mutation', async () => {
    const f = database(null);
    assert.equal((await auditWalletCollectionValidator(f.db)).status, 'MISSING');
    assert.equal(f.commands.length, 0);
  });
  await t.test('exact strict error schema needs no upgrade', async () => {
    const f = database(current());
    assert.equal((await auditWalletCollectionValidator(f.db)).status, 'CURRENT');
    assert.equal(f.commands.length, 0);
  });
  await t.test('implicit default error action is accepted', async () => {
    const o: any = current(); delete o.validationAction;
    const f = database(o);
    assert.equal((await auditWalletCollectionValidator(f.db)).status, 'CURRENT');
    assert.equal(f.commands.length, 0);
  });
  for (const kind of ['moderate', 'off', 'warn', 'missing-required', 'unbounded-reserved', 'extra-validator']) {
    await t.test(kind + ' is not falsely reported current when upgrade is denied', async () => {
      const o: any = current();
      if (kind === 'moderate' || kind === 'off') o.validationLevel = kind;
      if (kind === 'warn') o.validationAction = 'warn';
      if (kind === 'missing-required') o.validator.$jsonSchema.required = ['id'];
      if (kind === 'unbounded-reserved') delete o.validator.$jsonSchema.properties.reserved_credits.maximum;
      if (kind === 'extra-validator') o.validator.$comment = 'unexpected validator';
      const f = database(o, true);
      const result = await auditWalletCollectionValidator(f.db);
      assert.equal(result.status, 'OUTDATED');
      assert.equal(result.hasCollModPermission, false);
      assert.equal(f.commands.length, 1);
    });
  }
  await t.test('authorized upgrade explicitly restores strict error enforcement', async () => {
    const o: any = current(); o.validationAction = 'warn';
    const f = database(o);
    assert.equal((await auditWalletCollectionValidator(f.db)).status, 'CURRENT');
    assert.equal(f.commands.length, 1);
    assert.equal(f.commands[0].validationLevel, 'strict');
    assert.equal(f.commands[0].validationAction, 'error');
    assert.deepEqual(f.commands[0].validator, { $jsonSchema: WALLET_COLLECTION_JSON_SCHEMA });
  });
});
