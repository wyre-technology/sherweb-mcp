import { describe, it, expect } from "vitest";
import { HEALTH_RESPONSE, isHealthPath } from "./health.js";

describe("health liveness probe", () => {
  it("recognises /health as a probe path", () => {
    expect(isHealthPath("/health")).toBe(true);
  });

  it("recognises /healthz as a probe path", () => {
    expect(isHealthPath("/healthz")).toBe(true);
  });

  it("does not treat other paths as probe paths", () => {
    for (const path of ["/mcp", "/", "/health/extra", "/healthcheck"]) {
      expect(isHealthPath(path)).toBe(false);
    }
  });

  it("returns a shallow {status:'ok'} body with no credential fields", () => {
    // The probe must never expose credential state — in gateway mode
    // credentials arrive per-request, so the body is intentionally minimal.
    expect(HEALTH_RESPONSE).toEqual({ status: "ok" });
    expect(JSON.parse(JSON.stringify(HEALTH_RESPONSE))).toEqual({
      status: "ok",
    });
  });
});
