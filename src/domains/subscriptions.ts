/**
 * Subscriptions domain tools for Sherweb MCP Server
 *
 * Handles subscription management and quantity changes.
 * Uses the Service Provider API (v1 Beta): https://api.sherweb.com/service-provider/v1
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { serviceProviderRequest } from "../utils/client.js";
import { elicitText, elicitConfirmation } from "../utils/elicitation.js";
import { logger } from "../utils/logger.js";

/**
 * Subscription domain tool definitions
 */
function getTools(): Tool[] {
  return [
    {
      name: "sherweb_subscriptions_list",
      description:
        "List subscriptions for a customer. Returns subscription details including product, quantity, status, and billing cycle.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: {
            type: "string",
            description: "The customer ID to list subscriptions for (required)",
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
        required: ["customerId"],
      },
    },
    {
      name: "sherweb_subscriptions_get",
      description:
        "Get detailed information about a specific subscription including product details, pricing, quantity, and renewal dates.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: {
            type: "string",
            description: "The customer ID",
          },
          subscriptionId: {
            type: "string",
            description: "The unique subscription ID",
          },
        },
        required: ["customerId", "subscriptionId"],
      },
    },
    {
      name: "sherweb_subscriptions_change_quantity",
      description:
        "Change the quantity (number of seats/licenses) for a subscription. This modifies the subscription and may affect billing.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: {
            type: "string",
            description: "The customer ID",
          },
          subscriptionId: {
            type: "string",
            description: "The subscription ID to modify",
          },
          quantity: {
            type: "number",
            description: "The new quantity (number of seats/licenses)",
          },
        },
        required: ["customerId", "subscriptionId", "quantity"],
      },
    },
  ];
}

/**
 * Handle subscription domain tool calls
 */
async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (toolName) {
    case "sherweb_subscriptions_list": {
      const { customerId, page, pageSize } = args as {
        customerId: string;
        page?: number;
        pageSize?: number;
      };

      const params: Record<string, string | number | boolean | undefined> = {};
      if (page !== undefined) params.page = page;
      if (pageSize !== undefined) params.pageSize = pageSize;

      logger.info("API call: subscriptions.list", { customerId, params });

      const response = await serviceProviderRequest(
        `/customers/${customerId}/subscriptions`,
        { params }
      );

      return {
        content: [
          { type: "text", text: JSON.stringify(response, null, 2) },
        ],
      };
    }

    case "sherweb_subscriptions_get": {
      const { customerId, subscriptionId } = args as {
        customerId: string;
        subscriptionId: string;
      };

      logger.info("API call: subscriptions.get", { customerId, subscriptionId });

      const response = await serviceProviderRequest(
        `/customers/${customerId}/subscriptions/${subscriptionId}`
      );

      return {
        content: [
          { type: "text", text: JSON.stringify(response, null, 2) },
        ],
      };
    }

    case "sherweb_subscriptions_change_quantity": {
      const { customerId, subscriptionId, quantity } = args as {
        customerId: string;
        subscriptionId: string;
        quantity: number;
      };

      // Confirm before making changes
      const confirmed = await elicitConfirmation(
        `Are you sure you want to change the quantity of subscription ${subscriptionId} for customer ${customerId} to ${quantity}? This will affect billing.`
      );

      if (confirmed === false) {
        return {
          content: [
            {
              type: "text",
              text: "Quantity change cancelled by user.",
            },
          ],
        };
      }

      logger.info("API call: subscriptions.changeQuantity", {
        customerId,
        subscriptionId,
        quantity,
      });

      const response = await serviceProviderRequest(
        `/customers/${customerId}/subscriptions/${subscriptionId}/change-quantity`,
        {
          method: "POST",
          body: { quantity },
        }
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
          {
            type: "text",
            text: `Unknown subscriptions tool: ${toolName}`,
          },
        ],
        isError: true,
      };
  }
}

export const subscriptionsHandler: DomainHandler = { getTools, handleCall };
