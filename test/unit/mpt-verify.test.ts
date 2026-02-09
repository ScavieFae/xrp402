import { describe, it, expect } from "vitest";
import {
  crossCheckAuthorization,
  checkAmount,
  checkAsset,
} from "../../src/facilitator/verify.js";
import { isMPTAmount, classifyAsset } from "../../src/types/xrpl-payload.js";
import { checkMptAllowlist } from "../../src/xrpl/mpt-checks.js";
import type { ExactXrplPayload } from "../../src/types/xrpl-payload.js";
import type { PaymentRequirements } from "../../src/types/x402.js";

const TEST_ISSUANCE_ID = "00000001A407AF5856CFD6C40B1E5C6A5115C681";
const WRONG_ISSUANCE_ID = "00000002BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

// --- isMPTAmount type guard ---

describe("isMPTAmount", () => {
  it("returns true for MPTAmount objects", () => {
    expect(isMPTAmount({ mpt_issuance_id: TEST_ISSUANCE_ID, value: "100" })).toBe(true);
  });

  it("returns false for string amounts (XRP drops)", () => {
    expect(isMPTAmount("1000000")).toBe(false);
  });

  it("returns false for IssuedCurrencyAmount", () => {
    expect(isMPTAmount({ currency: "RLUSD", issuer: "rIssuer", value: "10" })).toBe(false);
  });

  it("returns false for objects with both currency and mpt_issuance_id", () => {
    // Should not happen, but guards against malformed data
    const weird = { currency: "X", issuer: "r", mpt_issuance_id: "abc", value: "1" };
    // isIssuedCurrencyAmount would catch this first; isMPTAmount checks !("currency" in ...)
    expect(isMPTAmount(weird as never)).toBe(false);
  });
});

// --- classifyAsset ---

describe("classifyAsset with mpt:", () => {
  it("classifies mpt: prefix as mpt", () => {
    expect(classifyAsset(`mpt:${TEST_ISSUANCE_ID}`)).toBe("mpt");
  });

  it("still classifies XRP correctly", () => {
    expect(classifyAsset("XRP")).toBe("xrp");
  });

  it("still classifies issuer address as issued", () => {
    expect(classifyAsset("rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De")).toBe("issued");
  });
});

// --- crossCheckAuthorization with MPTAmount ---

describe("crossCheckAuthorization (MPT)", () => {
  const mptPayload: ExactXrplPayload = {
    txBlob: "dummy",
    authorization: {
      account: "rSender",
      destination: "rReceiver",
      amount: { mpt_issuance_id: TEST_ISSUANCE_ID, value: "100" },
      fee: "12",
      sequence: 1,
    },
  };

  it("passes when MPT fields match", () => {
    const tx: Record<string, unknown> = {
      Account: "rSender",
      Destination: "rReceiver",
      Amount: { mpt_issuance_id: TEST_ISSUANCE_ID, value: "100" },
      Fee: "12",
      Sequence: 1,
    };
    expect(crossCheckAuthorization(tx, mptPayload)).toBeNull();
  });

  it("rejects mismatched mpt_issuance_id", () => {
    const tx: Record<string, unknown> = {
      Account: "rSender",
      Destination: "rReceiver",
      Amount: { mpt_issuance_id: WRONG_ISSUANCE_ID, value: "100" },
      Fee: "12",
      Sequence: 1,
    };
    const result = crossCheckAuthorization(tx, mptPayload);
    expect(result?.invalidReason).toBe("authorization_mismatch_amount");
  });

  it("rejects mismatched value", () => {
    const tx: Record<string, unknown> = {
      Account: "rSender",
      Destination: "rReceiver",
      Amount: { mpt_issuance_id: TEST_ISSUANCE_ID, value: "999" },
      Fee: "12",
      Sequence: 1,
    };
    const result = crossCheckAuthorization(tx, mptPayload);
    expect(result?.invalidReason).toBe("authorization_mismatch_amount");
  });

  it("rejects non-object tx amount for MPT auth", () => {
    const tx: Record<string, unknown> = {
      Account: "rSender",
      Destination: "rReceiver",
      Amount: "1000000",
      Fee: "12",
      Sequence: 1,
    };
    const result = crossCheckAuthorization(tx, mptPayload);
    expect(result?.invalidReason).toBe("authorization_mismatch_amount");
  });
});

