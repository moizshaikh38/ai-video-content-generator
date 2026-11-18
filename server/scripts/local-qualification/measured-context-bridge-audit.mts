import fs from 'node:fs';import {SmartReframeService as S} from '../../src/services/smartReframeService.js';
const t=JSON.parse(fs.readFileSync('/downloads/vireo-screen-ocr-review-job-1228/fresh-normal-track.json','utf8'));
console.log(JSON.stringify(S.computeShotComposition({rawSamples:t.raw_samples,sceneCuts:t.metadata.scene_cuts,duration:8,sourceWidth:t.source_width,sourceHeight:t.source_height,windowScope:'shot',allowConversationSplit:true,protectedContentRegions:t.metadata.protected_content_regions,splitHandSafetyReview:true}),null,2));
