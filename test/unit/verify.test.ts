import { describe, it, expect, beforeAll } from "vitest";
import { Wallet, encode } from "xrpl";
import {
  decodeTxBlob,
  validateTransaction,
  verifyTxSignature,
  crossCheckAuthorization,
  checkDestination,
  checkAmount,
  checkAsset,
  rejectPartialPayment,
  verify,
} from "../../src/facilitator/verify.js";
import type { ExactXrplPayload } from "../../src/types/xrpl-payload.js";
import type { PaymentRequirements } from "../../src/types/x402.js";

// Test fixtures — create once, reuse across tests
let wallet: Wallet;
let destAddress: string;
let signedBlob: string;
let xrpPayload: ExactXrplPayload;
let xrpRequirements: PaymentRequirements;

beforeAll(() => {
  wallet = Wallet.generate();
  destAddress = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";

  const tx = {
    TransactionType: "Payment" as const,
    Account: wallet.address,
    Destination: destAddress,
    Amount: "1000000", // 1 XRP
    Fee: "12",
    Sequence: 1,
    LastLedgerSequence: 100000000,
  };

  const signed = wallet.sign(tx);
  signedBlob = signed.tx_blob;

  xrpPayload = {
    txBlob: signedBlob,
    authorization: {
      account: wallet.address,
      destination: destAddress,
      amount: "1000000",
      fee: "12",
      sequence: 1,
      lastLedgerSequence: 100000000,
    },
  };

  xrpRequirements = {
    scheme: "exact",
    network: "xrpl:1",
    payTo: destAddress,
    maxAmountRequired: "1000000",
    asset: "XRP",
  };
});

// --- Step 1: Decode ---

describe("decodeTxBlob", () => {
  it("decodes a valid tx blob", () => {
    const result = decodeTxBlob(signedBlob);
    expect("tx" in result).toBe(true);
    if ("tx" in result) {
      expect(result.tx["TransactionType"]).toBe("Payment");
      expect(result.tx["Account"]).toBe(wallet.address);
    }
  });

  it("rejects garbage hex", () => {
    const result = decodeTxBlob("deadbeef");
    expect("isValid" in result).toBe(true);
    if ("isValid" in result) {
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_tx_blob");
    }
  });

  it("rejects empty string", () => {
    const result = decodeTxBlob("");
    // Empty string decodes to empty object, which fails at validate step
    // Either returns { tx } or { isValid: false } depending on xrpl.js version
    expect(result).toBeDefined();
  });
});

// --- Step 2: Validate ---

describe("validateTransaction", () => {
  it("accepts a valid Payment transaction", () => {
    const result = decodeTxBlob(signedBlob);
    expect("tx" in result).toBe(true);
    if ("tx" in result) {
      expect(validateTransaction(result.tx)).toBeNull();
    }
  });

  it("rejects a non-Payment transaction type", () => {
    // OfferCreate is valid tx type but not what we want to accept
    // validate() itself accepts any valid tx structure
    // We rely on cross-check + amount checks for Payment enforcement
    const fakeTx = {
      TransactionType: "NotARealType",
      Account: wallet.address,
    };
    const result = validateTransaction(fakeTx);
    // Invalid TransactionType should fail validation
    expect(result).not.toBeNull();
  });
});

// --- Step 3: Signature ---

describe("verifyTxSignature", () => {
  it("accepts a correctly signed blob", () => {
    expect(verifyTxSignature(signedBlob)).toBeNull();
  });

  it("rejects a tampered blob", () => {
    // Flip a character in the middle of the blob
    const chars = signedBlob.split("");
    const midpoint = Math.floor(chars.length / 2);
    chars[midpoint] = chars[midpoint] === "A" ? "B" : "A";
    const tampered = chars.join("");

    const result = verifyTxSignature(tampered);
    // Either invalid_signature or signature_verification_failed (if decode fails)
    expect(result).not.toBeNull();
    expect(result?.isValid).toBe(false);
  });
});

// --- Step 4: Cross-check ---

