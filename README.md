# Sherweb MCP Server

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![SafeSkill 96/100](https://img.shields.io/badge/SafeSkill-96%2F100_Verified%20Safe-brightgreen)](https://safeskill.dev/scan/wyre-technology-sherweb-mcp)

A Model Context Protocol (MCP) server for Sherweb cloud marketplace and partner portal. Enables AI assistants to manage customer subscriptions, browse the product catalog, and handle billing operations.

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that connects Claude (or any MCP-compatible AI) to your Sherweb environment.

> **Part of the [MSP Claude Plugins](https://github.com/wyre-technology) ecosystem** — a growing suite of AI integrations for the MSP stack. Built by MSPs, for MSPs.

## Installation

```bash
npm install @wyre-technology/sherweb-mcp
```

## Configuration

Set the following environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `SHERWEB_CLIENT_ID` | Yes | Your Sherweb API client ID |
| `SHERWEB_CLIENT_SECRET` | Yes | Your Sherweb API client secret |
| `SHERWEB_SUBSCRIPTION_KEY` | Yes | Your Sherweb subscription key |
| `MCP_TRANSPORT` | No | Transport mode: stdio (default) or http |

## Usage

### Running with Claude Desktop

Add to your Claude Desktop `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sherweb-mcp": {
      "command": "npx",
      "args": ["@wyre-technology/sherweb-mcp"],
      "env": {
        "SHERWEB_CLIENT_ID": "your-sherweb-client-id"
        "SHERWEB_CLIENT_SECRET": "your-sherweb-client-secret"
        "SHERWEB_SUBSCRIPTION_KEY": "your-sherweb-subscription-key"
      }
    }
  }
}
```

### Running with Claude Code (CLI)

```bash
claude mcp add sherweb-mcp \
  -e SHERWEB_CLIENT_ID=your-value \
  -e SHERWEB_CLIENT_SECRET=your-value \
  -e SHERWEB_SUBSCRIPTION_KEY=your-value \
  -- npx -y @wyre-technology/sherweb-mcp
```

### Docker

```bash
docker build -t sherweb-mcp .
docker run \
  -e SHERWEB_CLIENT_ID=your-value \
  -e SHERWEB_CLIENT_SECRET=your-value \
  -e SHERWEB_SUBSCRIPTION_KEY=your-value \
  -p 8080:8080 sherweb-mcp
```

## Available Domains

### Billing
Billing management and invoice operations

### Catalog
Browse the Sherweb product catalog

### Customers
Customer account management

### Subscriptions
Subscription lifecycle management


## Development

```bash
# Clone the repository
git clone https://github.com/wyre-technology/sherweb-mcp.git
cd sherweb-mcp

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) if present, or open an issue to discuss changes.

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
