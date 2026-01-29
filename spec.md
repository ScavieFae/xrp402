# XRPL x402 Facilitator — Spec & Requirements

## Executive Summary

Build the first x402 facilitator for XRPL, enabling HTTP 402 native payments for agentic commerce. Potential to integrate Multi-Purpose Tokens (MPTs) for compliance-aware payments — a capability no other x402 implementation has.

**Status:** SPECCING — design decisions locked, digging into implementation

---

## Decisions (Locked)

| Question | Decision |
|----------|----------|
| **Purpose** | First x402 facilitator for XRPL. Learning project with potential to become production tool. |
| **P0 Assets** | XRP and RLUSD. Both are ecosystem bread and butter. |
| **MPT Strategy** | Future-proof the architecture. Evaluate complexity as we spec. Add without refactor. |
| **Cost Model** | Keep it cheap. Fly.io/Railway + XRPL public nodes. Scale-to-zero friendly. |

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

1. **MPT Compliance Integration** (Future)
   - x402 payments that respect on-chain KYC flags
   - Transfer restrictions enforced at protocol level
   - Auditor key support (Confidential MPTs, Q1 2026)
   - First x402 implementation banks/FIs might consider

2. **Cost Advantage**
   - XRPL tx fees: ~$0.0002 (basically free)
   - Public RPC nodes (XRPL Foundation)
   - Scale-to-zero hosting viable

3. **Cross-Currency Potential** (Phase 3)
   - XRPL's native DEX enables auto-conversion
   - Pay in XRP, settle in RLUSD
   - No separate DEX integration needed

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

**PaymentPayload.payload structure for XRPL:**

```typescript
interface ExactXrplPayload {
  // The fully signed transaction blob (hex)
  txBlob: string;

  // Pre-parsed fields for quick validation
  // (facilitator can also deserialize txBlob to verify)
  authorization: {
    account: string;      // Source account (rAddress)
    destination: string;  // Destination account
    amount: string | IssuedCurrencyAmount;
    fee: string;          // Fee in drops
    sequence: number;
    lastLedgerSequence: number;
  };
}

interface IssuedCurrencyAmount {
  currency: string;   // "USD" or currency hex
  issuer: string;     // Issuer rAddress
  value: string;      // Decimal amount
}
```

### Verification Steps

1. **Deserialize txBlob** — Parse the signed transaction
2. **Verify signature** — Confirm tx is properly signed by `account`
3. **Check destination** — Must match `requirements.payTo`
4. **Check amount** — Must meet or exceed `requirements.amount`
5. **Check asset** — Must match `requirements.asset` (XRP or issuer)
6. **Check time bounds** — `LastLedgerSequence` must be in valid future range
7. **Check balance** — Source account has sufficient funds
8. **Check sequence** — Valid sequence number (not already used)
9. **(Future) Check MPT flags** — If MPT, verify compliance status

### Settlement Steps

1. **Re-verify** — Run all verification checks
2. **Submit txBlob** — Submit to XRPL network via `submit` method
3. **Wait for validation** — ~3-5 seconds until ledger close
4. **Return result** — Transaction hash and status

### XRP vs RLUSD vs MPT

**XRP (native):**
- Amount is string in drops: `"1000000"` = 1 XRP
- No trust line needed
- `asset` field: `"XRP"` or native marker

**RLUSD (issued currency):**
- Amount is object: `{ currency: "USD", issuer: "rIssuer...", value: "10.00" }`
- Destination needs trust line to issuer
- `asset` field: Issuer address

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

### MVP Scope

**Phase 1: XRP + RLUSD**
- Three endpoints: `/verify`, `/settle`, `/supported`
- XRP payments (native)
- RLUSD payments (issued currency)
- Testnet + Mainnet support
- Basic error handling
- README with usage examples

**Phase 2: Polish + MPT Prep**
- Comprehensive test suite
- Better error messages
- Logging/monitoring
- Refactor to support MPT code path (stub)

**Phase 3: MPT Integration**
- MPT payment support
- Compliance flag validation
- Confidential MPT support (when available)

---

## Open Questions (Technical)

1. **RLUSD currency code** — What's the actual currency code? `USD`? `RLUSD`? Need to check issuer details.

2. **Trust lines** — If destination doesn't have a trust line, payment fails. Do we check this in verify? Or let settle fail?

3. **Who pays gas?** — Client includes Fee in the signed tx, so client pays. This is different from EVM where facilitator pays gas. Is this acceptable for x402 model?

4. **Transaction simulation** — Can we dry-run an XRPL tx before submitting? EVM has `eth_call`. Does XRPL have equivalent?

5. **Nonce handling** — XRPL uses sequence numbers. If a tx is pending, sequence is consumed. Need to handle sequence gaps gracefully.

6. **Partial payments** — XRPL supports partial payments (tfPartialPayment flag). Should we explicitly disallow?

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

- [x] Read x402 v2 spec in detail
- [x] Clone reference implementation
- [x] Understand scheme implementation pattern
- [x] Research XRPL toolstack
- [ ] Research RLUSD details (issuer, currency code, trust line requirements)
- [ ] Write "Hello World" XRPL payment with xrpl.js
- [ ] Scaffold project with Hono + xrpl.js
- [ ] Implement `/supported` endpoint (simplest)
- [ ] Implement verify logic for XRP
- [ ] Implement settle logic for XRP
- [ ] Add RLUSD support
- [ ] Write tests

---

## Sources

- [x402 Protocol — Facilitator Spec](https://x402.gitbook.io/x402/core-concepts/facilitator)
- [T54.ai x402-secure](https://www.t54.ai/x402-secure)
- [XRPL Multi-Purpose Tokens](https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens)
- [Confidential MPTs Discussion (XLS-94)](https://github.com/XRPLF/XRPL-Standards/discussions/372)
- [XRPL Asset Tokenization Whitepaper](https://xrpl.org/static/pdf/Whitepaper_the_future_of_asset_tokenization.pdf)
- [FortStock MPT Case Study](https://xrpl.org/blog/2025/fortstock-xrpl-case-study-mpt-standard)
