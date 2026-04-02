#!/usr/bin/env node

// ============================================================================
// Anvil CLI
// ============================================================================
// Anvil is a sandbox recreation of Bitcoin's core mechanics.
// This CLI lets you interact with a local blockchain the same way
// Bitcoin works — mine blocks, send coins, check balances.
//
// The /explain command teaches you what each operation does in Bitcoin
// and how it differs from this sandbox.
// ============================================================================

const readline = require('readline');
const path = require('path');
const Blockchain = require('../blockchain/chain');
const Wallet = require('../blockchain/wallet');
const config = require('../../config');

// --- State ---
const blockchain = new Blockchain();
let currentWallet = null;

// --- Readline ---
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ============================================================================
// UI
// ============================================================================
const c = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
  purple:'\x1b[35m', cyan:'\x1b[36m', green:'\x1b[32m',
  yellow:'\x1b[33m', red:'\x1b[31m', gray:'\x1b[90m',
};

function line(ch='-',len=56){ return c.dim+ch.repeat(len)+c.reset; }
function header(t){ console.log('\n  '+line()+'\n  '+c.bold+c.purple+t+c.reset+'\n  '+line()); }
function sub(t){ console.log('\n  '+c.cyan+t+c.reset+'\n  '+c.dim+'~'.repeat(t.length)+c.reset); }
function info(l,v){ console.log('  '+c.gray+l+':'+c.reset+' '+v); }
function ok(m){ console.log('  '+c.green+m+c.reset); }
function warn(m){ console.log('  '+c.yellow+m+c.reset); }
function err(m){ console.log('  '+c.red+m+c.reset); }
function shortAddr(a){ return !a?'none':a.length<=20?a:a.substring(0,16)+'..'; }
function needWallet(){ if(!currentWallet){err('No wallet loaded. Run: /wallet create');return false;}return true; }

// ============================================================================
// EXPLANATIONS — /explain <topic>
// ============================================================================
// Each explanation describes how Bitcoin works, then notes how this sandbox
// simplifies it. This is the educational core of Anvil.
// ============================================================================

