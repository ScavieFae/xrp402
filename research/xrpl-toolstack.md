# XRPL Developer Toolstack

Comparison with EVM tooling and assessment for our facilitator project.

---

## Summary

| Aspect | XRPL | EVM Equivalent | Assessment |
|--------|------|----------------|------------|
| **Primary SDK** | xrpl.js | viem | Solid, official, actively maintained |
| **Weekly Downloads** | ~412K | ~2.5M (viem) | ~6x smaller, but healthy for ecosystem size |
| **Local Dev** | rippled standalone | Foundry anvil / Hardhat | Exists, more manual |
| **Testing Framework** | Jest/Vitest + testnet | Foundry / Hardhat | No dedicated framework |
| **Faucet** | Built-in + web tools | Various | Good |
| **Explorer** | xrpl.org explorer, XRPLWin | Etherscan | Adequate |
| **CLI Tools** | Limited | Foundry cast, etc. | Gap |
| **llms.txt** | ✅ Yes | Varies | Good for AI dev |

**Bottom line:** xrpl.js is production-quality and the clear choice. The tooling ecosystem is less mature than EVM but adequate for our needs.

---

## xrpl.js Deep Dive

### What It Is

The official JavaScript/TypeScript SDK for XRP Ledger. Maintained by XRPL Foundation.

- **Package:** `xrpl` on npm
- **Version:** 4.5.0 (as of Jan 2026)
- **Weekly Downloads:** ~412,528
- **GitHub Stars:** 1,309
- **Node.js:** v20+ required, v22 recommended

### Key Features

| Feature | API |
|---------|-----|
| **Create Wallet** | `Wallet.fromSeed(seed)`, `Wallet.generate()` |
| **Fund Testnet** | `client.fundWallet(wallet)` |
| **Sign Transaction** | `wallet.sign(txJSON)` → `{ tx_blob, hash }` |
| **Submit** | `client.submit(tx_blob)` or `client.submitAndWait(...)` |
| **Query Ledger** | `client.request({ command: '...' })` |
| **Autofill** | `client.autofill(tx)` — fills sequence, fee, etc. |

### Code Pattern

```typescript
import { Client, Wallet, xrpToDrops } from 'xrpl';

// Connect
const client = new Client('wss://s.altnet.rippletest.net:51233');
await client.connect();

// Create/load wallet
const wallet = Wallet.fromSeed(process.env.MY_SEED);

// Build transaction
const payment = {
  TransactionType: 'Payment',
  Account: wallet.address,
  Destination: 'rDestination...',
  Amount: xrpToDrops('10'), // 10 XRP
};

// Autofill (sequence, fee, lastLedgerSequence)
const prepared = await client.autofill(payment);

// Sign (offline-capable)
const signed = wallet.sign(prepared);
// signed.tx_blob — hex blob to submit
// signed.hash — transaction ID

// Submit and wait
const result = await client.submitAndWait(signed.tx_blob);

await client.disconnect();
```

### Comparison to viem

| Aspect | xrpl.js | viem |
|--------|---------|------|
| **Design** | All-in-one SDK | Modular, composable |
| **Type Safety** | Good TypeScript support | Excellent, stricter |
| **Bundle Size** | Larger (all-in-one) | Smaller (tree-shaking) |
| **API Style** | Method-based | Function-based |
| **Maturity** | Years of production use | Newer but well-designed |

**Verdict:** xrpl.js is less elegant than viem but perfectly functional. The all-in-one design is actually simpler for our use case — we don't need to compose multiple packages.

---

## Local Development Options

### 1. rippled Standalone Mode

The XRPL equivalent of Foundry's `anvil` — a local node for testing.

```bash
# Build rippled from source, then:
./rippled -a --conf ./config/rippled.cfg
```

**Key difference from EVM:** No automatic block/ledger advancement. You manually control when ledgers close. This is actually useful for deterministic testing.

**Pros:**
- Full API access
- Complete isolation
- Control over ledger advancement

**Cons:**
- Must build rippled from source (C++)
- More setup than `anvil`
- Less documentation

### 2. Public Testnets

| Network | WebSocket | Purpose |
|---------|-----------|---------|
| **Testnet** | `wss://s.altnet.rippletest.net:51233` | Mainnet-like |
| **Devnet** | `wss://s.devnet.rippletest.net:51233` | Pre-release features |

