import fs from 'node:fs';
import {SmartReframeService as S} from '../../src/services/smartReframeService.js';
const raw=JSON.parse(fs.readFileSync('/tmp/vireo-local-restore/actual-gaming-cv.json','utf8'));
(S as any).associateTracks(raw.samples);
const result={source:'actual eight-second Valorant stream excerpt600-608',samples:raw.sample_count,facecamCandidate:S.findStaticFacecamTrack(raw.samples),measured:(S as any).determineOptimalLayoutMode(raw.samples),samplesWithTracks:raw.samples};
fs.writeFileSync('/tmp/vireo-local-restore/actual-gaming-track-evidence.json',JSON.stringify(result,null,2));console.log(JSON.stringify({samples:result.samples,facecamCandidate:result.facecamCandidate,measured:result.measured}));
