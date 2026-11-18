# Direct-media ingress transport boundary, 2026-11-19

A distinct metadata HEAD request used automatic redirect following after initial URL validation. The streaming GET checked each redirect target but its connection could resolve DNS independently from the validation check.

## Changes

The validated/pinned transport now supports HTTP and HTTPS plus GET and HEAD. Overlay callers retain HTTPS-only behavior and their explicit nonproduction loopback exemption. Direct-media callers have no loopback exemption, even in development.

- Metadata HEAD returns a redirect response without following it. Optional metadata is simply unavailable on that response.
- Every direct-media GET connection resolves and validates the destination, then uses the selected validated address for the actual connection. Existing per-hop URL checks remain. A mixed private/public DNS answer is rejected.
- GET redirect bodies are cancelled before validating the next target.
- The stream timeout and response body are cleaned up on early errors as well as stream completion/failure.
- No YouTube subprocess/network path was changed or qualified by this work.

## Actual bounded integration

`server/scripts/local-qualification/ingress-http-boundary.mts` ran a real local HTTP server and actual UrlIngestionService methods, without media acquisition, probing or encoding. The bytes were a short synthetic non-media string.

The fixture temporarily mapped only its synthetic hostname to loopback and treated that loopback address as public for the transport-limit cases. Product policy was not relaxed. After restoring the real classifier, direct loopback was rejected before a request. This distinction matters: loopback transfer tests do not prove public-address classification by themselves.

Passed:
- exact streamed bytes saved to a new unique file;
- declared-size and actual-chunked overflow rejection;
- metadata HEAD caused only one request and did not follow a redirect;
- GET redirect to the metadata IP was rejected before any target request;
- unmodified private policy rejected loopback before a request.

The prior four streaming safeguard tests also passed when selected without media/probe cases: declared size, streamed size, stalled body timeout and backpressure. Their fixture allowance is now explicit and limited to that test block. The separate 108 focused source/boundary tests and both TypeScript checks pass.

## Limits

No actual private/metadata endpoint was contacted. No public media, production auth, real CDN, YouTube, render or product-output quality was qualified. Direct native requests may behave differently from the old fetch implementation for unusual servers; those compatibility cases remain to be tested against an authorized source. Source-only backup is not production deployment or a security certification.
