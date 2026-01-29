# x402 Spec Notes

Research notes from reading the x402 v2 specification and reference implementation.

---

## Protocol Overview

x402 is HTTP-native payments. When a server returns 402 Payment Required, the client constructs a signed payment and resubmits. A facilitator handles verification and settlement.

### Key Components

| Component | Role |
|-----------|------|
| **Resource Server** | Returns 402, specifies payment requirements |
| **Client** | Signs payment payload, resubmits request |
| **Facilitator** | Verifies payment validity, submits to blockchain |

### Facilitator Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /verify` | Validate payment without settling |
| `POST /settle` | Validate and submit to blockchain |
| `GET /supported` | List supported schemes, networks, extensions |

---

## Network Identifiers (CAIP-2)

Networks use Chain Agnostic Improvement Proposal 2 format: `{namespace}:{reference}`

**EVM:** `eip155:{chainId}` (e.g., `eip155:8453` for Base mainnet)
**Solana:** `solana:{genesisHash}` (e.g., `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`)
**XRPL:** `xrpl:{networkId}`:
- `xrpl:0` — Mainnet (livenet)
- `xrpl:1` — Testnet
- `xrpl:2` — Devnet

Source: [XRPL CAIP-2](https://namespaces.chainagnostic.org/xrpl/caip2)

---

## Request/Response Schemas

### PaymentRequired (Server → Client)

```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "https://api.example.com/resource",
    "description": "...",
    "mimeType": "application/json"
  },
  "accepts": [{
    "scheme": "exact",
    "network": "xrpl:0",
    "amount": "1000000",           // 1 XRP in drops
    "asset": "XRP",                // or issuer address for RLUSD
    "payTo": "rDestination...",
    "maxTimeoutSeconds": 60,
    "extra": { ... }
  }]
}
```

### PaymentPayload (Client → Server, in PAYMENT-SIGNATURE header)

```json
{
  "x402Version": 2,
  "resource": { ... },
  "accepted": {
    "scheme": "exact",
    "network": "xrpl:0",
    "amount": "1000000",
    "asset": "XRP",
    "payTo": "rDestination...",
    "maxTimeoutSeconds": 60
  },
  "payload": {
    // Scheme-specific. For XRPL, this would be the signed tx blob
  }
}
```

### VerifyResponse

```json
{
  "isValid": true,
  "payer": "rSourceAddress..."
}
```

### SettleResponse

```json
{
  "success": true,
  "transaction": "ABC123...",  // XRPL tx hash
  "network": "xrpl:0",
  "payer": "rSourceAddress..."
}
```

---

## Scheme Implementation Pattern

From reading `ExactEvmScheme`:

```typescript
class ExactXrplScheme implements SchemeNetworkFacilitator {
  readonly scheme = "exact";
  readonly caipFamily = "xrpl:*";

  async verify(payload, requirements): Promise<VerifyResponse> { ... }
  async settle(payload, requirements): Promise<SettleResponse> { ... }
  getExtra(network: string): Record<string, unknown> | undefined { ... }
  getSigners(network: string): string[] { ... }
}
```

---

## EVM vs XRPL: Key Differences

| Aspect | EVM (EIP-3009) | XRPL |
|--------|----------------|------|
| **Authorization** | EIP-712 typed signature | Signed transaction blob |
| **Execution** | Facilitator calls `transferWithAuthorization` | Facilitator submits pre-signed tx |
| **Replay prevention** | 32-byte random nonce | Sequence number |
| **Time bounds** | `validAfter` / `validBefore` | `LastLedgerSequence` |
| **Native currency** | N/A (ERC-20 only) | XRP (drops) |
| **Tokens** | ERC-20 | Issued currencies, MPTs |

---

## XRPL Payload Design (Draft)

For XRPL, the client pre-signs a Payment transaction:

```typescript
interface ExactXrplPayload {
  // The signed transaction blob (hex)
  txBlob: string;

  // Optional: parsed fields for quick validation
  // (facilitator can also deserialize txBlob)
  authorization?: {
    account: string;      // Source account
    destination: string;  // Destination account
    amount: string | {    // XRP drops or currency amount
      currency: string;
      issuer: string;
      value: string;
    };
    sequence: number;
    lastLedgerSequence: number;
  };
}
```

### Verification Steps (XRPL)

1. **Deserialize txBlob** — Extract transaction fields
2. **Verify signature** — Confirm transaction is properly signed
3. **Check destination** — Must match `payTo`
4. **Check amount** — Must meet or exceed `requirements.amount`
5. **Check asset** — Must match `requirements.asset` (XRP or issued currency)
6. **Check time bounds** — `LastLedgerSequence` must be in valid range
7. **Check balance** — Source account has sufficient funds
8. **Check sequence** — Valid sequence number (not already used)

### Settlement Steps (XRPL)

1. **Re-verify** — Run verification checks again
2. **Submit txBlob** — Submit to XRPL network
3. **Wait for validation** — ~3-5 seconds
4. **Return result** — Transaction hash and status

---

## XRP vs RLUSD Payments

### XRP (Native Currency)

```typescript
// Payment transaction for XRP
{
  TransactionType: "Payment",
  Account: "rSource...",
  Destination: "rDest...",
  Amount: "1000000",  // 1 XRP in drops
  Fee: "12",
  Sequence: 123,
  LastLedgerSequence: 456789
}
```

### RLUSD (Issued Currency)

```typescript
// Payment transaction for RLUSD
{
  TransactionType: "Payment",
  Account: "rSource...",
  Destination: "rDest...",
  Amount: {
    currency: "USD",  // or currency code for RLUSD
    issuer: "rIssuer...",
    value: "10.00"
  },
  Fee: "12",
  Sequence: 123,
  LastLedgerSequence: 456789
}
```

**Key difference:** XRP amounts are strings (drops), issued currency amounts are objects with currency/issuer/value.

---

## Open Questions

1. **RLUSD currency code** — Is it `USD` or a different code? Need to verify.
2. **Trust lines** — Does the destination need a trust line for RLUSD?
3. **MPT payments** — Different transaction type? Same Payment tx?
4. **Who pays fees?** — Client includes Fee in tx, so client pays. Is this acceptable?
5. **Pre-validation** — Can we check if tx will succeed before submit?

---

## Sources

- [x402 Specification v2](x402-reference/specs/x402-specification-v2.md)
- [x402 GitHub](https://github.com/coinbase/x402)
- [XRPL CAIP-2](https://namespaces.chainagnostic.org/xrpl/caip2)
- [XRPL Payment Transaction](https://xrpl.org/payment.html)
