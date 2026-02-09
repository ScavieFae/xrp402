// MPT-specific network checks (steps 12-15)
// checkMptAllowlist is a hard reject (local lookup).
// All others soft-fail — return null on network errors.

import type { Client } from "xrpl";
import type { VerifyResponse } from "../types/x402.js";
import type { MPTAmount } from "../types/xrpl-payload.js";
import type { XrplNetwork } from "./constants.js";
import { getMptConfig, MPT_FLAGS } from "./constants.js";

/**
 * Step 12: Check MPT allowlist.
 * Hard reject — if the issuance ID isn't in the allowlist, it's not accepted.
 * This is a local lookup, no network call needed.
 */
export function checkMptAllowlist(
  network: XrplNetwork,
  mptAmount: MPTAmount,
): VerifyResponse | null {
  const config = getMptConfig(network, mptAmount.mpt_issuance_id);
  if (!config) {
    return { isValid: false, invalidReason: "mpt_not_allowlisted" };
  }
  return null;
}

/**
 * Step 13: Check MPT issuance exists and is transferable.
 * Queries `ledger_entry` for the MPTokenIssuance object.
 * Verifies tfMPTCanTransfer is set (required for x402 — facilitator submits on behalf of payer).
 */
export async function checkMptIssuance(
  client: Client,
  issuanceId: string,
): Promise<VerifyResponse | null> {
  try {
    const result = await client.request({
      command: "ledger_entry",
      mpt_issuance: issuanceId,
    } as Parameters<Client["request"]>[0]);

    const node = (result.result as Record<string, unknown>)["node"] as Record<string, unknown> | undefined;
    if (!node) {
      return { isValid: false, invalidReason: "mpt_issuance_not_found" };
    }

    // Check tfMPTCanTransfer flag
    const flags = typeof node["Flags"] === "number" ? node["Flags"] : 0;
    if (!(flags & MPT_FLAGS.tfMPTCanTransfer)) {
      return { isValid: false, invalidReason: "mpt_not_transferable" };
    }

    return null;
  } catch {
    return null; // Soft-fail
  }
}

/**
 * Step 14: Check MPT holder status.
 * Queries the sender's MPToken entry for this issuance.
 * Checks: exists (authorized), not locked, balance sufficient.
 */
export async function checkMptHolder(
  client: Client,
  account: string,
  mptAmount: MPTAmount,
): Promise<VerifyResponse | null> {
  try {
    const result = await client.request({
      command: "ledger_entry",
      mptoken: {
        mpt_issuance_id: mptAmount.mpt_issuance_id,
        account,
      },
    } as Parameters<Client["request"]>[0]);

    const node = (result.result as Record<string, unknown>)["node"] as Record<string, unknown> | undefined;
    if (!node) {
      return { isValid: false, invalidReason: "mpt_holder_not_authorized" };
    }

    // Check locked flag (individual holder lock)
    const flags = typeof node["Flags"] === "number" ? node["Flags"] : 0;
    // lsfMPTLocked = 0x0001
    if (flags & 0x0001) {
      return { isValid: false, invalidReason: "mpt_holder_locked" };
    }

    // Check balance
    const balance = typeof node["MPTAmount"] === "string"
      ? parseFloat(node["MPTAmount"])
      : 0;
    const required = parseFloat(mptAmount.value);
    if (balance < required) {
      return { isValid: false, invalidReason: "mpt_insufficient_balance" };
    }

    return null;
  } catch {
    return null; // Soft-fail
  }
}

/**
 * Step 15: Check MPT destination can receive.
 * Queries the destination's MPToken entry for this issuance.
 * If the issuance requires auth (tfMPTRequireAuth), destination must have an authorized MPToken.
 */
export async function checkMptDestination(
  client: Client,
  destination: string,
  issuanceId: string,
): Promise<VerifyResponse | null> {
  try {
    const result = await client.request({
      command: "ledger_entry",
      mptoken: {
        mpt_issuance_id: issuanceId,
        account: destination,
      },
    } as Parameters<Client["request"]>[0]);

    const node = (result.result as Record<string, unknown>)["node"] as Record<string, unknown> | undefined;
    if (!node) {
      return { isValid: false, invalidReason: "mpt_destination_not_authorized" };
    }

    // Check locked flag on destination
    const flags = typeof node["Flags"] === "number" ? node["Flags"] : 0;
    if (flags & 0x0001) {
      return { isValid: false, invalidReason: "mpt_destination_locked" };
    }

    return null;
  } catch {
    return null; // Soft-fail
  }
}
