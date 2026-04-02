# Anvil: A Simplified Implementation of Bitcoin's Blockchain

**Version 1.0 — April 2026**

---

## Abstract

Anvil is an open-source educational implementation of Bitcoin's core blockchain mechanics, written in plain JavaScript. It provides a working proof-of-work blockchain with transaction signing, chain validation, and multi-node consensus — all designed to be readable by beginners. This document describes the system's design, how each component maps to Bitcoin, and where it intentionally diverges for educational clarity. Anvil is a sandbox. The ANV coin has no monetary value.

---

## 1. Introduction

Bitcoin, introduced by Satoshi Nakamoto in 2008, demonstrated that a decentralized peer-to-peer electronic cash system was possible without trusted third parties. The Bitcoin whitepaper ("Bitcoin: A Peer-to-Peer Electronic Cash System") is only 9 pages, but the production codebase is hundreds of thousands of lines of C++ built over 15+ years.

Anvil exists to bridge the gap between the whitepaper and the production code. It implements Bitcoin's fundamental algorithms — proof-of-work, hash-linked blocks, transaction signing, and longest-chain consensus — in under 1,000 lines of JavaScript that a beginner can read and modify.

### 1.1 Goals

- Teach how Bitcoin actually works at a code level
- Provide a sandbox where users can mine blocks, send coins, and inspect the chain
- Keep the code simple enough that each file can be read in one sitting
- Map every concept back to Bitcoin with clear documentation

### 1.2 Non-Goals

- Production security (this is not a real cryptocurrency)
- Performance optimization (clarity over speed)
- Complete Bitcoin compatibility (simplified for learning)
- Financial value of any kind

---

## 2. The Blockchain Data Structure

### 2.1 Blocks

A block is a container for transactions plus metadata. Each Anvil block contains:

| Field | Description | Bitcoin Equivalent |
|-------|-------------|-------------------|
| index | Position in the chain (0 = genesis) | Block height |
| timestamp | Unix timestamp of creation | Block header timestamp |
| transactions | Array of transactions | Block body (raw tx data) |
| previousHash | SHA-256 hash of the prior block | `hashPrevBlock` in header |
| nonce | Counter incremented during mining | `nonce` in header |
| hash | SHA-256 of all above fields | Block hash |

**Bitcoin difference:** Bitcoin blocks have an 80-byte header containing the version, previous hash, Merkle root, timestamp, difficulty target (bits), and nonce. The transactions are in the body, summarized by the Merkle root in the header. Anvil omits the Merkle tree and hashes all fields directly.

### 2.2 The Chain

Blocks form a chain by each storing the hash of the previous block:

```
Block 0           Block 1           Block 2
+-----------+     +-----------+     +-----------+
| prevHash: |     | prevHash: |     | prevHash: |
|   "0000"  |<----| hash of 0 |<----| hash of 1 |
| hash: abc |     | hash: def |     | hash: ghi |
+-----------+     +-----------+     +-----------+
```

If any data in Block 0 changes, its hash changes, which breaks the `prevHash` link in Block 1, which changes Block 1's hash, breaking Block 2's link, and so on. This cascading invalidation is what makes blockchains tamper-evident.

### 2.3 The Genesis Block

The genesis block is block #0. It has no predecessor (`prevHash = "0"`). Bitcoin's genesis block was mined on January 3, 2009, and contains the text: *"The Times 03/Jan/2009 Chancellor on brink of second bailout for banks."*

Anvil's genesis block contains a similar embedded message configurable in `config.js`.

---

## 3. Proof-of-Work Mining

### 3.1 The Algorithm

Mining is the process of finding a nonce value that, when included in the block data and hashed with SHA-256, produces a hash with a required number of leading zeros.

```
while (hash does not start with "000...") {
    nonce = nonce + 1
    hash = SHA-256(index + timestamp + transactions + previousHash + nonce)
}
```

This is brute-force: there's no shortcut to finding a valid nonce. You must try values one by one until you get lucky. The probability of any single hash having N leading zeros is 1/16^N (in hex), so:

- Difficulty 1: ~1 in 16 hashes (instant)
- Difficulty 3: ~1 in 4,096 hashes (~1 second)
- Difficulty 4: ~1 in 65,536 hashes (~15 seconds)
- Bitcoin (current): ~1 in 2^76 hashes (~10 minutes for the whole network)

### 3.2 Why Proof-of-Work Matters

Proof-of-work serves two purposes:

