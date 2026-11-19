export interface TikTokCommercialSelection {disclose:boolean;ownBrand:boolean;brandedContent:boolean}
export function tikTokCommercialErrors(value:TikTokCommercialSelection,privacy:string|null):string[]{
  const errors:string[]=[];
  if(value.disclose&&!value.ownBrand&&!value.brandedContent)errors.push('Indicate whether this content promotes your brand, a third party, or both.');
  if(!value.disclose&&(value.ownBrand||value.brandedContent))errors.push('Commercial labels need the content disclosure setting enabled.');
  if(value.disclose&&value.brandedContent&&privacy&& !['PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS'].includes(privacy))errors.push('Branded content visibility must be Everyone or Friends, not private or followers-only. Choose another supported audience; it will not be changed automatically.');
  return errors;
}
export function tikTokCommercialSelection(custom?:Record<string,any>):TikTokCommercialSelection{return{disclose:custom?.tiktok_content_disclosure===true,ownBrand:custom?.tiktok_own_brand===true,brandedContent:custom?.tiktok_branded_content===true};}
export function tikTokMusicDeclaration(branded:boolean):string{return branded?"By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.":"By posting, you agree to TikTok's Music Usage Confirmation.";}
