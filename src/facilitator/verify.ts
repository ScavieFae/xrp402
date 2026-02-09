// 11-step verification pipeline for XRPL x402 payments
// Each step is a standalone function returning VerifyResponse | null (null = passed)
// Pipeline short-circuits on first failure

import { decode, validate, verifySignature } from "xrpl";
import type { Client, Transaction } from "xrpl";
import type { VerifyResponse, PaymentRequirements } from "../types/x402.js";
import type { ExactXrplPayload } from "../types/xrpl-payload.js";
import { isIssuedCurrencyAmount, isMPTAmount, classifyAsset } from "../types/xrpl-payload.js";
import { PARTIAL_PAYMENT_FLAG } from "../xrpl/constants.js";
import type { XrplNetwork } from "../xrpl/constants.js";
import {
  checkAccountBalance,
  checkLedgerExpiry,
  checkTrustLine,
} from "../xrpl/network-checks.js";
import {
  checkMptAllowlist,
  checkMptIssuance,
  checkMptHolder,
  checkMptDestination,
} from "../xrpl/mpt-checks.js";

// Step 1: Decode txBlob
export function decodeTxBlob(txBlob: string): { tx: Record<string, unknown> } | VerifyResponse {
  try {
    const tx = decode(txBlob) as Record<string, unknown>;
    return { tx };
  } catch {
    return { isValid: false, invalidReason: "invalid_tx_blob" };
  }
}

// Step 2: Validate transaction structure
export function validateTransaction(tx: Record<string, unknown>): VerifyResponse | null {
  try {
    validate(tx);
    return null;
  } catch {
    return { isValid: false, invalidReason: "invalid_transaction_structure" };
  }
}

// Step 3: Verify cryptographic signature
export function verifyTxSignature(txBlob: string): VerifyResponse | null {
  try {
    const valid = verifySignature(txBlob);
    if (!valid) {
      return { isValid: false, invalidReason: "invalid_signature" };
    }
    return null;
  } catch {
    return { isValid: false, invalidReason: "signature_verification_failed" };
  }
}

// Step 4: Cross-check decoded fields vs authorization object
export function crossCheckAuthorization(
  tx: Record<string, unknown>,
  payload: ExactXrplPayload,
): VerifyResponse | null {
  const auth = payload.authorization;

  if (tx["Account"] !== auth.account) {
    return { isValid: false, invalidReason: "authorization_mismatch_account" };
  }
  if (tx["Destination"] !== auth.destination) {
    return { isValid: false, invalidReason: "authorization_mismatch_destination" };
  }
  if (tx["Fee"] !== auth.fee) {
    return { isValid: false, invalidReason: "authorization_mismatch_fee" };
  }

  // Amount comparison: string for XRP drops, object for issued currency or MPT
  const txAmount = tx["Amount"];
  if (isIssuedCurrencyAmount(auth.amount)) {
    if (typeof txAmount !== "object" || txAmount === null) {
      return { isValid: false, invalidReason: "authorization_mismatch_amount" };
    }
    const txAmountObj = txAmount as Record<string, unknown>;
    if (
      txAmountObj["currency"] !== auth.amount.currency ||
      txAmountObj["issuer"] !== auth.amount.issuer ||
      // Compare values numerically — xrpl.js normalizes trailing zeros (e.g. "25.50" → "25.5")
      parseFloat(String(txAmountObj["value"])) !== parseFloat(auth.amount.value)
    ) {
      return { isValid: false, invalidReason: "authorization_mismatch_amount" };
    }
  } else if (isMPTAmount(auth.amount)) {
    if (typeof txAmount !== "object" || txAmount === null) {
      return { isValid: false, invalidReason: "authorization_mismatch_amount" };
    }
    const txAmountObj = txAmount as Record<string, unknown>;
    if (
      txAmountObj["mpt_issuance_id"] !== auth.amount.mpt_issuance_id ||
      parseFloat(String(txAmountObj["value"])) !== parseFloat(auth.amount.value)
    ) {
      return { isValid: false, invalidReason: "authorization_mismatch_amount" };
    }
  } else {
    if (txAmount !== auth.amount) {
      return { isValid: false, invalidReason: "authorization_mismatch_amount" };
    }
  }

  // Sequence: check regular or ticket
  if (auth.ticketSequence !== undefined) {
    if (tx["Sequence"] !== 0 || tx["TicketSequence"] !== auth.ticketSequence) {
      return { isValid: false, invalidReason: "authorization_mismatch_sequence" };
    }
  } else {
    if (tx["Sequence"] !== auth.sequence) {
      return { isValid: false, invalidReason: "authorization_mismatch_sequence" };
    }
  }

  // LastLedgerSequence (optional)
  if (auth.lastLedgerSequence !== undefined) {
    if (tx["LastLedgerSequence"] !== auth.lastLedgerSequence) {
      return { isValid: false, invalidReason: "authorization_mismatch_last_ledger_sequence" };
    }
  }

  return null;
}

