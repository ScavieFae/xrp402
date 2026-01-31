// Resource server — a paid endpoint that uses xrp402 as its facilitator
// Hand-rolled x402 flow: no @x402 middleware, just the protocol.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { encodeHeader, decodeHeader } from "./shared.js";
import type { PaymentPayload, PaymentRequirements } from "./shared.js";

const FACILITATOR_URL = process.env["FACILITATOR_URL"] ?? "http://localhost:3402";
const MERCHANT_ADDRESS = process.env["MERCHANT_ADDRESS"];

if (!MERCHANT_ADDRESS) {
  console.error("MERCHANT_ADDRESS env var is required");
  process.exit(1);
}

const PRICE_DROPS = "1000000"; // 1 XRP

const haikus = [
  "Drops fall in silence,\nledger closes, balance shifts—\nvalue, rearranged.",
  "A hash, a handshake—\nconsensus across the net,\ntrust without a face.",
  "Payment in transit,\nvalidators nod as one—\nsettled before tea.",
];

const requirements: PaymentRequirements = {
  scheme: "exact",
  network: "xrpl:1",
  payTo: MERCHANT_ADDRESS,
  maxAmountRequired: PRICE_DROPS,
  asset: "XRP",
  description: "A haiku about XRPL",
};

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/haiku", async (c) => {
  const paymentHeader = c.req.header("Payment");

  // No payment → 402
  if (!paymentHeader) {
    return c.json(
      { error: "Payment Required", requirements },
      402,
      { "Payment-Required": encodeHeader(requirements) },
    );
  }

  // Decode payment payload from header
  let paymentPayload: PaymentPayload;
  try {
    paymentPayload = decodeHeader<PaymentPayload>(paymentHeader);
  } catch {
    return c.json({ error: "Malformed Payment header" }, 400);
  }

  // Verify with facilitator
  const verifyRes = await fetch(`${FACILITATOR_URL}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentPayload, paymentRequirements: requirements }),
  });

  const verifyResult = await verifyRes.json() as { isValid: boolean; invalidReason?: string };
  if (!verifyResult.isValid) {
    return c.json(
      { error: "Payment verification failed", reason: verifyResult.invalidReason },
      402,
    );
  }

  // Settle with facilitator
  const settleRes = await fetch(`${FACILITATOR_URL}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentPayload, paymentRequirements: requirements }),
  });

  const settleResult = await settleRes.json() as {
    success: boolean;
    transaction?: string;
    network?: string;
    payer?: string;
    errorReason?: string;
  };

  if (!settleResult.success) {
    return c.json(
      { error: "Payment settlement failed", reason: settleResult.errorReason },
      502,
    );
  }

  // Payment settled — serve the resource
  const haiku = haikus[Math.floor(Math.random() * haikus.length)];

  return c.json(
    {
      haiku,
      payment: {
        transaction: settleResult.transaction,
        network: settleResult.network,
        payer: settleResult.payer,
      },
    },
    200,
    {
      "Payment-Response": encodeHeader({
        success: true,
        transaction: settleResult.transaction,
        network: settleResult.network,
      }),
    },
  );
});

const port = Number(process.env["PORT"] ?? 3401);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Resource server listening on port ${port}`);
});
