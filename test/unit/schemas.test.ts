import { describe, it, expect } from "vitest";
import { VerifyRequestSchema, SettleRequestSchema } from "../../src/types/schemas.js";

const validPayload = {
  paymentPayload: {
    x402Version: 2,
    scheme: "exact",
    network: "xrpl:1",
    payload: {
      txBlob: "1200002200000000240000000361400000000000000A684000000000000014732103AC651208BDA639A37E3B862F20DEF8D8C05B8B982C2950B5B40E8F3E5D70C01E8114B5F762798A53D543A014CAF8B297CFF8F2F937E88314FDB08D07AAA0EB711793CF4F0B1D0B3D6C8B3C6F",
      authorization: {
        account: "rSourceAddress123",
        destination: "rDestAddress456",
        amount: "1000000",
        fee: "12",
        sequence: 3,
      },
    },
  },
  paymentRequirements: {
    scheme: "exact",
    network: "xrpl:1",
    payTo: "rDestAddress456",
    maxAmountRequired: "1000000",
    asset: "XRP",
  },
};

describe("VerifyRequestSchema", () => {
  it("accepts a valid XRP request", () => {
    const result = VerifyRequestSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts a request with issued currency amount", () => {
    const issuedPayload = structuredClone(validPayload);
    issuedPayload.paymentPayload.payload.authorization.amount = {
      currency: "RLUSD",
      issuer: "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV",
      value: "10.00",
    } as unknown as string;
    issuedPayload.paymentRequirements.asset = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";

    const result = VerifyRequestSchema.safeParse(issuedPayload);
    expect(result.success).toBe(true);
  });

  it("accepts a request with optional ticket sequence", () => {
    const ticketPayload = structuredClone(validPayload);
    ticketPayload.paymentPayload.payload.authorization.sequence = 0;
    (ticketPayload.paymentPayload.payload.authorization as Record<string, unknown>).ticketSequence = 5;

    const result = VerifyRequestSchema.safeParse(ticketPayload);
    expect(result.success).toBe(true);
  });

  it("rejects missing paymentPayload", () => {
    const result = VerifyRequestSchema.safeParse({
      paymentRequirements: validPayload.paymentRequirements,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing paymentRequirements", () => {
    const result = VerifyRequestSchema.safeParse({
      paymentPayload: validPayload.paymentPayload,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty txBlob", () => {
    const bad = structuredClone(validPayload);
    bad.paymentPayload.payload.txBlob = "";
    const result = VerifyRequestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects missing authorization fields", () => {
    const bad = structuredClone(validPayload);
    (bad.paymentPayload.payload.authorization as Record<string, unknown>).account = undefined;
    const result = VerifyRequestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects non-integer sequence", () => {
    const bad = structuredClone(validPayload);
    (bad.paymentPayload.payload.authorization as Record<string, unknown>).sequence = 1.5;
    const result = VerifyRequestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("SettleRequestSchema", () => {
  it("accepts a valid request (same shape as verify)", () => {
    const result = SettleRequestSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("rejects missing fields", () => {
    const result = SettleRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
