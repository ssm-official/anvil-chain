// ============================================================================
// Node Server
// ============================================================================
// Each node is an HTTP server that:
//   - Holds its own copy of the blockchain
//   - Exposes a REST API for interacting with the chain
//   - Can connect to peer nodes to share blocks
//   - Implements the "longest valid chain" consensus rule
//
// HOW THE NETWORK WORKS:
//   1. Start multiple nodes on different ports.
//   2. Tell each node about its peers (via PEERS env var or /peers endpoint).
//   3. When a block is mined on one node, it broadcasts to all peers.
//   4. Peers validate and adopt the new chain if it's longer and valid.
//
// This is a simplified model. Real P2P networks use gossip protocols,
// not direct HTTP calls. But HTTP makes it easy to understand and debug.
//
// USAGE:
//   PORT=3001 node src/network/node.js
//   PORT=3002 PEERS=http://localhost:3001 node src/network/node.js
// ============================================================================

const express = require('express');
const Blockchain = require('../blockchain/chain');
const Block = require('../blockchain/block');
const Transaction = require('../blockchain/transaction');
const Wallet = require('../blockchain/wallet');
const config = require('../../config');

const app = express();
app.use(express.json());

// --- State ---
const blockchain = new Blockchain();
const peers = new Set();
const PORT = process.env.PORT || config.DEFAULT_PORT;

// Register initial peers from environment variable
if (process.env.PEERS) {
  process.env.PEERS.split(',').forEach(p => peers.add(p.trim()));
}

// ============================================================================
// API Endpoints
// ============================================================================

// --- Get the full chain ---
app.get('/chain', (req, res) => {
  res.json({
    length: blockchain.chain.length,
    chain: blockchain.chain.map(b => b.toJSON()),
  });
});

// --- Get pending transactions ---
app.get('/transactions/pending', (req, res) => {
  res.json(blockchain.pendingTransactions.map(tx => tx.toJSON()));
});

// --- Submit a new transaction ---
app.post('/transactions', (req, res) => {
  try {
    const tx = Transaction.fromJSON(req.body);

    if (!tx.isValid() && tx.sender !== 'MINING_REWARD') {
      return res.status(400).json({ error: 'Invalid transaction.' });
    }

    blockchain.addTransaction(tx);
    res.json({ message: 'Transaction added to pending pool.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Mine a block ---
app.post('/mine', (req, res) => {
  const { minerAddress } = req.body;

  if (!minerAddress) {
    return res.status(400).json({ error: 'minerAddress is required.' });
  }

  const block = blockchain.minePendingTransactions(minerAddress);

  // Broadcast the new chain to all peers
  broadcastChain();

  res.json({
    message: `Block #${block.index} mined successfully.`,
    block: block.toJSON(),
  });
});

// --- Get balance for an address ---
app.get('/balance/:address', (req, res) => {
  const balance = blockchain.getBalance(req.params.address);
  res.json({
    address: req.params.address,
    balance,
    symbol: config.COIN_SYMBOL,
  });
});

// --- Validate the chain ---
app.get('/validate', (req, res) => {
  const valid = blockchain.isValid();
  res.json({ valid });
});

// --- Peer management ---
app.get('/peers', (req, res) => {
  res.json([...peers]);
});

app.post('/peers', (req, res) => {
  const { peer } = req.body;
  if (peer) {
    peers.add(peer);
    res.json({ message: `Peer added: ${peer}`, peers: [...peers] });
  } else {
    res.status(400).json({ error: 'peer URL is required.' });
  }
});

// --- Receive a chain from a peer (for consensus) ---
app.post('/chain/receive', (req, res) => {
  try {
    const newChain = req.body.chain.map(b => Block.fromJSON(b));
    const replaced = blockchain.replaceChain(newChain);
    res.json({
      message: replaced ? 'Chain replaced.' : 'Chain kept (ours is longer or equal).',
      length: blockchain.chain.length,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Node info ---
app.get('/info', (req, res) => {
  res.json({
    coin: config.COIN_NAME,
    symbol: config.COIN_SYMBOL,
    chainLength: blockchain.chain.length,
    difficulty: blockchain.difficulty,
    blockReward: blockchain.blockReward,
    pendingTransactions: blockchain.pendingTransactions.length,
    peers: [...peers],
  });
});

// ============================================================================
// Broadcast chain to all registered peers.
// If a peer is down, we just log and move on (resilient).
// ============================================================================
async function broadcastChain() {
  const chainData = {
    chain: blockchain.chain.map(b => b.toJSON()),
  };

  for (const peer of peers) {
    try {
      await fetch(`${peer}/chain/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chainData),
      });
      console.log(`  Broadcasted chain to ${peer}`);
    } catch {
      console.log(`  Could not reach peer ${peer}`);
    }
  }
}

// ============================================================================
// Start the node
// ============================================================================
app.listen(PORT, () => {
  console.log(`\n  ========================================`);
  console.log(`  ${config.COIN_NAME} Node`);
  console.log(`  ========================================`);
  console.log(`  Port:       ${PORT}`);
  console.log(`  Difficulty: ${blockchain.difficulty}`);
  console.log(`  Reward:     ${blockchain.blockReward} ${config.COIN_SYMBOL}`);
  console.log(`  Peers:      ${peers.size > 0 ? [...peers].join(', ') : 'none'}`);
  console.log(`  ========================================\n`);
});

module.exports = app;
