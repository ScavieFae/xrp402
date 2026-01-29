// Network verification steps (9-11): balance, ledger expiry, trust line
// All soft-fail — return null (pass) on network errors

import type { Client } from "xrpl";
import type { VerifyResponse } from "../types/x402.js";
import type { IssuedCurrencyAmount } from "../types/xrpl-payload.js";
import { isIssuedCurrencyAmount } from "../types/xrpl-payload.js";

/**
 * Step 9: Check source account balance and sequence/ticket validity.
 * Balance must cover amount + fee + reserve (10 XRP base reserve).
 */
export async function checkAccountBalance(
  client: Client,
  account: string,
  amount: string | IssuedCurrencyAmount,
  fee: string,
  sequence: number,
  ticketSequence?: number,
): Promise<VerifyResponse | null> {
  try {
    const info = await client.request({
      command: "account_info",
      account,
      ledger_index: "current",
    });

    const balance = BigInt(info.result.account_data.Balance);
    const feeDrops = BigInt(fee);
    // 10 XRP base reserve
    const reserve = BigInt(10_000_000);

    if (!isIssuedCurrencyAmount(amount)) {
      // XRP: balance must cover amount + fee + reserve
      const amountDrops = BigInt(amount);
      if (balance < amountDrops + feeDrops + reserve) {
        return { isValid: false, invalidReason: "insufficient_balance" };
      }
    } else {
      // Issued currency: balance must cover fee + reserve (XRP for fees)
      if (balance < feeDrops + reserve) {
        return { isValid: false, invalidReason: "insufficient_balance_for_fees" };
      }
    }

    // Sequence check: regular sequence or ticket
    if (ticketSequence !== undefined) {
      // Ticketed tx: verify the ticket exists
      try {
        const objects = await client.request({
          command: "account_objects",
          account,
          type: "ticket",
          ledger_index: "current",
        });
        const ticketExists = objects.result.account_objects.some(
          (obj) => "TicketSequence" in obj && obj["TicketSequence"] === ticketSequence,
        );
        if (!ticketExists) {
          return { isValid: false, invalidReason: "ticket_not_found" };
        }
      } catch {
        // Soft-fail on ticket lookup
      }
    } else {
      // Regular sequence: must match account's current sequence
      const accountSequence = info.result.account_data.Sequence;
      if (sequence !== accountSequence) {
        return { isValid: false, invalidReason: "invalid_sequence" };
      }
    }

    return null; // Passed
  } catch {
    return null; // Soft-fail
  }
}

/**
 * Step 10: Check ledger expiry.
 * LastLedgerSequence must be at least 4 ledgers in the future.
 */
export async function checkLedgerExpiry(
  client: Client,
  lastLedgerSequence?: number,
): Promise<VerifyResponse | null> {
  if (lastLedgerSequence === undefined) return null; // No expiry set, skip

  try {
    const currentLedger = await client.getLedgerIndex();
    const buffer = 4;
    if (lastLedgerSequence < currentLedger + buffer) {
      return { isValid: false, invalidReason: "transaction_will_expire_too_soon" };
    }
    return null; // Passed
  } catch {
    return null; // Soft-fail
  }
}

/**
 * Step 11: Check trust line for issued currency payments.
 * Destination must have a trust line to the issuer with limit > 0 and not frozen.
 */
export async function checkTrustLine(
  client: Client,
  destination: string,
  amount: IssuedCurrencyAmount,
): Promise<VerifyResponse | null> {
  try {
    const lines = await client.request({
      command: "account_lines",
      account: destination,
      peer: amount.issuer,
      ledger_index: "current",
    });

    const trustLine = lines.result.lines.find(
      (line) => line.currency === amount.currency,
    );

    if (!trustLine) {
      return { isValid: false, invalidReason: "no_trust_line" };
    }

    if (parseFloat(trustLine.limit) <= 0) {
      return { isValid: false, invalidReason: "trust_line_limit_zero" };
    }

    if (trustLine.freeze_peer) {
      return { isValid: false, invalidReason: "trust_line_frozen" };
    }

    return null; // Passed
  } catch {
    return null; // Soft-fail
  }
}
