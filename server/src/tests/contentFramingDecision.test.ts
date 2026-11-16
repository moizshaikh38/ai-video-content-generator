import {test} from 'node:test';import assert from 'node:assert/strict';import {chooseContentFraming as choose} from '../shared/contentFramingDecision.js';
const input={measuredMode:'track' as const,sampleCount:20,crowd:false,possibleEmbeddedCamera:false,hasAnchorableFace:true};
test('genre-specific policies are distinct but do not pretend to know important regions',()=>{
 assert.equal(choose({...input,genre:'podcast_interview',measuredMode:'split'}).layoutMode,'split');
 const game=choose({...input,genre:'gaming',possibleEmbeddedCamera:true});assert.equal(game.layoutMode,'blur');assert.equal(game.policy,'screen_content');assert.ok(game.reasons[0].includes('once'));
 assert.equal(choose({...input,genre:'sports'}).policy,'action_context');assert.equal(choose({...input,genre:'documentary'}).policy,'scene_context');assert.equal(choose({...input,genre:'motivation'}).layoutMode,'track');
});
test('manual decision wins, genre label never invents measurement',()=>{
 assert.equal(choose({...input,genre:'gaming',explicitMode:'screencast'}).source,'user');
 const empty=choose({...input,genre:'podcast_interview',sampleCount:0});assert.equal(empty.layoutMode,'blur');assert.ok(empty.uncertainties.length);
 assert.equal(choose({...input,genre:'podcast_interview',crowd:true,measuredMode:'split'}).layoutMode,'blur');
});
test('all auto policies declare a stable frame, and record uncertainty',()=>{
 for(const genre of ['podcast_interview','education_tutorial','gaming','sports','documentary','motivation','general'])assert.equal(choose({...input,genre}).stableFrameSize,true);
 assert.ok(choose({...input,genre:'gaming'}).uncertainties[0].includes('boundaries'));
});

test('preview/control precedence preserves manual and legacy choices',async()=>{
 const {effectiveContentLayout:effective}=await import('../shared/contentFramingDecision.js');const d=choose({...input,genre:'gaming'});
 assert.equal(effective({layout_mode:'screencast',crop_config:{layout_mode_source:'genre_recommendation'}},d),'blur');
 assert.equal(effective({layout_mode:'screencast',crop_config:{layout_mode_source:'user'}},d),'screencast');
 assert.equal(effective({layout_mode:'split'},d),'split');
 assert.equal(effective({layout_mode:'track',crop:{mode:'custom'},crop_config:{layout_mode_source:'genre_recommendation'}},d),'track');
});
