/**
 * Domain handlers index
 *
 * Lazy-loads domain handlers to avoid loading everything upfront.
 */

import type { DomainHandler } from "../utils/types.js";
import type { DomainName } from "../utils/types.js";

// Cache for loaded domain handlers
const domainCache = new Map<DomainName, DomainHandler>();

/**
 * Lazy-load a domain handler
 */
export async function getDomainHandler(
  domain: DomainName
): Promise<DomainHandler> {
  const cached = domainCache.get(domain);
  if (cached) {
    return cached;
  }

  let handler: DomainHandler;

  switch (domain) {
    case "billing": {
      const { billingHandler } = await import("./billing.js");
      handler = billingHandler;
      break;
    }
    case "customers": {
      const { customersHandler } = await import("./customers.js");
      handler = customersHandler;
      break;
    }
    case "subscriptions": {
      const { subscriptionsHandler } = await import("./subscriptions.js");
      handler = subscriptionsHandler;
      break;
    }
    case "catalog": {
      const { catalogHandler } = await import("./catalog.js");
      handler = catalogHandler;
      break;
    }
    default:
      throw new Error(`Unknown domain: ${domain}`);
  }

  domainCache.set(domain, handler);
  return handler;
}

/**
 * Get all available domain names
 */
export function getAvailableDomains(): DomainName[] {
  return ["billing", "customers", "subscriptions", "catalog"];
}

/**
 * Clear the domain cache (useful for testing)
 */
export function clearDomainCache(): void {
  domainCache.clear();
}
