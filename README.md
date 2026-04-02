# Anvil

> **EDUCATIONAL SANDBOX** — This is not real cryptocurrency. Anvil is a learning tool based on Bitcoin's design. The ANV coin has zero monetary value.

A simplified recreation of Bitcoin's core blockchain mechanics, built from scratch in JavaScript. Same algorithms, same concepts — just readable enough that a beginner can follow along.

**Anvil is a sandbox.** It runs entirely on your local machine, connects to no real network, and involves no real money. It exists to teach how Bitcoin actually works under the hood.

## Based on Bitcoin

Anvil implements Bitcoin's fundamental algorithms:

- **SHA-256 proof-of-work** mining (same hash algorithm as Bitcoin)
- **Cryptographic transaction signing** (Ed25519 instead of Bitcoin's ECDSA, same principle)
- **Hash-linked blocks** forming a tamper-evident chain
- **Coinbase transactions** that create new coins as mining rewards (starts at 50, like Bitcoin did)
- **Nakamoto consensus** — longest valid chain wins
- **Double-spend prevention** via balance validation before accepting transactions
- **Multi-node networking** with block broadcasting and chain synchronization

See the [Whitepaper](WHITEPAPER.md) for a detailed comparison of every component to Bitcoin.

## Quick Start

```bash
git clone https://github.com/ssm-official/anvil-chain.git
cd anvil-chain
npm install
npm start
```

## CLI Commands

| Command | Description |
|---|---|
| `/wallet create` | Generate a new wallet (key pair) |
| `/wallet load <file>` | Load a wallet from a saved file |
| `/wallet info` | Show wallet details |
| `/balance` | Check your balance |
| `/send <address> <amount>` | Send coins |
| `/mine` | Mine the next block and earn the reward |
| `/pending` | View transactions waiting in the mempool |
| `/chain` | Display the full blockchain |
| `/validate` | Verify chain integrity |
| `/info` | Show chain statistics |
| `/explain <topic>` | Learn how something works in Bitcoin |
| `/explain list` | Show all explanation topics |
| `/clear` | Clear terminal |
| `/exit` | Quit |

### The /explain System

Type `/explain` followed by a topic to learn how it works in Bitcoin vs this sandbox:

```
/explain mine          How Bitcoin mining works (hardware, difficulty, rewards)
/explain wallet        How Bitcoin wallets and keys work
/explain transaction   How Bitcoin transactions work (UTXO vs account model)
/explain block         How Bitcoin blocks are structured
/explain chain         How the blockchain is tamper-evident
/explain consensus     How Nakamoto consensus achieves agreement
/explain difficulty    How Bitcoin adjusts mining difficulty
/explain reward        How block rewards and halving work
/explain hash          How SHA-256 hashing works
/explain genesis       The story of Bitcoin's genesis block
```

## Running a Network

Simulate Bitcoin's peer-to-peer network with local nodes:

```bash
# Terminal 1 — first node
npm run node

# Terminal 2 — second node, connected to first
npm run node:3002

# Terminal 3 — third node, connected to both
npm run node:3003
```

When a block is mined on one node, it broadcasts to all peers. Peers adopt the longest valid chain.

## Configuration

Edit `config.js` — Bitcoin's actual values are noted for comparison:

```javascript
COIN_NAME: 'Anvil',           // Bitcoin: "Bitcoin"
COIN_SYMBOL: 'ANV',           // Bitcoin: "BTC"
MINING_DIFFICULTY: 3,          // Bitcoin: ~80 trillion (adjusts every 2016 blocks)
BLOCK_REWARD: 50,              // Bitcoin: started at 50, now 3.125 after 4 halvings
MAX_TRANSACTIONS_PER_BLOCK: 10 // Bitcoin: ~2000-3000 per block (limited by weight)
```

## Project Structure

```
anvil/
├── config.js                  # All settings (with Bitcoin comparisons)
├── WHITEPAPER.md              # Technical whitepaper
├── src/
│   ├── blockchain/
│   │   ├── block.js           # Block structure and proof-of-work mining
│   │   ├── chain.js           # Blockchain, validation, balances, consensus
│   │   ├── transaction.js     # Signed transactions
│   │   └── wallet.js          # Key pair generation
│   ├── network/
│   │   └── node.js            # HTTP node server (simulates P2P)
│   ├── cli/
│   │   └── index.js           # Interactive CLI with /commands
│   └── utils/
│       └── crypto.js          # SHA-256 + Ed25519 (Node.js built-in crypto)
├── docs/                      # Landing page (GitHub Pages)
├── package.json
├── LICENSE
└── README.md
```

## What Anvil Simplifies

| Bitcoin Feature | Anvil Version | Why |
|---|---|---|
| ECDSA (secp256k1) | Ed25519 | Same concept, modern algorithm |
| UTXO model | Account balances | Much simpler to understand |
| Merkle trees | Flat transaction array | Removes a layer of complexity |
| Script system (OP_CODES) | Fixed signature check | Script is a deep topic on its own |
| Difficulty adjustment | Fixed difficulty | Algorithm is simple but adds code |
| Block reward halving | Fixed reward | Easy to add as an exercise |
| Transaction fees | None | Simplifies mining |
| P2P gossip protocol | HTTP REST | Easy to inspect with curl |
| ~600GB chain | In-memory only | Starts fresh each run |

Read the [Whitepaper](WHITEPAPER.md) for the full technical breakdown.

## Disclaimer

Anvil is an **educational sandbox**. The ANV coin has **no real-world monetary value**. This project is not a cryptocurrency, not a token, not a financial product, and not connected to any real blockchain network. It runs locally on your machine and exists only to help you learn how Bitcoin works. Do not use this code to secure anything of value.

## Links

- [Live Site](https://ssm-official.github.io/anvil-chain/)
- [Whitepaper](WHITEPAPER.md)
- [Twitter / X](https://x.com/S_S_M_X)

## License

MIT
