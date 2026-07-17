/**
 * Iframe bridge + renderer for the Sherweb subscription card (MCP Apps,
 * SEP-1865).
 *
 * Runs inside the host's sandboxed iframe. Uses the official MCP Apps client
 * (`App`) to receive the tool result from the host. The card is read-only:
 * Sherweb subscription changes affect billing, so no write round-trip is
 * exposed from the card.
 *
 * The server attaches a normalized `_card` payload to
 * sherweb_subscriptions_get results (see src/card.builder.ts) so this
 * renderer never needs to resolve ids or entity names itself.
 *
 * Rendering uses DOM construction (no innerHTML) — product names and customer
 * names are untrusted vendor data, so text only ever lands in text nodes.
 *
 * White-label: the card is neutral by default (no vendor identity) and applies
 * an injected `window.__BRAND__` override (set by the MCP server via
 * MCP_BRAND_* env vars, or a gateway per-org) so the same card can render in
 * any operator's brand.
 */
import { App } from "@modelcontextprotocol/ext-apps";

interface Brand {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  bg?: string;
  text?: string;
}
declare global {
  interface Window {
    __BRAND__?: Brand;
  }
}

/** Mirror of SubscriptionCard in src/card.builder.ts — keep in sync. */
interface SubscriptionCard {
  id: string;
  product: string;
  customerId: string;
  customer?: string;
  sku?: string;
  status?: string;
  quantity?: number;
  billingCycle?: string;
  commitment?: string;
  commitmentEnd?: string;
  renewalDate?: string;
  scheduledQuantity?: number;
  purchaseDate?: string;
  recurringFee?: string;
  setupFee?: string;
}

const brand: Brand = window.__BRAND__ ?? {};
const brandName = brand.name ?? "";

// Apply any injected brand overrides onto the CSS custom properties.
function applyBrand(): void {
  const root = document.documentElement.style;
  if (brand.primaryColor) root.setProperty("--brand-primary", brand.primaryColor);
  if (brand.accentColor) root.setProperty("--brand-accent", brand.accentColor);
  if (brand.bg) root.setProperty("--brand-bg", brand.bg);
  if (brand.text) root.setProperty("--brand-text", brand.text);
}

const app = new App({ name: "Sherweb Subscription Card", version: "1.0.0" });

/** Create an element with a class and (safe, text-node) children. */
function el(
  tag: string,
  className = "",
  ...children: Array<Node | string | null>
): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) {
    if (child == null) continue;
    node.append(child); // strings become text nodes — never parsed as HTML
  }
  return node;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function field(label: string, value: string | undefined): HTMLElement | null {
  if (!value) return null;
  return el(
    "div",
    "field",
    el("div", "field__label", label),
    el("div", "field__value", value),
  );
}

function badge(text: string | undefined, cls: string): HTMLElement | null {
  return text ? el("span", `badge ${cls}`, text) : null;
}

function render(s: SubscriptionCard): void {
  // Brand identity only renders when a brand was injected — the neutral
  // default shows just the vendor context in the header.
  let brandId: HTMLElement | null = null;
  if (brandName || brand.logoUrl) {
    brandId = el("span", "brandid");
    if (brand.logoUrl) {
      const logo = document.createElement("img");
      logo.src = brand.logoUrl;
      logo.alt = brandName;
      logo.style.display = "inline-block";
      brandId.append(logo);
    }
    if (brandName) brandId.append(el("span", "brand", brandName));
  }

  const quantity =
    s.quantity != null
      ? s.scheduledQuantity != null && s.scheduledQuantity !== s.quantity
        ? `${s.quantity} (→ ${s.scheduledQuantity} at renewal)`
        : String(s.quantity)
      : undefined;

  const body = el(
    "div",
    "card__body",
    el("div", "brandrow", brandId, el("span", "context", "Subscription · Sherweb")),
    el("h1", "", s.product),
    el(
      "div",
      "badges",
      badge(s.status, "badge--status"),
      badge(s.billingCycle, "badge--cycle"),
    ),
    el(
      "div",
      "grid",
      field("Customer", s.customer),
      field("Quantity", quantity),
      field("Commitment", s.commitment),
      field("Term ends", s.commitmentEnd && fmtDate(s.commitmentEnd)),
      field("Renewal", s.renewalDate && fmtDate(s.renewalDate)),
      field("Purchased", s.purchaseDate && fmtDate(s.purchaseDate)),
      field("Recurring fee", s.recurringFee),
      field("Setup fee", s.setupFee),
      field("SKU", s.sku),
    ),
    el("div", "subid", `ID ${s.id}`),
  );

  const root = document.getElementById("root")!;
  root.replaceChildren(el("div", "card", el("div", "card__bar"), body));
}

// sherweb-mcp returns the subscription JSON directly and attaches the
// normalized card to sherweb_subscriptions_get results as _card.
function extractCard(obj: unknown): SubscriptionCard | null {
  const card = (obj as { _card?: SubscriptionCard })?._card;
  return card && typeof card.id === "string" && typeof card.product === "string"
    ? card
    : null;
}

applyBrand();

// Must be set before connect() so the initial tool-result isn't missed.
app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
  const payload = (result.content ?? []).find((c) => c.type === "text");
  if (!payload?.text) return;
  try {
    const card = extractCard(JSON.parse(payload.text));
    if (card) render(card);
  } catch {
    /* ignore malformed payloads */
  }
};

app.connect();
