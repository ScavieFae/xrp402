import { describe, it, expect } from "vitest";
import { getSupported } from "../../src/facilitator/supported.js";

describe("getSupported", () => {
  it("returns correct structure", () => {
    const response = getSupported();

    expect(response.kinds).toHaveLength(1);
    expect(response.kinds[0]?.x402Version).toBe(2);
    expect(response.kinds[0]?.scheme).toBe("exact");
    expect(response.kinds[0]?.network).toBe("xrpl:1");
  });

  it("has empty extensions", () => {
    const response = getSupported();
    expect(response.extensions).toEqual([]);
  });

  it("has empty signers when no facilitator address", () => {
    const response = getSupported();
    expect(response.signers["xrpl:*"]).toEqual([]);
  });

  it("includes extra field with fee schedule", () => {
    const response = getSupported();
    const extra = response.kinds[0]?.extra as Record<string, unknown>;

    expect(extra).toBeDefined();
    expect(extra["facilitatorAddress"]).toBeNull(); // No env var set
    expect(extra["facilitatorFee"]).toEqual({
      standard: null,
      mpt: "0",
      crossCurrency: "0",
    });
  });

  it("includes empty supportedMpts when allowlist is empty", () => {
    const response = getSupported();
    const extra = response.kinds[0]?.extra as Record<string, unknown>;

    expect(extra["supportedMpts"]).toEqual([]);
  });
});
