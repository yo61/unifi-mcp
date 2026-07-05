# Changelog

## [0.2.0](https://github.com/yo61/unifi-mcp/compare/v0.1.0...v0.2.0) (2026-07-05)


### Features

* add config loader with X-API-KEY and read-only defaults ([a116105](https://github.com/yo61/unifi-mcp/commit/a1161051a31c0312f7d43787aa8f551462a0b3b5))
* add EntityIndex mapping OpenAPI tags to entities ([9b06ea9](https://github.com/yo61/unifi-mcp/commit/9b06ea996e915f58a12ab18b8bd7ae1a83b2c843))
* add error hierarchy, promise cache, logger ([9703609](https://github.com/yo61/unifi-mcp/commit/970360906a256bab963f8552f973257b1c6e9698))
* add four generic MCP tools and error-to-result seam ([f10a501](https://github.com/yo61/unifi-mcp/commit/f10a501de2355e1a56aea5fc3fae41e99760d531))
* add spec types, bundled spec fallback, and update script ([73ec95a](https://github.com/yo61/unifi-mcp/commit/73ec95a4cd1e9e7c251bb7fb7379cfdf3170317a))
* add SpecStore three-source cascade ([d94ece8](https://github.com/yo61/unifi-mcp/commit/d94ece88b3ef47553933c3caaf082b6d174e94f4))
* add UnifiClient with read-only gate and param binding ([71d45a0](https://github.com/yo61/unifi-mcp/commit/71d45a004517cc086b09713eceecddeafbeb9c4e))
* add X-API-KEY http transport with self-signed TLS support ([e230287](https://github.com/yo61/unifi-mcp/commit/e23028736dc533cda35c03cb2101f53970f0a20c))
* surface resolved API base path and per-op requestPath in describe ([17565b6](https://github.com/yo61/unifi-mcp/commit/17565b6ca77adce26a73922c67b5458b04ddc6f0))
* wire MCP server and CLI entrypoint ([7bf73a2](https://github.com/yo61/unifi-mcp/commit/7bf73a2f4e894a128ac083a9b7d3e1782da7324a))
* wire SpecStore to fs cache, live fetch, and OpenAPI deref ([e433851](https://github.com/yo61/unifi-mcp/commit/e433851bb1640ce2966f75c228d1d3e03e27ddf4))


### Bug Fixes

* cover response body read with request timeout; wrap CA cert read error ([2125e11](https://github.com/yo61/unifi-mcp/commit/2125e118e2f67a971163adda93d8fad7df46c35c))
* key TLS dispatcher cache by CA cert content, not length ([cf3f931](https://github.com/yo61/unifi-mcp/commit/cf3f93192241534b12525083d6617dda44d63dca))
* parse upstream spec YAML leniently in update-spec ([d77d988](https://github.com/yo61/unifi-mcp/commit/d77d988275b7c4bbaf77919e9539e115742be5ab))
* resolve API base path from spec mount, not root-relative server url ([44d5aa9](https://github.com/yo61/unifi-mcp/commit/44d5aa9319a08f74ce3bc6f9882001f883cfac9f))
* treat declared-but-empty OpenAPI tags as known entities ([c2d6460](https://github.com/yo61/unifi-mcp/commit/c2d6460335e59bab20e7e731c692372a197ca221))


### Documentation

* add MVP implementation plan ([6e084fe](https://github.com/yo61/unifi-mcp/commit/6e084feeab56b18e9f57416830eba329d188f69e))
* add README, LICENSE, and .env.example ([dc14762](https://github.com/yo61/unifi-mcp/commit/dc1476256502fae62b639e957705b98ba89f4e29))
* add release-engineering decision record and quality criteria ([6199b90](https://github.com/yo61/unifi-mcp/commit/6199b9047482bf6f47427ddc2b2a1455f105ba85))
* add release-engineering design (house process) ([8b63967](https://github.com/yo61/unifi-mcp/commit/8b639673ceaab0bf02cbb119c7a72782ddb8109d))
* add release-engineering implementation plan ([9564d85](https://github.com/yo61/unifi-mcp/commit/9564d852e16eb851272a05d32ca5bbbba1fefdab))
* add spec-driven unifi-mcp design ([37f133b](https://github.com/yo61/unifi-mcp/commit/37f133ba8b3c70ecf2eadb50d0ec6522012f91b0))
* align plan with single-wrap tool design ([f1674c9](https://github.com/yo61/unifi-mcp/commit/f1674c9196829431f75284acb2445e0186130b60))
* correct EntityIndex declared-tag handling in plan ([5368dec](https://github.com/yo61/unifi-mcp/commit/5368dec8a16a587bdbcef5e5c60b859268b26c26))
* correct osv-scanner action ref to its subdirectory in plan ([55bacb4](https://github.com/yo61/unifi-mcp/commit/55bacb4fa93d9e86d32aa4f2066839ec697a6e9d))
* correct TLS dispatcher cache key in plan (content, not length) ([5b95d87](https://github.com/yo61/unifi-mcp/commit/5b95d87637c97c83dad9a81ab31a62536d43d7b3))
* fix commitlint job permissions in release-eng plan ([4e003cb](https://github.com/yo61/unifi-mcp/commit/4e003cb715e4ad6f129f5f2584b2ffb715135640))
* fix plan — named parser import and client fetcher injection ([0978fb6](https://github.com/yo61/unifi-mcp/commit/0978fb6c98389630daa5bfd2269ec2ad1c78c53c))
* guard SARIF upload to non-PR events in release-eng plan ([a42b28e](https://github.com/yo61/unifi-mcp/commit/a42b28eaa117b6ee853bd2d74421a06f5d16d0ed))
* note legacy controller API as future work ([9209fae](https://github.com/yo61/unifi-mcp/commit/9209fae909589c103a71e26d972f8f3498895238))
* revise plan — fix TLS design, defer release engineering ([cc2115f](https://github.com/yo61/unifi-mcp/commit/cc2115f2222128c2d60d0ce689f75b6555dd9c6a))


### Code Refactoring

* tighten domain model per DDD review ([6496af3](https://github.com/yo61/unifi-mcp/commit/6496af3506b9847f520745e69f87219effdcecd2))
* tighten domain model per DDD review ([c80d780](https://github.com/yo61/unifi-mcp/commit/c80d780e28136e2baac45d22f91d082a9eeb102e))
* type tool handlers as never and inject logger into buildTools ([8ec426c](https://github.com/yo61/unifi-mcp/commit/8ec426c22aeba47e41f3e958087cc539d05b2464))