1. **Sybil resistance** — creating blocks costs real computational work, so an attacker can't spam the network with fake blocks for free.
2. **Immutability** — rewriting history requires redoing all the proof-of-work from the tampered block to the chain tip, faster than honest miners extend the chain. With Bitcoin's hash rate, this would require more electricity than some countries consume.

### 3.3 Difficulty Adjustment

In Bitcoin, difficulty adjusts every 2,016 blocks (~2 weeks) to maintain an average block time of 10 minutes. If blocks are found too quickly, difficulty increases. If too slowly, it decreases.

In Anvil, difficulty is a fixed value in `config.js`. This is an intentional simplification — implementing difficulty adjustment would be a great exercise for learning.

### 3.4 Sandbox Note

Real Bitcoin mining requires Application-Specific Integrated Circuits (ASICs) — custom chips designed solely for SHA-256 hashing. A single Antminer S21 can compute ~200 terahashes per second. The entire Bitcoin network collectively computes over 600 exahashes per second (6 x 10^20).

Anvil's difficulty is set so mining takes ~1 second on a regular laptop. The algorithm is identical to Bitcoin's; only the difficulty differs.

---

## 4. Transactions

### 4.1 Structure

An Anvil transaction contains:

| Field | Description | Bitcoin Equivalent |
|-------|-------------|-------------------|
| sender | Public key of sender | Input script (scriptSig) |
| receiver | Public key of receiver | Output script (scriptPubKey) |
| amount | Number of coins | Output value (in satoshis) |
| timestamp | When created | Transaction locktime (different purpose) |
| signature | Ed25519 signature | ECDSA signature in scriptSig |

### 4.2 Signing and Verification

1. The sender computes `hash = SHA-256(sender + receiver + amount + timestamp)`
2. The sender signs `hash` with their private key, producing a signature
3. Anyone can verify the signature using the sender's public key

This proves the sender authorized the transaction without revealing their private key.

### 4.3 The Coinbase Transaction

The first transaction in every block is the **coinbase transaction** — it creates new coins from nothing and pays them to the miner. This is the only way new coins enter circulation.

