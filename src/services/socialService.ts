import { backendRequest } from './backendClient';

export type SocialPlatform = 'youtube' | 'instagram' | 'tiktok' | 'linkedin' | 'x';

export type SocialConnectionStatus = 'connected' | 'expired' | 'revoked' | 'error';

export interface SafeSocialAccountConnection {
  id: string;
  provider: SocialPlatform;
  account_name: string;
  username?: string | null;
  avatar_url?: string | null;
  status: SocialConnectionStatus;
  scopes: string[];
  connected_at: string;
  last_verified_at?: string | null;
  is_configured: boolean;
}

export interface ConnectedAccountsResponse {
  status: 'ok';
  data: {
    accounts: SafeSocialAccountConnection[];
    configuredProviders: Record<SocialPlatform, boolean>;
  };
}

export interface InitiateConnectResponse {
  status: 'ok';
  data: {
    authorizationUrl: string;
  };
}

export interface InstagramAccountSelection {
  selectionId:string;expiresAt:string;replacesAccountId:string|null;
  choices:Array<{providerAccountId:string;accountName:string;username:string|null;pageId:string;pageName:string|null}>;
}

export const socialService = {
  async getInstagramSelection(id:string):Promise<InstagramAccountSelection>{
    const result=await backendRequest<{status:'ok';data:InstagramAccountSelection}>(`/social/instagram/selections/${encodeURIComponent(id)}`);return result.data;
  },
  async confirmInstagramSelection(id:string,providerAccountId:string,confirmReplacement:boolean):Promise<void>{
    await backendRequest(`/social/instagram/selections/${encodeURIComponent(id)}/confirm`,{method:'POST',body:JSON.stringify({providerAccountId,confirmReplacement})});
  },
  async cancelInstagramSelection(id:string):Promise<void>{
    await backendRequest(`/social/instagram/selections/${encodeURIComponent(id)}/cancel`,{method:'POST'});
  },
  /**
   * Fetches all connected accounts and server provider configuration states
   */
  async getAccounts(): Promise<{
    accounts: SafeSocialAccountConnection[];
    configuredProviders: Record<SocialPlatform, boolean>;
  }> {
    const res = await backendRequest<ConnectedAccountsResponse>('/social/accounts');
    return res.data;
  },

  /**
   * Initiates the OAuth flow by requesting the authorization URL from the server
   */
  async getAuthorizationUrl(provider: SocialPlatform): Promise<string> {
    const res = await backendRequest<InitiateConnectResponse>(`/social/${provider}/connect`, {
      method: 'POST',
    });
    return res.data.authorizationUrl;
  },

  /**
   * Disconnects a connected social account
   */
  async disconnectAccount(connectionId: string): Promise<void> {
    await backendRequest<{ status: 'ok'; message: string }>(`/social/${connectionId}/disconnect`, {
      method: 'POST',
    });
  },

  /**
   * Refreshes an account's OAuth credentials
   */
  async refreshConnection(connectionId: string): Promise<SafeSocialAccountConnection> {
    const res = await backendRequest<{ status: 'ok'; data: { connection: SafeSocialAccountConnection } }>(
      `/social/${connectionId}/refresh`,
      {
        method: 'POST',
      }
    );
    return res.data.connection;
  },
};
