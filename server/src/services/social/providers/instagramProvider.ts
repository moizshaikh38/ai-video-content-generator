import {META_GRAPH_BASE,META_GRAPH_VERSION} from '../metaGraphVersion.js';
import { config } from '../../../config/index.js';
import { AppError } from '../../../types/index.js';
import {
  SocialOAuthProvider,
  OAuthAuthorizationUrlResult,
  OAuthTokenExchangeResult,
  ProviderAccountIdentity,
  RefreshTokenResult,
} from '../types.js';

/**
 * Instagram / Meta Graph API OAuth Provider
 * Flow uses Meta / Facebook Login for Instagram Professional/Creator accounts
 * Auth: versioned Facebook Login authorization endpoint
 * Token exchange: versioned Meta token endpoint
 * Scopes: instagram_basic, instagram_content_publish, pages_show_list, pages_read_engagement
 */
export class InstagramOAuthProvider implements SocialOAuthProvider {
  readonly platform = 'instagram' as const;

  private readonly defaultScopes = [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
  ];

  isConfigured(): boolean {
    return Boolean(config.metaClientId && config.metaClientSecret);
  }

  async getAuthorizationUrl(state: string, redirectUri?: string): Promise<OAuthAuthorizationUrlResult> {
    if (!this.isConfigured()) {
      throw new AppError(
        'Meta / Instagram OAuth is not configured. Please set META_CLIENT_ID and META_CLIENT_SECRET.',
        503,
        'PROVIDER_NOT_CONFIGURED'
      );
    }

    const rUri = redirectUri || config.metaRedirectUri;
    const params = new URLSearchParams({
      client_id: config.metaClientId,
      redirect_uri: rUri,
      state,
      scope: this.defaultScopes.join(','),
      response_type: 'code',
    });

    return {
      url: `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params.toString()}`,
      state,
    };
  }

  private async readGrantedScopes(accessToken:string):Promise<string[]> {
    const res=await fetch(`${META_GRAPH_BASE}/me/permissions`,{headers:{Authorization:`Bearer ${accessToken}`},redirect:'error',signal:AbortSignal.timeout(15000)});
    const data=await res.json() as any;
    if(!res.ok || !Array.isArray(data?.data) || data.paging?.next)throw new AppError('Current Meta permissions could not be verified. No requested permission will be assumed granted.',409,'INSTAGRAM_PERMISSIONS_UNVERIFIED');
    return [...new Set<string>(data.data.filter((p:any)=>p?.status==='granted'&&typeof p.permission==='string').map((p:any)=>p.permission))];
  }

  async exchangeCode(code: string, redirectUri?: string): Promise<OAuthTokenExchangeResult> {
    if (!this.isConfigured()) {
      throw new AppError('Meta / Instagram OAuth credentials missing.', 503, 'PROVIDER_NOT_CONFIGURED');
    }

    const rUri = redirectUri || config.metaRedirectUri;
    const tokenUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', config.metaClientId);
    tokenUrl.searchParams.set('client_secret', config.metaClientSecret);
    tokenUrl.searchParams.set('redirect_uri', rUri);
    tokenUrl.searchParams.set('code', code);

    const res = await fetch(tokenUrl.toString(),{redirect:'error',signal:AbortSignal.timeout(15000)});
    const data = await res.json() as any;

    if (!res.ok || data.error) {
      throw new AppError(
        'Instagram token exchange failed.',
        400,
        'OAUTH_EXCHANGE_FAILED'
      );
    }

    if(typeof data.access_token!=='string'||!data.access_token.trim())throw new AppError('Meta did not return a usable token.',502,'OAUTH_EXCHANGE_FAILED');

    // Attempt the documented short-to-long-lived token exchange; retain only actual expiry evidence.
    let finalAccessToken = data.access_token;
    let expiresIn = typeof data.expires_in==='number'&&data.expires_in>0 ? data.expires_in : null;

    try {
      const longLivedUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
      longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
      longLivedUrl.searchParams.set('client_id', config.metaClientId);
      longLivedUrl.searchParams.set('client_secret', config.metaClientSecret);
      longLivedUrl.searchParams.set('fb_exchange_token', data.access_token);

      const llRes = await fetch(longLivedUrl.toString(),{redirect:'error',signal:AbortSignal.timeout(15000)});
      if (llRes.ok) {
        const llData = await llRes.json() as any;
        if (llData.access_token) {
          finalAccessToken = llData.access_token;
          expiresIn = typeof llData.expires_in==='number'&&llData.expires_in>0 ? llData.expires_in : null;
        }
      }
    } catch {
      // Continue with original access token
    }

    return {
      accessToken: finalAccessToken,
      refreshToken: null, // Meta long-lived tokens refresh by exchanging existing token
      expiresInSeconds: expiresIn,
      tokenType: data.token_type || 'Bearer',
      scopes: await this.readGrantedScopes(finalAccessToken),
    };
  }

