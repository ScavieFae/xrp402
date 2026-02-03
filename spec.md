# XRPL x402 Facilitator — Spec & Requirements

## Executive Summary

Build the first x402 facilitator for XRPL, enabling HTTP 402 native payments for agentic commerce. Potential to integrate Multi-Purpose Tokens (MPTs) for compliance-aware payments — a capability no other x402 implementation has.

**Status:** IMPLEMENTING — research complete, design locked, building verify/settle

---

## Decisions (Locked)

| Question | Decision |
|----------|----------|
| **Purpose** | First x402 facilitator for XRPL. Learning project with potential to become production tool. |
| **P0 Assets** | XRP and RLUSD. Both are ecosystem bread and butter. |
| **MPT Strategy** | Future-proof the architecture. Evaluate complexity as we spec. Add without refactor. |
| **Cost Model** | Keep it cheap. Fly.io/Railway + XRPL public nodes. Scale-to-zero friendly. |
| **Fee Model** | Tiered: standard x402 (XRP/RLUSD) is free. XRPL-native features (MPT compliance, cross-currency) charge a per-tx facilitator fee via two-transaction model. See Fee Model section. |
| **RLUSD** | Currency code: `RLUSD` (hex: `524C555344000000000000000000000000000000`). Mainnet issuer: `rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De`. Testnet issuer: `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV`. |
| **Partial Payments** | Hard reject any tx with `tfPartialPayment` flag. Non-negotiable for x402 — a "1000 XRP" payment must deliver 1000 XRP. |
| **Trust Lines** | Check in `/verify` as soft-fail. If RPC call fails, continue — settlement catches it as `tecPATH_DRY`. |
| **Sequence Handling** | Accept both regular sequences and Tickets. Recommend Tickets in client docs — they solve the stale-sequence problem. |
| **Network Checks** | All network calls in verify are soft-fail. Transient RPC errors should not reject a potentially valid payment. Matches EVM reference pattern. |

---

## What is x402?

x402 is a protocol for HTTP-native payments. When a resource server returns HTTP 402 ("Payment Required"), the client constructs a signed payment payload and resubmits. A **facilitator** sits between the resource server and the blockchain:

```
Client → Resource Server → Facilitator → Blockchain
         (returns 402)    (verify/settle)
```

**Facilitator responsibilities:**
1. **`/verify`** — Validate payment payload meets server's requirements
2. **`/settle`** — Submit signed payment to blockchain, wait for confirmation

The facilitator **never holds funds** — it executes pre-signed transactions from client payloads.

---

## Current Landscape

### Existing x402 Implementations

| Chain | Facilitator | Notes |
|-------|-------------|-------|
| Base | Coinbase (official) | USDC via EIP-3009 |
| Solana | Coinbase (official) | SPL tokens |
| Base/Solana | T54.ai x402-secure | Adds risk layer via Trustline |
| **XRPL** | **None** | ← Opportunity |

T54.ai's differentiator is pre-transaction risk assessment for AI agents. Our differentiator could be **compliance-native payments via MPTs**.

### XRPL Advantages

- **Transaction cost:** ~$0.0002 per tx (vs Base ~$0.01-0.10)
- **Settlement time:** 3-5 seconds
- **Built-in DEX:** Native order book for currency conversion
- **MPTs:** Protocol-level compliance (KYC flags, transfer restrictions, freeze/clawback)
- **RLUSD:** Ripple's regulated stablecoin, NYDFS-chartered

### XRPL Challenges

- **Developer tooling:** Less mature than EVM ecosystem
- **SDK options:** xrpl.js (TypeScript), xrpl-py (Python) — both adequate
- **Ecosystem activity:** Honest reality is ~$10M/day DEX volume, small active user base

---

## Differentiation

What makes this more than "x402 on another chain":

