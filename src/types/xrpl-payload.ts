// XRPL-specific payload types for the "exact" scheme

/** Issued currency amount (RLUSD, etc.) */
export interface IssuedCurrencyAmount {
  currency: string;
  issuer: string;
  value: string;
}

/** Multi-Purpose Token amount */
export interface MPTAmount {
  mpt_issuance_id: string;
  value: string;
}

/** Pre-parsed authorization fields from the signed transaction */
export interface XrplAuthorization {
  account: string;
  destination: string;
  amount: string | IssuedCurrencyAmount | MPTAmount;
  fee: string;
  sequence: number;
  ticketSequence?: number;
  lastLedgerSequence?: number;
}

/** Fee authorization for paid-tier features (MPT, cross-currency) */
export interface FeeAuthorization {
  account: string;
  destination: string;
  amount: string; // Always XRP drops
  sequence: number;
  ticketSequence?: number;
}

/** The payload shape for scheme: "exact" on XRPL */
export interface ExactXrplPayload {
  txBlob: string;
  authorization: XrplAuthorization;
  /** Signed fee transaction blob — present only for paid-tier features */
  feeTxBlob?: string;
  /** Fee authorization fields — present only for paid-tier features */
  feeAuthorization?: FeeAuthorization;
}

/** Asset type classification */
export type AssetType = "xrp" | "issued" | "mpt";

/**
 * Classify an asset string by format:
 * - "XRP" → xrp (native)
 * - "r..." → issued currency (issuer address)
 * - "mpt:..." → MPT (future)
 */
export function classifyAsset(asset: string): AssetType {
  if (asset === "XRP") return "xrp";
  if (asset.startsWith("r")) return "issued";
  if (asset.startsWith("mpt:")) return "mpt";
  throw new Error(`Unknown asset format: ${asset}`);
}

/** Type guard for IssuedCurrencyAmount */
export function isIssuedCurrencyAmount(
  amount: string | IssuedCurrencyAmount | MPTAmount,
): amount is IssuedCurrencyAmount {
  return typeof amount === "object" && "currency" in amount && "issuer" in amount && "value" in amount;
}

/** Type guard for MPTAmount */
export function isMPTAmount(
  amount: string | IssuedCurrencyAmount | MPTAmount,
): amount is MPTAmount {
  return typeof amount === "object" && "mpt_issuance_id" in amount && "value" in amount && !("currency" in amount);
}
