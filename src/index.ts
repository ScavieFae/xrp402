import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { getSupported } from "./facilitator/supported.js";
import { verify } from "./facilitator/verify.js";
import { settle } from "./facilitator/settle.js";
import { VerifyRequestSchema, SettleRequestSchema } from "./types/schemas.js";
import { connectClient, disconnectClient, getClient } from "./xrpl/client.js";
import type { XrplNetwork } from "./xrpl/constants.js";
import type { ExactXrplPayload } from "./types/xrpl-payload.js";

const app = new Hono();

app.use("*", logger());

// Health check
app.get("/", (c) => {
  return c.json({
    name: "xrp402",
    description: "x402 facilitator for XRPL",
    version: "0.1.0",
  });
});

// GET /supported — list supported schemes and networks
app.get("/supported", (c) => {
  return c.json(getSupported());
});

// POST /verify — validate payment without settling
app.post("/verify", async (c) => {
  const body = await c.req.json();
  const parsed = VerifyRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { isValid: false, invalidReason: `invalid_request: ${parsed.error.message}` },
      400,
    );
  }

  const { paymentPayload, paymentRequirements } = parsed.data;
  const network = paymentPayload.network as XrplNetwork;
  const client = getClient(network);
  const payload = paymentPayload.payload as ExactXrplPayload;

  const result = await verify(payload, paymentRequirements, client);
  return c.json(result);
});

// POST /settle — validate and submit to blockchain
app.post("/settle", async (c) => {
  const body = await c.req.json();
  const parsed = SettleRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { success: false, errorReason: `invalid_request: ${parsed.error.message}` },
      400,
    );
  }

  const { paymentPayload, paymentRequirements } = parsed.data;
  const network = paymentPayload.network as XrplNetwork;
  const client = getClient(network);

  if (!client) {
    return c.json(
      { success: false, errorReason: "xrpl_client_not_connected", network },
      503,
    );
  }

  const payload = paymentPayload.payload as ExactXrplPayload;
  const result = await settle(payload, paymentRequirements, client, network);
  return c.json(result);
});

const port = Number(process.env["PORT"] ?? 3402);

// XRPL client lifecycle
connectClient().then(() => {
  console.log(`xrp402 facilitator starting on port ${port}`);
}).catch((err) => {
  console.error("Failed to connect XRPL client:", err);
  console.log(`xrp402 facilitator starting on port ${port} (without XRPL connection)`);
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`xrp402 facilitator listening on port ${port}`);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  await disconnectClient();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await disconnectClient();
  process.exit(0);
});