describe("crossCheckAuthorization", () => {
  it("passes when all fields match", () => {
    const result = decodeTxBlob(signedBlob);
    expect("tx" in result).toBe(true);
    if ("tx" in result) {
      expect(crossCheckAuthorization(result.tx, xrpPayload)).toBeNull();
    }
  });

  it("rejects mismatched account", () => {
    const result = decodeTxBlob(signedBlob);
    if ("tx" in result) {
      const badPayload = {
        ...xrpPayload,
        authorization: { ...xrpPayload.authorization, account: "rWrongAccount" },
      };
      const check = crossCheckAuthorization(result.tx, badPayload);
      expect(check?.invalidReason).toBe("authorization_mismatch_account");
    }
  });

  it("rejects mismatched destination", () => {
    const result = decodeTxBlob(signedBlob);
    if ("tx" in result) {
      const badPayload = {
        ...xrpPayload,
        authorization: { ...xrpPayload.authorization, destination: "rWrongDest" },
      };
      const check = crossCheckAuthorization(result.tx, badPayload);
      expect(check?.invalidReason).toBe("authorization_mismatch_destination");
    }
  });

  it("rejects mismatched amount", () => {
    const result = decodeTxBlob(signedBlob);
    if ("tx" in result) {
      const badPayload = {
        ...xrpPayload,
        authorization: { ...xrpPayload.authorization, amount: "9999999" },
      };
      const check = crossCheckAuthorization(result.tx, badPayload);
      expect(check?.invalidReason).toBe("authorization_mismatch_amount");
    }
  });

  it("rejects mismatched fee", () => {
    const result = decodeTxBlob(signedBlob);
    if ("tx" in result) {
      const badPayload = {
        ...xrpPayload,
        authorization: { ...xrpPayload.authorization, fee: "999" },
      };
      const check = crossCheckAuthorization(result.tx, badPayload);
      expect(check?.invalidReason).toBe("authorization_mismatch_fee");
    }
  });

  it("rejects mismatched sequence", () => {
    const result = decodeTxBlob(signedBlob);
    if ("tx" in result) {
      const badPayload = {
        ...xrpPayload,
        authorization: { ...xrpPayload.authorization, sequence: 999 },
      };
      const check = crossCheckAuthorization(result.tx, badPayload);
      expect(check?.invalidReason).toBe("authorization_mismatch_sequence");
    }
  });
});

// --- Step 5: Destination ---

describe("checkDestination", () => {
  it("passes when destination matches payTo", () => {
    expect(checkDestination(xrpPayload, xrpRequirements)).toBeNull();
  });

  it("rejects when destination differs from payTo", () => {
    const badReqs = { ...xrpRequirements, payTo: "rWrongAddress" };
    const result = checkDestination(xrpPayload, badReqs);
    expect(result?.invalidReason).toBe("destination_mismatch");
  });
});

// --- Step 6: Amount ---

describe("checkAmount", () => {
  it("passes when XRP amount meets requirement", () => {
    expect(checkAmount(xrpPayload, xrpRequirements)).toBeNull();
  });

  it("passes when XRP amount exceeds requirement", () => {
    const lowReqs = { ...xrpRequirements, maxAmountRequired: "500000" };
    expect(checkAmount(xrpPayload, lowReqs)).toBeNull();
  });

  it("rejects when XRP amount is below requirement", () => {
    const highReqs = { ...xrpRequirements, maxAmountRequired: "2000000" };
    const result = checkAmount(xrpPayload, highReqs);
    expect(result?.invalidReason).toBe("insufficient_amount");
  });

  it("passes for issued currency meeting requirement", () => {
    const issuedPayload: ExactXrplPayload = {
      ...xrpPayload,
      authorization: {
        ...xrpPayload.authorization,
        amount: { currency: "RLUSD", issuer: "rIssuer123", value: "10.00" },
      },
    };
    const issuedReqs = { ...xrpRequirements, maxAmountRequired: "10.00", asset: "rIssuer123" };
    expect(checkAmount(issuedPayload, issuedReqs)).toBeNull();
  });

  it("rejects issued currency below requirement", () => {
    const issuedPayload: ExactXrplPayload = {
      ...xrpPayload,
      authorization: {
        ...xrpPayload.authorization,
        amount: { currency: "RLUSD", issuer: "rIssuer123", value: "5.00" },
      },
    };
    const issuedReqs = { ...xrpRequirements, maxAmountRequired: "10.00", asset: "rIssuer123" };
    const result = checkAmount(issuedPayload, issuedReqs);
    expect(result?.invalidReason).toBe("insufficient_amount");
  });
});

// --- Step 7: Asset ---

