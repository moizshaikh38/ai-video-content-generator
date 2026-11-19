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
