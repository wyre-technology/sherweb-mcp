/**
 * Regression tests for the cross-tenant OAuth token cache leak.
 *
 * `authenticate()` used to cache `accessToken`/`tokenExpiry` in module-level
 * `let` variables shared by every request. Sherweb tokens are valid for
 * ~59 minutes, so this was not a rare race — it was a deterministic
 * cross-tenant credential reuse under normal multi-tenant traffic: any
 * tenant whose request landed within the token's lifetime would receive
 * whichever tenant's token happened to be sitting in the shared cache.
 *
 * Two scenarios are covered, matching the standard used on the sibling
 * liongard-mcp#58 / ninjaone-mcp#71 fixes:
 *  1. A sequential test — no interleaving needed — that reproduces the bug's
 *     actual real-world trigger condition: tenant B authenticates within
 *     tenant A's still-valid token window, then tenant A makes another call.
 *  2. A forced-interleave test using manually-resolved deferred promises to
 *     make two tenants' OAuth flows genuinely overlap, asserting on the real
 *     token *values* each tenant receives (not object identity).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { distributorRequest, runWithCredentials } from "./client.js";
import { SHERWEB_AUTH_URL, type SherwebCredentials } from "./types.js";

interface PingResult {
  authHeader: string | null;
}

function tenantCreds(id: string): SherwebCredentials {
  return {
    clientId: `client-${id}`,
    clientSecret: `secret-${id}`,
    subscriptionKey: `sub-${id}`,
  };
}

function oauthResponse(accessToken: string): Response {
  const payload = JSON.stringify({
    access_token: accessToken,
    expires_in: 3600,
    token_type: "Bearer",
  });
  return {
    ok: true,
    status: 200,
    text: async () => payload,
    json: async () => JSON.parse(payload),
  } as Response;
}

function apiResponse(authHeader: string | null): Response {
  const payload = JSON.stringify({ authHeader });
  return {
    ok: true,
    status: 200,
    text: async () => payload,
    json: async () => JSON.parse(payload),
  } as Response;
}

function clientIdFromAuthRequest(init: RequestInit | undefined): string | null {
  const body = new URLSearchParams(String(init?.body ?? ""));
  return body.get("client_id");
}

function authHeaderFromApiRequest(init: RequestInit | undefined): string | null {
  const headers = (init?.headers ?? {}) as Record<string, string>;
  return headers.Authorization ?? null;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("Sherweb OAuth token cache — cross-tenant isolation", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not let a later tenant's authentication contaminate an earlier tenant's still-valid token (sequential, no interleave)", async () => {
    // This is the bug's actual real-world trigger: no race required, just
    // two tenants' requests landing within the same ~59min token window.
    const tenantA = tenantCreds("A-seq");
    const tenantB = tenantCreds("B-seq");

    fetchMock.mockImplementation(
      async (url: string, init?: RequestInit): Promise<Response> => {
        if (url === SHERWEB_AUTH_URL) {
          const clientId = clientIdFromAuthRequest(init);
          if (clientId === tenantA.clientId) return oauthResponse("token-A-seq");
          if (clientId === tenantB.clientId) return oauthResponse("token-B-seq");
          throw new Error(`unexpected client_id in auth request: ${clientId}`);
        }
        return apiResponse(authHeaderFromApiRequest(init));
      }
    );

    // 1. Tenant A authenticates and makes a call.
    const resultA1 = await runWithCredentials(tenantA, () =>
      distributorRequest<PingResult>("/ping")
    );
    expect(resultA1).toEqual({ authHeader: "Bearer token-A-seq" });

    // 2. Tenant B authenticates within tenant A's still-valid token window.
    const resultB1 = await runWithCredentials(tenantB, () =>
      distributorRequest<PingResult>("/ping")
    );
    expect(resultB1).toEqual({ authHeader: "Bearer token-B-seq" });

    // 3. Tenant A makes another call. It must still use its OWN token —
    // under the old module-level cache this would deterministically read
    // back whatever the most recent authenticate() call had cached,
    // regardless of which tenant it belonged to.
    const resultA2 = await runWithCredentials(tenantA, () =>
      distributorRequest<PingResult>("/ping")
    );
    expect(resultA2).toEqual({ authHeader: "Bearer token-A-seq" });

    // Exactly one OAuth round trip per tenant: each tenant's second-or-later
    // call reused its own still-valid cached token instead of re-authenticating
    // (proving the cache is a real per-tenant cache, not per-request-only).
    const authCalls = fetchMock.mock.calls.filter(([url]) => url === SHERWEB_AUTH_URL);
    expect(authCalls).toHaveLength(2);
  });

  it("keeps each tenant's token isolated under a forced concurrent interleave", async () => {
    const tenantA = tenantCreds("A-interleave");
    const tenantB = tenantCreds("B-interleave");

    // Deterministic interleave: each tenant's OAuth fetch blocks on its own
    // deferred promise, so the test controls the exact resolution order
    // rather than hoping a setTimeout stagger reproduces the overlap.
    const gateA = deferred<void>();
    const gateB = deferred<void>();

    fetchMock.mockImplementation(
      async (url: string, init?: RequestInit): Promise<Response> => {
        if (url === SHERWEB_AUTH_URL) {
          const clientId = clientIdFromAuthRequest(init);
          if (clientId === tenantA.clientId) {
            await gateA.promise;
            return oauthResponse("token-A-interleave");
          }
          if (clientId === tenantB.clientId) {
            await gateB.promise;
            return oauthResponse("token-B-interleave");
          }
          throw new Error(`unexpected client_id in auth request: ${clientId}`);
        }
        return apiResponse(authHeaderFromApiRequest(init));
      }
    );

    // Kick off both tenants' full request flows concurrently. Neither's
    // OAuth call can complete until its gate is released below, so both
    // are genuinely in flight together — a real overlap, not a stagger.
    const callA = runWithCredentials(tenantA, () =>
      distributorRequest<PingResult>("/ping")
    );
    const callB = runWithCredentials(tenantB, () =>
      distributorRequest<PingResult>("/ping")
    );

    // Resolve out of call order: tenant B's OAuth exchange completes first
    // even though tenant A's request chain started first.
    gateB.resolve();
    await Promise.resolve();
    await Promise.resolve();
    gateA.resolve();

    const [resultA, resultB] = await Promise.all([callA, callB]);

    // Assert on the real token VALUES each tenant received — not object
    // identity, which would pass even if both requests raced onto a single
    // shared value by coincidence.
    expect(resultA).toEqual({ authHeader: "Bearer token-A-interleave" });
    expect(resultB).toEqual({ authHeader: "Bearer token-B-interleave" });
  });
});
