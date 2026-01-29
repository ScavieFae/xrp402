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

  it("has empty signers for xrpl:*", () => {
    const response = getSupported();
    expect(response.signers["xrpl:*"]).toEqual([]);
  });
});
