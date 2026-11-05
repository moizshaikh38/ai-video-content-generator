import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const suites = [
  { name: 'hardwareEncoderService.test.ts', file: 'src/tests/hardwareEncoderService.test.ts' },
  { name: 'captionAudioSync.test.ts', file: 'src/tests/captionAudioSync.test.ts' },
  { name: 'phase3_1WorkerReliability.test.ts', file: 'src/tests/phase3_1WorkerReliability.test.ts' },
  { name: 'phase3HighlightFusion.test.ts', file: 'src/tests/phase3HighlightFusion.test.ts' },
  { name: 'phase3_1ShotBoundaryAndCreditVerification.test.ts', file: 'src/tests/phase3_1ShotBoundaryAndCreditVerification.test.ts' },
  { name: 'phase2VideoIntelligence.test.ts', file: 'src/tests/phase2VideoIntelligence.test.ts' },
  { name: 'subtitleStudioService.test.ts', file: 'src/tests/subtitleStudioService.test.ts' },
  { name: 'subtitleStudioCreditIntegration.test.ts', file: 'src/tests/subtitleStudioCreditIntegration.test.ts' },
  { name: 'aiClippingCreditIntegration.test.ts', file: 'src/tests/aiClippingCreditIntegration.test.ts' },
  { name: 'creditSystem.test.ts', file: 'src/tests/creditSystem.test.ts' },
  { name: 'phase8Transcription.test.ts', file: 'src/tests/phase8Transcription.test.ts' },
];

async function main() {
  console.log('========================================================================');
  console.log('VIREOCLIP — COMPLETE PHASE 1 - 3.2 CORE REGRESSION TEST AUDIT');
  console.log('========================================================================\n');

  let totalPass = 0;
  let totalFail = 0;
  let totalSkip = 0;
  const suiteResults: any[] = [];

  for (const s of suites) {
    const cmd = `npx tsx --test ${s.file}`;
    console.log(`Running: ${s.name}...`);
    try {
      const { stdout, stderr } = await execAsync(cmd, { cwd: process.cwd() });
      const out = stdout + '\n' + stderr;

      // Extract test summary counts
      const passMatch = out.match(/ℹ pass (\d+)/) || out.match(/✔/g);
      const failMatch = out.match(/ℹ fail (\d+)/);
      const skipMatch = out.match(/ℹ skipped (\d+)/);

      let passed = 0;
      let failed = 0;
      let skipped = 0;

      if (out.includes('ℹ pass')) {
        passed = parseInt(out.match(/ℹ pass (\d+)/)?.[1] || '0', 10);
        failed = parseInt(out.match(/ℹ fail (\d+)/)?.[1] || '0', 10);
        skipped = parseInt(out.match(/ℹ skipped (\d+)/)?.[1] || '0', 10);
      } else if (out.includes('tests passed')) {
        passed = parseInt(out.match(/(\d+)\/\d+ tests passed/)?.[1] || '0', 10);
      } else {
        passed = (out.match(/✔/g) || []).length;
      }

      totalPass += passed;
      totalFail += failed;
      totalSkip += skipped;

      suiteResults.push({
        suite: s.name,
        passed,
        failed,
        skipped,
        status: failed === 0 ? 'PASS' : 'FAIL',
      });
      console.log(`  -> ${s.name}: ${passed} passed, ${failed} failed, ${skipped} skipped.`);
    } catch (err: any) {
      const out = err.stdout + '\n' + err.stderr;
      let passed = 0;
      let failed = 1;
      let skipped = 0;

      if (out.includes('ℹ pass')) {
        passed = parseInt(out.match(/ℹ pass (\d+)/)?.[1] || '0', 10);
        failed = parseInt(out.match(/ℹ fail (\d+)/)?.[1] || '1', 10);
        skipped = parseInt(out.match(/ℹ skipped (\d+)/)?.[1] || '0', 10);
      }

      totalPass += passed;
      totalFail += failed;
      totalSkip += skipped;

      suiteResults.push({
        suite: s.name,
        passed,
        failed,
        skipped,
        status: 'FAIL',
      });
      console.error(`  -> ${s.name} FAILED: ${passed} passed, ${failed} failed, ${skipped} skipped.`);
    }
  }

  console.log('\n========================================================================');
  console.log('UNABRIDGED REGRESSION TEST RECONCILIATION SUMMARY:');
  console.log('========================================================================');
  console.table(suiteResults);
  console.log(`TOTAL PASS: ${totalPass}`);
  console.log(`TOTAL FAIL: ${totalFail}`);
  console.log(`TOTAL SKIP: ${totalSkip}`);
  console.log(`GRAND TOTAL RECORDED: ${totalPass + totalFail + totalSkip}`);
  console.log('========================================================================\n');
}

main().catch(console.error);

