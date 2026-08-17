/**
 * Billing domain tools for Sherweb MCP Server
 *
 * Handles distributor payable charges.
 * Uses the Distributor API (v1): https://api.sherweb.com/distributor/v1
 *
 * The Distributor API publishes exactly one operation — GetPayableCharges —
 * whose only query parameter is `date` (any day inside the desired billing
 * period). There is no per-charge endpoint and no pagination, so charge
 * lookup filters the collection client-side.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { distributorRequest } from "../utils/client.js";
import { logger } from "../utils/logger.js";

/** Shape of the documented PayableCharges response. */
interface PayableCharges {
  periodFrom?: string;
  periodTo?: string;
  charges?: Array<Record<string, unknown>>;
}

const DATE_DESCRIPTION =
  "Any date inside the desired billing period, format yyyy-MM-dd (UTC). Defaults to today. E.g. 2026-03-17 returns the period containing March 17.";

/**
 * Billing domain tool definitions
 */
function getTools(): Tool[] {
  return [
    {
      name: "sherweb_billing_payable_charges",
      description:
        "Get the distributor payable charges for a billing period. Returns every charge in the period — recurring, usage and setup — with pricing, deductions, fees, taxes and invoice details.",
      inputSchema: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: DATE_DESCRIPTION,
          },
        },
      },
    },
    {
      name: "sherweb_billing_charge_details",
      description:
        "Get the full detail of one charge by its ID. Sherweb returns charges only as a billing-period collection, so this reads the period and selects the matching charge.",
      inputSchema: {
        type: "object",
        properties: {
          chargeId: {
            type: "string",
            description: "The unique charge ID to look up",
          },
          date: {
            type: "string",
            description: `${DATE_DESCRIPTION} Use this when the charge falls outside the current period.`,
          },
        },
        required: ["chargeId"],
      },
    },
  ];
}

/**
 * Fetch one billing period's payable charges.
 */
async function fetchPayableCharges(date?: string): Promise<PayableCharges> {
  const params: Record<string, string | undefined> = {};
  if (date) params.date = date;

  logger.info("API call: billing.payableCharges", { params });

  return distributorRequest<PayableCharges>("/billing/payable-charges", {
    params,
  });
}

/**
 * Handle billing domain tool calls
 */
async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  switch (toolName) {
    case "sherweb_billing_payable_charges": {
      const { date } = args as { date?: string };
      const response = await fetchPayableCharges(date);

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    }

    case "sherweb_billing_charge_details": {
      const { chargeId, date } = args as { chargeId: string; date?: string };

      const response = await fetchPayableCharges(date);
      const charge = response.charges?.find((c) => c.chargeId === chargeId);

      if (!charge) {
        return {
          content: [
            {
              type: "text",
              text: `Charge '${chargeId}' was not found in the billing period ${response.periodFrom ?? "?"} to ${response.periodTo ?? "?"}. Charges are only retrievable per billing period — pass a 'date' inside the period the charge belongs to.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(charge, null, 2) }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown billing tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const billingHandler: DomainHandler = { getTools, handleCall };