1. **MPT Compliance Integration** (Phase 2)
   - x402 payments that respect on-chain KYC flags
   - Transfer restrictions enforced at protocol level
   - Regular MPTs (compliance flags, freeze/clawback) are live on mainnet now
   - Confidential MPTs (ZKP privacy, auditor keys, XLS-94) not yet shipped — depends on XRPL amendment process
   - First x402 implementation banks/FIs might consider

2. **Cost Advantage**
   - XRPL tx fees: ~$0.0002 (basically free)
   - Public RPC nodes (XRPL Foundation)
   - Scale-to-zero hosting viable
   - Standard x402 payments are free — no facilitator fee for XRP/RLUSD

3. **Cross-Currency Settlement** (Phase 3)
   - XRPL's native DEX enables auto-conversion
   - Pay in XRP, settle in RLUSD
   - No separate DEX integration needed

4. **Tiered Fee Model**
   - Commodity behavior (submit a signed blob) is free — same as Coinbase's first year
   - Differentiated behavior (MPT compliance, cross-currency) charges a facilitator fee
   - Revenue tied to features only this facilitator can provide
   - See [Fee Model](#fee-model) section for mechanics

---

## Fee Model

### Strategy

Coinbase ran their x402 facilitator free for all of 2025, then introduced $0.001/settlement in January 2026. They're subsidizing growth — playing for total volume across their platform. We don't need to play that game. We're the only XRPL facilitator; anyone who wants x402 on XRPL uses ours.

Instead of subsidizing or charging for everything, we tier by capability:

| Tier | Features | Fee | Rationale |
|------|----------|-----|-----------|
| **Standard** | XRP + RLUSD verify/settle | **Free** | Commodity x402 behavior. Any generic x402 client works. Builds adoption, costs us near-zero to operate. |
| **Compliance** | MPT payments with flag validation, authorized holder checks, audit support | **Per-tx fee** | Differentiated. Only this facilitator can do it. Clients using MPTs are XRPL-native by definition — they understand the ecosystem patterns (Tickets, two-tx). |
| **Cross-Currency** | Pay in XRP, settle in RLUSD via native DEX | **Per-tx fee** | Differentiated. XRPL-native DEX integration no other facilitator has. |

The insight: clients using XRPL-native features already know they're on XRPL. They're building with xrpl.js, they understand Tickets, they've set up trust lines. The two-transaction fee pattern isn't a surprise — it's part of the same ecosystem they're already working in. Charging for commodity blob submission would be friction without justification. Charging for capabilities that only exist here is defensible.

### Mechanism: Two-Transaction Model

The facilitator never holds funds (spec principle + regulatory). So we can't take a cut from the merchant payment. Instead, the client signs two transactions:

1. **Merchant payment** — pays the resource server (same as standard tier)
2. **Facilitator fee** — pays the facilitator's address (only for paid-tier features)

The facilitator controls submission order: merchant first, fee second. Risk profile:

| Merchant tx | Fee tx | Outcome |
|-------------|--------|---------|
| Succeeds | Succeeds | Ideal |
| Fails | Not submitted | Clean — nobody loses |
| Succeeds | Fails | Client got resource, facilitator missed fee. **Facilitator absorbs the loss.** |

The worst case (client pays fee, doesn't get resource) cannot happen because the facilitator controls ordering.

### How It Works

**`/supported` advertises the fee via `getExtra()`:**
```json
{
  "facilitatorAddress": "rFacilitator...",
  "facilitatorFee": {
    "standard": null,
    "mpt": "100000",
    "crossCurrency": "100000"
  }
}
```

**Paid-tier payload extends the standard payload:**
```typescript
interface ExactXrplPayload {
  txBlob: string;
  authorization: XrplAuthorization;

  // Present only for paid-tier features (MPT, cross-currency)
  feeTxBlob?: string;
  feeAuthorization?: {
    account: string;
    destination: string;      // Must match facilitatorAddress
    amount: string;           // Must match advertised fee
    sequence: number;
    ticketSequence?: number;
  };
}
```

**Settlement for paid tier:**
1. Verify merchant tx (full pipeline)
2. Verify fee tx (signature, destination matches facilitator, amount matches advertised fee)
3. Submit merchant tx, wait for confirmation
4. If merchant succeeds → submit fee tx (best-effort)
5. If fee tx fails → log, still return success to client

### V1 → V2 Expansion

This is purely additive. The V1 payload type, verification pipeline, and settlement logic are untouched:

- `feeTxBlob` and `feeAuthorization` are optional fields — every V1 payload is a valid V2 payload
- Merchant verification and settlement are the same code path
- Fee verification is a new function called alongside (not replacing) merchant verification
- Fee settlement wraps around the existing merchant settlement without modifying it
- The facilitator needs an XRPL wallet to receive fees (new operational requirement in V2, not V1)

The key V1 implementation detail: keep `submitAndWait` as its own function, not inlined into settle. V2 needs to insert fee submission between "merchant confirmed" and "return result."

### What's Not in V1

- No facilitator wallet needed
- No fee fields in payload type (they're optional, V1 never sees them)
- No two-phase settlement logic
- No `getExtra()` fee advertising
- Standard XRP + RLUSD payments work with any generic x402 client

---

## Technical Design (Based on x402 v2 Spec)

### Network Identifiers (CAIP-2)

x402 v2 uses CAIP-2 chain identifiers. For XRPL:

| Network | CAIP-2 | Notes |
|---------|--------|-------|
| Mainnet | `xrpl:0` | Production |
| Testnet | `xrpl:1` | Stable releases |
| Devnet | `xrpl:2` | Beta releases |

### Facilitator Endpoints

Three endpoints per x402 v2 spec:

| Endpoint | Purpose |
|----------|---------|
| `POST /verify` | Validate payment without settling |
| `POST /settle` | Validate and submit to blockchain |
| `GET /supported` | List supported schemes, networks |

### XRPL Payment Payload Design

The key difference from EVM: XRPL uses **pre-signed transaction blobs** rather than EIP-712 authorization signatures.

On EVM, the client signs an EIP-712 message authorizing a transfer; the facilitator calls a contract function and pays gas. On XRPL, the client signs a complete Payment transaction (but doesn't submit it). The facilitator submits the pre-signed blob. The client pays the network fee (baked into the signed tx). This is actually cleaner — the facilitator can't modify the transaction, can't redirect funds, can't change the amount.

**PaymentPayload.payload structure for XRPL:**

```typescript
interface ExactXrplPayload {
  // The fully signed transaction blob (hex)
  txBlob: string;

  // Pre-parsed fields for quick validation.
  // Facilitator MUST cross-check these against the decoded txBlob —
  // trust but verify. If these don't match the blob, reject.
  authorization: {
    account: string;                    // Source account (rAddress)
    destination: string;                // Destination account
    amount: string | IssuedCurrencyAmount;
    fee: string;                        // Fee in drops
    sequence: number;                   // 0 if using Ticket
    ticketSequence?: number;            // Present if using Ticket
    lastLedgerSequence?: number;        // Null/omitted for non-expiring ticketed txs
  };
}

interface IssuedCurrencyAmount {
  currency: string;   // "RLUSD" (or 40-char hex for non-ASCII codes)
  issuer: string;     // Issuer rAddress
  value: string;      // Decimal amount (up to 15 significant digits)
}
```

### Tickets (Sequence Number Solution)

XRPL uses incrementing sequence numbers, not random nonces. If a client signs a tx with sequence N for our facilitator, then sends any other transaction, sequence N is consumed and our tx is permanently invalid (`tefPAST_SEQ`). EVM avoids this because EIP-3009 uses random nonces.

**Tickets solve this.** They reserve sequence numbers out of order:

1. Client sends `TicketCreate` to reserve a batch (up to 250)
2. Client signs x402 payment with `Sequence: 0, TicketSequence: N`
3. Client can continue normal transactions freely — Tickets are independent of the regular sequence

The facilitator accepts both patterns:

| Pattern | Fields | Verify check |
|---------|--------|-------------|
| Regular sequence | `sequence: N, ticketSequence: undefined` | `account_info` → sequence matches |
| Ticket | `sequence: 0, ticketSequence: N` | `account_objects(type: "ticket")` → Ticket exists |

Tickets are the recommended path for any client that uses their wallet for more than x402 payments. We document this in client-facing docs but don't require it.

Tickets become especially important for paid-tier features (Phase 2+), where the client signs two transactions (merchant + facilitator fee). With regular sequences, that's N and N+1 — if anything happens between them, one breaks. With Tickets, they're independent.

### Verification Steps

Ordered cheapest-to-most-expensive. Offline checks first (pure computation), network checks last (RPC calls). This matches the EVM reference implementation's pattern.

**Offline checks (no network needed):**

1. **Deserialize txBlob** — `decode(txBlob)` from xrpl.js. Parses hex blob into transaction object.
2. **Structural validation** — `validate(tx)` from xrpl.js. Checks required fields, valid field combinations, correct types. Catches malformed transactions before deeper checks.
3. **Verify signature** — `verifySignature(txBlob)` from xrpl.js. Cryptographic check that the blob is properly signed.
4. **Cross-check authorization** — Decoded blob fields must match the `authorization` object in the payload. If the client says "destination is rX" but the blob says "destination is rY", reject. Trust but verify.
5. **Check destination** — Must match `requirements.payTo`.
6. **Check amount** — Must meet or exceed `requirements.amount`.
7. **Check asset** — Must match `requirements.asset` (XRP native, or issuer address for RLUSD).
8. **Reject partial payments** — Hard reject if `tfPartialPayment` flag (0x00020000) is set. A "1000 XRP" x402 payment must deliver 1000 XRP.

**Network checks (require XRPL connection, all soft-fail):**

If any network call fails (RPC timeout, node error), continue verification rather than rejecting. Settlement will catch real problems. This matches the EVM reference's `balanceOf()` pattern.

9. **Check source account** — `account_info(source)`. Balance ≥ amount + fee. Sequence valid (for regular sequence txs) or Ticket exists (for ticketed txs via `account_objects`).
10. **Check ledger expiry** — `getLedgerIndex()`. If `LastLedgerSequence` is set, must be at least 4 ledgers in the future (~12-20 seconds buffer). If omitted (valid for ticketed txs), skip this check.
11. **Check destination (issued currency only)** — `account_lines(destination, peer: issuer)`. Trust line must exist with limit > 0. Also check `freeze_peer` flag. Only applies to RLUSD/issued currency payments, not XRP.
12. **(Future) Check MPT flags** — If MPT, verify compliance status.

### Settlement Steps

1. **Re-verify** — Run the full verification pipeline again. State can change between verify and settle requests (balance spent, sequence consumed, trust line removed). The EVM reference does this explicitly.
2. **Submit txBlob** — Submit to XRPL network via `submit` method (submit-only mode, not sign-and-submit). The blob is immutable — nothing can be modified.
3. **Check preliminary result** — `submit` returns `engine_result` immediately. `tesSUCCESS` means provisionally applied. `tef*`/`tem*` codes mean permanent failure — return error immediately. `ter*` codes mean retryable but we don't retry (the blob might expire).
4. **Wait for validation** — ~3-5 seconds until ledger close. Transaction appears in validated ledger or `LastLedgerSequence` passes.
5. **Return result** — Transaction hash, network, payer address, success/failure.

**Key error codes to handle in settlement:**

| Code | Meaning | Action |
|------|---------|--------|
| `tesSUCCESS` | Applied | Wait for validation, return success |
| `tecPATH_DRY` | No trust line or insufficient liquidity | Return failure: "destination cannot receive this asset" |
| `tecUNFUNDED_PAYMENT` | Insufficient balance | Return failure: "insufficient funds" |
| `tefPAST_SEQ` | Sequence already used | Return failure: "transaction expired — re-sign" |
| `tefMAX_LEDGER` | LastLedgerSequence passed | Return failure: "transaction expired — re-sign" |
| `tecFROZEN` | Trust line frozen | Return failure: "asset frozen" |

### XRP vs RLUSD vs MPT

**XRP (native):**
- Amount is string in drops: `"1000000"` = 1 XRP
- No trust line needed
- `asset` field: `"XRP"`
- Simplest code path — no issuer, no trust line check

**RLUSD (issued currency):**
- Amount is object: `{ currency: "RLUSD", issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", value: "10.00" }`
- Currency code is `RLUSD` (5 chars, stored on-ledger as hex `524C555344000000000000000000000000000000`; xrpl.js handles conversion)
- Destination needs trust line to issuer (check in verify, soft-fail)
- `asset` field: Issuer address (`rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De` mainnet, `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV` testnet)
- `RequireAuth` is **disabled** — anyone can hold RLUSD with just a trust line, no KYC gate
- `GlobalFreeze` is enabled — Ripple can freeze all RLUSD (handle gracefully)
- `AllowTrustLineClawback` is enabled — Ripple can claw back (edge case, regulatory)
- Precision: up to 15 significant digits; practically 2 decimal places for USD-pegged
- Testnet faucet: [tryrlusd.com](https://tryrlusd.com/)

**RLUSD Configuration (for implementation):**
```typescript
const RLUSD_CONFIG = {
  mainnet: {
    currency: "RLUSD",
    issuer: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
  },
  testnet: {
    currency: "RLUSD",
    issuer: "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV",
  },
} as const;
```

**MPT (future):**
- Different transaction type (MPTPayment?)
- Compliance flags checked at protocol level
- `asset` field: MPT issuance ID

### Architecture for MPT Future-Proofing

```
┌─────────────────────────────────────────────┐
│            ExactXrplScheme                   │
│   (implements SchemeNetworkFacilitator)      │
├─────────────────────────────────────────────┤
│  verify(payload, requirements)               │
│    ├─→ verifyXrp()      if asset = XRP      │
│    ├─→ verifyIssued()   if asset = issuer   │
│    └─→ verifyMpt()      if asset = mptId    │
├─────────────────────────────────────────────┤
│  settle(payload, requirements)               │
│    ├─→ settleXrp()                          │
│    ├─→ settleIssued()                       │
│    └─→ settleMpt()                          │
└─────────────────────────────────────────────┘
```

**Key insight:** Asset type determines code path, not scheme. Keep `scheme: "exact"` and route internally based on asset format.

### Technology Choices

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript | Best XRPL SDK (xrpl.js), x402 packages are TS |
| Framework | Hono | Lightweight, matches x402 reference impl |
| XRPL Client | xrpl.js | Official, well-maintained |
| Hosting | Fly.io | Scale-to-zero, cheap at low volume |
| Testing | Vitest | Fast, modern, matches x402 repo |

### Implementation Roadmap

**Phase 1: Standard Tier (Free)**
- Three endpoints: `/verify`, `/settle`, `/supported`
- XRP payments (native)
- RLUSD payments (issued currency)
- Ticket-aware sequence validation
- Testnet + Mainnet support
- Unit + integration test suite
- README with usage examples
- *No facilitator fee. Any x402 client works.*

**Phase 2: Compliance Tier (Paid) — MPT Integration**
- MPT payment verification + settlement (new asset routing branch)
- Compliance flag validation (KYC status, transfer restrictions, freeze checks)
- Two-transaction fee model (facilitator wallet, fee verification, two-phase settlement)
- `getExtra()` advertises facilitator address + fee schedule
- Client documentation: Tickets, two-tx pattern, MPT payment construction
- *Facilitator fee charged for MPT payments. Requires XRPL-aware client.*
- Note: Regular MPTs are live on mainnet. Confidential MPTs (XLS-94) not yet — Phase 2b when available.

**Phase 3: Cross-Currency Tier (Paid)**
- XRPL native DEX integration for auto-conversion
- Pay in XRP, settle in RLUSD (or vice versa)
- Path-finding via XRPL DEX order book
- Facilitator fee for cross-currency settlement
- *Same two-tx fee mechanism as Phase 2.*

---

## Resolved Questions (Technical)

All six original technical questions are now answered. Decisions are in the table above. Summary:

| Question | Resolution |
|----------|-----------|
| RLUSD currency code | `RLUSD` (5-char, hex-encoded on-ledger). Issuer addresses confirmed from Ripple's own repo. |
| Trust lines | Check in `/verify` as soft-fail. Missing trust line = `tecPATH_DRY` at settlement. |
| Who pays network fee | Client pays (baked into signed tx). Spec-compliant — x402 takes no position, it's implementation-level. EVM facilitator pays gas, Solana facilitator co-signs as feePayer, XRPL client pays. All valid. |
| Transaction simulation | `simulate` API exists (XLS-69, rippled 2.4.0). Requires unsigned tx, so not usable for our verify (we receive signed blobs). Useful client-side. Document as recommendation, not in our pipeline. |
| Sequence handling | Tickets solve the stale-sequence problem. Accept both regular sequences and Tickets. See Tickets section above. |
| Partial payments | Hard reject `tfPartialPayment`. Non-negotiable for x402. |
| Facilitator service fee | Tiered model. Standard x402 (XRP/RLUSD) is free — commodity behavior, builds adoption. XRPL-native features (MPT compliance, cross-currency) charge a per-tx fee via two-transaction model. Revenue tied to differentiated capabilities. See Fee Model section. |

---

## Open Questions (Strategy)

1. **Partner with T54.ai or compete?** — Their risk layer could complement our compliance layer. Worth reaching out?

2. **Submit to XRPL Grants?** — Spring 2026 grants opening. This could be a strong submission.

3. **Contribute to x402 repo?** — Could submit PR to add XRPL as official scheme. Good visibility.

---

## Workflow (Claude Code Best Practices)

Following patterns from [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices):

### Phase Pattern: Explore → Plan → Implement → Verify

Each feature follows this cycle:
1. **Explore** — Read relevant code, understand the problem space
2. **Plan** — Design the approach, identify edge cases
3. **Implement** — Write code in small, verifiable chunks
4. **Verify** — Run tests, check behavior, iterate

### Verification Strategy

Claude needs to verify its own work. For this project:

| What | How to verify |
|------|---------------|
| Payload parsing | Unit tests (Vitest) |
| Validation logic | Unit tests with edge cases |
| XRPL transactions | Integration tests against testnet |
| End-to-end flow | Manual test + integration suite |

**Key insight:** Invest in making verification rock-solid. If Claude can run tests and see green/red, it can iterate autonomously.

### Context Management

- `/clear` between unrelated tasks
- Use subagents for exploration that reads many files
- Keep sessions focused on one feature/phase
- Journal captures learning so fresh sessions don't lose context

### Skills (Future)

Once patterns stabilize, create skills in `.claude/skills/`:
- `xrpl-payment` — XRPL payment transaction patterns
- `x402-scheme` — x402 scheme implementation guide
- `test-xrpl` — Testing patterns for XRPL

---

## Next Steps

**Research (complete):**
- [x] Read x402 v2 spec in detail
- [x] Clone reference implementation
- [x] Understand scheme implementation pattern
- [x] Research XRPL toolstack
- [x] Research RLUSD details (issuer, currency code, trust line requirements)
- [x] Research verification patterns (EVM reference + xrpl.js builtins)
- [x] Resolve open technical questions (fees, simulation, sequences, partial payments)

**Scaffolding (complete):**
- [x] Scaffold project with Hono + xrpl.js
- [x] Stub endpoints: `/`, `/supported`, `/verify`, `/settle`
- [x] Integration tests pass (testnet connection, wallet creation, tx signing)

**Phase 1 — Standard Tier (mostly complete):**
- [x] Implement `/supported` endpoint with proper schema
- [x] Implement verification pipeline for XRP (steps 1-10)
- [x] Implement settlement pipeline for XRP
- [x] Add RLUSD verification (trust line check, issued currency amount parsing)
- [x] Add RLUSD settlement
- [ ] Add Ticket-aware sequence validation
- [x] Write unit tests (payload parsing, validation logic, flag rejection)
- [x] Write integration tests (end-to-end verify + settle against testnet)
- [x] RLUSD configuration (mainnet + testnet issuer addresses)
- [x] README with usage examples
- [x] End-to-end demo (`npm run demo` — full payment loop on testnet)
- [x] Node server binding fix (`@hono/node-server`)

**Phase 2 — Compliance Tier (future):**
- [ ] MPT asset routing branch (verifyMpt / settleMpt)
- [ ] MPT compliance flag validation
- [ ] Two-transaction fee model (facilitator wallet, fee verification, two-phase settlement)
- [ ] `getExtra()` fee advertising
- [ ] Client documentation (Ticket setup, two-tx fee pattern, MPT payment construction)
- [ ] Phase 2b: Confidential MPT support (when XLS-94 ships)

**Phase 3 — Cross-Currency Tier (future):**
- [ ] XRPL DEX integration for auto-conversion
- [ ] Path-finding for cross-currency settlement
- [ ] Fee mechanism (reuses Phase 2 two-tx model)

---

## Sources

**x402 Protocol:**
- [x402 Protocol — Facilitator Spec](https://x402.gitbook.io/x402/core-concepts/facilitator)
- [x402 V2 Specification](https://www.x402.org/writing/x402-v2-launch)
- [x402 GitHub (Coinbase)](https://github.com/coinbase/x402)
- [T54.ai x402-secure](https://www.t54.ai/x402-secure)
- [Coinbase x402 Facilitator Pricing](https://docs.cdp.coinbase.com/x402/welcome)

**XRPL Core:**
- [XRPL Payment Transaction](https://xrpl.org/docs/references/protocol/transactions/types/payment)
- [XRPL Reliable Transaction Submission](https://xrpl.org/docs/concepts/transactions/reliable-transaction-submission)
- [XRPL Tickets](https://xrpl.org/docs/concepts/accounts/tickets)
- [XRPL Transaction Cost](https://xrpl.org/docs/concepts/transactions/transaction-cost)
- [XRPL Transaction Queue](https://xrpl.org/docs/concepts/transactions/transaction-queue)
- [XRPL CAIP-2 Identifiers](https://namespaces.chainagnostic.org/xrpl/caip2)

**RLUSD:**
- [Ripple RLUSD-Implementation (issuer settings)](https://github.com/ripple/RLUSD-Implementation/blob/main/doc/rlusd-xrpl-settings.md)
- [RLUSD Testnet Faucet](https://tryrlusd.com/)
- [XRPL Authorized Trust Lines](https://xrpl.org/docs/concepts/tokens/fungible-tokens/authorized-trust-lines)

**XRPL APIs (used in verify/settle):**
- [account_info](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_info)
- [account_lines](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_lines)
- [submit](https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/submit)
- [XLS-69 simulate (rippled 2.4.0)](https://github.com/XRPLF/XRPL-Standards/discussions/199)

**MPTs (future):**
- [XRPL Multi-Purpose Tokens](https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens)
- [Confidential MPTs Discussion (XLS-94)](https://github.com/XRPLF/XRPL-Standards/discussions/372)
- [XRPL Asset Tokenization Whitepaper](https://xrpl.org/static/pdf/Whitepaper_the_future_of_asset_tokenization.pdf)
- [FortStock MPT Case Study](https://xrpl.org/blog/2025/fortstock-xrpl-case-study-mpt-standard)