  async refreshAccessToken(currentAccessToken: string): Promise<RefreshTokenResult> {
    if (!this.isConfigured()) {
      throw new AppError('Meta / Instagram OAuth credentials missing.', 503, 'PROVIDER_NOT_CONFIGURED');
    }

    const url = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', config.metaClientId);
    url.searchParams.set('client_secret', config.metaClientSecret);
    url.searchParams.set('fb_exchange_token', currentAccessToken);

    const res = await fetch(url.toString(),{redirect:'error',signal:AbortSignal.timeout(15000)});
    const data = await res.json() as any;

    if (!res.ok || data.error) {
      throw new AppError(
        'Instagram token refresh failed.',
        401,
        'TOKEN_REFRESH_FAILED'
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: null,
      expiresInSeconds: typeof data.expires_in==='number'&&data.expires_in>0 ? data.expires_in : null,
      scopes:await this.readGrantedScopes(data.access_token),
    };
  }

  /** Only follows validated opaque cursors on our fixed Graph endpoint, never
   * provider-supplied next URLs which could redirect bearer credentials. */
  async listAccountIdentities(accessToken:string):Promise<ProviderAccountIdentity[]> {
    const accounts=new Map<string,ProviderAccountIdentity>();const seen=new Set<string>();
    let after:string|undefined;
    for(let page=0;page<5;page++){
      const url=new URL(`${META_GRAPH_BASE}/me/accounts`);
      url.searchParams.set('fields','id,name,instagram_business_account{id,username,name,profile_picture_url}');url.searchParams.set('limit','100');
      if(after)url.searchParams.set('after',after);
      const response=await fetch(url.toString(),{headers:{Authorization:`Bearer ${accessToken}`},redirect:'error',signal:AbortSignal.timeout(15000)});
      const data=await response.json() as any;
      if(!response.ok||!Array.isArray(data?.data)||data.data.length>100||data.error)throw new AppError('Meta account choices could not be verified. Existing connections are unchanged.',409,'INSTAGRAM_ACCOUNT_SELECTION_UNVERIFIED');
      for(const item of data.data){
        if(!item||typeof item!=='object')throw new AppError('Meta account choices were malformed.',409,'INSTAGRAM_ACCOUNT_SELECTION_UNVERIFIED');
        const ig=item.instagram_business_account;if(!ig)continue;
        if(typeof item.id!=='string'||!/^\d+$/.test(item.id)||typeof ig.id!=='string'||!/^\d+$/.test(ig.id)||typeof ig.username!=='string'||!ig.username.trim()||ig.username.length>256||ig.name!==undefined&&typeof ig.name!=='string')throw new AppError('Instagram choice identity could not be verified.',409,'INSTAGRAM_ACCOUNT_SELECTION_UNVERIFIED');
        const candidate:ProviderAccountIdentity={providerAccountId:ig.id,accountName:ig.name||ig.username,username:ig.username,avatarUrl:null,metadata:{pageId:item.id,pageName:typeof item.name==='string'?item.name:null,instagramBusinessId:ig.id}};
        const prior=accounts.get(ig.id);
        if(prior&&prior.metadata?.pageId!==item.id)throw new AppError('Instagram account has conflicting page bindings. Existing connections are unchanged.',409,'INSTAGRAM_ACCOUNT_SELECTION_UNVERIFIED');
        accounts.set(ig.id,candidate);
      }
      if(!data.paging?.next)return [...accounts.values()];
      const cursor=data.paging?.cursors?.after;
      if(typeof cursor!=='string'||!cursor||cursor.length>4096||seen.has(cursor))throw new AppError('Meta account pagination could not be verified.',409,'INSTAGRAM_ACCOUNT_SELECTION_UNVERIFIED');
      seen.add(cursor);after=cursor;
    }
    throw new AppError('Meta returned more accounts than can be reviewed in one bounded selection. Existing connections are unchanged.',409,'INSTAGRAM_ACCOUNT_SELECTION_UNVERIFIED');
  }

  async getAccountIdentity(accessToken: string): Promise<ProviderAccountIdentity> {
    // 1. Fetch user accounts/pages to find linked Instagram Business/Creator Account
    const pagesRes = await fetch(
      `${META_GRAPH_BASE}/me/accounts?fields=instagram_business_account{id,username,name,profile_picture_url}`,
      {headers:{Authorization:`Bearer ${accessToken}`},redirect:'error',signal:AbortSignal.timeout(15000)}
    );

    if (pagesRes.ok) {
      const pagesData = await pagesRes.json() as any;
      if (pagesData.data && pagesData.data.length > 0) {
        const eligible=pagesData.data.filter((p:any)=>p.instagram_business_account);
        if(eligible.length>1 || pagesData.paging?.next)throw new AppError('Multiple or additional Meta pages may be available. Select the intended Instagram account before connecting; no first account was chosen.',409,'INSTAGRAM_ACCOUNT_SELECTION_REQUIRED');
        for (const page of eligible) {
          if (page.instagram_business_account) {
            const ig = page.instagram_business_account;
            if(typeof ig.id!=='string'||!/^\d+$/.test(ig.id)||typeof ig.username!=='string'||!ig.username.trim())throw new AppError('Instagram account identity could not be verified.',409,'INSTAGRAM_ACCOUNT_SELECTION_REQUIRED');
            return {
              providerAccountId: ig.id,
              accountName: ig.name || ig.username || 'Instagram Business',
              username: ig.username || null,
              avatarUrl: ig.profile_picture_url || null,
              metadata: {
                pageId: page.id,
                instagramBusinessId: ig.id,
              },
            };
          }
        }
      }
    }

    throw new AppError('No single verified Instagram Professional account was found. Connect the intended account before publishing.',409,'INSTAGRAM_ACCOUNT_SELECTION_REQUIRED');
  }

  normalizeError(error: unknown): string {
    if (error instanceof AppError) return error.message;
    if (error instanceof Error) return error.message;
    return 'An error occurred during Instagram OAuth.';
  }
}