// Step 5: Check destination matches requirements.payTo
export function checkDestination(
  payload: ExactXrplPayload,
  requirements: PaymentRequirements,
): VerifyResponse | null {
  if (payload.authorization.destination !== requirements.payTo) {
    return { isValid: false, invalidReason: "destination_mismatch" };
  }
  return null;
}

// Step 6: Check amount meets or exceeds requirements
export function checkAmount(
  payload: ExactXrplPayload,
  requirements: PaymentRequirements,
): VerifyResponse | null {
  const auth = payload.authorization;
  const requiredAmount = requirements.maxAmountRequired;

  if (isIssuedCurrencyAmount(auth.amount)) {
    // Issued currency: compare as float (up to 15 significant digits)
    const paymentValue = parseFloat(auth.amount.value);
    const requiredValue = parseFloat(requiredAmount);
    if (isNaN(paymentValue) || isNaN(requiredValue) || paymentValue < requiredValue) {
      return { isValid: false, invalidReason: "insufficient_amount" };
    }
  } else if (isMPTAmount(auth.amount)) {
    // MPT: compare as float (same pattern as issued currency)
    const paymentValue = parseFloat(auth.amount.value);
    const requiredValue = parseFloat(requiredAmount);
    if (isNaN(paymentValue) || isNaN(requiredValue) || paymentValue < requiredValue) {
      return { isValid: false, invalidReason: "insufficient_amount" };
    }
  } else {
    // XRP drops: compare as BigInt
    try {
      const paymentDrops = BigInt(auth.amount);
      const requiredDrops = BigInt(requiredAmount);
      if (paymentDrops < requiredDrops) {
        return { isValid: false, invalidReason: "insufficient_amount" };
      }
    } catch {
      return { isValid: false, invalidReason: "invalid_amount_format" };
    }
  }

  return null;
}

// Step 7: Check asset matches requirements
export function checkAsset(
  payload: ExactXrplPayload,
  requirements: PaymentRequirements,
): VerifyResponse | null {
  const auth = payload.authorization;
  const requiredAssetType = classifyAsset(requirements.asset);

  if (requiredAssetType === "xrp") {
    // XRP: amount must be a string (drops)
    if (typeof auth.amount !== "string") {
      return { isValid: false, invalidReason: "asset_mismatch" };
    }
  } else if (requiredAssetType === "issued") {
    // Issued currency: amount must be an object with matching issuer
    if (!isIssuedCurrencyAmount(auth.amount)) {
      return { isValid: false, invalidReason: "asset_mismatch" };
    }
    if (auth.amount.issuer !== requirements.asset) {
      return { isValid: false, invalidReason: "asset_mismatch_issuer" };
    }
  } else if (requiredAssetType === "mpt") {
    // MPT: amount must be MPTAmount with matching issuance ID
    if (!isMPTAmount(auth.amount)) {
      return { isValid: false, invalidReason: "asset_mismatch" };
    }
    // Strip "mpt:" prefix from requirements.asset to get issuance ID
    const requiredIssuanceId = requirements.asset.slice(4);
    if (auth.amount.mpt_issuance_id !== requiredIssuanceId) {
      return { isValid: false, invalidReason: "asset_mismatch_issuance_id" };
    }
  } else {
    return { isValid: false, invalidReason: "unsupported_asset_type" };
  }

  return null;
}

