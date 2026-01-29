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
