# 1.0.0 (2026-04-07)


### Bug Fixes

* align package name to sherweb-mcp convention ([7efe4c5](https://github.com/wyre-technology/sherweb-mcp/commit/7efe4c56cbd09c9e0bb4142f5a71a9d5eb4be676))


### Features

* initial scaffold with lazy loading support ([aa375d0](https://github.com/wyre-technology/sherweb-mcp/commit/aa375d00e2d9d961a601578ee2437a5567e9e755))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- `GET /health` (and new `GET /healthz`) are now shallow, unauthenticated
  liveness probes that always return `200 {"status":"ok"}`. Previously
  `/health` called `getCredentials()` and returned `503` when no
  process-wide credentials were set, which is always the case in gateway
  mode (`AUTH_MODE=gateway`) where credentials arrive per-request via
  headers. This caused the Azure Container Apps liveness probe to fail and
  SIGTERM-kill the container in a crash loop.
- CI `Test` job: added the missing `.eslintrc.json` so `npm run lint` can
  resolve a config (the reusable `mcp-server-ci.yml` workflow runs lint), and
  resolved the pre-existing `prefer-const` violations it surfaced.

### Added
- `src/health.ts` liveness-probe helpers (`isHealthPath`, `HEALTH_RESPONSE`)
  with unit tests in `src/health.test.ts`, giving the `Test` job a passing
  `vitest run` and covering the new `/health` / `/healthz` behavior.

## [0.1.0] - 2026-03-10

### Added
- Initial scaffold of Sherweb Partner API MCP server
- OAuth 2.0 Client Credentials authentication with token caching and auto-refresh
- Decision-tree navigation architecture with navigate/back flow
- Lazy loading mode (LAZY_LOADING=true) with meta-tools:
  - `sherweb_list_categories` - discover available tool categories
  - `sherweb_list_category_tools` - load tool schemas on demand
  - `sherweb_execute_tool` - execute any tool by name
  - `sherweb_router` - intent-based tool suggestion
- Billing domain: payable charges and charge details (Distributor API v1)
- Customers domain: list, get, and accounts receivable (Service Provider API v1 Beta)
- Subscriptions domain: list, get, and change quantity (Service Provider API v1 Beta)
- Catalog domain: product catalog browsing (Service Provider API v1 Beta)
- Elicitation support for interactive user input during tool calls
- Dual transport support: stdio (default) and HTTP streaming
- Gateway auth mode for hosted deployment with credential injection via headers
- Structured stderr-only logging with configurable LOG_LEVEL
- Health check endpoint for HTTP transport
- Graceful shutdown handling
