// xrp402 end-to-end demo — runs the full x402 payment loop on XRPL testnet
//
// Usage: npm run demo

import { spawn, type ChildProcess } from "node:child_process";
import { Client, Wallet } from "xrpl";
import { encodeHeader, decodeHeader } from "./shared.js";
import type { PaymentPayload, PaymentRequirements, ExactXrplPayload } from "./shared.js";

const TESTNET_URL = "wss://s.altnet.rippletest.net:51233";
const FACILITATOR_PORT = 3402;
const RESOURCE_PORT = 3401;
const FACILITATOR_URL = `http://localhost:${FACILITATOR_PORT}`;
const RESOURCE_URL = `http://localhost:${RESOURCE_PORT}`;

// ── Helpers ──

function log(msg: string) {
  console.log(msg);
}

function section(step: string) {
  console.log(`\n${step}`);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(url: string, label: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  throw new Error(`${label} did not start within ${timeoutMs / 1000}s`);
}

function spawnServer(label: string, args: string[], env?: Record<string, string>): ChildProcess {
  const child = spawn("npx", ["tsx", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Forward stderr so we can see startup errors
  child.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.error(`  [${label}] ${msg}`);
  });

  return child;
}

function cleanup(processes: ChildProcess[], client: Client) {
  for (const p of processes) {
    try { p.kill("SIGTERM"); } catch { /* already dead */ }
  }
  if (client.isConnected()) {
    client.disconnect().catch(() => {});
  }
}

// ── Main ──

async function main() {
  const processes: ChildProcess[] = [];
  const client = new Client(TESTNET_URL);

  // Ensure cleanup on unexpected exit
  process.on("SIGINT", () => { cleanup(processes, client); process.exit(1); });
  process.on("SIGTERM", () => { cleanup(processes, client); process.exit(1); });

  try {
    log("--- xrp402 Demo: x402 Payment Flow on XRPL Testnet ---");

    // ── Setup ──
    section("Setting up testnet wallets...");
    await client.connect();

    const [clientResult, merchantResult] = await Promise.all([
      client.fundWallet(),
      client.fundWallet(),
    ]);

    const clientWallet = clientResult.wallet;
    const merchantWallet = merchantResult.wallet;

    log(`  Client:   ${clientWallet.address} (${clientResult.balance} XRP)`);
    log(`  Merchant: ${merchantWallet.address} (${merchantResult.balance} XRP)`);

    // ── Start servers ──
    section("Starting facilitator on :3402...");
    const facilitator = spawnServer("facilitator", ["src/index.ts"], {
      PORT: String(FACILITATOR_PORT),
    });
    processes.push(facilitator);
    await waitForServer(`${FACILITATOR_URL}/`, "Facilitator");
    log("  ready");

    section("Starting resource server on :3401...");
    const resourceServer = spawnServer("resource-server", ["examples/resource-server.ts"], {
      PORT: String(RESOURCE_PORT),
      MERCHANT_ADDRESS: merchantWallet.address,
      FACILITATOR_URL,
    });
    processes.push(resourceServer);
    await waitForServer(`${RESOURCE_URL}/health`, "Resource server");
    log("  ready");

    // ── Step 1: Request without payment ──
    section("[1/3] Request without payment");
    log(`  GET ${RESOURCE_URL}/haiku`);

    const noPayRes = await fetch(`${RESOURCE_URL}/haiku`);
    log(`  <- ${noPayRes.status} Payment Required`);

    const reqHeader = noPayRes.headers.get("Payment-Required");
    if (!reqHeader) throw new Error("No Payment-Required header in 402 response");

    const requirements = decodeHeader<PaymentRequirements>(reqHeader);
    const priceXrp = (Number(requirements.maxAmountRequired) / 1_000_000).toFixed(0);
    log(`  Requires: ${priceXrp} XRP to ${requirements.payTo}`);

    // ── Step 2: Construct and sign payment ──
    section("[2/3] Construct and sign XRPL payment");

    const accountInfo = await client.request({
      command: "account_info",
      account: clientWallet.address,
      ledger_index: "current",
    });
    const sequence = accountInfo.result.account_data.Sequence;
    const currentLedger = await client.getLedgerIndex();
    const lastLedgerSequence = currentLedger + 50;

    const tx = {
      TransactionType: "Payment" as const,
      Account: clientWallet.address,
      Destination: requirements.payTo,
      Amount: requirements.maxAmountRequired,
      Fee: "12",
      Sequence: sequence,
      LastLedgerSequence: lastLedgerSequence,
    };

    const signed = clientWallet.sign(tx);

    log(`  Payment: ${Number(requirements.maxAmountRequired).toLocaleString()} drops ${clientWallet.address} -> ${requirements.payTo}`);
    log(`  Signed (sequence ${sequence}, ledger limit +50)`);

    // Build the x402 payment payload
    const xrplPayload: ExactXrplPayload = {
      txBlob: signed.tx_blob,
      authorization: {
        account: clientWallet.address,
        destination: requirements.payTo,
        amount: requirements.maxAmountRequired,
        fee: "12",
        sequence,
        lastLedgerSequence,
      },
    };

    const paymentPayload: PaymentPayload = {
      x402Version: 2,
      scheme: "exact",
      network: "xrpl:1",
      payload: xrplPayload,
    };

    // ── Step 3: Retry with payment ──
    section("[3/3] Retry with payment");
    log(`  GET ${RESOURCE_URL}/haiku`);

    const paidRes = await fetch(`${RESOURCE_URL}/haiku`, {
      headers: {
        Payment: encodeHeader(paymentPayload),
      },
    });

    if (!paidRes.ok) {
      const body = await paidRes.text();
      throw new Error(`Payment request failed (${paidRes.status}): ${body}`);
    }

    log("  -> Facilitator: verified");
    log("  -> Facilitator: settled");
    log(`  <- ${paidRes.status} OK`);

    const result = await paidRes.json() as {
      haiku: string;
      payment: { transaction: string; network: string; payer: string };
    };

    // ── Print result ──
    console.log("");
    for (const line of result.haiku.split("\n")) {
      log(`  "${line}"`);
    }

    const txHash = result.payment.transaction;
    console.log("");
    log(`  Transaction: ${txHash}`);
    log(`  https://testnet.xrpl.org/transactions/${txHash}`);

    console.log("\nDone.");
  } finally {
    cleanup(processes, client);
  }
}

main().catch((err) => {
  console.error("\nDemo failed:", err.message ?? err);
  process.exit(1);
});
