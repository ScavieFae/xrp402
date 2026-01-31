// Shared utilities for demo files

import type { PaymentPayload, PaymentRequirements } from "../src/types/x402.js";
import type { ExactXrplPayload } from "../src/types/xrpl-payload.js";

export type { PaymentPayload, PaymentRequirements, ExactXrplPayload };

/** Encode an object as a base64 JSON string (for x402 headers) */
export function encodeHeader(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

/** Decode a base64 JSON header back to an object */
export function decodeHeader<T = unknown>(str: string): T {
  return JSON.parse(Buffer.from(str, "base64").toString("utf-8")) as T;
}