const EXPLANATIONS = {

mine: `
  ${c.bold}What is mining?${c.reset}

  Mining is the process of adding new blocks to the blockchain. A miner:

  1. Collects pending transactions from the network
  2. Bundles them into a candidate block
  3. Repeatedly hashes the block data with different nonce values
  4. Keeps going until the hash starts with enough zeros

  This is ${c.bold}proof-of-work${c.reset} — it proves the miner spent real computational
  effort. The difficulty target controls how many zeros are needed.

  ${c.cyan}In Bitcoin:${c.reset}
  - Mining requires specialized hardware (ASICs) costing thousands
  - A single block takes ~10 minutes to mine across the entire network
  - Miners compete globally — only the first to find a valid hash wins
  - The difficulty adjusts every 2016 blocks to maintain 10-minute spacing
  - Current reward: 3.125 BTC (~$200K+ per block as of 2025)
  - Miners also earn transaction fees from every included transaction
  - Mining pools combine hash power and split rewards

  ${c.yellow}In this sandbox:${c.reset}
  - Mining takes ~1 second on a regular laptop
  - There's no competition — you're the only miner
  - Difficulty is fixed (no automatic adjustment)
  - No transaction fees — miners only get the block reward
  - This is intentional: the point is to see the algorithm work,
    not to simulate the economics of industrial mining
`,

wallet: `
  ${c.bold}What is a wallet?${c.reset}

  A wallet is a pair of cryptographic keys:

  ${c.green}Public key${c.reset}  = your address. Share it freely. People send coins here.
  ${c.red}Private key${c.reset} = your secret. Signs transactions. NEVER share it.

  When you "own" Bitcoin, what you really own is the private key that can
  sign transactions spending coins sent to the corresponding public key.
  If you lose the private key, those coins are gone forever.

  ${c.cyan}In Bitcoin:${c.reset}
  - Uses ECDSA (secp256k1 curve) for key generation
  - Addresses are derived: pubkey -> SHA256 -> RIPEMD160 -> Base58Check
  - Result looks like: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
  - Wallet software manages keys, generates addresses, tracks UTXOs
  - Hardware wallets (Ledger, Trezor) keep private keys offline

  ${c.yellow}In this sandbox:${c.reset}
  - Uses Ed25519 (a different, modern signature scheme)
  - Your address IS your full public key (no shortening/encoding)
  - Keys are saved as plain JSON files (a real wallet would encrypt them)
  - Same core idea: private key signs, public key verifies
`,

transaction: `
  ${c.bold}What is a transaction?${c.reset}

  A transaction is a signed instruction that says:
  "I (sender) authorize sending X coins to (receiver)."

  The sender signs the transaction with their private key. Anyone on the
  network can verify the signature using the sender's public key. This
  proves the sender authorized it without revealing their private key.

  ${c.cyan}In Bitcoin:${c.reset}
  - Uses the UTXO model (Unspent Transaction Outputs)
  - Each transaction consumes previous outputs and creates new ones
  - You don't have a "balance" — you have a set of unspent outputs
  - Transactions include inputs (what you're spending) and outputs (where it goes)
  - Change is sent back to yourself as a new output
  - Transaction fees = sum(inputs) - sum(outputs)
  - Script system (Script/OP_CODES) controls spending conditions

  ${c.yellow}In this sandbox:${c.reset}
  - Uses an account/balance model (simpler, like Ethereum)
  - Balances are calculated by scanning the entire chain
  - No UTXO tracking, no change outputs, no script system
  - No transaction fees
  - Same core concept: cryptographically signed authorization
`,

block: `
  ${c.bold}What is a block?${c.reset}

  A block is a container that bundles transactions together with metadata:

  - ${c.cyan}Index${c.reset}         — position in the chain (0 = genesis)
  - ${c.cyan}Timestamp${c.reset}     — when the block was created
  - ${c.cyan}Transactions${c.reset}  — the batch of transactions in this block
  - ${c.cyan}Previous Hash${c.reset} — SHA-256 hash of the block before this one
  - ${c.cyan}Nonce${c.reset}         — the number incremented during mining
  - ${c.cyan}Hash${c.reset}          — SHA-256 hash of all the above fields

  The previous hash is what creates the "chain" — each block points back
  to the one before it. Tamper with any block and every block after it
  becomes invalid because the hashes no longer match.

  ${c.cyan}In Bitcoin:${c.reset}
  - Blocks have a header (80 bytes) and a body (transactions)
  - Header includes: version, prev hash, Merkle root, timestamp, difficulty, nonce
  - Merkle tree efficiently summarizes all transactions in one hash
  - Block size limited to ~4MB (weight units)
  - Average block contains ~2000-3000 transactions
  - Blocks are found every ~10 minutes on average

  ${c.yellow}In this sandbox:${c.reset}
  - No Merkle tree — transactions stored as a flat array
  - Max 10 transactions per block (configurable)
  - No block size limit in bytes
  - Same fundamental structure: data + previous hash + nonce
`,

chain: `
  ${c.bold}What is the blockchain?${c.reset}

  The blockchain is a linked list of blocks where each block contains the
  hash of the previous block. This creates an immutable, append-only ledger.

  If someone changes a transaction in block #500, the hash of block #500
  changes. But block #501 stored the OLD hash of #500, so #501 is now
  invalid. And #502 stored the hash of #501... the corruption cascades
  all the way to the end of the chain.

  To successfully tamper with the chain, an attacker would need to re-mine
  every block from the tampered one to the tip — faster than the rest of
  the network adds new blocks. This is the ${c.bold}51% attack${c.reset} problem.

  ${c.cyan}In Bitcoin:${c.reset}
  - The chain started January 3, 2009 with the genesis block
  - As of 2025, the chain has 800,000+ blocks
  - Full blockchain is ~600GB+ of data
  - Every full node stores and validates the entire chain
  - "Longest chain" (most cumulative proof-of-work) = the truth
  - Light clients (SPV) verify only block headers, not full blocks

  ${c.yellow}In this sandbox:${c.reset}
  - Chain exists only in memory (lost when you exit)
  - No persistence to disk
  - Consensus uses chain length, not cumulative work
  - Same principle: hash-linked blocks, tamper-evident structure
`,

consensus: `
  ${c.bold}What is consensus?${c.reset}

  Consensus is how a decentralized network agrees on the truth without
  a central authority. In Bitcoin, this is ${c.bold}Nakamoto consensus${c.reset}:

  1. Anyone can propose a new block by mining it
  2. Nodes accept the longest valid chain they've seen
  3. Miners build on top of the longest chain
  4. If two miners find blocks simultaneously (a fork), the network
     temporarily has two competing chains
  5. The fork resolves when one chain gets another block first —
     the longer chain wins, the shorter one is abandoned

  This works because extending the chain requires proof-of-work.
  An attacker would need >50% of the network's hash power to
  consistently outpace honest miners. This is economically infeasible
  for Bitcoin (it would cost billions of dollars worth of hardware).

  ${c.cyan}In Bitcoin:${c.reset}
  - ~20,000 reachable nodes worldwide validate the chain
  - Mining is dominated by large pools (Foundry, AntPool, etc.)
  - Forks resolve within 1-2 blocks typically
  - "6 confirmations" is considered safe for large transactions
  - Block propagation takes ~1-2 seconds across the network

  ${c.yellow}In this sandbox:${c.reset}
  - You can run multiple local nodes that share blocks over HTTP
  - Longest valid chain wins (same rule, simplified)
  - No real fork resolution — just chain length comparison
  - HTTP instead of Bitcoin's P2P gossip protocol
`,

difficulty: `
  ${c.bold}What is mining difficulty?${c.reset}

  Difficulty controls how hard it is to find a valid block hash. The hash
  must start with a certain number of leading zeros.

  - Difficulty 1: hash starts with "0..."      (instant)
  - Difficulty 3: hash starts with "000..."    (~1 second)
  - Difficulty 5: hash starts with "00000..."  (~minutes)

  Higher difficulty = more nonces to try = more computation = more time.

  ${c.cyan}In Bitcoin:${c.reset}
  - Difficulty adjusts every 2016 blocks (~2 weeks)
  - Target: one block every 10 minutes on average
  - If blocks are too fast, difficulty goes up
  - If blocks are too slow, difficulty goes down
  - Current difficulty requires hashes with ~19 leading hex zeros
  - The entire Bitcoin network computes ~600+ exahashes per second
  - That's 600,000,000,000,000,000,000 hashes per second

  ${c.yellow}In this sandbox:${c.reset}
  - Difficulty is fixed at ${config.MINING_DIFFICULTY} (configurable in config.js)
  - No automatic adjustment
  - Your laptop does maybe 500,000 hashes/second
  - That's about 1 trillion times slower than Bitcoin's network
  - This is fine — the point is to see proof-of-work happen, not to be slow
`,

reward: `
  ${c.bold}What is the block reward?${c.reset}

  The block reward is new coins created and given to the miner who
  successfully mines a block. This is the ${c.bold}coinbase transaction${c.reset} —
  the first transaction in every block, creating coins from nothing.

  This is how new coins enter circulation. It's the only way new
  coins are created.

  ${c.cyan}In Bitcoin:${c.reset}
  - Started at 50 BTC per block in 2009 (same as Anvil!)
  - Halves every 210,000 blocks (~4 years): the "halving"
  - 50 -> 25 -> 12.5 -> 6.25 -> 3.125 BTC (current, since April 2024)
  - Eventually reaches 0 around the year 2140
  - Total supply capped at 21,000,000 BTC (hardcoded limit)
  - After all BTC are mined, miners earn only transaction fees

  ${c.yellow}In this sandbox:${c.reset}
  - Reward is ${config.BLOCK_REWARD} ${config.COIN_SYMBOL} per block (configurable)
  - No halving — reward stays the same forever
  - No supply cap — coins are created indefinitely
  - No transaction fees
  - You could add halving as a learning exercise!
`,

hash: `
  ${c.bold}What is a hash?${c.reset}

  A hash function takes any input and produces a fixed-size output (digest).
  SHA-256 always produces 256 bits (64 hex characters), no matter the input.

  Key properties:
  ${c.green}Deterministic${c.reset}    — same input always gives same output
  ${c.green}One-way${c.reset}          — you can't reverse a hash to find the input
  ${c.green}Avalanche effect${c.reset} — tiny input change = completely different hash
  ${c.green}Collision-resistant${c.reset} — nearly impossible to find two inputs with same hash

  Example:
  "hello"    -> 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e...
  "hello!"   -> ce06092fb948d9ffac7d1a376e404b26b7575bcc11ee05a4...

  One character changed the entire hash. This is what makes the blockchain
  tamper-evident.

  ${c.cyan}In Bitcoin:${c.reset}
  - Uses SHA-256 (double-hashed: SHA-256(SHA-256(data))) for blocks
  - Also uses RIPEMD-160 for address derivation
  - The hash is what miners are trying to find (with enough leading zeros)

  ${c.yellow}In this sandbox:${c.reset}
  - Uses SHA-256 (single hash) — same algorithm, simplified
  - Same concept, same security properties
`,

genesis: `
  ${c.bold}What is the genesis block?${c.reset}

  The genesis block is block #0 — the very first block in the chain.
  It has no predecessor, so its "previous hash" is just zeros.
  Every blockchain starts here.

  ${c.cyan}In Bitcoin:${c.reset}
  - Mined by Satoshi Nakamoto on January 3, 2009
  - Contains the text: "The Times 03/Jan/2009 Chancellor on brink
    of second bailout for banks"
  - This headline from The Times newspaper proves the block couldn't
    have been created before that date
  - The 50 BTC reward in the genesis block is unspendable (by design)
  - Block hash: 000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f

  ${c.yellow}In this sandbox:${c.reset}
  - Genesis message: "${config.GENESIS_MESSAGE}"
  - Created automatically when you start the chain
  - Same concept: the anchor point of the entire chain
`,

};

