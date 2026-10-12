# Dependency review — 12 October 2026

The supplied hosting starter contained outdated packages. Available fixes were applied: Next 16.3.8, React/React DOM/server DOM 19.2.8, Vite 8.0.16, sharp 0.35.5, image-size 2.0.3, undici 7.29.1, ws 8.21.0 and esbuild 0.28.2, plus compatible lockfile updates. Tests, TypeScript checking, migration generation and the production build passed afterward.

The remaining root npm audit warnings all trace to one upstream issue: `braces` stack exhaustion from deeply nested glob patterns (GHSA-vfj7-8cjw-p6xm). No patched braces release was available. It produces eight package-level warnings through linting/build dependency paths, including Vinext's Vite plugins. These tools process this repository's fixed, trusted source patterns, not visitor-supplied patterns. The deployed endpoints do not accept glob patterns. The obsolete Esbuild development-server issues and critical Next image-response issue no longer appear in the updated audit.

The collector also inherits the braces issue through `alexa-cookie2`'s `http-proxy-middleware` dependency. The cloud collector does not start the package's login proxy or accept incoming HTTP requests; it only reads a previously registered session and makes outbound requests. Do not add an internet-facing login proxy to the cloud collector. Recheck this advisory before adding any user-supplied pattern processing or widening access to the private repository.

This is a scoped assessment, not a claim of an entirely vulnerability-free dependency tree. No alerts were suppressed or dismissed. The repository and Site remain private, all collector endpoints require a separate writer secret, and credentials are never included in source, build output, CSV exports or browser responses.
