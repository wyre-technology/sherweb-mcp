/**
 * Billing domain tools for Sherweb MCP Server
 *
 * Handles distributor payable charges, billing periods, and charge details.
 * Uses the Distributor API (v1): https://api.sherweb.com/distributor/v1
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { distributorRequest } from "../utils/client.js";
import { elicitSelection } from "../utils/elicitation.js";
import { logger } from "../utils/logger.js";

/**
 * Billing domain tool definitions
 */
function getTools(): Tool[] {
  return [
    {
      name: "sherweb_billing_payable_charges",
      description:
        "Get payable charges for a billing period. Returns charges including products, pricing, deductions, fees, and taxes. Filter by billing cycle type (OneTime, Monthly, Yearly) and date range.",
      inputSchema: {
        type: "object",
        properties: {
          billingCycleType: {
            type: "string",
            enum: ["OneTime", "Monthly", "Yearly"],
            description:
              "The billing cycle type to filter by (OneTime, Monthly, or Yearly)",
          },
          periodFrom: {
            type: "string",
            description:
              "Start date of the billing period (ISO 8601 format, e.g., 2025-01-01)",
          },
          periodTo: {
            type: "string",
            description:
              "End date of the billing period (ISO 8601 format, e.g., 2025-01-31)",
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
      name: "sherweb_billing_charge_details",
      description:
        "Get detailed breakdown of a specific charge including line items, pricing tiers, deductions, fees, and tax information.",
      inputSchema: {
        type: "object",
        properties: {
          chargeId: {
            type: "string",
            description: "The unique charge ID to get details for",
          },
        },
        required: ["chargeId"],
      },
    },
  ];
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
      let {
        billingCycleType,
        periodFrom,
        periodTo,
        page,
        pageSize,
      } = args as {
        billingCycleType?: string;
        periodFrom?: string;
        periodTo?: string;
        page?: number;
        pageSize?: number;
      };

      // Elicit billing cycle type if not provided
      if (!billingCycleType && !periodFrom && !periodTo) {
        const selected = await elicitSelection(
          "What type of billing charges would you like to see?",
          "billingCycleType",
          [
            { value: "Monthly", label: "Monthly recurring charges" },
            { value: "Yearly", label: "Yearly recurring charges" },
            { value: "OneTime", label: "One-time charges" },
          ]
        );
        if (selected) billingCycleType = selected;
      }

      const params: Record<string, string | number | boolean | undefined> = {};
      if (billingCycleType) params.billingCycleType = billingCycleType;
      if (periodFrom) params.periodFrom = periodFrom;
      if (periodTo) params.periodTo = periodTo;
      if (page !== undefined) params.page = page;
      if (pageSize !== undefined) params.pageSize = pageSize;

      logger.info("API call: billing.payableCharges", { params });

      const response = await distributorRequest("/payable-charges", { params });

      return {
        content: [
          { type: "text", text: JSON.stringify(response, null, 2) },
        ],
      };
    }

    case "sherweb_billing_charge_details": {
      const { chargeId } = args as { chargeId: string };

      logger.info("API call: billing.chargeDetails", { chargeId });

      const response = await distributorRequest(`/payable-charges/${chargeId}`);

      return {
        content: [
          { type: "text", text: JSON.stringify(response, null, 2) },
        ],
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
