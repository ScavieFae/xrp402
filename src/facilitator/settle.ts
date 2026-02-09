// Settlement pipeline: re-verify → submit → wait for validation

import type { Client } from "xrpl";
import type { SettleResponse, PaymentRequirements } from "../types/x402.js";
import type { ExactXrplPayload } from "../types/xrpl-payload.js";
import { isMPTAmount } from "../types/xrpl-payload.js";
import { verify } from "./verify.js";
import { verifyFeePayload, settleWithFee, FEE_SCHEDULE } from "./fee.js";

/** Map XRPL engine_result codes to human-readable error reasons */
function mapEngineResult(engineResult: string): string {
  const map: Record<string, string> = {
    tecPATH_DRY: "destination_cannot_receive_asset",
    tecUNFUNDED_PAYMENT: "insufficient_funds",
    tecNO_DST: "destination_account_not_found",
    tecNO_DST_INSUF_XRP: "destination_below_reserve",
    tecFROZEN: "asset_frozen",
    tefPAST_SEQ: "transaction_expired_sequence",
    tefMAX_LEDGER: "transaction_expired_ledger",
    tefALREADY: "transaction_already_applied",
    temBAD_AMOUNT: "invalid_amount",
    temBAD_FEE: "invalid_fee",
    temDST_IS_SRC: "destination_is_source",
    tecMPTOKEN_NOT_AUTHORIZED: "mpt_not_authorized",
    tecMPT_NOT_ENABLED: "mpt_not_enabled",
    tecMPT_LOCKED: "mpt_locked",
    tecMPT_MAX_AMOUNT_EXCEEDED: "mpt_max_amount_exceeded",
  };
  return map[engineResult] ?? `settlement_failed: ${engineResult}`;
}

/**
 * Submit a signed txBlob and wait for validated result.
 * Exported separately so V2 fee model can compose:
 * submitAndWait(merchant) → submitAndWait(fee)
 */
export async function submitAndWait(
  client: Client,
  txBlob: string,
  maxAttempts = 10,
  pollIntervalMs = 1000,
): Promise<SettleResponse> {
  // Submit the pre-signed blob (submit-only mode)
  const submitResult = await client.submit(txBlob);
  const engineResult = submitResult.result.engine_result;
  const txHash = submitResult.result.tx_json.hash;

  // Permanent failures — return immediately
  if (engineResult.startsWith("tef") || engineResult.startsWith("tem")) {
    return {
      success: false,
      errorReason: mapEngineResult(engineResult),
      transaction: txHash ?? "",
      network: "",
    };
  }

  // tec codes are also final (applied but failed) — return immediately
  if (engineResult.startsWith("tec")) {
    return {
      success: false,
      errorReason: mapEngineResult(engineResult),
      transaction: txHash ?? "",
      network: "",
    };
  }

  // tesSUCCESS or ter* — poll for validation
  if (!txHash) {
    return {
      success: false,
      errorReason: "no_transaction_hash",
      network: "",
    };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const txResult = await client.request({
        command: "tx",
        transaction: txHash,
      });

      if (txResult.result.validated) {
        // Check the final result in the validated ledger
        const meta = txResult.result.meta;
        const finalResult = typeof meta === "object" && meta !== null && "TransactionResult" in meta
          ? (meta as { TransactionResult: string }).TransactionResult
          : undefined;

        if (finalResult === "tesSUCCESS") {
          // xrpl.js v4: Account lives in tx_json, not at top level
          const txJson = (txResult.result as unknown as Record<string, unknown>)["tx_json"] as Record<string, unknown> | undefined;
          return {
            success: true,
            transaction: txHash,
            network: "",
            payer: typeof txJson?.["Account"] === "string" ? txJson["Account"] : undefined,
          };
        }

        // Validated but failed
        return {
          success: false,
          errorReason: finalResult ? mapEngineResult(finalResult) : "settlement_failed",
          transaction: txHash,
          network: "",
        };
      }
    } catch {
      // tx not found yet, keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return {
    success: false,
    errorReason: "settlement_timeout",
    transaction: txHash,
    network: "",
  };
}

/**
 * Full settlement: re-verify → submit → wait.
 */
export async function settle(
  payload: ExactXrplPayload,
  requirements: PaymentRequirements,
  client: Client,
  network: string,
): Promise<SettleResponse> {
  // Re-verify with network checks
  const verifyResult = await verify(payload, requirements, client);
  if (!verifyResult.isValid) {
    return {
      success: false,
      errorReason: verifyResult.invalidReason ?? "verification_failed",
      network,
    };
  }

  // Fee verification for paid-tier assets (MPT)
  if (isMPTAmount(payload.authorization.amount)) {
    const feeCheck = verifyFeePayload(payload, FEE_SCHEDULE.mpt);
    if (feeCheck) {
      return {
        success: false,
        errorReason: feeCheck.invalidReason,
        network,
      };
    }
  }

  try {
    const merchantResult = await submitAndWait(client, payload.txBlob);
    // Fill in the network (submitAndWait doesn't know which network it's on)
    merchantResult.network = network;

    // Two-phase: if merchant succeeded and fee tx present, submit fee
    if (payload.feeTxBlob && merchantResult.success) {
      return settleWithFee(client, merchantResult, payload.feeTxBlob, network);
    }

    return merchantResult;
  } catch (err) {
    return {
      success: false,
      errorReason: `settlement_error: ${err instanceof Error ? err.message : String(err)}`,
      network,
    };
  }
}
