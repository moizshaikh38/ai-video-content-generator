import { getMongoDb } from '../mongoClient.js';

/** Compare-and-set the processing state so two API instances cannot launch the same project. */
export async function claimProjectProcessing(userId: string, projectId: string,
  expectedStatus: string, expectedUpdatedAt: Date): Promise<boolean> {
  const db = await getMongoDb();
  // Idle-source metadata (for example poster generation) may update updated_at
  // without starting processing. Status alone serializes an idle -> processing
  // transition. Stale active recovery must still fence the exact active version.
  const active = expectedStatus === 'processing' || expectedStatus === 'transcribing';
  const result = await db.collection('projects').updateOne({
    id: projectId, user_id: userId, video_status: expectedStatus,
    ...(active ? { updated_at: expectedUpdatedAt } : {}),
  }, { $set: { video_status: 'processing', updated_at: new Date() } });
  return result.modifiedCount === 1;
}
