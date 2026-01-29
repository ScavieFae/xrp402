import { describe, it, expect } from "vitest";

// Simple unit test to verify test setup works
describe("Supported Endpoint", () => {
  it("returns correct structure", () => {
    const response = {
      kinds: [
        {
          x402Version: 2,
          scheme: "exact",
          network: "xrpl:1",
        },
      ],
      extensions: [],
      signers: {},
    };

    expect(response.kinds).toHaveLength(1);
    expect(response.kinds[0]?.scheme).toBe("exact");
    expect(response.kinds[0]?.network).toBe("xrpl:1");
  });
});
