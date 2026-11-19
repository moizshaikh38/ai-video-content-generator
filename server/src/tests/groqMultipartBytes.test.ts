import test from 'node:test';
import assert from 'node:assert/strict';
import {GroqTranscriptionProvider} from '../services/transcription/groqTranscriptionProvider.js';
import {config} from '../config/index.js';

const response = {text:'Hello world',language:'en',duration:1,segments:[{text:'Hello world',start:0,end:1}],words:[{word:'Hello',start:0,end:.4},{word:'world',start:.4,end:.9}]};

test('Groq multipart preserves exact sliced and shared-buffer bytes without a provider request', async () => {
  const oldFetch=globalThis.fetch, oldKey=config.groqApiKey;
  let calls=0;
  try {
    config.groqApiKey='fixture-not-a-key';
    const backing=Buffer.from([91,92,0,127,128,255,93,94]);
    const sliced=backing.subarray(2,6);
    const shared=Buffer.from(new SharedArrayBuffer(8));
    shared.set(backing);
    for (const audio of [sliced,shared.subarray(2,6)]) {
      globalThis.fetch=async(input,init)=>{
        calls++;
        assert.equal(String(input),'https://api.groq.com/openai/v1/audio/transcriptions');
        assert.equal(init?.method,'POST');
        assert(init?.body instanceof FormData);
        const file=init.body.get('file');
        assert(file instanceof Blob);
        assert.equal(file.type,'audio/wav');
        assert.equal((file as File).name,'slice.wav');
        assert.deepEqual([...new Uint8Array(await file.arrayBuffer())],[0,127,128,255]);
        assert.equal(init.body.get('model'),'whisper-large-v3-turbo');
        assert.deepEqual(init.body.getAll('timestamp_granularities[]'),['word','segment']);
        assert.equal(init.body.get('language'),'en');
        assert.equal(init.body.get('prompt'),'Fixture prompt');
        return new Response(JSON.stringify(response),{status:200});
      };
      const result=await new GroqTranscriptionProvider().transcribeAudio(audio,'slice.wav','audio/wav',{language:'en',prompt:'Fixture prompt'});
      assert.equal(result.text,response.text);
      assert.deepEqual(result.words,response.words);
    }
    assert.equal(calls,2);
  } finally {
    globalThis.fetch=oldFetch;
    config.groqApiKey=oldKey;
  }
});
