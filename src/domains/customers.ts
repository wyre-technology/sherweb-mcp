/**
 * Customers domain tools for Sherweb MCP Server
 *
 * Handles customer listing, details, and accounts receivable.
 * Uses the Service Provider API (v1 Beta): https://api.sherweb.com/service-provider/v1
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { serviceProviderRequest } from "../utils/client.js";
import { elicitText } from "../utils/elicitation.js";
import { logger } from "../utils/logger.js";

/**
 * Customer domain tool definitions
 */
function getTools(): Tool[] {
  return [
    {
      name: "sherweb_customers_list",
      description:
        "List customers managed by the service provider. Returns customer details including name, status, and identifiers.",
      inputSchema: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Search by customer name or identifier",
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
    {
      name: "sherweb_customers_get",
      description:
        "Get detailed information about a specific customer by their ID.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: {
            type: "string",
            description: "The unique customer ID",
          },
        },
        required: ["customerId"],
      },
    },
    {
      name: "sherweb_customers_accounts_receivable",
      description:
        "Get accounts receivable information for a specific customer. Shows outstanding balances and payment status.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: {
            type: "string",
            description: "The unique customer ID",
          },
        },
        required: ["customerId"],
      },
    },
  ];
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
      let { search, page, pageSize } = args as {
        search?: string;
        page?: number;
        pageSize?: number;
      };

      // Elicit search term if no filters provided
      if (!search && page === undefined) {
        const searchTerm = await elicitText(
          "Would you like to search for a specific customer? Enter a name or keyword, or leave blank to list all.",
          "search",
          "Enter a customer name or keyword to search for"
        );
        if (searchTerm) search = searchTerm;
      }

      const params: Record<string, string | number | boolean | undefined> = {};
      if (search) params.search = search;
      if (page !== undefined) params.page = page;
      if (pageSize !== undefined) params.pageSize = pageSize;

      logger.info("API call: customers.list", { params });

      const response = await serviceProviderRequest("/customers", { params });

      return {
        content: [
          { type: "text", text: JSON.stringify(response, null, 2) },
        ],
      };
    }

    case "sherweb_customers_get": {
      const { customerId } = args as { customerId: string };

      logger.info("API call: customers.get", { customerId });

      const response = await serviceProviderRequest(`/customers/${customerId}`);

      return {
        content: [
          { type: "text", text: JSON.stringify(response, null, 2) },
        ],
      };
    }

    case "sherweb_customers_accounts_receivable": {
      const { customerId } = args as { customerId: string };

      logger.info("API call: customers.accountsReceivable", { customerId });

      const response = await serviceProviderRequest(
        `/customers/${customerId}/accounts-receivable`
      );

      return {
        content: [
          { type: "text", text: JSON.stringify(response, null, 2) },
        ],
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
