/**
 * MCP Apps (SEP-1865) contract tests — mirrors the checks an MCP Apps host
 * performs to render the subscription card:
 *   1. the renderable tool advertises the UI resource via _meta
 *   2. the ui:// resource lists and reads back as profile=mcp-app HTML
 *   3. buildSubscriptionCard normalizes a Sherweb subscription into the card
 *      payload the iframe renders from (best-effort, read-only)
 */

import { describe, it, expect, vi } from "vitest";
import { getAvailableDomains, getDomainHandler } from "./domains/index.js";
import { listResources, readResource } from "./resources.js";
import {
  buildSubscriptionCard,
  applyBrandInjection,
  SUBSCRIPTION_CARD_RESOURCE_URI,
  MCP_APP_RESOURCE_MIME,
} from "./card.builder.js";
import { SUBSCRIPTION_CARD_HTML } from "./generated/subscription-card-html.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// Read-only card: the only renderable tool is the subscription read.
// sherweb_subscriptions_change_quantity affects billing and is deliberately
// not exposed from the card.
const RENDERABLE_TOOLS = ["sherweb_subscriptions_get"];

async function getAllTools(): Promise<Tool[]> {
  const tools: Tool[] = [];
  for (const domain of getAvailableDomains()) {
    const handler = await getDomainHandler(domain);
    tools.push(...handler.getTools());
  }
  return tools;
}

