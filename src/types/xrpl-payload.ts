// XRPL-specific payload types for the "exact" scheme

/** Issued currency amount (RLUSD, etc.) */
export interface IssuedCurrencyAmount {
  currency: string;
  issuer: string;
  value: string;
}

/** Pre-parsed authorization fields from the signed transaction */
export interface XrplAuthorization {
  account: string;
  destination: string;
  amount: string | IssuedCurrencyAmount;
  fee: string;
  sequence: number;
  ticketSequence?: number;
  lastLedgerSequence?: number;
}

/** The payload shape for scheme: "exact" on XRPL */
export interface ExactXrplPayload {
  txBlob: string;
  authorization: XrplAuthorization;
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
  amount: string | IssuedCurrencyAmount,
): amount is IssuedCurrencyAmount {
  return typeof amount === "object" && "currency" in amount && "issuer" in amount && "value" in amount;
}
