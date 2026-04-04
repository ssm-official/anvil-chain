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
  MINING_DIFFICULTY: 5,      // Number of leading zeros required in block hash.
                             // 3 = instant, 4 = ~1 second, 5 = ~5-30 seconds
                             // Bitcoin started at difficulty ~1, now it's ~80+ trillion.
                             // In real Bitcoin, difficulty adjusts every 2016 blocks.

  BLOCK_REWARD: 50,          // Starting reward. Bitcoin also started at 50 BTC.
                             // This halves at HALVING_INTERVAL.

  // ------ Supply Economics (like Bitcoin) ------
  MAX_SUPPLY: 21000000,      // Maximum coins that will ever exist.
                             // Bitcoin: exactly 21,000,000 BTC. Not one more.

  HALVING_INTERVAL: 100,     // Reward halves every N blocks.
                             // Bitcoin: every 210,000 blocks (~4 years).
                             // We use 100 so you can see halvings happen quickly.
                             // 50 -> 25 -> 12.5 -> 6.25 -> 3.125 etc.

  BURN_ADDRESS: 'BURN_000000000000000000000000000000000000',
  // Coins sent here are permanently destroyed (unspendable).
  // Bitcoin equivalent: sending to an address with no known private key,
  // like 1111111111111111111114oLvT2. Those coins are gone forever.
  // Common reasons to burn: reduce supply, prove commitment, destroy tokens.

  // ------ Block Limits ------
  MAX_TRANSACTIONS_PER_BLOCK: 10,  // Max transactions per block.
                                    // Bitcoin: ~2000-3000 per block (~4MB weight limit).

  // ------ Network ------
  DEFAULT_PORT: 3001,        // Default port for the node HTTP server.
                             // Bitcoin uses port 8333.

  // ------ Genesis Block ------
  GENESIS_MESSAGE: 'The Times 01/Apr/2026 Anvil chain forged.',
  // Bitcoin's genesis block contained:
  // "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks"
};
