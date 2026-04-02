# Anvil

A beginner-friendly blockchain built from scratch in JavaScript. No frameworks, no magic — just blocks, hashes, and proof-of-work you can actually read.

**Anvil is educational software.** It demonstrates how blockchains work at a fundamental level. It is not intended for production use.

## What's Inside

- **Proof-of-work mining** with configurable difficulty
- **Ed25519 digital signatures** for transaction authentication
- **Native coin (ANV)** with mining rewards and balance tracking
- **Double-spend prevention** — balances are checked before transactions are accepted
- **Chain validation** — tamper with any block and the whole chain breaks
- **Multi-node networking** — run multiple nodes, share blocks, reach consensus
- **Interactive CLI** — create wallets, send coins, mine blocks, inspect the chain
- **Single config file** — customize coin name, difficulty, reward, block size

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/anvil-chain.git
cd anvil-chain
npm install
npm start
```

That's it. You'll see the interactive CLI:

```
  ========================================
   Welcome to Anvil (ANV)
   A beginner-friendly blockchain
  ========================================
  Type "help" for available commands.

  anvil (no wallet) >
```

## CLI Commands

| Command | Description |
|---|---|
| `create-wallet` | Generate a new Ed25519 key pair |
| `load-wallet <file>` | Load a wallet from a JSON file |
| `balance` | Check your current balance |
| `send <address> <amount>` | Send coins to another address |
| `mine` | Mine the next block and earn the block reward |
| `pending` | View transactions waiting to be mined |
| `chain` | Display the full blockchain |
| `validate` | Verify the integrity of the chain |
| `info` | Show chain statistics |
| `exit` | Quit |

## Running a Network

You can simulate a multi-node network on your machine:

```bash
# Terminal 1 — start the first node
npm run node

# Terminal 2 — start a second node, connected to the first
npm run node:3002

# Terminal 3 — start a third node, connected to both
npm run node:3003
```

Nodes expose a REST API:

| Endpoint | Method | Description |
|---|---|---|
| `/chain` | GET | Get the full chain |
| `/transactions` | POST | Submit a signed transaction |
| `/mine` | POST | Mine a block (`{ minerAddress }`) |
| `/balance/:address` | GET | Get balance for an address |
| `/validate` | GET | Validate the chain |
| `/peers` | GET/POST | View or add peers |
| `/info` | GET | Node information |

When a block is mined on one node, it broadcasts the chain to all peers. Peers adopt the longest valid chain (Nakamoto consensus).

## Customization

Edit `config.js` to change:

```js
COIN_NAME: 'Anvil',        // Your coin's name
COIN_SYMBOL: 'ANV',        // Ticker symbol
MINING_DIFFICULTY: 3,       // Leading zeros required (higher = harder)
BLOCK_REWARD: 50,           // Coins per mined block
MAX_TRANSACTIONS_PER_BLOCK: 10,
```

## Project Structure

```
anvil/
├── config.js                  # All customizable settings
├── src/
│   ├── blockchain/
│   │   ├── block.js           # Block structure and mining
│   │   ├── chain.js           # Blockchain logic, validation, balances
│   │   ├── transaction.js     # Transaction creation and signing
│   │   └── wallet.js          # Key pair generation and management
│   ├── network/
│   │   └── node.js            # Express HTTP node server
│   ├── cli/
│   │   └── index.js           # Interactive command-line interface
│   └── utils/
│       └── crypto.js          # SHA-256 hashing, Ed25519 signatures
├── landing/
│   └── index.html             # Project landing page
├── package.json
├── LICENSE
└── README.md
```

## How It Works

### 1. Blocks
Each block contains an index, timestamp, list of transactions, the previous block's hash, a nonce, and its own hash. The hash is computed from all these fields — change anything and the hash changes.

### 2. Chain
Blocks link together by storing the hash of the previous block. This creates an immutable chain: tampering with block #5 would change its hash, which would break the link in block #6, and so on.

### 3. Proof of Work
To add a block, miners must find a nonce that makes the block's hash start with a certain number of zeros (the difficulty). This requires brute-force computation and is what makes the chain secure — rewriting history would require redoing all that work.

### 4. Transactions
Each transaction is signed with the sender's Ed25519 private key. The network verifies signatures before accepting transactions. This proves the sender authorized the transfer without revealing their private key.

### 5. Consensus
When multiple nodes exist, they follow the **longest valid chain rule**. If a node receives a chain that is longer than its own and passes validation, it adopts the new chain. This is how distributed nodes agree on the state of truth.

## Security Limitations

This is educational software. Known simplifications:

- **No Merkle trees** — transactions are stored as a flat list, not a hash tree
- **No UTXO model** — balances are calculated by scanning the entire chain
- **No mempool prioritization** — transactions are processed first-come, first-served
- **No transaction fees** — miners only earn the block reward
- **No difficulty adjustment** — difficulty is fixed in config
- **No account nonces** — replay protection relies on balance checks, not sequence numbers
- **Plain-text key storage** — wallet files are not encrypted
- **HTTP networking** — real blockchains use P2P protocols, not REST APIs
- **No fork resolution** — only chain length is compared, not total work

## License

MIT — use it however you want.
