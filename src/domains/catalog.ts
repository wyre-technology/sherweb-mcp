/**
 * Catalog domain tools for Sherweb MCP Server
 *
 * Handles product catalog browsing.
 * Uses the Service Provider API (v1 Beta): https://api.sherweb.com/service-provider/v1
 *
 * Note: This is a future capability area. The Sherweb API may expand
 * its product catalog endpoints over time.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { serviceProviderRequest } from "../utils/client.js";
import { elicitText } from "../utils/elicitation.js";
import { logger } from "../utils/logger.js";

/**
 * Catalog domain tool definitions
 */
function getTools(): Tool[] {
  return [
    {
      name: "sherweb_catalog_list_products",
      description:
        "List available products in the Sherweb catalog. Browse the product catalog to see available services, SKUs, and pricing tiers.",
      inputSchema: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Search by product name or keyword",
          },
          page: {
            type: "number",
            description: "Page number for pagination (default: 1)",
          },
          pageSize: {
            type: "number",
            description: "Number of items per page (default: 50)",
          },
        },
      },
    },
  ];
}

/**
 * Handle catalog domain tool calls
 */
async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (toolName) {
    case "sherweb_catalog_list_products": {
      let { search, page, pageSize } = args as {
        search?: string;
        page?: number;
        pageSize?: number;
      };

      // Elicit search term if no filters provided
      if (!search && page === undefined) {
        const searchTerm = await elicitText(
          "Would you like to search for a specific product? Enter a name or keyword, or leave blank to list all.",
          "search",
          "Enter a product name or keyword to search for"
        );
        if (searchTerm) search = searchTerm;
      }

      const params: Record<string, string | number | boolean | undefined> = {};
      if (search) params.search = search;
      if (page !== undefined) params.page = page;
      if (pageSize !== undefined) params.pageSize = pageSize;

      logger.info("API call: catalog.listProducts", { params });

      const response = await serviceProviderRequest("/catalog/products", {
        params,
      });

      return {
        content: [
          { type: "text", text: JSON.stringify(response, null, 2) },
        ],
      };
    }

    default:
      return {
        content: [
          { type: "text", text: `Unknown catalog tool: ${toolName}` },
        ],
        isError: true,
      };
  }
}

export const catalogHandler: DomainHandler = { getTools, handleCall };