**Pros:**
- Zero setup
- Faucet built into xrpl.js
- Realistic network conditions

**Cons:**
- Network latency
- Rate limits possible
- Less control

### 3. Core Dev Bootcamp Playground

XRPL Commons maintains a playground environment:
- https://github.com/XRPL-Commons/core-dev-bootcamp-2025/tree/main/playground

**Recommendation for us:** Start with testnet. It's good enough for facilitator development. Graduate to standalone mode if we need deterministic testing.

---

## Testing Story

### No Foundry Equivalent

XRPL doesn't have a dedicated testing framework like Foundry. The pattern is:

1. Use standard JS testing (Jest, Vitest)
2. Connect to testnet or standalone node
3. Use `client.fundWallet()` for test accounts
4. Run transactions against real (test) ledger

### x402 Reference Approach

From `@x402/evm/package.json`:
```json
{
  "test": "vitest run",
  "test:integration": "vitest run --config vitest.integration.config.ts"
}
```

They use Vitest for unit tests, separate config for integration tests. We should follow this pattern.

### Our Testing Strategy

```
Unit tests (Vitest)
├── Payload parsing
├── Validation logic
└── Error handling

Integration tests (Vitest + Testnet)
├── Actual XRPL transactions
├── End-to-end payment flows
└── Settlement confirmation
```

---

## Developer Tools

### Faucets

| Tool | URL | Notes |
|------|-----|-------|
| **xrpl.js built-in** | `client.fundWallet()` | Easiest |
| **XRPL.org Faucet** | xrpl.org/resources/dev-tools/xrp-faucets | Web UI |
| **Bithomp** | dev.bithomp.com/en/faucet | Alternative |

### Explorers

| Tool | URL | Notes |
|------|-----|-------|
| **XRPL Explorer** | testnet.xrpl.org | Official |
| **XRPLWin** | xrplwin.com | Advanced, hook support |
| **Bithomp** | test.bithomp.com | Clean UI |

### CLI Tools

**Gap:** No equivalent to Foundry's `cast` for quick command-line operations.

Workaround: We can write small scripts or use the xrpl.js REPL.

---

## XRPLF GitHub Organization

Key repositories:

| Repo | Purpose | Stars | Status |
|------|---------|-------|--------|
| **rippled** | The blockchain daemon (C++) | 5,076 | Active |
| **xrpl.js** | JavaScript SDK | 1,309 | Active |
| **xrpl-py** | Python SDK | 225 | Active |
| **xrpl4j** | Java SDK | 121 | Active |
| **xrpl-dev-portal** | Docs site | 1,680 | Active |
| **XRPL-Standards** | XLS proposals | - | Active |

All actively maintained as of Jan 2026.

---

## llms.txt

**Yes, XRPL has llms.txt!**

Location: https://xrpl.org/llms.txt

Contents: Comprehensive table of contents for the entire xrpl.org documentation site, including:
- All concept docs
- API references
- Tutorials in multiple languages
- Blog posts from 2014-2026

---

## Toolstack for Our Facilitator

### Recommended Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Runtime** | Node.js 22 | Recommended by xrpl.js |
| **Language** | TypeScript | Type safety, matches x402 |
| **Framework** | Hono | Lightweight, matches x402 reference |
| **XRPL SDK** | xrpl.js | Only real option, it's good |
| **Testing** | Vitest | Fast, modern, x402 uses it |
| **Linting** | ESLint + Prettier | Standard |
| **Build** | tsup | Used by x402, simple |
| **CI** | GitHub Actions | Standard |

### Dependencies

```json
{
  "dependencies": {
    "@x402/core": "^2.0.0",
    "xrpl": "^4.5.0",
    "hono": "^4.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.0.0",
    "tsup": "^8.4.0"
  }
}
```

---

## Sources

- [xrpl.js GitHub](https://github.com/XRPLF/xrpl.js)
- [xrpl.js Documentation](https://js.xrpl.org/)
- [XRPL Dev Tools](https://xrpl.org/resources/dev-tools)
- [XRPLF GitHub Organization](https://github.com/XRPLF)
- [XRPL Local Development](https://docs.xrpl-commons.org/core-dev-bootcamp/module01/local-development-testing)
- [xrpl.org llms.txt](https://xrpl.org/llms.txt)
- [WietseWind TypeScript Demo](https://github.com/WietseWind/XRPL-JS-TS-demo)
