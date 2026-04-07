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
