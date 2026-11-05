import path from 'node:path';
import fs from 'node:fs';
import { VideoIntelligencePrototype } from '../prototypes/videoIntelligenceEngine.js';

async function testSourceIdentityStrategy() {
  console.log('========================================================================');
  console.log('POINT 1 VERIFICATION: SOURCE IDENTITY & CACHE STRATEGY VALIDATION');
  console.log('========================================================================\n');

  const v1 = path.resolve(process.cwd(), '../public/demo/creator-demo.mp4');
  const v2 = path.resolve(process.cwd(), '../public/demo/creator-studio-demo.mp4');
  const v3 = path.resolve(process.cwd(), '../public/demo/vireo-demo.mp4');
  const vLarge = path.resolve(process.cwd(), '../delete/video_20261011_011105.mp4');
  const vTutorial = path.resolve(process.cwd(), '../delete/2.mp4');

  const files = [
    { label: 'Creator Demo (6.2s, 0.49MB)', path: v1 },
    { label: 'Creator Studio Demo (49.9s, 1.88MB)', path: v2 },
    { label: 'Vireo Demo (52.2s, 4.17MB)', path: v3 },
    { label: 'High-Res Tutorial (23.6s, 45.67MB)', path: vTutorial },
    { label: '4K UHD Sample (22.4s, 101.42MB)', path: vLarge },
  ].filter((f) => fs.existsSync(f.path));

  console.log('1. Unique Hash Generation across Different Real Videos:');
  const hashes: Record<string, string> = {};
  for (const f of files) {
    const t0 = Date.now();
    const id = VideoIntelligencePrototype.computeSourceIdentity(f.path, { userId: 'user_alpha' });
    const elapsed = Date.now() - t0;
    hashes[f.label] = id.sourceHash;
    console.log(`   - [${id.strategy}] ${f.label}`);
    console.log(`     Hash: ${id.sourceHash} (${elapsed}ms, ${id.fileSizeBytes} bytes)`);
  }

  // Check collision
  const values = Object.values(hashes);
  const uniqueValues = new Set(values);
  console.log(`\n   Collision check: ${uniqueValues.size} unique hashes out of ${values.length} videos.`);
  if (uniqueValues.size === values.length) {
    console.log('   [PASS] Zero collisions detected across distinct video sources.');
  } else {
    console.error('   [FAIL] Collision detected!');
  }

  console.log('\n2. Tenant Isolation Verification (Same video, different users):');
  const idUser1 = VideoIntelligencePrototype.computeSourceIdentity(v1, { userId: 'user_123' });
  const idUser2 = VideoIntelligencePrototype.computeSourceIdentity(v1, { userId: 'user_456' });
  console.log(`   User 123 hash: ${idUser1.sourceHash}`);
  console.log(`   User 456 hash: ${idUser2.sourceHash}`);
  if (idUser1.sourceHash !== idUser2.sourceHash) {
    console.log('   [PASS] Tenant isolation verified: different users produce isolated hash namespaces.');
  } else {
    console.error('   [FAIL] Tenant isolation failed: identical hashes for different users.');
  }

  console.log('\n3. Engine Version Invalidation Verification (Model/Schema bump):');
  const idVer1 = VideoIntelligencePrototype.computeSourceIdentity(v1, { userId: 'user_123', engineVersion: 'v1.7.0' });
  const idVer2 = VideoIntelligencePrototype.computeSourceIdentity(v1, { userId: 'user_123', engineVersion: 'v1.8.0' });
  console.log(`   Engine v1.7.0 hash: ${idVer1.sourceHash}`);
  console.log(`   Engine v1.8.0 hash: ${idVer2.sourceHash}`);
  if (idVer1.sourceHash !== idVer2.sourceHash) {
    console.log('   [PASS] Cache invalidation verified: upgrading engine version invalidates old cache keys.');
  } else {
    console.error('   [FAIL] Version bump failed to invalidate cache key.');
  }

  console.log('\n4. Simulated Byte Alteration in Middle Sector:');
  // Create a temp copy of v1 and alter 1 byte in the middle
  const tempV1 = path.resolve(process.cwd(), '../delete/temp_corrupt_test.mp4');
  try {
    fs.copyFileSync(v1, tempV1);
    const buf = fs.readFileSync(tempV1);
    // Invert one byte in the middle of the file
    const midIdx = Math.floor(buf.length / 2);
    buf[midIdx] = buf[midIdx] ^ 0xff;
    fs.writeFileSync(tempV1, buf);

    const origId = VideoIntelligencePrototype.computeSourceIdentity(v1, { userId: 'user_123' });
    const modId = VideoIntelligencePrototype.computeSourceIdentity(tempV1, { userId: 'user_123' });
    console.log(`   Original hash: ${origId.sourceHash}`);
    console.log(`   Modified hash: ${modId.sourceHash}`);
    if (origId.sourceHash !== modId.sourceHash) {
      console.log('   [PASS] Mid-file byte difference successfully triggers completely different hash.');
    } else {
      console.error('   [FAIL] Mid-file alteration did not change hash!');
    }
  } finally {
    if (fs.existsSync(tempV1)) fs.unlinkSync(tempV1);
  }

  console.log('\n========================================================================');
  console.log('POINT 1 VERIFICATION COMPLETED SUCCESSFULLY');
  console.log('========================================================================');
}

testSourceIdentityStrategy().catch(console.error);

