// Zod schemas for HTTP boundary validation

import { z } from "zod";

const IssuedCurrencyAmountSchema = z.object({
  currency: z.string(),
  issuer: z.string(),
  value: z.string(),
});

const MPTAmountSchema = z.object({
  mpt_issuance_id: z.string(),
  value: z.string(),
});

const FeeAuthorizationSchema = z.object({
  account: z.string(),
  destination: z.string(),
  amount: z.string(), // Always XRP drops
  sequence: z.number().int(),
  ticketSequence: z.number().int().optional(),
});

const XrplAuthorizationSchema = z.object({
  account: z.string(),
  destination: z.string(),
  amount: z.union([z.string(), IssuedCurrencyAmountSchema, MPTAmountSchema]),
  fee: z.string(),
  sequence: z.number().int(),
  ticketSequence: z.number().int().optional(),
  lastLedgerSequence: z.number().int().optional(),
});

const ExactXrplPayloadSchema = z.object({
  txBlob: z.string().min(1),
  authorization: XrplAuthorizationSchema,
  feeTxBlob: z.string().min(1).optional(),
  feeAuthorization: FeeAuthorizationSchema.optional(),
});

const PaymentPayloadSchema = z.object({
  x402Version: z.number(),
  scheme: z.string(),
  network: z.string(),
  payload: ExactXrplPayloadSchema,
});

const PaymentRequirementsSchema = z.object({
  scheme: z.string(),
  network: z.string(),
  payTo: z.string(),
  maxAmountRequired: z.string(),
  asset: z.string(),
  extra: z.record(z.unknown()).optional(),
  description: z.string().optional(),
  resource: z.string().optional(),
  mimeType: z.string().optional(),
  outputSchema: z.unknown().optional(),
});

export const VerifyRequestSchema = z.object({
  paymentPayload: PaymentPayloadSchema,
  paymentRequirements: PaymentRequirementsSchema,
});

export const SettleRequestSchema = z.object({
  paymentPayload: PaymentPayloadSchema,
  paymentRequirements: PaymentRequirementsSchema,
});

export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;
export type SettleRequest = z.infer<typeof SettleRequestSchema>;
