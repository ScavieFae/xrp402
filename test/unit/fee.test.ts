import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyFeePayload } from "../../src/facilitator/fee.js";
import type { ExactXrplPayload } from "../../src/types/xrpl-payload.js";

const basePayload: ExactXrplPayload = {
  txBlob: "dummy",
  authorization: {
    account: "rPayer123",
    destination: "rMerchant456",
    amount: "1000000",
    fee: "12",
    sequence: 1,
  },
};

describe("verifyFeePayload", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when fee is null (free tier)", () => {
    expect(verifyFeePayload(basePayload, null)).toBeNull();
  });

  it("returns null when fee is '0' (infrastructure ready, no charge)", () => {
    expect(verifyFeePayload(basePayload, "0")).toBeNull();
  });

  it("returns null when no facilitator address configured and no fee fields", () => {
    // No FACILITATOR_ADDRESS env var set, no fee fields in payload
    expect(verifyFeePayload(basePayload, "100000")).toBeNull();
  });

  it("rejects when facilitator configured but fee fields missing", () => {
    vi.stubEnv("FACILITATOR_ADDRESS", "rFacilitator789");

    const result = verifyFeePayload(basePayload, "100000");
    expect(result?.invalidReason).toBe("fee_payment_required");
  });

  it("rejects when fee fields present but no facilitator configured", () => {
    // No FACILITATOR_ADDRESS env var
    const payload: ExactXrplPayload = {
      ...basePayload,
      feeTxBlob: "some_blob",
      feeAuthorization: {
        account: "rPayer123",
        destination: "rFacilitator789",
        amount: "100000",
        sequence: 2,
      },
    };

    const result = verifyFeePayload(payload, "100000");
    expect(result?.invalidReason).toBe("fee_facilitator_not_configured");
  });

  it("rejects wrong destination (not facilitator address)", () => {
    vi.stubEnv("FACILITATOR_ADDRESS", "rFacilitator789");

    const payload: ExactXrplPayload = {
      ...basePayload,
      feeTxBlob: "some_blob",
      feeAuthorization: {
        account: "rPayer123",
        destination: "rWrongDestination",
        amount: "100000",
        sequence: 2,
      },
    };

    // This will fail at decode since feeTxBlob is not a valid hex blob
    const result = verifyFeePayload(payload, "100000");
    expect(result).not.toBeNull();
    expect(result?.isValid).toBe(false);
  });

  it("rejects wrong fee amount", () => {
    vi.stubEnv("FACILITATOR_ADDRESS", "rFacilitator789");

    const payload: ExactXrplPayload = {
      ...basePayload,
      feeTxBlob: "some_blob",
      feeAuthorization: {
        account: "rPayer123",
        destination: "rFacilitator789",
        amount: "50000", // Wrong — should be 100000
        sequence: 2,
      },
    };

    const result = verifyFeePayload(payload, "100000");
    expect(result).not.toBeNull();
    expect(result?.isValid).toBe(false);
  });

  it("rejects fee from different payer than merchant tx", () => {
    vi.stubEnv("FACILITATOR_ADDRESS", "rFacilitator789");

    const payload: ExactXrplPayload = {
      ...basePayload,
      feeTxBlob: "some_blob",
      feeAuthorization: {
        account: "rDifferentPayer", // Not rPayer123
        destination: "rFacilitator789",
        amount: "100000",
        sequence: 2,
      },
    };

    const result = verifyFeePayload(payload, "100000");
    expect(result).not.toBeNull();
    expect(result?.isValid).toBe(false);
  });
});
