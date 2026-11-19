import crypto from 'node:crypto';
import {getMongoDb,getMongoClient} from '../db/mongoClient.js';
import {AppError,type SafeSocialAccountConnection} from '../types/index.js';
import {encryptToken,decryptToken} from '../utils/tokenEncryption.js';
import {socialProviderRegistry} from './social/socialProviderRegistry.js';
import type {OAuthTokenExchangeResult,ProviderAccountIdentity} from './social/types.js';

/** Pending grant uses the existing oauth_states TTL collection, encrypted at
 * rest. No token, OAuth code or scope goes into a redirect or browser response.
 * No choice is a connection until an authenticated owner explicitly confirms.
 */
export class InstagramAccountSelectionService {
  async prepare(userId:string,token:OAuthTokenExchangeResult) {
    const provider=socialProviderRegistry.getProvider('instagram');
    if(!provider.listAccountIdentities)throw new AppError('Instagram selection is unavailable.',503,'INSTAGRAM_ACCOUNT_SELECTION_UNVERIFIED');
    const choices=await provider.listAccountIdentities(token.accessToken);
    if(!choices.length)throw new AppError('No eligible Instagram Professional account was found. Existing connections are unchanged.',409,'INSTAGRAM_ACCOUNT_SELECTION_REQUIRED');
    const db=await getMongoDb(),now=new Date();
    const existing=await db.collection('social_account_connections').findOne({user_id:userId,provider:'instagram'});
    const tokenExpiresAt=typeof token.expiresInSeconds==='number'&&Number.isFinite(token.expiresInSeconds)&&token.expiresInSeconds>0?new Date(now.getTime()+token.expiresInSeconds*1000):null;
    const expiresAt=new Date(Math.min(now.getTime()+600000,tokenExpiresAt?.getTime()??Infinity));
    const id=crypto.randomUUID();
    await db.collection('oauth_states').insertOne({id,user_id:userId,provider:'instagram',kind:'instagram-account-selection',state_hash:crypto.randomBytes(32).toString('hex'),redirect_uri:'',consumed_at:now,created_at:now,updated_at:now,expires_at:expiresAt,selection_status:'pending',encrypted_selection:encryptToken(JSON.stringify({token,choices,tokenExpiresAt:tokenExpiresAt?.toISOString()??null})),existing_connection:existing?{id:existing.id,providerAccountId:existing.provider_account_id,updatedAt:existing.updated_at}:null});
    return {selectionId:id};
  }
  private async read(userId:string,id:string){
    if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))throw new AppError('Account selection is missing or expired.',404,'INSTAGRAM_SELECTION_EXPIRED');
    const db=await getMongoDb();
    const row=await db.collection('oauth_states').findOne({id,user_id:userId,provider:'instagram',kind:'instagram-account-selection',selection_status:'pending',expires_at:{$gt:new Date()}});
    if(!row||typeof row.encrypted_selection!=='string')throw new AppError('Account selection is missing, expired or already completed. Existing connections are unchanged.',409,'INSTAGRAM_SELECTION_EXPIRED');
    return row;
  }
  async choices(userId:string,id:string){
    const row=await this.read(userId,id);const grant=JSON.parse(decryptToken(row.encrypted_selection));
    return {selectionId:row.id,expiresAt:row.expires_at.toISOString(),replacesAccountId:row.existing_connection?.providerAccountId??null,choices:(grant.choices as ProviderAccountIdentity[]).map(c=>({providerAccountId:c.providerAccountId,accountName:c.accountName,username:c.username??null,pageId:c.metadata?.pageId,pageName:c.metadata?.pageName??null}))};
  }
  async cancel(userId:string,id:string){
    const db=await getMongoDb();await db.collection('oauth_states').deleteOne({id,user_id:userId,provider:'instagram',kind:'instagram-account-selection',selection_status:'pending'});
  }
  async confirm(userId:string,id:string,providerAccountId:string,confirmReplacement:boolean):Promise<{connection:SafeSocialAccountConnection}>{
    const row=await this.read(userId,id);const grant=JSON.parse(decryptToken(row.encrypted_selection));
    const chosen=(grant.choices as ProviderAccountIdentity[]).find(c=>c.providerAccountId===providerAccountId);
    if(!chosen)throw new AppError('Choose an account from this exact selection.',409,'INSTAGRAM_SELECTION_INVALID');
    if(row.existing_connection&&row.existing_connection.providerAccountId!==providerAccountId&&!confirmReplacement)throw new AppError('Confirm replacing the existing Instagram destination. It has not changed.',409,'INSTAGRAM_REPLACEMENT_CONFIRMATION_REQUIRED');
    const provider=socialProviderRegistry.getProvider('instagram');
    if(!provider.listAccountIdentities)throw new AppError('Instagram selection is unavailable.',503,'INSTAGRAM_ACCOUNT_SELECTION_UNVERIFIED');
    const fresh=(await provider.listAccountIdentities(grant.token.accessToken)).find(c=>c.providerAccountId===providerAccountId&&c.metadata?.pageId===chosen.metadata?.pageId);
    if(!fresh)throw new AppError('The chosen Instagram account/page is no longer available. Existing connections are unchanged.',409,'INSTAGRAM_SELECTION_STALE');
    const db=await getMongoDb(),client=await getMongoClient(),session=client.startSession();const now=new Date();
    const savedId=row.existing_connection?.id??crypto.randomUUID();
    try{
      await session.withTransaction(async()=>{
        const current=await db.collection('social_account_connections').findOne({user_id:userId,provider:'instagram'},{session});
        if(row.existing_connection?(!current||current.id!==row.existing_connection.id||current.provider_account_id!==row.existing_connection.providerAccountId||current.updated_at?.getTime()!==row.existing_connection.updatedAt?.getTime()):!!current)throw new AppError('Existing connection changed during review. Start a new connection review; no account was replaced.',409,'INSTAGRAM_EXISTING_CONNECTION_CHANGED');
        const other=await db.collection('social_account_connections').findOne({provider:'instagram',provider_account_id:providerAccountId,user_id:{$ne:userId}},{session});
        if(other)throw new AppError('This Instagram account is linked to another Vireo user.',409,'ACCOUNT_ALREADY_LINKED');
        const consumed=await db.collection('oauth_states').findOneAndDelete({id,user_id:userId,provider:'instagram',kind:'instagram-account-selection',selection_status:'pending',expires_at:{$gt:new Date()}},{session});
        if(!consumed)throw new AppError('Selection expired or already completed.',409,'INSTAGRAM_SELECTION_EXPIRED');
        const record={id:savedId,user_id:userId,provider:'instagram',provider_account_id:fresh.providerAccountId,provider_account_name:fresh.accountName,provider_username:fresh.username??null,provider_avatar_url:fresh.avatarUrl??null,access_token:encryptToken(grant.token.accessToken),refresh_token:grant.token.refreshToken?encryptToken(grant.token.refreshToken):null,token_expires_at:grant.tokenExpiresAt?new Date(grant.tokenExpiresAt):null,scopes:grant.token.scopes,status:'connected',metadata:fresh.metadata,last_verified_at:now,last_error_at:null,last_error_code:null,updated_at:now,created_at:current?.created_at??now};
        if(current)await db.collection('social_account_connections').updateOne({id:savedId,user_id:userId,provider:'instagram'},{$set:record},{session});
        else await db.collection('social_account_connections').insertOne(record,{session});
      },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
    }finally{await session.endSession();}
    return {connection:{id:savedId,provider:'instagram',account_name:fresh.accountName,username:fresh.username??null,avatar_url:fresh.avatarUrl??null,status:'connected',scopes:grant.token.scopes,connected_at:now.toISOString(),last_verified_at:now.toISOString(),is_configured:true}};
  }
}
export const instagramAccountSelectionService=new InstagramAccountSelectionService();