// ============================================================================
// COMMANDS
// ============================================================================

function cmdHelp() {
  header(`${config.COIN_NAME} CLI`);
  console.log(`  ${c.dim}A sandbox recreation of Bitcoin's core mechanics.${c.reset}\n`);

  sub('Core');
  console.log(`  ${c.cyan}/wallet create${c.reset}          Generate a new wallet`);
  console.log(`  ${c.cyan}/wallet load ${c.gray}<file>${c.reset}     Load wallet from file`);
  console.log(`  ${c.cyan}/wallet info${c.reset}            Show wallet details`);
  console.log(`  ${c.cyan}/balance${c.reset}                Check your balance`);
  console.log(`  ${c.cyan}/send ${c.gray}<addr> <amt>${c.reset}     Send ${config.COIN_SYMBOL}`);
  console.log(`  ${c.cyan}/mine${c.reset}                   Mine the next block`);
  console.log(`  ${c.cyan}/chain${c.reset}                  View the blockchain`);
  console.log(`  ${c.cyan}/pending${c.reset}                View pending transactions`);
  console.log(`  ${c.cyan}/validate${c.reset}               Validate chain integrity`);
  console.log(`  ${c.cyan}/info${c.reset}                   Chain statistics`);

  sub('Learn');
  console.log(`  ${c.cyan}/explain ${c.gray}<topic>${c.reset}        How something works in Bitcoin vs here`);
  console.log(`  ${c.cyan}/explain list${c.reset}            Show all topics`);

  sub('System');
  console.log(`  ${c.cyan}/clear${c.reset}                  Clear terminal`);
  console.log(`  ${c.cyan}/exit${c.reset}                   Quit`);
  console.log('');
}

