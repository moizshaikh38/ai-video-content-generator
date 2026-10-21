import { CaptionService } from '../server/src/services/captionService.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { ownerContext } from '../server/src/db/repositories/dataRepository.js';

import { getMongoDb } from '../server/src/db/mongoClient.js';

async function test() {
  const db = await getMongoDb();
  const clipsWithCues = await db.collection('clips').find({ 'caption_cues.0': { $exists: true } }).toArray();
  console.log(`Found ${clipsWithCues.length} clips with cues:`);
  for (const c of clipsWithCues.slice(0, 5)) {
    console.log({
      id: c.id,
      title: c.title,
      userId: c.user_id || c.userId,
      cuesCount: c.caption_cues?.length,
      firstCueText: c.caption_cues?.[0]?.text,
    });
  }
}

test().catch(console.error);
