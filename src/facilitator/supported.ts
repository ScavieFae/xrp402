// /supported endpoint response builder

import type { SupportedResponse } from "../types/x402.js";
import { SUPPORTED_NETWORKS } from "../xrpl/constants.js";

export function getSupported(): SupportedResponse {
  return {
    kinds: SUPPORTED_NETWORKS.map((network) => ({
      x402Version: 2,
      scheme: "exact",
      network,
    })),
    extensions: [],
    // V1: facilitator doesn't sign anything — signers are empty
    signers: { "xrpl:*": [] },
  };
}