function cmdExplain(args) {
  const topic = args[0]?.toLowerCase();

  if (!topic || topic === 'list') {
    header('Explain Topics');
    console.log(`  ${c.gray}Type /explain <topic> to learn how it works in Bitcoin.${c.reset}\n`);
    const topics = Object.keys(EXPLANATIONS);
    for (const t of topics) {
      console.log(`  ${c.cyan}/explain ${t}${c.reset}`);
    }
    console.log('');
    return;
  }

  if (EXPLANATIONS[topic]) {
    console.log(EXPLANATIONS[topic]);
  } else {
    err(`Unknown topic: ${topic}`);
    console.log(`  ${c.gray}Available: ${Object.keys(EXPLANATIONS).join(', ')}${c.reset}`);
  }
}

function cmdWalletCreate() {
  currentWallet = Wallet.create();
  const walletsDir = path.join(process.cwd(), 'wallets');
  const filePath = path.join(walletsDir, `wallet-${Date.now()}.json`);
  currentWallet.save(filePath);

  header('Wallet Created');
  info('Address', shortAddr(currentWallet.publicKey));
  info('Saved', filePath);
  console.log(`\n  ${c.yellow}Your private key is in that file. Never share it.${c.reset}`);
  console.log(`  ${c.gray}Run /explain wallet to learn how Bitcoin wallets work.${c.reset}`);
}

