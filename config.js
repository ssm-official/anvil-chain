// ============================================================================
// Anvil Configuration
// ============================================================================
// Anvil is modeled after Bitcoin's design. Change these values to experiment
// with how different parameters affect the chain's behavior.
//
// Bitcoin's actual values are noted in comments for comparison.
// ============================================================================

module.exports = {
  // ------ Coin Identity ------
  COIN_NAME: 'Anvil',       // Bitcoin: "Bitcoin"
  COIN_SYMBOL: 'ANV',       // Bitcoin: "BTC"

  // ------ Mining ------
  MINING_DIFFICULTY: 3,      // Number of leading zeros required in block hash.
                             // Bitcoin started at difficulty ~1, now it's ~80+ trillion.
                             // We keep it low so mining takes ~1 second, not ~10 minutes.
                             // In real Bitcoin, difficulty adjusts every 2016 blocks.

  BLOCK_REWARD: 50,          // Coins awarded to the miner of each block.
                             // Bitcoin also started at 50 BTC per block in 2009.
                             // Bitcoin halves this every 210,000 blocks (~4 years).
                             // Current Bitcoin reward: 3.125 BTC (after 4 halvings).

  // ------ Block Limits ------
  MAX_TRANSACTIONS_PER_BLOCK: 10,  // Max transactions per block.
                                    // Bitcoin's limit is based on block weight
                                    // (~4MB), not a fixed transaction count.

  // ------ Network ------
  DEFAULT_PORT: 3001,        // Default port for the node HTTP server.
                             // Bitcoin uses port 8333.

  // ------ Genesis Block ------
  GENESIS_MESSAGE: 'The Times 01/Apr/2026 Anvil chain forged.',
  // Bitcoin's genesis block contained:
  // "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks"
};
