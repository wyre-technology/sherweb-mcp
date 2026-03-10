#!/usr/bin/env node
/**
 * Sherweb MCP Server with Decision Tree Architecture
 *
 * This MCP server uses a hierarchical tool loading approach:
 * 1. Initially exposes only a navigation tool
 * 2. After user selects a domain, exposes domain-specific tools
 * 3. Lazy-loads domain handlers on first access
 *
 * Supports both stdio and HTTP transports:
 * - stdio (default): For local Claude Desktop / CLI usage
 * - http: For hosted deployment with optional gateway auth
 *
 * Auth modes:
 * - env (default): Credentials from SHERWEB_CLIENT_ID, SHERWEB_CLIENT_SECRET,
 *   and SHERWEB_SUBSCRIPTION_KEY environment variables
 * - gateway: Credentials injected from request headers by the MCP gateway
 *   - Headers: X-Sherweb-Client-ID, X-Sherweb-Client-Secret, X-Sherweb-Subscription-Key
 *
 * Lazy loading mode (LAZY_LOADING=true):
 * - Exposes meta-tools: sherweb_list_categories, sherweb_list_category_tools,
 *   sherweb_execute_tool, sherweb_router
 *
 * Domains:
 * - billing: Payable charges, billing periods, charge details, pricing
 * - customers: List customers, customer details, accounts receivable
 * - subscriptions: Subscription management, quantity changes
 * - catalog: Product catalog browsing (future capability)
 */

import {
  createServer as createHttpServer,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getDomainHandler, getAvailableDomains } from "./domains/index.js";
import { isDomainName, type DomainName } from "./utils/types.js";
import { getCredentials, resetClient } from "./utils/client.js";
import { logger } from "./utils/logger.js";
import { setServerRef } from "./utils/server-ref.js";
import {
  TOOL_CATEGORIES,
  findDomainForTool,
  routeIntent,
} from "./utils/categories.js";

// Server navigation state
let currentDomain: DomainName | null = null;

// Create the MCP server
const server = new Server(
  {
    name: "mcp-server-sherweb",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

setServerRef(server);

/**
 * Navigation tool - shown when at root (no domain selected)
 */
const navigateTool: Tool = {
  name: "sherweb_navigate",
  description:
    "Navigate to a Sherweb domain to access its tools. Available domains: billing (payable charges, billing periods, charge details), customers (customer list, details, accounts receivable), subscriptions (subscription management, quantity changes), catalog (product catalog browsing).",
  inputSchema: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        enum: getAvailableDomains(),
        description:
          "The domain to navigate to. Choose: billing, customers, subscriptions, or catalog",
      },
    },
    required: ["domain"],
  },
};

/**
 * Back navigation tool - shown when inside a domain
 */
const backTool: Tool = {
  name: "sherweb_back",
  description:
    "Navigate back to the main menu to select a different domain",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

/**
 * Status tool - always available
 */
const statusTool: Tool = {
  name: "sherweb_status",
  description:
    "Show current navigation state and available domains. Also verifies API credentials are configured.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

// ---------------------------------------------------------------------------
// Lazy-loading meta-tools (used when LAZY_LOADING=true)
// ---------------------------------------------------------------------------

const metaTools: Tool[] = [
  {
    name: "sherweb_list_categories",
    description:
      "List all available Sherweb tool categories with descriptions and tool counts. Use this first to discover what the server can do before loading individual tool schemas.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "sherweb_list_category_tools",
    description:
      "List all tools in a specific category with their full schemas. Call this after sherweb_list_categories to see exactly what parameters a tool accepts.",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          enum: Object.keys(TOOL_CATEGORIES),
          description:
            "The category to list tools for (e.g. billing, customers, subscriptions, catalog)",
        },
      },
      required: ["category"],
    },
  },
  {
    name: "sherweb_execute_tool",
    description:
      "Execute any Sherweb tool by name. Use sherweb_list_category_tools first to discover the tool's required arguments.",
    inputSchema: {
      type: "object" as const,
      properties: {
        toolName: {
          type: "string",
          description:
            "The full tool name to execute (e.g. sherweb_customers_list)",
        },
        arguments: {
          type: "object",
          description: "The arguments to pass to the tool",
          additionalProperties: true,
        },
      },
      required: ["toolName"],
    },
  },
  {
    name: "sherweb_router",
    description:
      "Suggest the best Sherweb tool(s) for a given intent. Describe what you want to do in plain language and this tool will recommend which tool(s) to call.",
    inputSchema: {
      type: "object" as const,
      properties: {
        intent: {
          type: "string",
          description:
            "A plain-language description of what you want to accomplish (e.g. 'list all customers', 'get billing charges', 'change subscription quantity')",
        },
      },
      required: ["intent"],
    },
  },
];

/**
 * Check whether lazy-loading mode is enabled via environment variable.
 */
function isLazyLoadingEnabled(): boolean {
  return process.env.LAZY_LOADING === "true";
}

