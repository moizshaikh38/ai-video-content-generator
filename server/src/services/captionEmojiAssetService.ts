import fs from'node:fs';import path from'node:path';import os from'node:os';import{fileURLToPath}from'node:url';import{captionEmojiAssetId}from'../shared/captionEmojiAssets.js';
/** Maps only canonical bundled emoji URLs into a trusted render cache. Never
 * resolves caller-controlled path fragments or downloads a remote graphic. */
export function cacheBundledCaptionEmoji(value:unknown,tmpDir:string):string|null{
 const id=captionEmojiAssetId(value);if(!id)return null;
 const root=path.resolve(os.tmpdir()),dir=path.resolve(tmpDir);
 if(dir!==root&&!dir.startsWith(root+path.sep))throw new Error('Emoji cache must be inside the render temp directory.');
 const source=fileURLToPath(new URL(`../../../public/caption-emojis/${id}.png`,import.meta.url));
 const target=path.join(dir,`bundled-caption-emoji-${id}.png`);
 fs.mkdirSync(dir,{recursive:true});
 // Always copy the bundled file. An existing cache file is not provenance.
 fs.copyFileSync(source,target);return target;
}
