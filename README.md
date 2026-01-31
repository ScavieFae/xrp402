# xrp402

The first [x402](https://x402.org) facilitator for XRP Ledger.

x402 enables HTTP-native payments for agentic commerce. This facilitator handles payment verification and settlement on XRPL, supporting XRP and RLUSD.

## Demo

Run the full x402 payment loop on XRPL testnet — funds wallets, starts servers, verifies and settles a real payment:

```bash
npm run demo
```

```
--- xrp402 Demo: x402 Payment Flow on XRPL Testnet ---

Setting up testnet wallets...
  Client:   rHkn47z... (100 XRP)
  Merchant: rPqM8Jv... (100 XRP)

Starting facilitator on :3402...  ready
Starting resource server on :3401...  ready

[1/3] Request without payment
  GET http://localhost:3401/haiku
  <- 402 Payment Required
  Requires: 1 XRP to rPqM8Jv...

[2/3] Construct and sign XRPL payment
  Payment: 1,000,000 drops rHkn47z... -> rPqM8Jv...
  Signed (sequence 4781203, ledger limit +50)

[3/3] Retry with payment
  GET http://localhost:3401/haiku
  -> Facilitator: verified
  -> Facilitator: settled
  <- 200 OK

  "Drops fall in silence,
   ledger closes, balance shifts—
   value, rearranged."

  Transaction: 90E81E53EDE1F39C52E8C627CA0...
  https://testnet.xrpl.org/transactions/90E81E53EDE1F39C52E8C627CA0...

Done.
```

## Architecture

```
Client                  Resource Server (:3401)      Facilitator (:3402)
  |                              |                          |
  |--- GET /haiku -------------->|                          |
  |<-- 402 + Payment-Required ---|                          |
  |                              |                          |
  |  [sign XRPL Payment tx]     |                          |
  |                              |                          |
  |--- GET /haiku + Payment ---->|                          |
  |                              |--- POST /verify -------->|
  |                              |<-- { isValid: true } ----|
  |                              |--- POST /settle -------->|
  |                              |<-- { success, txHash } --|
  |<-- 200 + haiku + tx hash ----|                          |
```

## Quick Start

```bash
npm install
npm test
npm run dev        # Start facilitator on :3402
npm run typecheck
```

## Facilitator Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /` | Health check |
| `GET /supported` | List supported payment schemes and networks |
| `POST /verify` | Validate a signed payment without submitting |
| `POST /settle` | Validate and submit payment to XRPL |

## Supported Assets

- **XRP** — Native currency
- **RLUSD** — Ripple's regulated stablecoin (issuer-based)

## Networks

| Network | CAIP-2 ID | Status |
|---------|-----------|--------|
| Mainnet | `xrpl:0` | Not yet enabled |
| Testnet | `xrpl:1` | Active |
| Devnet  | `xrpl:2` | Not yet enabled |

## Development

See `spec.md` for technical design.

## Links

- [x402 Protocol Docs](https://x402.org)
- [XRPL Documentation](https://xrpl.org/docs)
- [xrpl.js SDK](https://js.xrpl.org/)

## License

MIT
