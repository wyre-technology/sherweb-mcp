/**
 * Catalog domain tools for Sherweb MCP Server
 *
 * Handles product catalog browsing.
 * Uses the Service Provider API (v1 Beta): https://api.sherweb.com/service-provider/v1
 *
 * Sherweb has no global product catalog — catalogs are scoped per customer,
 * because available offers and terms differ by customer. The endpoint takes no
 * query parameters, so search is applied client-side over the returned items.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { serviceProviderRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";

/** Localized text as returned by the catalog endpoint. */
interface Translation {
  culture?: string;
  value?: string;
}

/** Shape of the documented CustomerCatalog response. */
interface CustomerCatalog {
  customerId?: string;
  catalogItems?: Array<{
    sku?: string;
    name?: Translation[];
    description?: Translation[];
    billingCycle?: string;
    commitmentTerm?: string;
  }>;
}

/**
 * Catalog domain tool definitions
 */
function getTools(): Tool[] {
  return [
    {
      name: "sherweb_catalog_list_products",
      description:
        "List the products a specific customer can be sold, with SKU, localized name and description, billing cycle and commitment term. Catalogs are per-customer in Sherweb — there is no global product list.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: {
            type: "string",
            description:
              "The customer whose catalog to browse (UUID). Required — offers differ per customer.",
          },
          search: {
            type: "string",
            description:
              "Optional case-insensitive filter on SKU or product name. Sherweb returns the full catalog, so this is applied locally.",
          },
        },
        required: ["customerId"],
      },
    },
  ];
}

/** Does a catalog item match the search needle, in any culture? */
function itemMatches(
  item: NonNullable<CustomerCatalog["catalogItems"]>[number],
  needle: string
): boolean {
  if (String(item.sku ?? "").toLowerCase().includes(needle)) return true;
  return (item.name ?? []).some((n) =>
    String(n.value ?? "").toLowerCase().includes(needle)
  );
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
      const { customerId, search } = args as {
        customerId: string;
        search?: string;
      };

      logger.info("API call: catalog.getCustomerCatalog", { customerId });

      const response = await serviceProviderRequest<CustomerCatalog>(
        `/customer-catalogs/${customerId}`
      );

      if (!search) {
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      }

      const needle = search.toLowerCase();
      const catalogItems = (response.catalogItems ?? []).filter((item) =>
        itemMatches(item, needle)
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ...response, catalogItems }, null, 2),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown catalog tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const catalogHandler: DomainHandler = { getTools, handleCall };
