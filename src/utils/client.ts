/**
 * Sherweb REST Client
 *
 * Lightweight HTTP client for the Sherweb Partner API with OAuth2 client
 * credentials flow and automatic token management.
 *
 * Authentication:
 * - OAuth 2.0 Client Credentials flow
 * - Token endpoint: https://api.sherweb.com/auth/oidc/connect/token
 * - Requires client_id, client_secret, and subscription_key (Ocp-Apim-Subscription-Key header)
 * - Scopes: "distributor" and "service-provider"
 * - Tokens valid for 3600 seconds
 *
 * Base URLs:
 * - Distributor API: https://api.sherweb.com/distributor/v1
 * - Service Provider API: https://api.sherweb.com/service-provider/v1
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { logger } from "./logger.js";
import {
  SHERWEB_AUTH_URL,
  SHERWEB_DISTRIBUTOR_BASE,
  SHERWEB_SERVICE_PROVIDER_BASE,
  type SherwebCredentials,
} from "./types.js";

/**
 * OAuth2 token cache
 */
let accessToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Per-request credential store for gateway mode.
 * Ensures concurrent requests cannot leak credentials across tenants.
 */
const credentialStore = new AsyncLocalStorage<SherwebCredentials>();

/**
 * Run a callback with per-request credential overrides.
 * Used by the HTTP transport in gateway mode.
 */
export function runWithCredentials<T>(creds: SherwebCredentials, fn: () => T): T {
  return credentialStore.run(creds, fn);
}

/**
 * Get credentials — checks per-request store first, then falls back to env vars.
 */
export function getCredentials(): SherwebCredentials | null {
  // Per-request override (gateway mode)
  const override = credentialStore.getStore();
  if (override) {
    return override;
  }

  // Fallback to environment variables (stdio / env mode)
  const clientId = process.env.SHERWEB_CLIENT_ID;
  const clientSecret = process.env.SHERWEB_CLIENT_SECRET;
  const subscriptionKey = process.env.SHERWEB_SUBSCRIPTION_KEY;

  if (!clientId || !clientSecret || !subscriptionKey) {
    logger.warn("Missing credentials", {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasSubscriptionKey: !!subscriptionKey,
    });
    return null;
  }

  return { clientId, clientSecret, subscriptionKey };
}

/**
 * Authenticate with Sherweb OAuth2 endpoint.
 * Caches the token until expiry.
 */
async function authenticate(creds: SherwebCredentials): Promise<string> {
  // Return cached token if still valid
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  logger.debug("Authenticating with Sherweb OAuth2 endpoint");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: "distributor service-provider",
  });

  const response = await fetch(SHERWEB_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Ocp-Apim-Subscription-Key": creds.subscriptionKey,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Sherweb authentication failed (${response.status}): ${responseBody}`
    );
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  accessToken = data.access_token;
  // Expire 60 seconds early to avoid edge cases
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

  logger.info("Sherweb authentication successful", {
    expiresIn: data.expires_in,
  });

  return accessToken;
}

/**
 * Make an authenticated request to the Sherweb Distributor API.
 */
export async function distributorRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
  } = {}
): Promise<T> {
  const creds = getCredentials();
  if (!creds) {
    throw new Error(
      "No Sherweb API credentials configured. Please set SHERWEB_CLIENT_ID, SHERWEB_CLIENT_SECRET, and SHERWEB_SUBSCRIPTION_KEY environment variables."
    );
  }

  const token = await authenticate(creds);
  const url = new URL(`${SHERWEB_DISTRIBUTOR_BASE}${path}`);

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const method = options.method || "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Ocp-Apim-Subscription-Key": creds.subscriptionKey,
  };

  const fetchOptions: RequestInit = { method, headers };

  if (options.body !== undefined && method !== "GET") {
    fetchOptions.body = JSON.stringify(options.body);
  }

  logger.debug("Sherweb Distributor API request", { method, url: url.toString() });

  const response = await fetch(url.toString(), fetchOptions);

  // Safe: read text once, then try JSON parse
  const rawText = await response.text();
  let responseBody: unknown;
  try {
    responseBody = JSON.parse(rawText);
  } catch {
    responseBody = rawText;
  }

  if (!response.ok) {
    handleApiError(response.status, responseBody, url.toString());
  }

  return responseBody as T;
}

/**
 * Make an authenticated request to the Sherweb Service Provider API.
 */
export async function serviceProviderRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string | number | boolean | undefined>;
  } = {}
): Promise<T> {
  const creds = getCredentials();
  if (!creds) {
    throw new Error(
      "No Sherweb API credentials configured. Please set SHERWEB_CLIENT_ID, SHERWEB_CLIENT_SECRET, and SHERWEB_SUBSCRIPTION_KEY environment variables."
    );
  }

  const token = await authenticate(creds);
  const url = new URL(`${SHERWEB_SERVICE_PROVIDER_BASE}${path}`);

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const method = options.method || "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Ocp-Apim-Subscription-Key": creds.subscriptionKey,
  };

  const fetchOptions: RequestInit = { method, headers };

  if (options.body !== undefined && method !== "GET") {
    fetchOptions.body = JSON.stringify(options.body);
  }

  logger.debug("Sherweb Service Provider API request", { method, url: url.toString() });

  const response = await fetch(url.toString(), fetchOptions);

  // Safe: read text once, then try JSON parse
  const rawText = await response.text();
  let responseBody: unknown;
  try {
    responseBody = JSON.parse(rawText);
  } catch {
    responseBody = rawText;
  }

  if (!response.ok) {
    handleApiError(response.status, responseBody, url.toString());
  }

  return responseBody as T;
}

/**
 * Handle API error responses with clear error messages
 */
function handleApiError(status: number, responseBody: unknown, url: string): never {
  const message =
    typeof responseBody === "object" &&
    responseBody !== null &&
    "message" in responseBody
      ? String((responseBody as Record<string, unknown>).message)
      : `HTTP ${status}`;

  logger.error("Sherweb API error", { status, url, message });

  if (status === 401) {
    // Reset token cache on auth failure
    accessToken = null;
    tokenExpiry = 0;
    throw new Error(
      `Authentication failed: ${message}. Check your SHERWEB_CLIENT_ID, SHERWEB_CLIENT_SECRET, and SHERWEB_SUBSCRIPTION_KEY.`
    );
  }
  if (status === 403) {
    throw new Error(
      `Forbidden: ${message}. Insufficient permissions or incorrect scope.`
    );
  }
  if (status === 404) {
    throw new Error(`Not found: ${message}`);
  }
  if (status === 429) {
    throw new Error(`Rate limit exceeded: ${message}. Please wait and retry.`);
  }
  throw new Error(`Sherweb API error (${status}): ${message}`);
}

/**
 * Reset the token cache.
 * Used in gateway mode to pick up new credentials from headers.
 */
export function resetClient(): void {
  accessToken = null;
  tokenExpiry = 0;
}
