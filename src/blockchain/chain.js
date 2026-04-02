// ============================================================================
// Blockchain (Chain)
// ============================================================================
// The chain is the core data structure — an ordered list of blocks, each
// pointing back to the previous one via its hash.
//
// This class manages:
//   - Creating the genesis (first) block
//   - Adding transactions to a pending pool
//   - Mining new blocks from pending transactions
//   - Validating the entire chain's integrity
//   - Calculating balances for any address
//   - Preventing double-spending
//
// SECURITY NOTES:
//   - Balance checks happen BEFORE a transaction enters the pending pool.
//   - The chain is validated end-to-end whenever a new chain is received
//     from a peer (longest valid chain wins).
//   - This is educational code. A production chain would need Merkle trees,
//     UTXO sets, mempool prioritization, and much more.
// ============================================================================

const Block = require('./block');
const Transaction = require('./transaction');
const config = require('../../config');

class Blockchain {
  constructor() {
    this.chain = [this.createGenesisBlock()];
    this.pendingTransactions = [];
    this.difficulty = config.MINING_DIFFICULTY;
    this.blockReward = config.BLOCK_REWARD;
    this.maxTxPerBlock = config.MAX_TRANSACTIONS_PER_BLOCK;
  }

  // ---------------------------------------------------------------------------
  // Genesis Block
  // ---------------------------------------------------------------------------
  // The genesis block is the very first block in the chain. It has no
  // predecessor, so its previousHash is '0'. Every blockchain starts here.
  // ---------------------------------------------------------------------------
  createGenesisBlock() {
    const genesisTx = new Transaction('MINING_REWARD', 'genesis', 0);
    const block = new Block(0, [genesisTx], '0');
    block.timestamp = 0; // Fixed timestamp so the genesis hash is deterministic
    block.hash = block.computeHash();
    return block;
  }

