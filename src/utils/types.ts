/**
 * Shared types for the Sherweb MCP server
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Tool call result type - inline definition for MCP SDK compatibility
 */
export type CallToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/**
 * Domain handler interface
 */
export interface DomainHandler {
  /** Get the tools for this domain */
  getTools(): Tool[];
  /** Handle a tool call */
  handleCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<CallToolResult>;
}

/**
 * Domain names for Sherweb
 */
export type DomainName =
  | "billing"
  | "customers"
  | "subscriptions"
  | "catalog";

/**
 * Check if a string is a valid domain name
 */
export function isDomainName(value: string): value is DomainName {
  return ["billing", "customers", "subscriptions", "catalog"].includes(value);
}

/**
 * Sherweb credentials extracted from environment or gateway headers
 */
export interface SherwebCredentials {
  clientId: string;
  clientSecret: string;
  subscriptionKey: string;
}

/**
 * Sherweb API base URLs
 */
export const SHERWEB_AUTH_URL = "https://api.sherweb.com/auth/oidc/connect/token";
export const SHERWEB_DISTRIBUTOR_BASE = "https://api.sherweb.com/distributor/v1";
export const SHERWEB_SERVICE_PROVIDER_BASE = "https://api.sherweb.com/service-provider/v1";

/**
 * Billing cycle types
 */
export type BillingCycleType = "OneTime" | "Monthly" | "Yearly";

/**
 * Charge types
 */
export type ChargeType = "Setup" | "Recurring" | "Usage" | "Unknown";