// Step 8: Reject partial payments
export function rejectPartialPayment(tx: Record<string, unknown>): VerifyResponse | null {
  const flags = typeof tx["Flags"] === "number" ? tx["Flags"] : 0;
  if (flags & PARTIAL_PAYMENT_FLAG) {
    return { isValid: false, invalidReason: "partial_payment_not_allowed" };
  }
  return null;
}

/**
 * Run the full verification pipeline.
 * Client is optional — when absent, only offline steps (1-8) run.
 */
export async function verify(
  payload: ExactXrplPayload,
  requirements: PaymentRequirements,
  client?: Client,
): Promise<VerifyResponse> {
  // Step 1: Decode
  const decodeResult = decodeTxBlob(payload.txBlob);
  if ("isValid" in decodeResult) return decodeResult;
  const { tx } = decodeResult;

  // Step 2: Validate
  const step2 = validateTransaction(tx);
  if (step2) return step2;

  // Step 3: Signature
  const step3 = verifyTxSignature(payload.txBlob);
  if (step3) return step3;

  // Step 4: Cross-check
  const step4 = crossCheckAuthorization(tx, payload);
  if (step4) return step4;

  // Step 5: Destination
  const step5 = checkDestination(payload, requirements);
  if (step5) return step5;

  // Step 6: Amount
  const step6 = checkAmount(payload, requirements);
  if (step6) return step6;

  // Step 7: Asset
  const step7 = checkAsset(payload, requirements);
  if (step7) return step7;

  // Step 8: Partial payment
  const step8 = rejectPartialPayment(tx);
  if (step8) return step8;

  // Step 12: MPT allowlist (local check — runs with or without client)
  if (isMPTAmount(payload.authorization.amount)) {
    const step12 = checkMptAllowlist(
      requirements.network as XrplNetwork,
      payload.authorization.amount,
    );
    if (step12) return step12;
  }

  // Network steps (9-11, 13-15) — only if client provided
  if (client) {
    // Step 9: Balance + sequence/ticket
    const step9 = await checkAccountBalance(
      client,
      payload.authorization.account,
      payload.authorization.amount,
      payload.authorization.fee,
      payload.authorization.sequence,
      payload.authorization.ticketSequence,
    );
    if (step9) return step9;

    // Step 10: Ledger expiry
    const step10 = await checkLedgerExpiry(
      client,
      payload.authorization.lastLedgerSequence,
    );
    if (step10) return step10;

    // Step 11: Trust line (issued currency only)
    if (isIssuedCurrencyAmount(payload.authorization.amount)) {
      const step11 = await checkTrustLine(
        client,
        payload.authorization.destination,
        payload.authorization.amount,
      );
      if (step11) return step11;
    }

    // Steps 13-15: MPT-specific network checks
    if (isMPTAmount(payload.authorization.amount)) {
      const mptAmount = payload.authorization.amount;
      const issuanceId = mptAmount.mpt_issuance_id;

      // Step 13: MPT issuance exists and is transferable
      const step13 = await checkMptIssuance(client, issuanceId);
      if (step13) return step13;

      // Step 14: Sender is authorized holder with sufficient balance
      const step14 = await checkMptHolder(
        client,
        payload.authorization.account,
        mptAmount,
      );
      if (step14) return step14;

      // Step 15: Destination can receive this MPT
      const step15 = await checkMptDestination(
        client,
        payload.authorization.destination,
        issuanceId,
      );
      if (step15) return step15;
    }
  }

  return { isValid: true };
}
