# Twitch clip imports

This is an import-only OAuth connection, separate from publishing connections. It is implemented locally but has not yet been exercised against a real Twitch account. Do not describe live acquisition as verified until that test is complete.

## Current scope

- Completed clips from the connected broadcaster's own channel, through Twitch's official clip metadata and download endpoints.
- Explicit connect and disconnect controls in the existing dashboard Home workflow. Visual and browser-interaction qualification is still pending.
- Existing YouTube, direct-media and file-upload paths remain in place. YouTube acquisition rejects known live/upcoming/post-live processing states and applies the same completed-video filter during download.
- Twitch VOD and Kick links are recognized but return an explicit unavailable error with file-upload guidance. They are not implemented download capabilities. Live/channel links are rejected.
- No third-party scraping service, paid fallback, automatic account connection or publishing scope.

## Configuration, not activation

The server reads `TWITCH_IMPORT_CLIENT_ID`, `TWITCH_IMPORT_CLIENT_SECRET` and `TWITCH_IMPORT_REDIRECT_URI`. Leave them unset to keep connect unavailable. The redirect URI must match the provider registration exactly, ending in `/api/imports/twitch/callback`. Use HTTPS outside local development. Secrets belong in the server's secret manager, never the client bundle or source control. The existing production social-token encryption key must be valid.

Creating a provider application, changing live authentication settings, adding credentials or scopes, connecting an account and deploying are separate activation steps requiring the owner's approval. This implementation does none of them.

Twitch requests `channel:manage:clips`, not a read-only scope. The dashboard says this before redirecting. Imports currently accept only the broadcaster's own clips, not editor access or arbitrary public clips. Official authorization may permit more than downloading, so review the consent screen before approving.

## Connection handling

State is random, hashed at rest, expires after ten minutes and is single use. A new attempt supersedes an older one. Disconnect clears pending authorization and stored credentials; an in-flight callback cannot reconnect afterward. The server attempts Twitch revocation and returns `remoteRevocationConfirmed: false` if it cannot confirm that step. Local disconnect is not a claim of remote revocation.

Access and refresh tokens use the existing AES-GCM storage helper. Tokens are validated for application, user, scope and expiry. Refresh uses a conditional update so it cannot overwrite a changed/disconnected connection. Callback responses contain no token and redirect only to the configured dashboard origin. Import responses use no-store headers.

Official API responses are bounded to 1 MiB and ten seconds, with redirects disabled. Signed media URLs are accepted only from HTTPS Twitch CDN hosts and then use the existing public-address-pinned streaming downloader. Project metadata stores the canonical clip link and ID, not the temporary media URL. Live CDN hostname compatibility remains unverified.

## Local tests

The parser checks run without a database. The OAuth/service/route integration group is opt-in using `TWITCH_IMPORT_TEST_MONGODB_URI`, which must point to an isolated local Mongo instance. The group creates a randomly named database and deletes it afterward. Provider HTTP and authentication verification are mocked, so passing is not evidence of live authorization or provider access.

From `server`, with an isolated local Mongo URI set:

```sh
node --import tsx --test --test-concurrency=1 src/tests/twitchImport.test.ts
```

The integration group covers encrypted per-user credentials, scope/client/user mismatches, foreign-channel rejection, signed-media constraints, refresh, state expiry/replay/denial, callback/disconnect races, authenticated routes and callback redirects. Browser pixels, full application typecheck and live-provider acquisition remain separate qualification work.

Sources consulted for the original integration:

- https://dev.twitch.tv/docs/api/reference/clips
- https://dev.twitch.tv/docs/authentication/getting-tokens-oauth
- https://dev.twitch.tv/docs/authentication/validate-tokens
- https://dev.twitch.tv/docs/authentication/revoke-tokens
- https://api.kick.com/swagger/doc.yaml
