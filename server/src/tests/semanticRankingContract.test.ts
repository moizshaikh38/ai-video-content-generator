import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseCandidateRanking} from '../../scripts/local-qualification/semantic-ranking-contract.js';
const cs=[{id:'A',geometryQualified:true,manualWitnessOnly:false},{id:'B',geometryQualified:false,manualWitnessOnly:true}];
const rank={candidateId:'A',uncertain:false,visibleLosses:[]};
test('ranker cannot introduce coordinates or unknown IDs',()=>{assert.equal(parseCandidateRanking({...rank,x:.1},cs).status,'rejected');assert.equal(parseCandidateRanking({...rank,candidateId:'Z'},cs).status,'rejected');});
test('uncertainty, observed loss and no preference mean abstention',()=>{for(const change of [{uncertain:true},{visibleLosses:['person disappears']},{candidateId:null}])assert.equal(parseCandidateRanking({...rank,...change},cs).status,'abstained');});
test('even eligible ID never becomes automatic safety authorization',()=>{assert.equal(parseCandidateRanking(rank,cs).status,'review-only');assert.equal(parseCandidateRanking({...rank,candidateId:'B'},cs).status,'review-only');});
