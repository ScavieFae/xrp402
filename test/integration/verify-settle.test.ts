import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client, Wallet } from "xrpl";
import { verify } from "../../src/facilitator/verify.js";
import { settle } from "../../src/facilitator/settle.js";
import type { ExactXrplPayload } from "../../src/types/xrpl-payload.js";
import type { PaymentRequirements } from "../../src/types/x402.js";

const TESTNET_URL = "wss://s.altnet.rippletest.net:51233";

describe("Verify + Settle (testnet)", () => {
  let client: Client;
  let sender: Wallet;
  let receiver: Wallet;

  beforeAll(async () => {
    client = new Client(TESTNET_URL);
    await client.connect();

    // Fund two wallets on testnet
    const [senderResult, receiverResult] = await Promise.all([
      client.fundWallet(),
      client.fundWallet(),
    ]);

    sender = senderResult.wallet;
    receiver = receiverResult.wallet;

    console.log(`Sender: ${sender.address}`);
    console.log(`Receiver: ${receiver.address}`);
  }, 60000);

  afterAll(async () => {
    if (client.isConnected()) {
      await client.disconnect();
    }
  });

  it("verifies a valid XRP payment with network checks", async () => {
    // Get current account info for sequence
    const accountInfo = await client.request({
      command: "account_info",
      account: sender.address,
      ledger_index: "current",
    });
    const sequence = accountInfo.result.account_data.Sequence;
    const currentLedger = await client.getLedgerIndex();

    const tx = {
      TransactionType: "Payment" as const,
      Account: sender.address,
      Destination: receiver.address,
      Amount: "1000000", // 1 XRP
      Fee: "12",
      Sequence: sequence,
      LastLedgerSequence: currentLedger + 50, // ~2.5 min buffer
    };

    const signed = sender.sign(tx);

    const payload: ExactXrplPayload = {
      txBlob: signed.tx_blob,
      authorization: {
        account: sender.address,
        destination: receiver.address,
        amount: "1000000",
        fee: "12",
        sequence,
        lastLedgerSequence: currentLedger + 50,
      },
    };

    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: "xrpl:1",
      payTo: receiver.address,
      maxAmountRequired: "1000000",
      asset: "XRP",
    };

    const result = await verify(payload, requirements, client);
    expect(result.isValid).toBe(true);
  }, 30000);

  it("settles a valid XRP payment end-to-end", async () => {
    // Get fresh sequence
    const accountInfo = await client.request({
      command: "account_info",
      account: sender.address,
      ledger_index: "current",
    });
    const sequence = accountInfo.result.account_data.Sequence;
    const currentLedger = await client.getLedgerIndex();

    const tx = {
      TransactionType: "Payment" as const,
      Account: sender.address,
      Destination: receiver.address,
      Amount: "500000", // 0.5 XRP
      Fee: "12",
      Sequence: sequence,
      LastLedgerSequence: currentLedger + 50,
    };

    const signed = sender.sign(tx);

    const payload: ExactXrplPayload = {
      txBlob: signed.tx_blob,
      authorization: {
        account: sender.address,
        destination: receiver.address,
        amount: "500000",
        fee: "12",
        sequence,
        lastLedgerSequence: currentLedger + 50,
      },
    };

    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: "xrpl:1",
      payTo: receiver.address,
      maxAmountRequired: "500000",
      asset: "XRP",
    };

    const result = await settle(payload, requirements, client, "xrpl:1");

    expect(result.success).toBe(true);
    expect(result.transaction).toBeDefined();
    expect(result.transaction!.length).toBeGreaterThan(0);
    expect(result.network).toBe("xrpl:1");
    expect(result.payer).toBe(sender.address);

    console.log(`Settled tx: ${result.transaction}`);
  }, 60000);

  it("rejects a payment below the required amount in verify", async () => {
    const accountInfo = await client.request({
      command: "account_info",
      account: sender.address,
      ledger_index: "current",
    });
    const sequence = accountInfo.result.account_data.Sequence;
    const currentLedger = await client.getLedgerIndex();

    const tx = {
      TransactionType: "Payment" as const,
      Account: sender.address,
      Destination: receiver.address,
      Amount: "100000", // 0.1 XRP
      Fee: "12",
      Sequence: sequence,
      LastLedgerSequence: currentLedger + 50,
    };

    const signed = sender.sign(tx);

    const payload: ExactXrplPayload = {
      txBlob: signed.tx_blob,
      authorization: {
        account: sender.address,
        destination: receiver.address,
        amount: "100000",
        fee: "12",
        sequence,
        lastLedgerSequence: currentLedger + 50,
      },
    };

    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: "xrpl:1",
      payTo: receiver.address,
      maxAmountRequired: "5000000", // Requires 5 XRP, only paying 0.1
      asset: "XRP",
    };

    const result = await verify(payload, requirements, client);
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("insufficient_amount");
  }, 30000);
}, 120000); // 2 min overall timeout
