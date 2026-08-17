/**
 * Customers domain tools for Sherweb MCP Server
 *
 * Handles customer listing, lookup, and receivable charges.
 * Uses the Service Provider API (v1 Beta): https://api.sherweb.com/service-provider/v1
 *
 * GetCustomers publishes no query parameters — it returns the full customer
 * collection — so search and single-customer lookup are applied client-side.
 * Receivable charges are keyed off a `customerId` query parameter rather than
 * a nested customer path.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { serviceProviderRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";

/** Shape of the documented Customers response. */
interface Customers {
  items?: Array<Record<string, unknown>>;
}

/**
 * Customer domain tool definitions
 */
function getTools(): Tool[] {
  return [
    {
      name: "sherweb_customers_list",
      description:
        "List every customer under your service provider account, with display name, ID, hierarchy path, suspension state and company contact information.",
      inputSchema: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description:
              "Optional case-insensitive filter on customer display name. Sherweb returns the full list, so this is applied locally.",
          },
        },
      },
    },
    {
      name: "sherweb_customers_get",
      description:
        "Get one customer by ID. Sherweb exposes customers only as a collection, so this reads the list and selects the match.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: {
            type: "string",
            description: "The customer's unique ID (UUID)",
          },
        },
        required: ["customerId"],
      },
    },
    {
      name: "sherweb_customers_accounts_receivable",
      description:
        "Get the receivable charges you bill a customer for a billing period — recurring, usage and setup charges with cost, quantity and currency.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: {
            type: "string",
            description: "The customer's unique ID (UUID)",
          },
          date: {
            type: "string",
            description:
              "Any date inside the desired billing period, format yyyy-MM-dd (UTC). Defaults to today.",
          },
        },
        required: ["customerId"],
      },
    },
  ];
}

/**
 * Fetch the full customer collection.
 */
async function fetchCustomers(): Promise<Customers> {
  logger.info("API call: customers.list");
  return serviceProviderRequest<Customers>("/customers");
}

/**
 * Handle customer domain tool calls
 */
async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (toolName) {
    case "sherweb_customers_list": {
      const { search } = args as { search?: string };

      const response = await fetchCustomers();

      if (!search) {
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      }

      const needle = search.toLowerCase();
      const items = (response.items ?? []).filter((c) =>
        String(c.displayName ?? "").toLowerCase().includes(needle)
      );

      return {
        content: [{ type: "text", text: JSON.stringify({ items }, null, 2) }],
      };
    }

    case "sherweb_customers_get": {
      const { customerId } = args as { customerId: string };

      logger.info("API call: customers.get", { customerId });

      const response = await fetchCustomers();
      const customer = (response.items ?? []).find((c) => c.id === customerId);

      if (!customer) {
        return {
          content: [
            {
              type: "text",
              text: `Customer '${customerId}' was not found under this service provider account. Use sherweb_customers_list to see available customers.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(customer, null, 2) }],
      };
    }

    case "sherweb_customers_accounts_receivable": {
      const { customerId, date } = args as {
        customerId: string;
        date?: string;
      };

      const params: Record<string, string | undefined> = { customerId };
      if (date) params.date = date;

      logger.info("API call: customers.receivableCharges", { params });

      const response = await serviceProviderRequest(
        "/billing/receivable-charges",
        { params }
      );

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    default:
      return {
        content: [
          { type: "text", text: `Unknown customers tool: ${toolName}` },
        ],
        isError: true,
      };
  }
}

export const customersHandler: DomainHandler = { getTools, handleCall };
