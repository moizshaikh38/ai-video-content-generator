# Source object snapshot groundwork

Existing parallel/ranged downloads already sent IfMatch from HEAD ETag. The smaller single-stream branch did not, and did not compare received bytes with HEAD length. It could therefore report success if the same key changed between HEAD and GET or the server returned a self-consistent shorter object.

Single-stream now sends the same IfMatch when an ETag exists and rejects received length different from HEAD. No extra network call, changed credentials or vendor dependency. An absent ETag cannot establish a strong version; length alone does not prove content identity. Existing SHA256 hashes delivered bytes but still must be consumed by a plan identity producer.

Eight localHTTP/storage/chunk tests pass, including normal byte-exact hash,412version-race failure, short-object failure and existing ranged concurrency test. Server typecheck passes. Only local protocol server used; no production storage calls. Cache invalidation, same-path source-version binding and preview/export acceptance remain separate work; this is not a claim that path-keyed cache is now safe.