function cmdWalletLoad(args) {
  if (!args[0]) { err('Usage: /wallet load <path>'); return; }
  try {
    currentWallet = Wallet.load(args[0]);
    header('Wallet Loaded');
    info('Address', shortAddr(currentWallet.publicKey));
  } catch (e) { err(e.message); }
}

function cmdWalletInfo() {
  if (!needWallet()) return;
  const bal = blockchain.getBalance(currentWallet.publicKey);
  header('Wallet');
  info('Address', shortAddr(currentWallet.publicKey));
  info('Full Key', c.dim + currentWallet.publicKey);
  info('Balance', `${bal} ${config.COIN_SYMBOL}`);
}

function cmdBalance() {
  if (!needWallet()) return;
  const bal = blockchain.getBalance(currentWallet.publicKey);
  header('Balance');
  info('Address', shortAddr(currentWallet.publicKey));
  info('Balance', `${c.bold}${c.green}${bal} ${config.COIN_SYMBOL}${c.reset}`);
}

function cmdSend(args) {
  if (!needWallet()) return;
  const receiver = args[0];
  const amount = parseFloat(args[1]);
  if (!receiver || isNaN(amount)) { err('Usage: /send <address> <amount>'); return; }
  try {
    const tx = currentWallet.createTransaction(receiver, amount);
    blockchain.addTransaction(tx);
    ok(`Transaction queued: ${amount} ${config.COIN_SYMBOL} -> ${shortAddr(receiver)}`);
    console.log(`  ${c.gray}Waiting to be included in a mined block.${c.reset}`);
    console.log(`  ${c.gray}Run /explain transaction to learn how Bitcoin transactions work.${c.reset}`);
  } catch (e) { err(e.message); }
}

function cmdMine() {
  if (!needWallet()) return;
  header('Mining');
  console.log(`  ${c.gray}Finding a nonce that makes the hash start with ${'0'.repeat(blockchain.difficulty)} ...${c.reset}`);
  console.log(`  ${c.gray}(In real Bitcoin, this takes ~10 min with billions of $ in hardware)${c.reset}\n`);
  const block = blockchain.minePendingTransactions(currentWallet.publicKey);
  console.log('');
  ok(`Block #${block.index} mined.`);
  ok(`Reward: +${config.BLOCK_REWARD} ${config.COIN_SYMBOL} (coinbase transaction)`);
  console.log(`  ${c.gray}Run /explain mine to learn how Bitcoin mining works.${c.reset}`);
}

function cmdPending() {
  const pending = blockchain.pendingTransactions;
  header(`Pending Transactions (${pending.length})`);
  if (pending.length === 0) {
    console.log(`  ${c.gray}Mempool is empty. No transactions waiting to be mined.${c.reset}`);
    console.log(`  ${c.gray}(In Bitcoin, the mempool typically has thousands of unconfirmed tx.)${c.reset}`);
    return;
  }
  for (const tx of pending) {
    const sender = tx.sender === 'MINING_REWARD' ? 'COINBASE' : shortAddr(tx.sender);
    console.log(`  ${sender} -> ${shortAddr(tx.receiver)}  ${tx.amount} ${config.COIN_SYMBOL}`);
  }
}

function cmdChain() {
  header(`${config.COIN_NAME} Chain (${blockchain.chain.length} blocks)`);
  for (const block of blockchain.chain) {
    console.log(`\n  ${c.purple}Block #${block.index}${c.reset}`);
    console.log(`  ${line('~', 30)}`);
    info('  Time', new Date(block.timestamp).toISOString());
    info('  Tx', block.transactions.length);
    info('  Nonce', block.nonce);
    info('  Hash', shortAddr(block.hash));
    info('  Prev', shortAddr(block.previousHash));
    for (const tx of block.transactions) {
      const s = tx.sender === 'MINING_REWARD' ? `${c.yellow}COINBASE${c.reset}` : shortAddr(tx.sender);
      console.log(`    ${s} -> ${shortAddr(tx.receiver)} ${c.green}${tx.amount} ${config.COIN_SYMBOL}${c.reset}`);
    }
  }
}

function cmdValidate() {
  header('Chain Validation');
  console.log(`  ${c.gray}Checking every block: hash integrity, links, signatures...${c.reset}`);
  const valid = blockchain.isValid();
  if (valid) ok('Chain is VALID. No tampering detected.');
  else err('Chain is INVALID. Data has been tampered with.');
}

