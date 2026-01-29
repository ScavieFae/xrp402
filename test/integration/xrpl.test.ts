import { describe, it, expect } from "vitest";
import { Client, Wallet } from "xrpl";

describe("XRPL Integration", () => {
  it("can connect to testnet and create a funded wallet", async () => {
    const client = new Client("wss://s.altnet.rippletest.net:51233");

    try {
      await client.connect();
      expect(client.isConnected()).toBe(true);

      // Create and fund a testnet wallet
      const { wallet, balance } = await client.fundWallet();

      expect(wallet).toBeDefined();
      expect(wallet.address).toMatch(/^r[a-zA-Z0-9]{24,34}$/);
      expect(balance).toBeGreaterThan(0);

      console.log(`Created wallet: ${wallet.address}`);
      console.log(`Balance: ${balance} XRP`);
    } finally {
      await client.disconnect();
    }
  }, 30000); // 30s timeout for network operations

  it("can sign a transaction offline", () => {
    // Generate a wallet (no network needed)
    const wallet = Wallet.generate();

    expect(wallet.address).toMatch(/^r[a-zA-Z0-9]{24,34}$/);
    expect(wallet.publicKey).toBeDefined();
    expect(wallet.privateKey).toBeDefined();

    // Create a payment transaction
    const tx = {
      TransactionType: "Payment" as const,
      Account: wallet.address,
      Destination: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe", // Example address
      Amount: "1000000", // 1 XRP in drops
      Fee: "12",
      Sequence: 1,
      LastLedgerSequence: 100000000,
    };

    // Sign it
    const signed = wallet.sign(tx);

    expect(signed.tx_blob).toBeDefined();
    expect(signed.hash).toBeDefined();
    expect(signed.tx_blob.length).toBeGreaterThan(0);

    console.log(`Signed tx hash: ${signed.hash}`);
  });
});
