// x402 v2 protocol types — no @x402/core dependency

/** Payment payload sent by the client */
export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: unknown;
}

/** Requirements set by the resource server */
export interface PaymentRequirements {
  scheme: string;
  network: string;
  payTo: string;
  maxAmountRequired: string;
  asset: string;
  extra?: Record<string, unknown>;
  description?: string;
  resource?: string;
  mimeType?: string;
  outputSchema?: unknown;
}

/** Verify endpoint response */
export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
}

/** Settle endpoint response */
export interface SettleResponse {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
}

/** Supported endpoint response */
export interface SupportedResponse {
  kinds: SupportedKind[];
  extensions: string[];
  signers: Record<string, string[]>;
}

export interface SupportedKind {
  x402Version: number;
  scheme: string;
  network: string;
}
