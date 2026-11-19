import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStreamVideoSource as parse} from '../shared/streamVideoSource.js';

test('native Kick clip URL remains a completed clip, without promising acquisition',()=>{
 const id='clip_01J8RGZRKHXHXXKJEHGRM932A5';
 assert.deepEqual(parse(new URL('https://kick.com/spreen/clips/'+id+'?tracking=ignored')),{provider:'kick',kind:'clip',id,normalizedUrl:'https://kick.com/spreen/clips/'+id});
 assert.equal(parse(new URL('https://kick.com/channel?clip=clip_abc'))?.id,'clip_abc');
 for(const u of ['https://kick.com/channel/clips','https://kick.com/channel/clips/abc','https://kick.com/channel/clips/clip_abc/extra','https://kick.com/channel/clips/clip_a%2Fb','https://kick.com/channel/clips/clip_','https://user:pass@kick.com/channel/clips/clip_abc','https://kick.com:444/channel/clips/clip_abc','http://kick.com/channel/clips/clip_abc'])assert.throws(()=>parse(new URL(u)));
 assert.equal(parse(new URL('https://kick.com.attacker.invalid/channel/clips/clip_abc')),null);
});