/**
 * Get tools based on current navigation state
 */
async function getToolsForState(): Promise<Tool[]> {
  const tools: Tool[] = [statusTool];

  if (currentDomain === null) {
    tools.unshift(navigateTool);
  } else {
    tools.unshift(backTool);
    const handler = await getDomainHandler(currentDomain);
    const domainTools = handler.getTools();
    tools.push(...domainTools);
  }

  return tools;
}

// Handle ListTools requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
  if (isLazyLoadingEnabled()) {
    return { tools: metaTools };
  }
  const tools = await getToolsForState();
  return { tools };
});

// Handle CallTool requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logger.info("Tool call received", { tool: name, arguments: args });

  try {
    // -----------------------------------------------------------------
    // Lazy-loading meta-tool handlers
    // -----------------------------------------------------------------

    if (name === "sherweb_list_categories") {
      const categories = Object.entries(TOOL_CATEGORIES).map(
        ([categoryName, cat]) => ({
          name: categoryName,
          description: cat.description,
          toolCount: cat.tools.length,
        })
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ categories }, null, 2),
          },
        ],
      };
    }

    if (name === "sherweb_list_category_tools") {
      const category = (args as { category: string }).category;
      if (!isDomainName(category)) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid category: '${category}'. Available categories: ${Object.keys(TOOL_CATEGORIES).join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      const handler = await getDomainHandler(category);
      const tools = handler.getTools();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                category,
                description: TOOL_CATEGORIES[category].description,
                tools: tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  inputSchema: t.inputSchema,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "sherweb_execute_tool") {
      const toolName = (
        args as { toolName: string; arguments?: Record<string, unknown> }
      ).toolName;
      const toolArgs = (
        args as { toolName: string; arguments?: Record<string, unknown> }
      ).arguments ?? {};

      // Validate credentials
      const creds = getCredentials();
      if (!creds) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No API credentials configured. Please set SHERWEB_CLIENT_ID, SHERWEB_CLIENT_SECRET, and SHERWEB_SUBSCRIPTION_KEY environment variables.",
            },
          ],
          isError: true,
        };
      }

      const domain = findDomainForTool(toolName);
      if (!domain) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: '${toolName}'. Use sherweb_list_categories and sherweb_list_category_tools to discover available tools.`,
            },
          ],
          isError: true,
        };
      }

      const handler = await getDomainHandler(domain);
      const result = await handler.handleCall(toolName, toolArgs);

      logger.debug("Meta-tool execute completed", {
        tool: toolName,
        domain,
        responseSize: JSON.stringify(result).length,
      });

      return result;
    }

    if (name === "sherweb_router") {
      const intent = (args as { intent: string }).intent;
      const suggestions = routeIntent(intent);

      if (suggestions.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  intent,
                  suggestions: [],
                  message:
                    "No matching tools found for that intent. Use sherweb_list_categories to browse all available categories.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Enrich suggestions with their category
      const enriched = suggestions.map((toolName) => {
        const domain = findDomainForTool(toolName);
        return {
          tool: toolName,
          category: domain,
          categoryDescription: domain
            ? TOOL_CATEGORIES[domain].description
            : null,
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { intent, suggestions: enriched },
              null,
              2
            ),
          },
        ],
      };
    }

    // Navigate to a domain
    if (name === "sherweb_navigate") {
      const domain = (args as { domain: string }).domain;

      if (!isDomainName(domain)) {
        return {
          content: [
            {
              type: "text",
              text: `Invalid domain: '${domain}'. Available domains: ${getAvailableDomains().join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      // Validate credentials before allowing navigation
      const creds = getCredentials();
      if (!creds) {
        return {
          content: [
            {
              type: "text",
              text: "Error: No API credentials configured. Please set SHERWEB_CLIENT_ID, SHERWEB_CLIENT_SECRET, and SHERWEB_SUBSCRIPTION_KEY environment variables.",
            },
          ],
          isError: true,
        };
      }

      currentDomain = domain;
      const handler = await getDomainHandler(domain);
      const domainTools = handler.getTools();

      logger.info("Navigated to domain", {
        domain,
        toolCount: domainTools.length,
      });

      return {
        content: [
          {
            type: "text",
            text: `Navigated to ${domain} domain.\n\nAvailable tools:\n${domainTools
              .map((t) => `- ${t.name}: ${t.description}`)
              .join("\n")}\n\nUse sherweb_back to return to the main menu.`,
          },
        ],
      };
    }

    // Navigate back to root
    if (name === "sherweb_back") {
      const previousDomain = currentDomain;
      currentDomain = null;

      return {
        content: [
          {
            type: "text",
            text: `Navigated back from ${previousDomain || "root"} to the main menu.\n\nAvailable domains: ${getAvailableDomains().join(", ")}\n\nUse sherweb_navigate to select a domain.`,
          },
        ],
      };
    }

    // Status check
    if (name === "sherweb_status") {
      const creds = getCredentials();
      const credStatus = creds
        ? "Configured"
        : "NOT CONFIGURED - Please set SHERWEB_CLIENT_ID, SHERWEB_CLIENT_SECRET, and SHERWEB_SUBSCRIPTION_KEY environment variables";

      return {
        content: [
          {
            type: "text",
            text: `Sherweb MCP Server Status\n\nCurrent domain: ${currentDomain || "(none - at main menu)"}\nCredentials: ${credStatus}\nAvailable domains: ${getAvailableDomains().join(", ")}`,
          },
        ],
      };
    }

    // Domain-specific tool calls
    if (currentDomain !== null) {
      const handler = await getDomainHandler(currentDomain);
      const domainTools = handler.getTools();
      const toolExists = domainTools.some((t) => t.name === name);

      if (toolExists) {
        const result = await handler.handleCall(
          name,
          args as Record<string, unknown>
        );
        logger.debug("Tool call completed", {
          tool: name,
          responseSize: JSON.stringify(result).length,
        });
        return result;
      }
    }

    // Tool not found
    return {
      content: [
        {
          type: "text",
          text: currentDomain
            ? `Unknown tool: '${name}'. You are in the '${currentDomain}' domain. Use sherweb_back to return to the main menu.`
            : `Unknown tool: '${name}'. Use sherweb_navigate to select a domain first.`,
        },
      ],
      isError: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error("Tool call failed", { tool: name, error: message, stack });
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

/**
 * Start the server with stdio transport (default)
 */
async function startStdioTransport(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const mode = isLazyLoadingEnabled() ? "lazy loading" : "decision tree";
  logger.info(`Sherweb MCP server running on stdio (${mode} mode)`);
}

/**
 * Start the server with HTTP Streamable transport.
 * In gateway mode (AUTH_MODE=gateway), credentials are extracted
 * from request headers.
 */
async function startHttpTransport(): Promise<void> {
  const port = parseInt(process.env.MCP_HTTP_PORT || "8080", 10);
  const host = process.env.MCP_HTTP_HOST || "0.0.0.0";
  const isGatewayMode = process.env.AUTH_MODE === "gateway";

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  });

  const httpServer = createHttpServer(
    (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "localhost"}`
      );

      // Health check - no auth required
      if (url.pathname === "/health") {
        const creds = getCredentials();
        const statusCode = creds ? 200 : 503;

        res.writeHead(statusCode, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: creds ? "ok" : "degraded",
            transport: "http",
            authMode: isGatewayMode ? "gateway" : "env",
            timestamp: new Date().toISOString(),
            credentials: {
              configured: !!creds,
            },
            logLevel: process.env.LOG_LEVEL || "info",
            version: "1.0.0",
          })
        );
        return;
      }

      // MCP endpoint
      if (url.pathname === "/mcp") {
        // Gateway mode: extract credentials from headers
        if (isGatewayMode) {
          const clientId = req.headers["x-sherweb-client-id"] as
            | string
            | undefined;
          const clientSecret = req.headers["x-sherweb-client-secret"] as
            | string
            | undefined;
          const subscriptionKey = req.headers[
            "x-sherweb-subscription-key"
          ] as string | undefined;

          if (!clientId || !clientSecret || !subscriptionKey) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: "Missing credentials",
                message:
                  "Gateway mode requires X-Sherweb-Client-ID, X-Sherweb-Client-Secret, and X-Sherweb-Subscription-Key headers",
                required: [
                  "X-Sherweb-Client-ID",
                  "X-Sherweb-Client-Secret",
                  "X-Sherweb-Subscription-Key",
                ],
              })
            );
            return;
          }

          // Reset client so next request picks up the new credentials
          resetClient();
          process.env.SHERWEB_CLIENT_ID = clientId;
          process.env.SHERWEB_CLIENT_SECRET = clientSecret;
          process.env.SHERWEB_SUBSCRIPTION_KEY = subscriptionKey;
        }

        transport.handleRequest(req, res);
        return;
      }

      // 404 for everything else
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Not found",
          endpoints: ["/mcp", "/health"],
        })
      );
    }
  );

  await server.connect(transport);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      logger.info(
        `Sherweb MCP server listening on http://${host}:${port}/mcp`
      );
      logger.info(
        `Health check available at http://${host}:${port}/health`
      );
      logger.info(
        `Authentication mode: ${isGatewayMode ? "gateway (header-based)" : "env (environment variables)"}`
      );
      resolve();
    });
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down Sherweb MCP server...");
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Main entry point - select transport based on MCP_TRANSPORT env var
 */
async function main() {
  const transportType = process.env.MCP_TRANSPORT || "stdio";
  logger.info("Starting Sherweb MCP server", {
    transport: transportType,
    logLevel: process.env.LOG_LEVEL || "info",
    nodeVersion: process.version,
  });

  if (transportType === "http") {
    await startHttpTransport();
  } else {
    await startStdioTransport();
  }
}

main().catch((error) => {
  logger.error("Fatal startup error", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
