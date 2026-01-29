# xrp402

The first [x402](https://x402.org) facilitator for XRP Ledger.

x402 enables HTTP-native payments for agentic commerce. This facilitator handles payment verification and settlement on XRPL.

## Status

**Early development** — scaffolded, not yet functional.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Start dev server
pnpm dev

# Type check
pnpm typecheck
```

## Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /` | Health check |
| `GET /supported` | List supported payment schemes and networks |
| `POST /verify` | Validate payment payload |
| `POST /settle` | Submit payment to XRPL |

## Supported Assets (Planned)

- **XRP** — Native currency
- **RLUSD** — Ripple's regulated stablecoin
- **MPTs** — Multi-Purpose Tokens (future)

## Networks

| Network | CAIP-2 ID | Status |
|---------|-----------|--------|
| Mainnet | `xrpl:0` | Planned |
| Testnet | `xrpl:1` | In development |
| Devnet | `xrpl:2` | Planned |

## Development

See `spec.md` for technical design and `journal.md` for build log.

## Links

- [x402 Protocol Docs](https://x402.org)
- [XRPL Documentation](https://xrpl.org/docs)
- [xrpl.js SDK](https://js.xrpl.org/)

## License

MIT
