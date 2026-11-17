import{test}from'node:test';import assert from'node:assert/strict';
import{supportedYouTubeJsArgs as args}from'../shared/youtubeRuntime.js';
import{classifyYouTubeFailure as classify}from'../utils/youtubeErrorClassifier.js';
test('supported installed Node runtime is enabled with remote code downloads disabled',()=>{assert.deepEqual(args('22.23.5','/usr/bin/node'),['--js-runtimes','node:/usr/bin/node','--no-remote-components']);assert.equal(args('24.1.0','C:/Program Files/node.exe').length,3)});
test('unsupported or malformed runtimes are not offered as repaired extraction',()=>{for(const v of['20.19.0','unknown','22.0','NaN'])assert.deepEqual(args(v,'/usr/bin/node'),[]);assert.deepEqual(args('22.1.0',''),[]);assert.deepEqual(args('22.1.0','/bin/node\nother'),[])});
test('verification and rate-limit responses stop strategy fallback without asking for cookies',()=>{for(const stderr of["Sign in to confirm you're not a bot",'HTTP Error 429: Too Many Requests']){const f=classify({stderr});assert.equal(f.terminal,true);assert.equal(f.statusCode,429);assert.doesNotMatch(f.message,/YOUTUBE_COOKIES|few minutes|try.*again/i)}});