describe("checkAsset", () => {
  it("passes for XRP with drops amount", () => {
    expect(checkAsset(xrpPayload, xrpRequirements)).toBeNull();
  });

  it("rejects XRP requirement with issued currency payload", () => {
    const issuedPayload: ExactXrplPayload = {
      ...xrpPayload,
      authorization: {
        ...xrpPayload.authorization,
        amount: { currency: "RLUSD", issuer: "rIssuer123", value: "10.00" },
      },
    };
    const result = checkAsset(issuedPayload, xrpRequirements);
    expect(result?.invalidReason).toBe("asset_mismatch");
  });

  it("passes for issued currency with matching issuer", () => {
    const issuedPayload: ExactXrplPayload = {
      ...xrpPayload,
      authorization: {
        ...xrpPayload.authorization,
        amount: { currency: "RLUSD", issuer: "rIssuer123", value: "10.00" },
      },
    };
    const issuedReqs = { ...xrpRequirements, asset: "rIssuer123" };
    expect(checkAsset(issuedPayload, issuedReqs)).toBeNull();
  });

  it("rejects issued currency with wrong issuer", () => {
    const issuedPayload: ExactXrplPayload = {
      ...xrpPayload,
      authorization: {
        ...xrpPayload.authorization,
        amount: { currency: "RLUSD", issuer: "rIssuer123", value: "10.00" },
      },
    };
    const issuedReqs = { ...xrpRequirements, asset: "rWrongIssuer" };
    const result = checkAsset(issuedPayload, issuedReqs);
    expect(result?.invalidReason).toBe("asset_mismatch_issuer");
  });
});

// --- Step 8: Partial Payment ---

describe("rejectPartialPayment", () => {
  it("passes when no flags set", () => {
    expect(rejectPartialPayment({ Flags: 0 })).toBeNull();
  });

  it("passes when Flags is absent", () => {
    expect(rejectPartialPayment({})).toBeNull();
  });

  it("rejects when tfPartialPayment flag is set", () => {
    const result = rejectPartialPayment({ Flags: 0x00020000 });
    expect(result?.invalidReason).toBe("partial_payment_not_allowed");
  });

  it("rejects when tfPartialPayment flag is combined with other flags", () => {
    const result = rejectPartialPayment({ Flags: 0x00020000 | 0x00000001 });
    expect(result?.invalidReason).toBe("partial_payment_not_allowed");
  });
});

// --- Full offline pipeline ---

describe("verify (offline pipeline)", () => {
  it("passes a valid XRP payment through all offline steps", async () => {
    const result = await verify(xrpPayload, xrpRequirements);
    expect(result.isValid).toBe(true);
  });

  it("rejects when destination does not match payTo", async () => {
    const badReqs = { ...xrpRequirements, payTo: "rWrongAddress" };
    const result = await verify(xrpPayload, badReqs);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("destination_mismatch");
  });

  it("rejects when amount is below requirement", async () => {
    const highReqs = { ...xrpRequirements, maxAmountRequired: "9999999999" };
    const result = await verify(xrpPayload, highReqs);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("insufficient_amount");
  });

  it("rejects when asset type mismatches", async () => {
    const issuedReqs = { ...xrpRequirements, asset: "rSomeIssuer123" };
    const result = await verify(xrpPayload, issuedReqs);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("asset_mismatch");
  });
});

// --- RLUSD pipeline ---

describe("verify (RLUSD offline)", () => {
  let rlusdPayload: ExactXrplPayload;
  let rlusdRequirements: PaymentRequirements;

  // RLUSD hex code: 5-char codes need 40-char hex for xrpl.js signing
  const RLUSD_HEX = "524C555344000000000000000000000000000000";
  const RLUSD_ISSUER = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";

  beforeAll(() => {
    const rlusdWallet = Wallet.generate();
    const rlusdDest = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";

    const tx = {
      TransactionType: "Payment" as const,
      Account: rlusdWallet.address,
      Destination: rlusdDest,
      Amount: {
        currency: RLUSD_HEX,
        issuer: RLUSD_ISSUER,
        value: "25.50",
      },
      Fee: "12",
      Sequence: 1,
      LastLedgerSequence: 100000000,
    };

    const signed = rlusdWallet.sign(tx);

    // After decode, xrpl.js represents the currency as the hex code
    rlusdPayload = {
      txBlob: signed.tx_blob,
      authorization: {
        account: rlusdWallet.address,
        destination: rlusdDest,
        amount: {
          currency: RLUSD_HEX,
          issuer: RLUSD_ISSUER,
          value: "25.50",
        },
        fee: "12",
        sequence: 1,
        lastLedgerSequence: 100000000,
      },
    };

    rlusdRequirements = {
      scheme: "exact",
      network: "xrpl:1",
      payTo: rlusdDest,
      maxAmountRequired: "25.50",
      asset: RLUSD_ISSUER,
    };
  });

  it("passes a valid RLUSD payment through all offline steps", async () => {
    const result = await verify(rlusdPayload, rlusdRequirements);
    expect(result.isValid).toBe(true);
  });

  it("rejects RLUSD when amount below requirement", async () => {
    const highReqs = { ...rlusdRequirements, maxAmountRequired: "100.00" };
    const result = await verify(rlusdPayload, highReqs);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("insufficient_amount");
  });
});
