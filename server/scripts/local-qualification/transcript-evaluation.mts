/** Offline E1 evidence lane. Run from server with tsx and three explicit paths:
 * transcript-evaluation.mts CASE.json SOURCE_MEDIA OUTPUT.json
 * CASE follows TranscriptEvaluationCase; references must be reviewed separately.
 * This never calls STT, guesses reference words, or authorizes provider spend. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import {evaluateTranscript,type TranscriptEvaluationCase} from '../../src/shared/transcriptEvaluation.js';
const [casePath,sourcePath,outputPath]=process.argv.slice(2);
if(!casePath||!sourcePath||!outputPath)throw Error('Supply CASE.json SOURCE_MEDIA OUTPUT.json.');
if(fs.existsSync(outputPath))throw Error('Use a new output path; do not replace previous evidence.');
const input:TranscriptEvaluationCase=JSON.parse(fs.readFileSync(casePath,'utf8'));
const hash=crypto.createHash('sha256');
for await(const chunk of fs.createReadStream(sourcePath))hash.update(chunk);
const actual=hash.digest('hex');
if(actual!==input.sourceSha256.toLowerCase())throw Error('Source hash mismatch. Evaluation must name these exact media bytes.');
const result=evaluateTranscript(input);
fs.writeFileSync(outputPath,JSON.stringify({createdAt:new Date().toISOString(),casePath,sourcePath,...result},null,2),{flag:'wx'});
console.log(JSON.stringify({outputPath,caseId:result.identity.caseId,wordErrorRate:result.wordErrorRate,counts:result.counts,recordedNoRescueEligibility:result.recordedNoRescueEligibility,caveat:result.caveat}));
