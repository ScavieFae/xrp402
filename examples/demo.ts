// xrp402 end-to-end demo — runs the full x402 payment loop on XRPL testnet
//
// Usage: npm run demo

import { spawn, type ChildProcess } from "node:child_process";
import { Client } from "xrpl";
import pc from "picocolors";
import { encodeHeader, decodeHeader } from "./shared.js";
import type { PaymentPayload, PaymentRequirements, ExactXrplPayload } from "./shared.js";

const TESTNET_URL = "wss://s.altnet.rippletest.net:51233";
const FACILITATOR_PORT = 3402;
const RESOURCE_PORT = 3401;
const FACILITATOR_URL = `http://localhost:${FACILITATOR_PORT}`;
const RESOURCE_URL = `http://localhost:${RESOURCE_PORT}`;

// ── Formatting helpers ──

function truncAddr(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-3)}`;
}

function elapsed(startMs: number): string {
  return ((Date.now() - startMs) / 1000).toFixed(1) + "s";
}

function ok(msg: string) {
  console.log(`  ${pc.green("✓")} ${msg}`);
}

function arrow(msg: string) {
  console.log(`  ${pc.dim("→")} ${msg}`);
}

function arrowBack(msg: string) {
  console.log(`  ${pc.dim("←")} ${msg}`);
}

function detail(msg: string) {
  console.log(`    ${msg}`);
}

function stepHeader(n: number, title: string) {
  console.log(`\n${pc.bold(pc.cyan(`Step ${n}`))} ${pc.dim("·")} ${title}`);
}

function titleBox() {
  const inner = [
    pc.bold("xrp402") + pc.dim(" · ") + "x402 Payments on XRPL",
    pc.dim("Live demo on XRPL Testnet"),
  ];
  // Measure without ANSI for padding (visual columns, not JS length)
  const plainLens = [
    "xrp402 · x402 Payments on XRPL".length,
    "Live demo on XRPL Testnet".length,
  ];
  const maxLen = Math.max(...plainLens);
  const width = maxLen + 4;
  const border = pc.cyan;
  console.log(border("┌" + "─".repeat(width) + "┐"));
  for (let i = 0; i < inner.length; i++) {
    const pad = width - plainLens[i] - 2;
    console.log(border("│") + "  " + inner[i] + " ".repeat(Math.max(pad, 0)) + border("│"));
  }
  console.log(border("└" + "─".repeat(width) + "┘"));
}

// ── Infrastructure helpers ──

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

  child.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.error(pc.dim(`  [${label}] ${msg}`));
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

  process.on("SIGINT", () => { cleanup(processes, client); process.exit(1); });
  process.on("SIGTERM", () => { cleanup(processes, client); process.exit(1); });

  try {
    console.log("");
    titleBox();

    // ── Setup ──
    const setupStart = Date.now();
    console.log(`\n${pc.bold("Setting up")}`);

    await client.connect();
    ok("Connected to XRPL Testnet");

    const [clientResult, merchantResult] = await Promise.all([
      client.fundWallet(),
      client.fundWallet(),
    ]);

    const clientWallet = clientResult.wallet;
    const merchantWallet = merchantResult.wallet;

    ok(`Client wallet   ${truncAddr(clientWallet.address)}  ${pc.dim(`(${clientResult.balance} XRP)`)}`);
    ok(`Merchant wallet ${truncAddr(merchantWallet.address)}  ${pc.dim(`(${merchantResult.balance} XRP)`)}`);

    // Start servers
    const facilitator = spawnServer("facilitator", ["src/index.ts"], {
      PORT: String(FACILITATOR_PORT),
    });
    processes.push(facilitator);
    await waitForServer(`${FACILITATOR_URL}/`, "Facilitator");
    ok(`Facilitator     :${FACILITATOR_PORT} ready`);

    const resourceServer = spawnServer("resource-server", ["examples/resource-server.ts"], {
      PORT: String(RESOURCE_PORT),
      MERCHANT_ADDRESS: merchantWallet.address,
      FACILITATOR_URL,
    });
    processes.push(resourceServer);
    await waitForServer(`${RESOURCE_URL}/health`, "Resource server");
    ok(`Resource server  :${RESOURCE_PORT} ready` + pc.dim(`             ${elapsed(setupStart)}`));

    // ── Step 1: Request without payment ──
    stepHeader(1, "Request a paid resource");
    arrow(`GET ${pc.dim("http://localhost:" + RESOURCE_PORT)}/haiku`);

    const noPayRes = await fetch(`${RESOURCE_URL}/haiku`);
    arrowBack(`${pc.yellow("402")} Payment Required`);

    const reqHeader = noPayRes.headers.get("Payment-Required");
    if (!reqHeader) throw new Error("No Payment-Required header in 402 response");

    const requirements = decodeHeader<PaymentRequirements>(reqHeader);
    const priceXrp = (Number(requirements.maxAmountRequired) / 1_000_000).toFixed(0);
    detail(`Pay ${priceXrp} XRP to ${truncAddr(requirements.payTo)}`);

    // ── Step 2: Sign payment ──
    stepHeader(2, "Sign an XRPL payment");

    const accountInfo = await client.request({
      command: "account_info",
      account: clientWallet.address,
      ledger_index: "current",
    });
    const sequence = accountInfo.result.account_data.Sequence;
    const currentLedger = await client.getLedgerIndex();
    const lastLedgerSequence = currentLedger + 50;

    const drops = Number(requirements.maxAmountRequired).toLocaleString();
    arrow(`${drops} drops  ${truncAddr(clientWallet.address)} ${pc.dim("→")} ${truncAddr(requirements.payTo)}`);

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
    ok(`Signed ${pc.dim(`(sequence ${sequence})`)}`);

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
    stepHeader(3, "Retry with payment");
    arrow(`GET ${pc.dim("http://localhost:" + RESOURCE_PORT)}/haiku + ${pc.bold("Payment")} header`);

    const settleStart = Date.now();
    const paidRes = await fetch(`${RESOURCE_URL}/haiku`, {
      headers: {
        Payment: encodeHeader(paymentPayload),
      },
    });

    if (!paidRes.ok) {
      const body = await paidRes.text();
      throw new Error(`Payment request failed (${paidRes.status}): ${body}`);
    }

    const settleTime = elapsed(settleStart);
    ok("Facilitator verified payment");
    ok(`Facilitator settled on-chain` + pc.dim(`              ${settleTime}`));
    arrowBack(`${pc.green("200")} OK`);

    const result = await paidRes.json() as {
      haiku: string;
      payment: { transaction: string; network: string; payer: string };
    };

    const txHash = result.payment.transaction;
    const txShort = txHash.slice(0, 4) + "..." + txHash.slice(-4);

    // ── Result box ──
    const haikuLines = result.haiku.split("\n").map((l) => pc.bold(pc.yellow(`"${l}"`)));
    const haikuPlainLens = result.haiku.split("\n").map((l) => `"${l}"`.length);
    const summaryLine = `Settled in ${settleTime} · ${priceXrp} XRP`;
    const txLine = `testnet.xrpl.org/transactions/${txShort}`;

    const allPlainLens = [...haikuPlainLens, summaryLine.length, txLine.length];
    const maxLen = Math.max(...allPlainLens);
    const w = maxLen + 4;
    const b = pc.yellow;

    console.log("");
    console.log(b("┌" + "─".repeat(w) + "┐"));
    console.log(b("│") + " ".repeat(w) + b("│"));
    for (let i = 0; i < haikuLines.length; i++) {
      const pad = w - haikuPlainLens[i] - 2;
      console.log(b("│") + "  " + haikuLines[i] + " ".repeat(Math.max(pad, 0)) + b("│"));
    }
    console.log(b("│") + " ".repeat(w) + b("│"));
    // Summary
    const sumPad = w - summaryLine.length - 2;
    console.log(b("│") + "  " + pc.dim(summaryLine) + " ".repeat(Math.max(sumPad, 0)) + b("│"));
    // TX link
    const txPad = w - txLine.length - 2;
    console.log(b("│") + "  " + pc.dim(txLine) + " ".repeat(Math.max(txPad, 0)) + b("│"));
    console.log(b("│") + " ".repeat(w) + b("│"));
    console.log(b("└" + "─".repeat(w) + "┘"));
    console.log("");
  } finally {
    cleanup(processes, client);
  }
}

main().catch((err) => {
  console.error(`\n${pc.red("✗")} Demo failed: ${err.message ?? err}`);
  process.exit(1);
});
