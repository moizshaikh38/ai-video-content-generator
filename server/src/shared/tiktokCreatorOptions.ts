export const TIKTOK_PRIVACY_LEVELS=['PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS','FOLLOWER_OF_CREATOR','SELF_ONLY'] as const;
export type TikTokPrivacyLevel=typeof TIKTOK_PRIVACY_LEVELS[number];
export interface TikTokCreatorOptions {
  nickname:string;username:string;privacyLevels:TikTokPrivacyLevel[];
  commentDisabled:boolean;duetDisabled:boolean;stitchDisabled:boolean;maxVideoSeconds:number;
}
export function isTikTokPrivacyLevel(x:unknown):x is TikTokPrivacyLevel{return typeof x==='string'&&(TIKTOK_PRIVACY_LEVELS as readonly string[]).includes(x);}
export function selectedTikTokPrivacy(payload:{privacy?:unknown;platform_custom?:Record<string,any>}):TikTokPrivacyLevel|null {
  const raw=payload.platform_custom?.tiktok_privacy_level;
  if(raw!==undefined)return isTikTokPrivacyLevel(raw)?raw:null;
  return payload.privacy==='private'?'SELF_ONLY':payload.privacy==='public'?'PUBLIC_TO_EVERYONE':null;
}
export const TIKTOK_PRIVACY_LABELS:Record<TikTokPrivacyLevel,string>={PUBLIC_TO_EVERYONE:'Everyone',MUTUAL_FOLLOW_FRIENDS:'Friends (mutual followers)',FOLLOWER_OF_CREATOR:'Followers',SELF_ONLY:'Only me'};
/** Strict parsed facts, not a claim that the app is reviewed or upload-ready. */
export function parseTikTokCreatorOptions(data:any):TikTokCreatorOptions|null {
  if(!data||typeof data!=='object'||!Array.isArray(data.privacy_level_options)||!data.privacy_level_options.length||data.privacy_level_options.length>4||!data.privacy_level_options.every(isTikTokPrivacyLevel)||new Set(data.privacy_level_options).size!==data.privacy_level_options.length||!['comment_disabled','duet_disabled','stitch_disabled'].every(k=>typeof data[k]==='boolean')||!Number.isInteger(data.max_video_post_duration_sec)||data.max_video_post_duration_sec<=0||typeof data.creator_nickname!=='string'||!data.creator_nickname.trim()||data.creator_nickname.length>256||typeof data.creator_username!=='string'||!data.creator_username.trim()||data.creator_username.length>256)return null;
  return {nickname:data.creator_nickname,username:data.creator_username,privacyLevels:[...data.privacy_level_options],commentDisabled:data.comment_disabled,duetDisabled:data.duet_disabled,stitchDisabled:data.stitch_disabled,maxVideoSeconds:data.max_video_post_duration_sec};
}
