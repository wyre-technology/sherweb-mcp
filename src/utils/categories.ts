/**
 * Tool categories for lazy-loading meta-tools mode.
 *
 * When LAZY_LOADING=true, the server exposes only four meta-tools instead of
 * the full decision-tree navigation. Clients discover available tools by
 * category, then load schemas on demand.
 */

import type { DomainName } from "./types.js";

export interface ToolCategory {
  description: string;
  tools: string[];
}

/**
 * Maps each domain to its human-readable description and the tool names it
 * provides. Keep this in sync with the individual domain handlers in
 * src/domains/.
 */
export const TOOL_CATEGORIES: Record<DomainName, ToolCategory> = {
  billing: {
    description: "Distributor payable charges, billing periods, and charge details",
    tools: [
      "sherweb_billing_payable_charges",
      "sherweb_billing_charge_details",
    ],
  },
  customers: {
    description: "Service provider customer management and accounts receivable",
    tools: [
      "sherweb_customers_list",
      "sherweb_customers_get",
      "sherweb_customers_accounts_receivable",
    ],
  },
  subscriptions: {
    description: "Subscription management and quantity changes",
    tools: [
      "sherweb_subscriptions_list",
      "sherweb_subscriptions_get",
      "sherweb_subscriptions_change_quantity",
    ],
  },
  catalog: {
    description: "Product catalog browsing (future capability)",
    tools: [
      "sherweb_catalog_list_products",
    ],
  },
};

/**
 * Reverse lookup: given a tool name, return the domain that owns it.
 */
export function findDomainForTool(toolName: string): DomainName | null {
  for (const [domain, category] of Object.entries(TOOL_CATEGORIES)) {
    if (category.tools.includes(toolName)) {
      return domain as DomainName;
    }
  }
  return null;
}

/**
 * Simple keyword-to-tool router. Maps common intent phrases to suggested
 * tools so the LLM can ask "what tool should I use for X?" without loading
 * every schema.
 */
const INTENT_KEYWORDS: Record<string, string[]> = {
  // Billing
  billing: ["sherweb_billing_payable_charges", "sherweb_billing_charge_details"],
  charges: ["sherweb_billing_payable_charges", "sherweb_billing_charge_details"],
  payable: ["sherweb_billing_payable_charges"],
  invoice: ["sherweb_billing_payable_charges"],
  "billing period": ["sherweb_billing_payable_charges"],
  pricing: ["sherweb_billing_charge_details"],
  deductions: ["sherweb_billing_charge_details"],
  fees: ["sherweb_billing_charge_details"],
  taxes: ["sherweb_billing_charge_details"],
  // Customers
  customer: ["sherweb_customers_list", "sherweb_customers_get"],
  customers: ["sherweb_customers_list"],
  "accounts receivable": ["sherweb_customers_accounts_receivable"],
  receivable: ["sherweb_customers_accounts_receivable"],
  // Subscriptions
  subscription: ["sherweb_subscriptions_list", "sherweb_subscriptions_get"],
  subscriptions: ["sherweb_subscriptions_list"],
  quantity: ["sherweb_subscriptions_change_quantity"],
  license: ["sherweb_subscriptions_change_quantity"],
  seats: ["sherweb_subscriptions_change_quantity"],
  // Catalog
  catalog: ["sherweb_catalog_list_products"],
  product: ["sherweb_catalog_list_products"],
  products: ["sherweb_catalog_list_products"],
};

/**
 * Given a free-text intent string, return the best-matching tool suggestions.
 */
export function routeIntent(intent: string): string[] {
  const lower = intent.toLowerCase();
  const matches = new Set<string>();

  for (const [keyword, tools] of Object.entries(INTENT_KEYWORDS)) {
    if (lower.includes(keyword)) {
      for (const tool of tools) {
        matches.add(tool);
      }
    }
  }

  return [...matches];
}