function cmdInfo() {
  header(`${config.COIN_NAME} Info`);
  info('Coin', `${config.COIN_NAME} (${config.COIN_SYMBOL})`);
  info('Based on', 'Bitcoin (simplified for learning)');
  info('Blocks', blockchain.chain.length);
  info('Difficulty', blockchain.difficulty);
  info('Block Reward', `${blockchain.blockReward} ${config.COIN_SYMBOL}`);
  info('Pending Tx', blockchain.pendingTransactions.length);
  info('Hashing', 'SHA-256');
  info('Signatures', 'Ed25519');
  info('Consensus', 'Longest valid chain (Nakamoto consensus)');
}

// ============================================================================
// ROUTER
// ============================================================================
function handleInput(input) {
  const trimmed = input.trim();
  if (!trimmed) return;
  const normalized = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed;
  const parts = normalized.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const sub_ = parts[1]?.toLowerCase();
  const args = parts.slice(1);
  const subArgs = parts.slice(2);

  switch (cmd) {
    case 'help': case 'h': cmdHelp(); break;
    case 'clear': case 'cls': console.clear(); break;
    case 'exit': case 'quit': case 'q':
      console.log(`\n  ${c.gray}Goodbye.${c.reset}\n`);
      rl.close(); process.exit(0); break;

    case 'explain': case 'ex': case 'learn': cmdExplain(args); break;

    case 'wallet':
      if (sub_ === 'create' || sub_ === 'new') cmdWalletCreate();
      else if (sub_ === 'load') cmdWalletLoad(subArgs);
      else if (sub_ === 'info') cmdWalletInfo();
      else err('Usage: /wallet <create|load|info>');
      break;
    case 'create-wallet': cmdWalletCreate(); break;

    case 'balance': case 'bal': cmdBalance(); break;
    case 'send': cmdSend(args); break;
    case 'mine': cmdMine(); break;
    case 'pending': case 'mempool': cmdPending(); break;
    case 'chain': cmdChain(); break;
    case 'validate': cmdValidate(); break;
    case 'info': cmdInfo(); break;

    default:
      err(`Unknown command: ${cmd}`);
      console.log(`  ${c.gray}Type /help for commands or /explain list to learn.${c.reset}`);
      break;
  }
}

// ============================================================================
// PROMPT & STARTUP
// ============================================================================
function prompt() {
  const walletTag = currentWallet ? shortAddr(currentWallet.publicKey) : 'no wallet';
  const blocks = blockchain.chain.length;
  const p = `${c.purple}anvil${c.reset} ${c.dim}[${blocks} blocks]${c.reset} ${c.gray}(${walletTag})${c.reset}`;
  rl.question(`  ${p} ${c.cyan}>${c.reset} `, (input) => { handleInput(input); prompt(); });
}

console.log('');
console.log(`  ${c.dim}${'='.repeat(56)}${c.reset}`);
console.log('');
console.log(`  ${c.bold}${c.purple}   ___    _   ___    __ ___  _     ${c.reset}`);
console.log(`  ${c.bold}${c.purple}  / _ |  / | / / |  / //  / / /    ${c.reset}`);
console.log(`  ${c.bold}${c.purple} / __ | /  |/ /| | / // / / / /__  ${c.reset}`);
console.log(`  ${c.bold}${c.purple}/_/ |_|/_/|__/ |_|/_//_/ /_/____/  ${c.reset}`);
console.log(`  ${c.bold}${c.purple}              C H A I N            ${c.reset}`);
console.log('');
console.log(`  ${c.dim}${'='.repeat(56)}${c.reset}`);
console.log(`  ${c.gray}A sandbox recreation of Bitcoin's core mechanics.${c.reset}`);
console.log(`  ${c.gray}Not real cryptocurrency. Built for learning.${c.reset}`);
console.log('');
console.log(`  ${c.gray}To start this again, run: ${c.bold}${c.cyan}anvil-chain${c.reset}`);
console.log('');
console.log(`  ${c.gray}Type ${c.cyan}/help${c.gray} for commands.${c.reset}`);
console.log(`  ${c.gray}Type ${c.cyan}/explain mine${c.gray} to learn how Bitcoin mining works.${c.reset}`);
console.log(`  ${c.dim}${'='.repeat(56)}${c.reset}`);
console.log('');

prompt();
