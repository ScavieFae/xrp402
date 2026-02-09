// XRPL network configuration and constants

/** CAIP-2 network identifiers for XRPL */
export type XrplNetwork = "xrpl:0" | "xrpl:1" | "xrpl:2";

/** WebSocket URLs for XRPL networks */
export const NETWORK_URLS: Record<XrplNetwork, string> = {
  "xrpl:0": "wss://xrplcluster.com",
  "xrpl:1": "wss://s.altnet.rippletest.net:51233",
  "xrpl:2": "wss://s.devnet.rippletest.net:51233",
};

/** RLUSD issuer configuration per network */
export const RLUSD_CONFIG = {
  "xrpl:0": {
    currency: "RLUSD",
    issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
  },
  "xrpl:1": {
    currency: "RLUSD",
    issuer: "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV",
  },
} as const;

/** Networks supported in V1 (testnet only during development) */
export const SUPPORTED_NETWORKS: XrplNetwork[] = ["xrpl:1"];

/** tfPartialPayment flag — hard reject any tx with this set */
export const PARTIAL_PAYMENT_FLAG = 0x00020000;

// --- MPT Configuration ---

/** MPT issuance configuration */
export interface MptConfig {
  issuanceId: string;
  name: string;
  issuer: string;
  assetScale: number;
}

/**
 * MPT allowlist per network.
 * Only issuances listed here are accepted — unlisted = hard reject.
 * Empty by default; populate when onboarding specific MPT issuers.
 *
 * Example:
 * "xrpl:1": [
 *   { issuanceId: "00000001A407AF5856...", name: "ExampleToken", issuer: "rIssuer...", assetScale: 6 },
 * ],
 */
export const MPT_ALLOWLIST: Partial<Record<XrplNetwork, MptConfig[]>> = {};

/** Look up an MPT config by network and issuance ID */
export function getMptConfig(network: XrplNetwork, issuanceId: string): MptConfig | undefined {
  return MPT_ALLOWLIST[network]?.find((mpt) => mpt.issuanceId === issuanceId);
}

/**
 * MPT issuance flags (from XLS-33).
 * These are bit flags on the MPTokenIssuance ledger object's Flags field.
 */
export const MPT_FLAGS = {
  tfMPTCanLock: 0x0002,
  tfMPTRequireAuth: 0x0004,
  tfMPTCanEscrow: 0x0008,
  tfMPTCanTrade: 0x0010,
  tfMPTCanTransfer: 0x0020,
  tfMPTCanClawback: 0x0040,
} as const;
