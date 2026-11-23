/** A requested platform is not permission to silently choose another one. */
export function initialPublishAccount(accounts:any[],platform:string|undefined,disabled:(account:any)=>boolean){
 const eligible=accounts.filter(account=>!disabled(account));
 if(platform)return eligible.find(account=>account.provider===platform)?.id||'';
 return eligible[0]?.id||'';
}
