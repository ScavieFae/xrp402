// /supported endpoint response builder

import type { SupportedResponse } from "../types/x402.js";
import { SUPPORTED_NETWORKS, MPT_ALLOWLIST } from "../xrpl/constants.js";
import type { XrplNetwork } from "../xrpl/constants.js";
import { getFacilitatorAddress, FEE_SCHEDULE } from "./fee.js";

export function getSupported(): SupportedResponse {
  const facilitatorAddress = getFacilitatorAddress();

  return {
    kinds: SUPPORTED_NETWORKS.map((network) => {
      const mptConfigs = MPT_ALLOWLIST[network as XrplNetwork] ?? [];
      return {
        x402Version: 2,
        scheme: "exact",
        network,
        extra: {
          facilitatorAddress: facilitatorAddress ?? null,
          facilitatorFee: FEE_SCHEDULE,
          supportedMpts: mptConfigs.map((mpt) => ({
            issuanceId: mpt.issuanceId,
            name: mpt.name,
            issuer: mpt.issuer,
            asset: `mpt:${mpt.issuanceId}`,
          })),
        },
      };
    }),
    extensions: [],
    signers: {
      "xrpl:*": facilitatorAddress ? [facilitatorAddress] : [],
    },
  };
}
