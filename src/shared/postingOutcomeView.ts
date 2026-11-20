/** UI presentation from persisted posting evidence, never an external status check. */
export interface PostingOutcomeInput {
  status:string;provider:string;provider_account_id?:string|null;
  provider_post_id?:string|null;provider_post_url?:string|null;
  last_error_code?:string|null;last_error_message?:string|null;
  payload?:{privacy?:string;platform_custom?:Record<string,any>};
}
export interface PostingOutcomeView {
  statusLabel:string;tone:'success'|'warning'|'error'|'neutral';
  feedbackLabel:string|null;feedback:string|null;
  destination:string;visibility:string;receipt:string|null;
  verifiedLink:string|null;canRetry:boolean;
}
function httpsLink(value:unknown):string|null {
  if(typeof value!=='string')return null;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?value:null;}catch{return null;}
}
export function postingOutcomeView(post:PostingOutcomeInput):PostingOutcomeView {
  const unknown=post.last_error_code==='PUBLISH_OUTCOME_UNKNOWN';
  const published=post.status==='published';
  const review=published&&Boolean(post.last_error_code||post.last_error_message);
  const awaiting=post.status==='publishing';
  const privacy=post.payload?.privacy;
  const level=post.payload?.platform_custom?.tiktok_privacy_level;
  const tiktokLabels:Record<string,string>={SELF_ONLY:'Only me',PUBLIC_TO_EVERYONE:'Everyone',MUTUAL_FOLLOW_FRIENDS:'Friends (mutual followers)',FOLLOWER_OF_CREATOR:'Followers'};
  const visibility=post.provider==='tiktok'&&typeof level==='string'&&Object.prototype.hasOwnProperty.call(tiktokLabels,level)?tiktokLabels[level]+' (requested)':privacy==='public'?(post.provider==='instagram'?'Account audience (requested)':'Public (requested)'):privacy==='private'?'Private (requested)':privacy==='unlisted'?'Unlisted (requested)':'Not recorded';
  const verifiedLink=published?httpsLink(post.provider_post_url):null;
  let feedbackLabel:string|null=null,feedback:string|null=null;
  if(unknown&&!published){feedbackLabel='Check selected account';feedback=post.last_error_message||'The platform may have received this submission. Publication is unconfirmed. Do not submit it again before checking the selected account.';}
  else if(review){feedbackLabel='Published, review details';feedback=post.last_error_message||'Publication was confirmed, but some details need review on the selected account. Do not repost automatically.';}
  else if(awaiting){feedbackLabel='Awaiting platform confirmation';feedback='This is not confirmed publication. Refresh history for the latest saved result. Do not upload the same clip again while confirmation is pending.';}
  else if(post.last_error_message){feedbackLabel=post.status==='failed'?'Publishing error':'Saved feedback';feedback=post.last_error_message;}
  else if(published&&!verifiedLink){feedbackLabel='No public link returned';feedback='Publication was confirmed, but no public viewing link is available here. Check the selected account. Private posts may not have a public link.';}
  return {
    statusLabel:published?'Published':unknown?'Delivery unconfirmed':awaiting?'Awaiting confirmation':post.status==='scheduled'?'Scheduled':post.status==='failed'?'Failed':post.status==='cancelled'?'Cancelled':post.status==='draft'?'Draft':'Unknown saved status',
    tone:published?(review?'warning':'success'):unknown?'warning':post.status==='failed'?'error':'neutral',
    feedbackLabel,feedback,
    destination:post.provider_account_id?`${post.provider} account ID: ${post.provider_account_id}`:'Selected account ID not recorded',
    visibility,receipt:post.provider_post_id||null,verifiedLink,
    canRetry:post.status==='failed'&&!unknown,
  };
}