  // ---------------------------------------------------------------------------
  // Get the most recent block (we need its hash to link the next block).
  // ---------------------------------------------------------------------------
  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  // ---------------------------------------------------------------------------
  // Add a transaction to the pending pool.
  //
  // Before accepting, we check:
  //   1. Transaction is cryptographically valid (signed correctly).
  //   2. Sender has enough balance (prevents double-spending).
  //   3. Amount is positive.
  //
  // DOUBLE-SPEND PREVENTION:
  //   We check the sender's balance against BOTH confirmed transactions
  //   (in the chain) AND pending transactions (not yet mined). This stops
  //   someone from sending their entire balance in two separate transactions
  //   before either is mined.
  // ---------------------------------------------------------------------------
  addTransaction(transaction) {
    if (!transaction.sender || !transaction.receiver) {
      throw new Error('Transaction must include sender and receiver.');
    }

    if (transaction.sender !== 'MINING_REWARD') {
      if (!transaction.isValid()) {
        throw new Error('Invalid transaction signature.');
      }

      if (transaction.amount <= 0) {
        throw new Error('Transaction amount must be greater than zero.');
      }

      // Check balance including pending transactions
      const balance = this.getBalance(transaction.sender);
      const pendingOutgoing = this.pendingTransactions
        .filter(tx => tx.sender === transaction.sender)
        .reduce((sum, tx) => sum + tx.amount, 0);

      if (balance - pendingOutgoing < transaction.amount) {
        throw new Error(
          `Insufficient balance. Available: ${balance - pendingOutgoing} ${config.COIN_SYMBOL}`
        );
      }
    }

    this.pendingTransactions.push(transaction);
    console.log(`  Transaction added to pending pool. Pool size: ${this.pendingTransactions.length}`);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Mine a new block.
  //
  // Steps:
  //   1. Take up to MAX_TRANSACTIONS_PER_BLOCK from the pending pool.
  //   2. Add a "coinbase" reward transaction (new coins for the miner).
  //   3. Create a new block linking to the previous one.
  //   4. Run proof-of-work (find a valid nonce).
  //   5. Append the block to the chain.
  //
  // The mining reward is how new coins enter circulation — just like
  // Bitcoin miners receive BTC for each block they mine.
  // ---------------------------------------------------------------------------
  minePendingTransactions(minerAddress) {
    // Take a batch of pending transactions
    const txBatch = this.pendingTransactions.slice(0, this.maxTxPerBlock);

    // Create the coinbase (mining reward) transaction
    const rewardTx = new Transaction('MINING_REWARD', minerAddress, this.blockReward);

    // The reward tx goes first in the block (convention from Bitcoin)
    const blockTransactions = [rewardTx, ...txBatch];

    console.log(`\n  Creating block #${this.chain.length} with ${blockTransactions.length} transaction(s)...`);

    const newBlock = new Block(
      this.chain.length,
      blockTransactions,
      this.getLatestBlock().hash
    );

    newBlock.mine(this.difficulty);

    this.chain.push(newBlock);

    // Remove mined transactions from the pending pool
    this.pendingTransactions = this.pendingTransactions.slice(txBatch.length);

    console.log(`  Block #${newBlock.index} added to chain.`);
    console.log(`  Miner reward: +${this.blockReward} ${config.COIN_SYMBOL} to ${minerAddress.substring(0, 16)}...`);

    if (this.pendingTransactions.length > 0) {
      console.log(`  ${this.pendingTransactions.length} transaction(s) still pending.`);
    }

    return newBlock;
  }

  // ---------------------------------------------------------------------------
  // Calculate the balance for an address.
  //
  // We scan every transaction in every block:
  //   - If the address is the receiver, add the amount.
  //   - If the address is the sender, subtract the amount.
  //
  // NOTE: This is the simple approach. Bitcoin uses UTXOs (unspent transaction
  // outputs) for better performance. We use the simpler method for clarity.
  // ---------------------------------------------------------------------------
  getBalance(address) {
    let balance = 0;

    for (const block of this.chain) {
      for (const tx of block.transactions) {
        if (tx.sender === address) balance -= tx.amount;
        if (tx.receiver === address) balance += tx.amount;
      }
    }

    return balance;
  }

  // ---------------------------------------------------------------------------
  // Validate the entire chain.
  //
  // For each block (starting after genesis), we check:
  //   1. The stored hash matches a freshly computed hash (no tampering).
  //   2. The previousHash matches the actual hash of the prior block (links).
  //   3. All transactions in the block have valid signatures.
  //
  // If ANY check fails, the chain is invalid.
  // ---------------------------------------------------------------------------
  isValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const current = this.chain[i];
      const previous = this.chain[i - 1];

      // Recompute the hash — does it match what's stored?
      if (current.hash !== current.computeHash()) {
        console.log(`  [!] Block #${i} hash mismatch (data was tampered with).`);
        return false;
      }

      // Does this block correctly point to the previous block?
      if (current.previousHash !== previous.hash) {
        console.log(`  [!] Block #${i} previousHash doesn't match block #${i - 1}.`);
        return false;
      }

      // Are all transactions in this block valid?
      if (!current.hasValidTransactions()) {
        console.log(`  [!] Block #${i} contains invalid transactions.`);
        return false;
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Replace the chain if a longer valid chain is received from a peer.
  // This is the "longest chain rule" — the chain with the most proof-of-work
  // (longest valid chain) is considered the truth.
  // ---------------------------------------------------------------------------
  replaceChain(newChain) {
    if (newChain.length <= this.chain.length) {
      console.log('  Received chain is not longer. Keeping current chain.');
      return false;
    }

    // Build a temporary blockchain to validate the incoming chain
    const tempChain = new Blockchain();
    tempChain.chain = newChain;

    if (!tempChain.isValid()) {
      console.log('  Received chain is invalid. Keeping current chain.');
      return false;
    }

    console.log('  Replacing chain with longer valid chain from peer.');
    this.chain = newChain;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------
  toJSON() {
    return {
      chain: this.chain.map(block =>
        typeof block.toJSON === 'function' ? block.toJSON() : block
      ),
      pendingTransactions: this.pendingTransactions.map(tx =>
        typeof tx.toJSON === 'function' ? tx.toJSON() : tx
      ),
    };
  }

  static fromJSON(data) {
    const blockchain = new Blockchain();
    blockchain.chain = data.chain.map(b => Block.fromJSON(b));
    blockchain.pendingTransactions = (data.pendingTransactions || []).map(tx =>
      Transaction.fromJSON(tx)
    );
    return blockchain;
  }
}

module.exports = Blockchain;