In Bitcoin, the coinbase transaction has no inputs (no coins being spent) and one or more outputs (the miner's reward + fees). Anvil's coinbase uses `sender = "MINING_REWARD"` to indicate it's system-generated.

### 4.4 Double-Spend Prevention

Before accepting a transaction, Anvil checks:
1. The transaction signature is valid
2. The sender has sufficient balance (checking both confirmed and pending transactions)

This prevents double-spending — sending the same coins twice before either transaction is confirmed.

**Bitcoin difference:** Bitcoin uses the UTXO (Unspent Transaction Output) model, not account balances. Each transaction consumes specific previous outputs and creates new ones. A coin can only be spent once because spending it removes the UTXO. Anvil uses an account-balance model (like Ethereum) for simplicity.

---

## 5. Cryptography

### 5.1 Hashing: SHA-256

Both Anvil and Bitcoin use SHA-256 (Secure Hash Algorithm, 256-bit) for block hashing. SHA-256 is a member of the SHA-2 family designed by the NSA and published by NIST in 2001. It produces a 256-bit (32-byte, 64 hex character) digest.

Properties exploited by blockchains:
- **Deterministic**: same input always yields same output
- **Preimage resistant**: given a hash, you cannot find the input
- **Avalanche effect**: changing one bit of input changes ~50% of output bits
- **Collision resistant**: infeasible to find two inputs with the same hash

Bitcoin actually double-hashes: `SHA-256(SHA-256(data))`. Anvil single-hashes for simplicity.

### 5.2 Digital Signatures

| | Bitcoin | Anvil |
|---|---|---|
| Algorithm | ECDSA (secp256k1) | Ed25519 |
| Key size | 256-bit | 256-bit |
| Signature size | ~72 bytes (DER) | 64 bytes |
| Standard | SEC 2 | RFC 8032 |

Both are elliptic curve signature schemes. Bitcoin chose secp256k1 (a Koblitz curve) in 2009. Ed25519 (an Edwards curve) is a more modern choice with simpler implementation and better performance. The security principles are identical: private key signs, public key verifies.

---

## 6. Network and Consensus

### 6.1 Node Architecture

Each Anvil node is an HTTP server (Express.js) that:
- Holds its own copy of the blockchain
- Accepts transactions and mining requests via REST API
- Connects to peer nodes for block sharing
- Implements the longest-chain consensus rule

### 6.2 Nakamoto Consensus

When a node receives a chain from a peer:
1. Validate the chain (check all hashes, links, and signatures)
2. If the received chain is longer than ours, adopt it
3. If shorter or equal, keep our chain

This is the "longest valid chain wins" rule. In Bitcoin, "longest" actually means "most cumulative proof-of-work" (which correlates with length when difficulty is constant). Anvil simplifies to chain length.

### 6.3 Block Propagation

When a block is mined on one Anvil node, it broadcasts the full chain to all registered peers via HTTP POST. Peers validate and adopt it if it's longer.

**Bitcoin difference:** Bitcoin uses a peer-to-peer gossip protocol over TCP (port 8333). Nodes relay block headers first, then full blocks on request. Compact block relay (BIP 152) sends only short transaction IDs, since peers likely already have most transactions in their mempool. This is far more efficient than sending the entire chain.

---

## 7. What Anvil Omits

These Bitcoin features are intentionally omitted for educational clarity:

| Feature | Bitcoin | Anvil | Why Omitted |
|---------|---------|-------|-------------|
| UTXO model | Tracks unspent outputs | Account balances | Balance scanning is simpler to understand |
| Merkle trees | Efficiently summarize transactions | Flat array | Adds complexity without aiding core concepts |
| Script system | Programmable spending conditions | Fixed signature check | Script/OP_CODES are a deep topic on their own |
| Difficulty adjustment | Every 2016 blocks | Fixed | Algorithm is straightforward but adds code |
| Halving | Every 210,000 blocks | None | Easy to add as an exercise |
| Transaction fees | Incentivize miners | None | Simplifies transaction handling |
| SPV / light clients | Verify with headers only | Full validation | Requires Merkle proofs |
| Block weight/size limits | 4M weight units | Fixed tx count | Simplifies block creation |
| Segregated Witness | Separates signatures from tx data | Combined | SegWit is a Bitcoin-specific upgrade |
| Peer discovery | DNS seeds, addr messages | Manual peer config | Keeps networking simple |
| Key derivation | HD wallets (BIP 32/44) | Raw key pairs | HD wallets are a layer on top |
| Address encoding | Base58Check / Bech32 | Raw hex public key | Encoding is cosmetic, not fundamental |

---

## 8. Running Anvil

### 8.1 CLI Mode

```bash
npm install
npm start
```

Interactive commands: `/wallet create`, `/mine`, `/send`, `/balance`, `/chain`, `/explain mine`, etc.

### 8.2 Network Mode

```bash
# Terminal 1
npm run node

# Terminal 2
PORT=3002 PEERS=http://localhost:3001 npm run node:3002

# Terminal 3
PORT=3003 PEERS=http://localhost:3001,http://localhost:3002 npm run node:3003
```

### 8.3 Configuration

All parameters are in `config.js`:

```javascript
COIN_NAME: 'Anvil',
COIN_SYMBOL: 'ANV',
MINING_DIFFICULTY: 3,    // Bitcoin: ~80 trillion
BLOCK_REWARD: 50,        // Bitcoin: started at 50, now 3.125
MAX_TRANSACTIONS_PER_BLOCK: 10,
```

---

## 9. Conclusion

Anvil demonstrates that the core of Bitcoin's design can be understood and implemented in a few hundred lines of code. The fundamental insight of the blockchain — that a chain of cryptographic hashes creates a tamper-evident ledger, and that proof-of-work makes it economically infeasible to rewrite — is as simple as a while loop incrementing a nonce.

The engineering complexity of Bitcoin lies not in the core algorithm but in the infrastructure around it: efficient peer-to-peer networking, UTXO management, script execution, difficulty adjustment, and the economic incentive structure that has sustained the network since 2009.

Anvil gives you the core. The rest is an exercise for the reader.

---

## References

1. Nakamoto, S. (2008). "Bitcoin: A Peer-to-Peer Electronic Cash System." https://bitcoin.org/bitcoin.pdf
2. Antonopoulos, A. (2017). "Mastering Bitcoin." O'Reilly Media.
3. Bitcoin Developer Documentation. https://developer.bitcoin.org/
4. SHA-256 Specification. NIST FIPS 180-4.
5. Bernstein, D.J. et al. (2012). "High-speed high-security signatures." Journal of Cryptographic Engineering.

---

## Disclaimer

Anvil is an educational sandbox. The ANV coin has no monetary value. This software is not a cryptocurrency, not a financial product, and not connected to any real blockchain network. It exists solely to teach how Bitcoin's blockchain works at a fundamental level.

---

*Anvil is open-source under the MIT License.*
*https://github.com/ssm-official/anvil-chain*
