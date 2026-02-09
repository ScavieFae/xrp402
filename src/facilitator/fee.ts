// Fee verification and two-phase settlement for paid-tier features.
// Fee amounts start at "0" — infrastructure runs but nobody is charged.
// Turning on fees = changing FEE_SCHEDULE values.

import { decode, verifySignature } from "xrpl";
import type { Client } from "xrpl";
import type { SettleResponse } from "../types/x402.js";
import type { ExactXrplPayload } from "../types/xrpl-payload.js";
import { submitAndWait } from "./settle.js";

/** Fee schedule — amounts in XRP drops. null = free, "0" = infrastructure ready but no charge. */
export const FEE_SCHEDULE = {
  standard: null as string | null,
  mpt: "0",
  crossCurrency: "0",
} as const;

/** Get the facilitator's receiving address from env */
export function getFacilitatorAddress(): string | undefined {
  return process.env["FACILITATOR_ADDRESS"];
}

/**
 * Verify the fee transaction payload.
 *
 * Returns null (pass) when:
 * - Fee amount is "0" (no charge)
 * - No facilitator address configured and no fee fields present
 *
 * Returns error when fee is non-zero and validation fails.
 */
export function verifyFeePayload(
  payload: ExactXrplPayload,
  expectedFeeAmount: string | null,
): { isValid: false; invalidReason: string } | null {
  // No fee for this tier
  if (expectedFeeAmount === null || expectedFeeAmount === "0") {
    return null;
  }

  const facilitatorAddress = getFacilitatorAddress();

  // No facilitator address configured — can't charge fees
  if (!facilitatorAddress) {
    if (!payload.feeTxBlob && !payload.feeAuthorization) {
      return null; // No fee fields, no facilitator — fine
    }
    return { isValid: false, invalidReason: "fee_facilitator_not_configured" };
  }

  // Fee is non-zero — fee fields are required
  if (!payload.feeTxBlob || !payload.feeAuthorization) {
    return { isValid: false, invalidReason: "fee_payment_required" };
  }

  const feeAuth = payload.feeAuthorization;

  // Decode and verify signature
  let feeTx: Record<string, unknown>;
  try {
    feeTx = decode(payload.feeTxBlob) as Record<string, unknown>;
  } catch {
    return { isValid: false, invalidReason: "fee_invalid_tx_blob" };
  }

  try {
    if (!verifySignature(payload.feeTxBlob)) {
      return { isValid: false, invalidReason: "fee_invalid_signature" };
    }
  } catch {
    return { isValid: false, invalidReason: "fee_signature_verification_failed" };
  }

  // Cross-check fee blob against fee authorization
  if (feeTx["Account"] !== feeAuth.account) {
    return { isValid: false, invalidReason: "fee_authorization_mismatch_account" };
  }
  if (feeTx["Destination"] !== feeAuth.destination) {
    return { isValid: false, invalidReason: "fee_authorization_mismatch_destination" };
  }
  if (feeTx["Amount"] !== feeAuth.amount) {
    return { isValid: false, invalidReason: "fee_authorization_mismatch_amount" };
  }

  // Destination must be the facilitator
  if (feeAuth.destination !== facilitatorAddress) {
    return { isValid: false, invalidReason: "fee_wrong_destination" };
  }

  // Amount must match advertised fee
  if (feeAuth.amount !== expectedFeeAmount) {
    return { isValid: false, invalidReason: "fee_wrong_amount" };
  }

  // Same payer as merchant tx
  if (feeAuth.account !== payload.authorization.account) {
    return { isValid: false, invalidReason: "fee_payer_mismatch" };
  }

  return null;
}

/**
 * Two-phase settlement: submit fee tx after merchant succeeds.
 * Fee failure is logged but doesn't affect merchant result — facilitator absorbs the loss.
 */
export async function settleWithFee(
  client: Client,
  merchantResult: SettleResponse,
  feeTxBlob: string,
  network: string,
): Promise<SettleResponse> {
  // Only submit fee if merchant succeeded
  if (!merchantResult.success) {
    return merchantResult;
  }

  try {
    const feeResult = await submitAndWait(client, feeTxBlob);
    if (!feeResult.success) {
      console.warn(
        `[fee] Fee settlement failed (merchant tx ${merchantResult.transaction}): ${feeResult.errorReason}`,
      );
    }
  } catch (err) {
    console.warn(
      `[fee] Fee settlement error (merchant tx ${merchantResult.transaction}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Always return merchant result — fee failure is the facilitator's problem
  return merchantResult;
}
