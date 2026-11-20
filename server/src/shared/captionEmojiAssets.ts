/** Exactly these bundled graphics are client-addressable. This is a virtual
 * asset URL, not a filesystem path or arbitrary static-file prefix. */
export const CAPTION_EMOJI_ASSET_IDS=['1f4a1','1f3ae','2764','1f3c6']as const;
export type CaptionEmojiAssetId=typeof CAPTION_EMOJI_ASSET_IDS[number];
export function captionEmojiAssetId(value:unknown):CaptionEmojiAssetId|null{
 if(typeof value!=='string')return null;
 return CAPTION_EMOJI_ASSET_IDS.find(id=>value===`/caption-emojis/${id}.png`)??null;
}
export function captionEmojiAssetUrl(id:CaptionEmojiAssetId):string{return `/caption-emojis/${id}.png`;}
