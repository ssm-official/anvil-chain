// ============================================================================
// Anvil Configuration
// ============================================================================
// Change these values to customize your blockchain.
// This is the single place to tweak how the chain behaves.
// ============================================================================

module.exports = {
  // ------ Coin Identity ------
  COIN_NAME: 'Anvil',       // Name of your coin (displayed in CLI and logs)
  COIN_SYMBOL: 'ANV',       // Ticker symbol

  // ------ Mining ------
  MINING_DIFFICULTY: 3,      // Number of leading zeros required in block hash.
                             // Higher = harder = slower mining.
                             // 2 = instant, 3 = ~1s, 4 = ~15s, 5+ = very slow

  BLOCK_REWARD: 50,          // Coins awarded to the miner of each block.
                             // Bitcoin started at 50 too!

  // ------ Block Limits ------
  MAX_TRANSACTIONS_PER_BLOCK: 10,  // Max transactions that fit in one block.
                                    // Keeps blocks small and easy to inspect.

  // ------ Network ------
  DEFAULT_PORT: 3001,        // Default port for the node HTTP server.

  // ------ Smart Contracts ------
  ENABLE_CONTRACTS: true,          // Turn on the smart contract engine.
  CONTRACT_GAS_LIMIT: 1000,        // Max operations per contract call.
                                   // Prevents infinite loops from freezing the chain.

  // ------ NFTs ------
  ENABLE_NFTS: true,               // Turn on the NFT system.
  NFT_MINT_COST: 5,                // Cost in ANV to mint an NFT.
                                   // This goes to the miner of the block.

  // ------ Genesis Block ------
  GENESIS_MESSAGE: 'The Times 01/Apr/2026 Anvil chain forged.',
};