// --- checkAmount with MPT ---

describe("checkAmount (MPT)", () => {
  const makeMptPayload = (value: string): ExactXrplPayload => ({
    txBlob: "dummy",
    authorization: {
      account: "rSender",
      destination: "rReceiver",
      amount: { mpt_issuance_id: TEST_ISSUANCE_ID, value },
      fee: "12",
      sequence: 1,
    },
  });

  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: "xrpl:1",
    payTo: "rReceiver",
    maxAmountRequired: "100",
    asset: `mpt:${TEST_ISSUANCE_ID}`,
  };

  it("passes when MPT amount meets requirement", () => {
    expect(checkAmount(makeMptPayload("100"), requirements)).toBeNull();
  });

  it("passes when MPT amount exceeds requirement (overpayment)", () => {
    expect(checkAmount(makeMptPayload("150"), requirements)).toBeNull();
  });

  it("rejects when MPT amount is below requirement", () => {
    const result = checkAmount(makeMptPayload("50"), requirements);
    expect(result?.invalidReason).toBe("insufficient_amount");
  });
});

// --- checkAsset with MPT ---

describe("checkAsset (MPT)", () => {
  const mptPayload: ExactXrplPayload = {
    txBlob: "dummy",
    authorization: {
      account: "rSender",
      destination: "rReceiver",
      amount: { mpt_issuance_id: TEST_ISSUANCE_ID, value: "100" },
      fee: "12",
      sequence: 1,
    },
  };

  it("passes for matching MPT issuance ID", () => {
    const reqs: PaymentRequirements = {
      scheme: "exact",
      network: "xrpl:1",
      payTo: "rReceiver",
      maxAmountRequired: "100",
      asset: `mpt:${TEST_ISSUANCE_ID}`,
    };
    expect(checkAsset(mptPayload, reqs)).toBeNull();
  });

  it("rejects wrong issuance ID", () => {
    const reqs: PaymentRequirements = {
      scheme: "exact",
      network: "xrpl:1",
      payTo: "rReceiver",
      maxAmountRequired: "100",
      asset: `mpt:${WRONG_ISSUANCE_ID}`,
    };
    const result = checkAsset(mptPayload, reqs);
    expect(result?.invalidReason).toBe("asset_mismatch_issuance_id");
  });

  it("rejects non-MPT amount for MPT requirement", () => {
    const xrpPayload: ExactXrplPayload = {
      txBlob: "dummy",
      authorization: {
        account: "rSender",
        destination: "rReceiver",
        amount: "1000000",
        fee: "12",
        sequence: 1,
      },
    };
    const reqs: PaymentRequirements = {
      scheme: "exact",
      network: "xrpl:1",
      payTo: "rReceiver",
      maxAmountRequired: "100",
      asset: `mpt:${TEST_ISSUANCE_ID}`,
    };
    const result = checkAsset(xrpPayload, reqs);
    expect(result?.invalidReason).toBe("asset_mismatch");
  });
});

// --- checkMptAllowlist ---

describe("checkMptAllowlist", () => {
  it("rejects unknown issuance ID (empty allowlist)", () => {
    const result = checkMptAllowlist("xrpl:1", {
      mpt_issuance_id: TEST_ISSUANCE_ID,
      value: "100",
    });
    expect(result?.invalidReason).toBe("mpt_not_allowlisted");
  });

  it("rejects on wrong network even if ID exists elsewhere", () => {
    // With empty allowlist, any network rejects
    const result = checkMptAllowlist("xrpl:0", {
      mpt_issuance_id: TEST_ISSUANCE_ID,
      value: "100",
    });
    expect(result?.invalidReason).toBe("mpt_not_allowlisted");
  });
});
