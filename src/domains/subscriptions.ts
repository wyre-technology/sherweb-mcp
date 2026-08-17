/**
 * Subscriptions domain tools for Sherweb MCP Server
 *
 * Handles subscription listing, detail lookup, and quantity amendments.
 * Uses the Service Provider API (v1 Beta): https://api.sherweb.com/service-provider/v1
 *
 * Sherweb keys subscriptions off a `customerId` query parameter rather than a
 * nested customer path, and exposes no single-subscription endpoint — detail
 * lookup reads the customer's collection and selects the match.
 *
 * Quantity changes are asynchronous: POSTing an amendment returns an
 * amendment ID plus a tracking ID, and the caller polls
 * sherweb_subscriptions_amendment_status for the outcome.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { serviceProviderRequest } from "../utils/client.js";
import { elicitConfirmation } from "../utils/elicitation.js";
import { logger } from "../utils/logger.js";
import {
  buildSubscriptionCard,
  SUBSCRIPTION_CARD_META,
} from "../card.builder.js";

/** Shape of the documented Subscriptions / CustomerSubscriptions responses. */
interface SubscriptionCollection {
  items?: Array<Record<string, unknown>>;
}

/** Documented response of a successful amendment submission. */
interface AmendmentReceipt {
  subscriptionsAmendmentId?: string;
  trackingId?: { requestTrackingId?: string };
}

/**
 * Subscription domain tool definitions
 */
function getTools(): Tool[] {
  return [
    {
      name: "sherweb_subscriptions_list",
      description:
        "List a customer's subscriptions with product name, SKU, quantity, billing cycle, purchase date, fees and commitment term.",
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
      name: "sherweb_subscriptions_get",
      description:
        "Get one subscription's full details. Sherweb exposes subscriptions only per customer, so this reads that customer's subscription details and selects the match.",
      _meta: SUBSCRIPTION_CARD_META,
      inputSchema: {
        type: "object",
        properties: {
          customerId: {
            type: "string",
            description: "The customer's unique ID (UUID)",
          },
          subscriptionId: {
            type: "string",
            description: "The subscription's unique ID (UUID)",
          },
        },
        required: ["customerId", "subscriptionId"],
      },
    },
    {
      name: "sherweb_subscriptions_change_quantity",
      description:
        "Change a subscription's quantity (seats/licenses). This affects billing. The change is submitted asynchronously — it returns a tracking ID to poll with sherweb_subscriptions_amendment_status, not a finished result.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: {
            type: "string",
            description: "The customer's unique ID (UUID)",
          },
          subscriptionId: {
            type: "string",
            description: "The subscription to amend (UUID)",
          },
          quantity: {
            type: "number",
            description: "The new quantity (number of seats/licenses)",
          },
        },
        required: ["customerId", "subscriptionId", "quantity"],
      },
    },
    {
      name: "sherweb_subscriptions_amendment_status",
      description:
        "Check the status of a submitted subscription amendment using the tracking ID returned by sherweb_subscriptions_change_quantity. Returns Unknown, Queued, Processing, Success or Failure.",
      inputSchema: {
        type: "object",
        properties: {
          trackingId: {
            type: "string",
            description:
              "The requestTrackingId returned when the amendment was submitted",
          },
        },
        required: ["trackingId"],
      },
    },
  ];
}

/**
 * Fetch a customer's subscription details collection.
 */
async function fetchSubscriptionDetails(
  customerId: string
): Promise<SubscriptionCollection> {
  return serviceProviderRequest<SubscriptionCollection>(
    "/billing/subscriptions/details",
    { params: { customerId } }
  );
}

/**
 * Resolve a customer's display name for the subscription card. Sherweb has no
 * single-customer endpoint, so this reads the collection and selects the match.
 */
async function lookupCustomer(customerId: string): Promise<unknown> {
  const customers = await serviceProviderRequest<{
    items?: Array<Record<string, unknown>>;
  }>("/customers");
  return (customers.items ?? []).find((c) => c.id === customerId);
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
      const { customerId } = args as { customerId: string };

      logger.info("API call: subscriptions.list", { customerId });

      const response = await serviceProviderRequest("/billing/subscriptions", {
        params: { customerId },
      });

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    case "sherweb_subscriptions_get": {
      const { customerId, subscriptionId } = args as {
        customerId: string;
        subscriptionId: string;
      };

      logger.info("API call: subscriptions.get", { customerId, subscriptionId });

      const response = await fetchSubscriptionDetails(customerId);
      const subscription = (response.items ?? []).find(
        (s) => s.id === subscriptionId
      );

      if (!subscription) {
        return {
          content: [
            {
              type: "text",
              text: `Subscription '${subscriptionId}' was not found for customer '${customerId}'. Use sherweb_subscriptions_list to see that customer's subscriptions.`,
            },
          ],
          isError: true,
        };
      }

      // MCP Apps: attach the normalized card payload the ui:// subscription
      // card renders from. Best-effort — any failure just means no card, the
      // model-visible JSON is otherwise unchanged.
      let payload: unknown = subscription;
      try {
        const card = await buildSubscriptionCard(subscription, customerId, () =>
          lookupCustomer(customerId)
        );
        if (card) {
          payload = { ...subscription, _card: card };
        }
      } catch {
        // Card building never affects the tool result.
      }

      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
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
          content: [{ type: "text", text: "Quantity change cancelled by user." }],
        };
      }

      logger.info("API call: subscriptions.createAmendment", {
        customerId,
        subscriptionId,
        quantity,
      });

      const response = await serviceProviderRequest<AmendmentReceipt>(
        "/billing/subscriptions/amendments",
        {
          method: "POST",
          params: { customerId },
          body: {
            subscriptionAmendmentParameters: [
              { subscriptionId, newQuantity: quantity },
            ],
          },
        }
      );

      const trackingId = response.trackingId?.requestTrackingId;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                submitted: true,
                subscriptionsAmendmentId: response.subscriptionsAmendmentId,
                trackingId,
                note: trackingId
                  ? `The amendment was accepted but is processed asynchronously — it is not applied yet. Poll sherweb_subscriptions_amendment_status with trackingId '${trackingId}' to confirm the outcome.`
                  : "The amendment was accepted but is processed asynchronously and Sherweb returned no tracking ID.",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "sherweb_subscriptions_amendment_status": {
      const { trackingId } = args as { trackingId: string };

      logger.info("API call: subscriptions.trackRequest", { trackingId });

      const response = await serviceProviderRequest(`/tracking/${trackingId}`);

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    default:
      return {
        content: [
          { type: "text", text: `Unknown subscriptions tool: ${toolName}` },
        ],
        isError: true,
      };
  }
}

export const subscriptionsHandler: DomainHandler = { getTools, handleCall };
