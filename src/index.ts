import { Hono } from "hono";
import { logger } from "hono/logger";

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

// x402 facilitator endpoints
app.get("/supported", (c) => {
  return c.json({
    kinds: [
      {
        x402Version: 2,
        scheme: "exact",
        network: "xrpl:1", // Testnet for now
      },
    ],
    extensions: [],
    signers: {},
  });
});

app.post("/verify", async (c) => {
  // TODO: Implement verification logic
  return c.json({
    isValid: false,
    invalidReason: "not_implemented",
  });
});

app.post("/settle", async (c) => {
  // TODO: Implement settlement logic
  return c.json({
    success: false,
    errorReason: "not_implemented",
    transaction: "",
    network: "xrpl:1",
  });
});

const port = process.env.PORT ?? 3402;
console.log(`xrp402 facilitator starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
