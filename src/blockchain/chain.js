// ============================================================================
// Blockchain (Chain)
// ============================================================================
// The chain is the core data structure — modeled after Bitcoin.
//
// Bitcoin-matching features:
//   - Block reward halving (every HALVING_INTERVAL blocks)
//   - Maximum supply cap (21,000,000 like Bitcoin)
//   - Coinbase (mining reward) transactions
//   - Burn address (permanently destroy coins)
//   - Double-spend prevention
//   - Longest chain consensus
//
// Supply economics:
//   - New coins ONLY enter circulation through mining rewards
//   - Reward halves: 50 -> 25 -> 12.5 -> 6.25 -> 3.125 -> ...
//   - Once MAX_SUPPLY is reached, no more rewards (miners get nothing)
//   - Coins sent to BURN_ADDRESS are permanently unspendable
//   - Circulating supply = total mined - total burned
// ============================================================================

const Block = require('./block');
const Transaction = require('./transaction');
const config = require('../../config');

class Blockchain {
  constructor() {
    this.chain = [this.createGenesisBlock()];
    this.pendingTransactions = [];
    this.difficulty = config.MINING_DIFFICULTY;
    this.maxTxPerBlock = config.MAX_TRANSACTIONS_PER_BLOCK;
  }

  // ---------------------------------------------------------------------------
  // Genesis Block — block #0, the anchor of the entire chain.
  // Bitcoin's was mined January 3, 2009 by Satoshi Nakamoto.
  // ---------------------------------------------------------------------------
  createGenesisBlock() {
    const genesisTx = new Transaction('MINING_REWARD', 'genesis', 0);
    const block = new Block(0, [genesisTx], '0');
    block.timestamp = 0;
    block.hash = block.computeHash();
    return block;
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  // ---------------------------------------------------------------------------
  // BLOCK REWARD with HALVING
  // ---------------------------------------------------------------------------
  // Bitcoin halves the reward every 210,000 blocks:
  //   Block 0-209999:      50 BTC
  //   Block 210000-419999:  25 BTC
  //   Block 420000-629999:  12.5 BTC
  //   ...and so on until the reward rounds to 0.
  //
  // We do the same, but with HALVING_INTERVAL from config (default 100).
  // This lets you see halvings happen quickly in the sandbox.
  // ---------------------------------------------------------------------------
  getCurrentReward() {
    const halvings = Math.floor(this.chain.length / (config.HALVING_INTERVAL || 210000));
    let reward = config.BLOCK_REWARD;

    for (let i = 0; i < halvings; i++) {
      reward = reward / 2;
    }

    // Once the reward is negligibly small, it's effectively 0
    // Bitcoin uses integer satoshis so it eventually hits exactly 0
    if (reward < 0.00000001) return 0;

    // Check if we'd exceed max supply
    const totalMined = this.getTotalMined();
    if (totalMined + reward > config.MAX_SUPPLY) {
      // Only mint what's left
      const remaining = config.MAX_SUPPLY - totalMined;
      return remaining > 0 ? remaining : 0;
    }

    return reward;
  }

  // ---------------------------------------------------------------------------
  // SUPPLY TRACKING
  // ---------------------------------------------------------------------------

  // Total coins ever mined (all coinbase rewards)
  getTotalMined() {
    let total = 0;
    for (const block of this.chain) {
      for (const tx of block.transactions) {
        if (tx.sender === 'MINING_REWARD') {
          total += tx.amount;
        }
      }
    }
    return total;
  }

  // Total coins sent to the burn address (permanently destroyed)
  getTotalBurned() {
    let burned = 0;
    const burnAddr = config.BURN_ADDRESS;
    for (const block of this.chain) {
      for (const tx of block.transactions) {
        if (tx.receiver === burnAddr) {
          burned += tx.amount;
        }
      }
    }
    return burned;
  }

  // Circulating supply = mined - burned
  getCirculatingSupply() {
    return this.getTotalMined() - this.getTotalBurned();
  }

  // How many blocks until the next halving?
  getBlocksUntilHalving() {
    const interval = config.HALVING_INTERVAL || 210000;
    return interval - (this.chain.length % interval);
  }

  // Current halving epoch (0 = first era, 1 = after first halving, etc.)
  getHalvingEpoch() {
    return Math.floor(this.chain.length / (config.HALVING_INTERVAL || 210000));
  }

  // Simulated price based on stock-to-flow model
  // S2F = stock / flow, where stock = circulating supply, flow = annual production
  // This is a very rough simulation — real Bitcoin price is driven by markets
  // Simulated price based on scarcity (stock-to-flow inspired).
  // As more coins are mined and supply gets scarcer (halvings), price rises.
  // This is educational — real Bitcoin price is set by market supply & demand.
  getSimulatedPrice() {
    const circulating = this.getCirculatingSupply();
    const reward = this.getCurrentReward();
    const blocks = this.chain.length;

    if (circulating <= 0 || blocks <= 1) return 0;

    // Scarcity factor: how much of max supply is left?
    // As supply gets mined, remaining shrinks, price goes up
    const percentMined = circulating / config.MAX_SUPPLY;
    const scarcity = 1 / (1 - percentMined + 0.01); // approaches infinity near max

    // Halving factor: each halving roughly doubles the price
    const epoch = this.getHalvingEpoch();
    const halvingMultiplier = Math.pow(2, epoch);

    // Base price grows with blocks (adoption over time)
    const adoption = Math.log2(blocks + 1);

    // Burn bonus: burned coins increase scarcity
    const burnBonus = 1 + (this.getTotalBurned() / (circulating + 1)) * 0.5;

    const price = 0.01 * adoption * halvingMultiplier * scarcity * burnBonus;

    return Math.round(price * 100) / 100;
  }

  // Full supply stats in one call
  getSupplyStats() {
    const reward = this.getCurrentReward();
    return {
      totalMined: this.getTotalMined(),
      totalBurned: this.getTotalBurned(),
      circulating: this.getCirculatingSupply(),
      maxSupply: config.MAX_SUPPLY,
      percentMined: ((this.getTotalMined() / config.MAX_SUPPLY) * 100).toFixed(4),
      currentReward: reward,
      halvingEpoch: this.getHalvingEpoch(),
      blocksUntilHalving: this.getBlocksUntilHalving(),
      simulatedPrice: this.getSimulatedPrice(),
    };
  }

  // ---------------------------------------------------------------------------
  // Add transaction — with burn address support
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

      // Can't send FROM the burn address (those coins are gone)
      if (transaction.sender === config.BURN_ADDRESS) {
        throw new Error('Cannot send from the burn address. Those coins are destroyed.');
      }

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
  // Mine — uses getCurrentReward() for halving-aware rewards
  // ---------------------------------------------------------------------------
  minePendingTransactions(minerAddress) {
    const txBatch = this.pendingTransactions.slice(0, this.maxTxPerBlock);

    // Get the halving-aware reward
    const reward = this.getCurrentReward();

    // Create coinbase transaction (may be 0 if max supply reached)
    const rewardTx = new Transaction('MINING_REWARD', minerAddress, reward);
    const blockTransactions = [rewardTx, ...txBatch];

    console.log(`\n  Creating block #${this.chain.length} with ${blockTransactions.length} transaction(s)...`);

    if (reward < config.BLOCK_REWARD) {
      const epoch = this.getHalvingEpoch();
      console.log(`  Halving epoch ${epoch}: reward is now ${reward} ${config.COIN_SYMBOL} (was ${config.BLOCK_REWARD})`);
    }

    if (reward === 0) {
      console.log(`  MAX SUPPLY REACHED. No more coins will be created.`);
    }

    const newBlock = new Block(
      this.chain.length,
      blockTransactions,
      this.getLatestBlock().hash
    );

    newBlock.mine(this.difficulty);
    this.chain.push(newBlock);

    this.pendingTransactions = this.pendingTransactions.slice(txBatch.length);

    console.log(`  Block #${newBlock.index} added to chain.`);
    if (reward > 0) {
      console.log(`  Miner reward: +${reward} ${config.COIN_SYMBOL}`);
    }

    // Check if halving is coming soon
    const untilHalving = this.getBlocksUntilHalving();
    if (untilHalving <= 10 && untilHalving > 0) {
      console.log(`  ${untilHalving} blocks until next halving!`);
    }

    return newBlock;
  }

  // ---------------------------------------------------------------------------
  // Balance — coins at burn address are technically there but unspendable
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
  // Validation
  // ---------------------------------------------------------------------------
  isValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const current = this.chain[i];
      const previous = this.chain[i - 1];

      if (current.hash !== current.computeHash()) {
        console.log(`  [!] Block #${i} hash mismatch (data was tampered with).`);
        return false;
      }

      if (current.previousHash !== previous.hash) {
        console.log(`  [!] Block #${i} previousHash doesn't match block #${i - 1}.`);
        return false;
      }

      if (!current.hasValidTransactions()) {
        console.log(`  [!] Block #${i} contains invalid transactions.`);
        return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Consensus — longest valid chain wins
  // ---------------------------------------------------------------------------
  replaceChain(newChain) {
    if (newChain.length <= this.chain.length) {
      console.log('  Received chain is not longer. Keeping current chain.');
      return false;
    }

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
