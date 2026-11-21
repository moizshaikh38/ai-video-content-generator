import crypto from 'node:crypto';
import {getMongoDb} from '../db/mongoClient.js';
import {deleteObject} from './objectStorageService.js';
import {DELETION_MARKER_FIELD} from './deletionAdmissionService.js';

/** Each extraction owns its bytes. A rejected late publisher may remove only
 * its random attempt, never a shared/versioned poster from another request. */
export function posterAttemptKey(canonical:string):string{
 if(!canonical.endsWith('.jpg'))throw new Error('Invalid poster recipe key.');
 return canonical.slice(0,-4)+'/attempts/'+crypto.randomUUID()+'.jpg';
}
export function posterKeyMatchesRecipe(key:string|null|undefined,canonical:string):boolean{
 if(key===canonical)return true;
 const prefix=canonical.slice(0,-4)+'/attempts/';
 return typeof key==='string'&&key.startsWith(prefix)&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i.test(key.slice(prefix.length));
}
/** Unknown database outcomes preserve uploaded bytes. Confirmed no-match never
 * creates the deleted parent and deletes only the caller-owned attempt. */
export async function publishPosterAttempt(collection:'projects'|'clips',ownerId:string,id:string,key:string,canonical:string,expected:Record<string,unknown>={}):Promise<string|null>{
 const parts=canonical.split('/');
 if(parts[0]!=='users'||parts[1]!==ownerId||parts[2]!=='projects'||(collection==='projects'?parts[3]!==id:parts[4]!=='clips'||parts[5]!==id))throw new Error('Poster owner identity does not match recipe.');
 if(key===canonical||!posterKeyMatchesRecipe(key,canonical))throw new Error('Poster publication requires an immutable attempt key.');
 const db=await getMongoDb();
 // The marker-absent filter contends with deletion admission on the parent
 // document: once deletion is admitted, publication loses and removes only
 // its own immutable attempt bytes (below); it can never mark the parent.
 const result=await db.collection(collection).updateOne({...expected,id,user_id:ownerId,[DELETION_MARKER_FIELD]:{$exists:false}},{$set:{poster_key:key}});
 if(result.matchedCount===1)return key;
 await deleteObject('clips',key);
 return null;
}