describe("MCP Apps subscription card", () => {
  describe("tool _meta advertisement", () => {
    it.each(RENDERABLE_TOOLS)("%s links the card via _meta", async (name) => {
      const tool = (await getAllTools()).find((t) => t.name === name);
      expect(tool).toBeDefined();
      // Canonical flat key (ext-apps RESOURCE_URI_META_KEY) …
      expect(tool?._meta?.["ui/resourceUri"]).toBe(SUBSCRIPTION_CARD_RESOURCE_URI);
      // … and the nested form registerAppTool also emits.
      expect((tool?._meta?.ui as { resourceUri?: string })?.resourceUri).toBe(
        SUBSCRIPTION_CARD_RESOURCE_URI
      );
    });

    it("no other tools carry UI metadata", async () => {
      const others = (await getAllTools()).filter(
        (t) => t._meta && !RENDERABLE_TOOLS.includes(t.name)
      );
      expect(others).toEqual([]);
    });
  });

  describe("ui:// resource", () => {
    it("is listed with the MCP Apps MIME type", () => {
      const card = listResources().find(
        (r) => r.uri === SUBSCRIPTION_CARD_RESOURCE_URI
      );
      expect(card?.mimeType).toBe(MCP_APP_RESOURCE_MIME);
    });

    it("reads back as profile=mcp-app HTML containing the card app", () => {
      const content = readResource(SUBSCRIPTION_CARD_RESOURCE_URI);
      expect(content.mimeType).toBe(MCP_APP_RESOURCE_MIME);
      // No MCP_BRAND_* env set → the embedded HTML is served byte-identical.
      expect(content.text).toBe(SUBSCRIPTION_CARD_HTML);
      expect(content.text).toContain("card__bar");
      expect(content.text).toContain("BRAND_INJECT");
      // The vite build must have inlined the bridge script — a bare
      // <script src> would be unloadable from a resources/read HTML string.
      expect(content.text).not.toContain('src="./subscription-card.ts"');
    });

    it("serves neutral defaults with no vendor identity", () => {
      const { text } = readResource(SUBSCRIPTION_CARD_RESOURCE_URI);
      expect(text).not.toMatch(/WYRE/i);
      expect(text).not.toContain("00c9db"); // WYRE cyan
      expect(text).not.toContain("ede947"); // WYRE yellow
      expect(text).not.toContain("fonts.googleapis.com"); // no external fetches
    });

    it("injects MCP_BRAND_* env vars into the served HTML", () => {
      vi.stubEnv("MCP_BRAND_NAME", "Acme MSP");
      vi.stubEnv("MCP_BRAND_PRIMARY_COLOR", "#ff0000");
      try {
        const { text } = readResource(SUBSCRIPTION_CARD_RESOURCE_URI);
        expect(text).toContain(
          '<script>window.__BRAND__={"name":"Acme MSP","primaryColor":"#ff0000"}</script>'
        );
        expect(text).not.toContain("BRAND_INJECT");
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("rejects unknown resource URIs", () => {
      expect(() => readResource("ui://sherweb/nope.html")).toThrow(
        /Unknown resource/
      );
    });
  });

  describe("applyBrandInjection", () => {
    const html = SUBSCRIPTION_CARD_HTML;

    it("replaces the marker with an inline window.__BRAND__ script", () => {
      const out = applyBrandInjection(html, {
        name: "Acme",
        primaryColor: "#123456",
      });
      expect(out).toContain('window.__BRAND__={"name":"Acme","primaryColor":"#123456"}');
      expect(out).not.toContain("BRAND_INJECT");
    });

    it("escapes < so brand values cannot break out of the script tag", () => {
      const out = applyBrandInjection(html, { name: "</script><script>alert(1)" });
      expect(out).not.toContain("</script><script>alert(1)");
      expect(out).toContain("\\u003c/script>\\u003cscript>alert(1)");
    });

    it("returns the HTML unchanged for an empty brand", () => {
      expect(applyBrandInjection(html, {})).toBe(html);
      expect(applyBrandInjection(html, { name: "" })).toBe(html);
    });
  });

  describe("buildSubscriptionCard", () => {
    const subscription = {
      id: "b7a1a2f0-6f4e-4d0a-9d0e-1c2b3a4d5e6f",
      productName: "Microsoft 365 Business Premium",
      sku: "M365_BUSINESS_PREMIUM",
      status: "Active",
      quantity: 25,
      billingCycle: "Monthly",
      purchaseDate: "2025-11-03T00:00:00Z",
      commitmentTerm: {
        type: "Annual",
        termEndDate: "2026-11-03T00:00:00Z",
        renewalConfiguration: {
          renewalDate: "2026-11-03T00:00:00Z",
          scheduledQuantity: 30,
        },
      },
      fees: { recurringFee: 18.6, setupFee: 0, currency: "USD" },
    };
    const customerId = "0f3c9a2d-1111-2222-3333-444455556666";

    const lookupCustomer = vi.fn(async () => ({
      id: customerId,
      displayName: "Acme Corp",
    }));

    it("normalizes the Sherweb payload into flat, label-resolved fields", async () => {
      const card = await buildSubscriptionCard(subscription, customerId, lookupCustomer);
      expect(card).toEqual({
        id: "b7a1a2f0-6f4e-4d0a-9d0e-1c2b3a4d5e6f",
        product: "Microsoft 365 Business Premium",
        customerId,
        customer: "Acme Corp",
        sku: "M365_BUSINESS_PREMIUM",
        status: "Active",
        quantity: 25,
        billingCycle: "Monthly",
        commitment: "Annual",
        commitmentEnd: "2026-11-03T00:00:00Z",
        renewalDate: "2026-11-03T00:00:00Z",
        scheduledQuantity: 30,
        purchaseDate: "2025-11-03T00:00:00Z",
        recurringFee: "18.60 USD",
      });
      // setupFee of 0 is omitted — nothing to render.
      expect(card?.setupFee).toBeUndefined();
    });

    it("falls back to the SKU when the API omits productName", async () => {
      const bare = { id: "abc", sku: "AZURE_PLAN" };
      const card = await buildSubscriptionCard(bare, customerId, lookupCustomer);
      expect(card?.product).toBe("AZURE_PLAN");
    });

    it("returns null for payloads that are not a subscription", async () => {
      expect(await buildSubscriptionCard({}, customerId, lookupCustomer)).toBeNull();
      expect(
        await buildSubscriptionCard({ id: "x" }, customerId, lookupCustomer)
      ).toBeNull();
      expect(
        await buildSubscriptionCard(
          { productName: "no id" },
          customerId,
          lookupCustomer
        )
      ).toBeNull();
    });

    it("survives customer-lookup failures (card is best-effort)", async () => {
      const failing = vi.fn(async () => {
        throw new Error("Sherweb 500");
      });
      const card = await buildSubscriptionCard(subscription, customerId, failing);
      expect(card).toMatchObject({
        id: subscription.id,
        product: "Microsoft 365 Business Premium",
        status: "Active",
      });
      expect(card?.customer).toBeUndefined();
    });

    it("ignores malformed nested structures without throwing", async () => {
      const messy = {
        id: "abc",
        productName: "Thing",
        quantity: "not-a-number",
        commitmentTerm: "Annual",
        fees: { recurringFee: "12", currency: 5 },
      };
      const card = await buildSubscriptionCard(messy, customerId, lookupCustomer);
      expect(card).toMatchObject({ id: "abc", product: "Thing" });
      expect(card?.quantity).toBeUndefined();
      expect(card?.commitment).toBeUndefined();
      expect(card?.recurringFee).toBeUndefined();
    });
  });
});
