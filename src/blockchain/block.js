// ============================================================================
// Block
// ============================================================================
// A block is a container that holds a batch of transactions plus metadata.
//
// Structure:
//   index        — position in the chain (0 = genesis block)
//   timestamp    — when the block was created
//   transactions — array of Transaction objects included in this block
//   previousHash — hash of the preceding block (links the chain together)
//   hash         — SHA-256 hash of this block's contents
//   nonce        — a number incremented during mining (proof-of-work)
//
// WHY BLOCKS LINK TOGETHER:
//   Each block stores the hash of the block before it. If someone tampers
//   with an old block, its hash changes, which breaks the link in the next
//   block, and every block after that. This makes the chain tamper-evident.
//
// WHAT IS THE NONCE?
//   Mining requires finding a hash that starts with a certain number of
//   zeros (the "difficulty"). The nonce is the variable we keep incrementing
//   until we find a valid hash. This is proof-of-work — it proves the miner
//   spent computational effort to create the block.
// ============================================================================

const { sha256 } = require('../utils/crypto');

class Block {
  constructor(index, transactions, previousHash = '') {
    this.index = index;
    this.timestamp = Date.now();
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = this.computeHash();
  }

  // ---------------------------------------------------------------------------
  // Compute the SHA-256 hash of this block.
  // Includes ALL fields so any tampering changes the hash.
  // ---------------------------------------------------------------------------
  computeHash() {
    const data =
      this.index +
      this.timestamp +
      JSON.stringify(this.transactions) +
      this.previousHash +
      this.nonce;

    return sha256(data);
  }

  // ---------------------------------------------------------------------------
  // Mine the block (proof-of-work).
  //
  // We repeatedly increment the nonce and recompute the hash until it starts
  // with `difficulty` number of zeros.
  //
  // Example: difficulty 3 means the hash must start with "000...".
  //
  // This is intentionally slow — it's what prevents anyone from rewriting
  // the chain faster than honest miners can extend it.
  // ---------------------------------------------------------------------------
  mine(difficulty) {
    const target = '0'.repeat(difficulty);

    console.log(`  Mining block #${this.index}...`);
    const startTime = Date.now();

    while (this.hash.substring(0, difficulty) !== target) {
      this.nonce++;
      this.hash = this.computeHash();
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  Block mined! Nonce: ${this.nonce} | Time: ${elapsed}s`);
    console.log(`  Hash: ${this.hash}`);

    return this;
  }

  // ---------------------------------------------------------------------------
  // Check that every transaction in this block is valid.
  // ---------------------------------------------------------------------------
  hasValidTransactions() {
    for (const tx of this.transactions) {
      if (!tx.isValid()) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Serialization helpers for network transfer.
  // ---------------------------------------------------------------------------
  toJSON() {
    return {
      index: this.index,
      timestamp: this.timestamp,
      transactions: this.transactions.map(tx =>
        typeof tx.toJSON === 'function' ? tx.toJSON() : tx
      ),
      previousHash: this.previousHash,
      nonce: this.nonce,
      hash: this.hash,
    };
  }

  static fromJSON(data) {
    const Transaction = require('./transaction');
    const block = new Block(
      data.index,
      data.transactions.map(tx => Transaction.fromJSON(tx)),
      data.previousHash
    );
    block.timestamp = data.timestamp;
    block.nonce = data.nonce;
    block.hash = data.hash;
    return block;
  }
}

module.exports = Block;
