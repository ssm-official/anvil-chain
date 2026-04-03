#!/usr/bin/env node

// ============================================================================
// Anvil Chain CLI
// ============================================================================

const readline = require('readline');
const path = require('path');
const fs = require('fs');
const Blockchain = require('../blockchain/chain');
const Wallet = require('../blockchain/wallet');
const config = require('../../config');

// --- State ---
const blockchain = new Blockchain();
const wallets = [];       // all created/loaded wallets
let activeIdx = -1;       // index into wallets[]
let cmdHistory = [];
let historyIdx = -1;

function activeWallet() { return activeIdx >= 0 ? wallets[activeIdx] : null; }

// --- Readline with tab completion ---
const COMMANDS = [
  '/help', '/wallet create', '/wallet list', '/wallet switch',
  '/wallet info', '/wallet load', '/balance', '/send',
  '/mine', '/chain', '/pending', '/validate', '/info',
  '/explain mine', '/explain wallet', '/explain transaction',
  '/explain block', '/explain chain', '/explain consensus',
  '/explain difficulty', '/explain reward', '/explain hash',
  '/explain genesis', '/explain list',
  '/clear', '/exit',
];

function completer(line) {
  const hits = COMMANDS.filter(c => c.startsWith(line));
  return [hits.length ? hits : COMMANDS, line];
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer,
});

// ============================================================================
// UI Helpers
// ============================================================================
const c = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
  purple:'\x1b[35m', cyan:'\x1b[36m', green:'\x1b[32m',
  yellow:'\x1b[33m', red:'\x1b[31m', gray:'\x1b[90m', white:'\x1b[37m',
};

function ln(ch='-', len=58) { return c.dim + ch.repeat(len) + c.reset; }
function header(t) {
  console.log('');
  console.log(`  ${ln()}`);
  console.log(`  ${c.bold}${c.purple}${t}${c.reset}`);
  console.log(`  ${ln()}`);
}
function sub(t) {
  console.log(`\n  ${c.cyan}${c.bold}${t}${c.reset}`);
}
function row(l, v) { console.log(`  ${c.gray}${l}:${c.reset} ${v}`); }
function ok(m)   { console.log(`\n  ${c.green}${m}${c.reset}`); }
function warn(m) { console.log(`\n  ${c.yellow}${m}${c.reset}`); }
function err(m)  { console.log(`\n  ${c.red}${m}${c.reset}`); }
function gap()   { console.log(''); }

function shortAddr(a) {
  if (!a) return 'none';
  if (a.length <= 20) return a;
  // Skip the Ed25519 DER prefix (first 24 hex chars are always the same)
  const unique = a.length > 24 ? a.substring(24) : a;
  return unique.substring(0, 12) + '...';
}

function needWallet() {
  if (!activeWallet()) {
    err('No wallet active. Run /wallet create first.');
    return false;
  }
  return true;
}

// ============================================================================
// EXPLANATIONS
// ============================================================================

const EXPLAINS = {
mine: `
  ${c.bold}${c.white}What is mining?${c.reset}

  Mining is the process of adding new blocks to the blockchain:

    1. Collect pending transactions from the network
    2. Bundle them into a candidate block
    3. Hash the block data with different nonce values
    4. Keep going until the hash starts with enough zeros

  This is ${c.bold}proof-of-work${c.reset}. The difficulty controls how many zeros.

  ${c.cyan}In Bitcoin:${c.reset}
    - Requires ASIC hardware ($5K-$15K per unit)
    - A single block takes ~10 minutes for the entire network
    - Miners compete globally — only the first valid hash wins
    - Difficulty adjusts every 2016 blocks to keep 10-min spacing
    - Current reward: 3.125 BTC (~$200K+ per block)
    - Miners also collect transaction fees

  ${c.yellow}In this sandbox:${c.reset}
    - Takes ~1 second on a regular laptop
    - You're the only miner — no competition
    - Difficulty is fixed at ${config.MINING_DIFFICULTY}
    - Same SHA-256 algorithm, just much easier
`,

wallet: `
  ${c.bold}${c.white}What is a wallet?${c.reset}

  A wallet is a cryptographic key pair:

    ${c.green}Public key${c.reset}  = your address. Share it freely.
    ${c.red}Private key${c.reset} = your secret. Signs transactions. NEVER share.

  If you lose the private key, those coins are gone forever.

  ${c.cyan}In Bitcoin:${c.reset}
    - Uses ECDSA (secp256k1) for signatures
    - Addresses: pubkey -> SHA256 -> RIPEMD160 -> Base58Check
    - Looks like: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
    - Hardware wallets (Ledger, Trezor) keep keys offline

  ${c.yellow}In this sandbox:${c.reset}
    - Uses Ed25519 (modern, same principle)
    - Address is the full public key hex
    - Keys saved as plain JSON (real wallets encrypt them)
`,

transaction: `
  ${c.bold}${c.white}What is a transaction?${c.reset}

  A signed instruction: "I authorize sending X coins to Y."
  The sender signs with their private key. Anyone can verify
  using the sender's public key.

  ${c.cyan}In Bitcoin:${c.reset}
    - UTXO model (Unspent Transaction Outputs)
    - Each tx consumes previous outputs, creates new ones
    - Change sent back to yourself as a new output
    - Fees = sum(inputs) - sum(outputs)
    - Script system (OP_CODES) for spending conditions

  ${c.yellow}In this sandbox:${c.reset}
    - Account/balance model (simpler, like Ethereum)
    - No UTXO, no change outputs, no script, no fees
`,

block: `
  ${c.bold}${c.white}What is a block?${c.reset}

  A container bundling transactions with metadata:

    ${c.cyan}index${c.reset}         position in the chain
    ${c.cyan}timestamp${c.reset}     when created
    ${c.cyan}transactions${c.reset}  the batch of tx in this block
    ${c.cyan}previousHash${c.reset}  hash of the block before this one
    ${c.cyan}nonce${c.reset}         number found during mining
    ${c.cyan}hash${c.reset}          SHA-256 of all above fields

  ${c.cyan}In Bitcoin:${c.reset}
    - 80-byte header + Merkle root of all transactions
    - ~2000-3000 tx per block, every ~10 minutes
    - Block weight limit: ~4MB

  ${c.yellow}In this sandbox:${c.reset}
    - Flat transaction array (no Merkle tree)
    - Max ${config.MAX_TRANSACTIONS_PER_BLOCK} tx per block
`,

chain: `
  ${c.bold}${c.white}What is the blockchain?${c.reset}

  A linked list of blocks. Each block stores the hash of the
  previous block. Change any block and everything after it breaks.

  To rewrite history, an attacker must re-mine every block from
  the tampered one to the tip — faster than honest miners.
  This is the ${c.bold}51% attack${c.reset} problem.

  ${c.cyan}In Bitcoin:${c.reset}
    - Started January 3, 2009. Now 800,000+ blocks.
    - Full chain: ~600GB+
    - Every full node stores the entire thing

  ${c.yellow}In this sandbox:${c.reset}
    - In-memory only (lost when you exit)
`,

consensus: `
  ${c.bold}${c.white}What is Nakamoto consensus?${c.reset}

  How a decentralized network agrees without a central authority:

    1. Anyone can propose a block by mining it
    2. Nodes accept the longest valid chain
    3. Forks resolve when one chain gets ahead

  Requires >50% of hash power to attack (infeasible for Bitcoin).

  ${c.cyan}In Bitcoin:${c.reset} ~20,000 nodes worldwide, P2P gossip protocol
  ${c.yellow}In this sandbox:${c.reset} local HTTP nodes, same longest-chain rule
`,

difficulty: `
  ${c.bold}${c.white}What is mining difficulty?${c.reset}

  The hash must start with N zeros:

    Difficulty 1:  "0..."       (instant)
    Difficulty 3:  "000..."     (~1 second)
    Difficulty 5:  "00000..."   (~minutes)
    Bitcoin now:   ~19 hex zeros (~10 min for 600 EH/s network)

  ${c.cyan}In Bitcoin:${c.reset} adjusts every 2016 blocks to keep ~10 min
  ${c.yellow}In this sandbox:${c.reset} fixed at ${config.MINING_DIFFICULTY}
`,

reward: `
  ${c.bold}${c.white}What is the block reward?${c.reset}

  New coins created for the miner — the "coinbase transaction."
  The ONLY way new coins enter circulation.

  ${c.cyan}In Bitcoin:${c.reset}
    Started at 50 BTC (2009). Halves every 210,000 blocks:
    50 -> 25 -> 12.5 -> 6.25 -> 3.125 BTC (current)
    Total supply capped at 21,000,000 BTC. Runs out ~2140.

  ${c.yellow}In this sandbox:${c.reset}
    Fixed ${config.BLOCK_REWARD} ${config.COIN_SYMBOL} per block. No halving, no cap.
`,

hash: `
  ${c.bold}${c.white}What is a hash?${c.reset}

  SHA-256 takes any input -> fixed 64-char hex output.

    ${c.green}Deterministic${c.reset}     same input = same output
    ${c.green}One-way${c.reset}           can't reverse it
    ${c.green}Avalanche effect${c.reset}  tiny change = totally different hash
    ${c.green}Collision-resistant${c.reset} near-impossible to find two matching inputs

  Bitcoin uses SHA-256 (double-hashed). This sandbox uses SHA-256 (single).
`,

genesis: `
  ${c.bold}${c.white}What is the genesis block?${c.reset}

  Block #0. No predecessor. Every blockchain starts here.

  ${c.cyan}In Bitcoin:${c.reset}
    Mined by Satoshi Nakamoto on January 3, 2009.
    Contains: "The Times 03/Jan/2009 Chancellor on brink of
    second bailout for banks"
    The 50 BTC reward is unspendable (by design).

  ${c.yellow}In this sandbox:${c.reset}
    Genesis message: "${config.GENESIS_MESSAGE}"
`,
};

// ============================================================================
// COMMANDS
// ============================================================================

function cmdHelp() {
  header(`${config.COIN_NAME} CLI`);
  console.log(`  ${c.dim}A sandbox recreation of Bitcoin. Type a command or press Tab.${c.reset}`);

  sub('Wallet');
  console.log(`  ${c.cyan}/wallet create${c.reset}          Create a new wallet`);
  console.log(`  ${c.cyan}/wallet list${c.reset}            List all wallets`);
  console.log(`  ${c.cyan}/wallet switch ${c.gray}<#>${c.reset}      Switch active wallet`);
  console.log(`  ${c.cyan}/wallet info${c.reset}            Current wallet details + full address`);
  console.log(`  ${c.cyan}/wallet load ${c.gray}<file>${c.reset}     Load from file`);

  sub('Blockchain');
  console.log(`  ${c.cyan}/balance${c.reset}                Check your balance`);
  console.log(`  ${c.cyan}/send ${c.gray}<addr> <amt>${c.reset}     Send ${config.COIN_SYMBOL}`);
  console.log(`  ${c.cyan}/mine${c.reset}                   Mine the next block`);
  console.log(`  ${c.cyan}/chain${c.reset}                  View the blockchain`);
  console.log(`  ${c.cyan}/pending${c.reset}                View mempool`);
  console.log(`  ${c.cyan}/validate${c.reset}               Validate chain integrity`);
  console.log(`  ${c.cyan}/info${c.reset}                   Chain statistics`);

  sub('Learn');
  console.log(`  ${c.cyan}/explain ${c.gray}<topic>${c.reset}        How Bitcoin does it vs this sandbox`);
  console.log(`  ${c.cyan}/explain list${c.reset}            All available topics`);

  sub('System');
  console.log(`  ${c.cyan}/clear${c.reset}                  Clear terminal`);
  console.log(`  ${c.cyan}/exit${c.reset}                   Quit`);
  gap();
}

function cmdExplain(args) {
  const topic = args[0]?.toLowerCase();
  if (!topic || topic === 'list') {
    header('Explain Topics');
    console.log(`  ${c.gray}Type /explain <topic> to learn how it works in Bitcoin.${c.reset}`);
    gap();
    for (const t of Object.keys(EXPLAINS)) {
      console.log(`    ${c.cyan}/explain ${t}${c.reset}`);
    }
    gap();
    return;
  }
  if (EXPLAINS[topic]) {
    console.log(EXPLAINS[topic]);
  } else {
    err(`Unknown topic: ${topic}`);
    console.log(`  ${c.gray}Available: ${Object.keys(EXPLAINS).join(', ')}${c.reset}`);
    gap();
  }
}

// --- Wallet commands ---

function cmdWalletCreate() {
  const w = Wallet.create();
  const walletsDir = path.join(process.cwd(), 'wallets');
  const filePath = path.join(walletsDir, `wallet-${Date.now()}.json`);
  w.save(filePath);

  wallets.push(w);
  activeIdx = wallets.length - 1;

  header('Wallet Created');
  row('Wallet #', activeIdx + 1);
  row('Short', shortAddr(w.publicKey));
  row('Full Address', w.publicKey);
  row('Saved', filePath);
  gap();
  console.log(`  ${c.yellow}Your private key is in that file. Never share it.${c.reset}`);
  console.log(`  ${c.gray}Tip: /explain wallet${c.reset}`);
  gap();
}

function cmdWalletList() {
  header(`Wallets (${wallets.length})`);

  if (wallets.length === 0) {
    console.log(`  ${c.gray}No wallets yet. Run /wallet create${c.reset}`);
    gap();
    return;
  }

  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    const bal = blockchain.getBalance(w.publicKey);
    const active = i === activeIdx ? `${c.green} *active*${c.reset}` : '';
    const num = `${c.bold}#${i + 1}${c.reset}`;
    console.log(`\n  ${num}  ${shortAddr(w.publicKey)}  ${c.green}${bal} ${config.COIN_SYMBOL}${c.reset}${active}`);
    console.log(`       ${c.dim}${w.publicKey}${c.reset}`);
  }
  gap();
  if (wallets.length > 1) {
    console.log(`  ${c.gray}Switch with: /wallet switch <number>${c.reset}`);
    gap();
  }
}

function cmdWalletSwitch(args) {
  const num = parseInt(args[0]);
  if (isNaN(num) || num < 1 || num > wallets.length) {
    err(`Usage: /wallet switch <1-${wallets.length}>`);
    if (wallets.length === 0) console.log(`  ${c.gray}No wallets. Run /wallet create first.${c.reset}`);
    gap();
    return;
  }
  activeIdx = num - 1;
  const w = wallets[activeIdx];
  ok(`Switched to wallet #${num}`);
  row('Address', shortAddr(w.publicKey));
  row('Balance', `${blockchain.getBalance(w.publicKey)} ${config.COIN_SYMBOL}`);
  gap();
}

function cmdWalletInfo() {
  if (!needWallet()) return;
  const w = activeWallet();
  const bal = blockchain.getBalance(w.publicKey);

  header(`Wallet #${activeIdx + 1}`);
  row('Short', shortAddr(w.publicKey));
  row('Full Address', w.publicKey);
  row('Balance', `${c.bold}${c.green}${bal} ${config.COIN_SYMBOL}${c.reset}`);
  gap();
  console.log(`  ${c.gray}Tip: /explain wallet${c.reset}`);
  gap();
}

function cmdWalletLoad(args) {
  if (!args[0]) {
    err('Usage: /wallet load <path-to-wallet.json>');
    gap();
    return;
  }
  try {
    const w = Wallet.load(args[0]);
    wallets.push(w);
    activeIdx = wallets.length - 1;
    ok(`Wallet loaded as #${wallets.length}`);
    row('Address', shortAddr(w.publicKey));
    gap();
  } catch (e) { err(e.message); gap(); }
}

// --- Core commands ---

function cmdBalance() {
  if (!needWallet()) return;
  const w = activeWallet();
  const bal = blockchain.getBalance(w.publicKey);

  header('Balance');
  row('Wallet', `#${activeIdx + 1}  ${shortAddr(w.publicKey)}`);
  row('Balance', `${c.bold}${c.green}${bal} ${config.COIN_SYMBOL}${c.reset}`);
  gap();
}

function cmdSend(args) {
  if (!needWallet()) return;
  const w = activeWallet();
  const receiver = args[0];
  const amount = parseFloat(args[1]);

  if (!receiver || isNaN(amount)) {
    err('Usage: /send <address> <amount>');
    gap();
    console.log(`  ${c.gray}Example: /send ${c.dim}302a300506032b6570...${c.gray} 10${c.reset}`);
    gap();
    return;
  }

  try {
    const tx = w.createTransaction(receiver, amount);
    blockchain.addTransaction(tx);
    ok(`Transaction queued: ${amount} ${config.COIN_SYMBOL}`);
    row('From', shortAddr(w.publicKey));
    row('To', shortAddr(receiver));
    gap();
    console.log(`  ${c.gray}Waiting to be included in a mined block.${c.reset}`);
    console.log(`  ${c.gray}Tip: /explain transaction${c.reset}`);
    gap();
  } catch (e) { err(e.message); gap(); }
}

function cmdMine() {
  if (!needWallet()) return;
  const w = activeWallet();

  header('Mining');
  console.log(`  ${c.gray}Finding a nonce where SHA-256 starts with "${'0'.repeat(blockchain.difficulty)}"...${c.reset}`);
  console.log(`  ${c.gray}(In real Bitcoin this takes ~10 min with specialized hardware)${c.reset}`);
  gap();

  const block = blockchain.minePendingTransactions(w.publicKey);

  ok(`Block #${block.index} mined successfully.`);
  gap();
  row('Nonce', block.nonce);
  row('Hash', block.hash);
  row('Transactions', block.transactions.length);
  row('Reward', `+${config.BLOCK_REWARD} ${config.COIN_SYMBOL} (coinbase)`);
  gap();
  console.log(`  ${c.gray}Tip: /explain mine${c.reset}`);
  gap();
}

function cmdPending() {
  const pending = blockchain.pendingTransactions;
  header(`Mempool (${pending.length} pending)`);

  if (pending.length === 0) {
    console.log(`  ${c.gray}Empty. No transactions waiting to be mined.${c.reset}`);
    console.log(`  ${c.gray}(In Bitcoin the mempool has thousands of unconfirmed tx.)${c.reset}`);
    gap();
    return;
  }

  for (const tx of pending) {
    const sender = tx.sender === 'MINING_REWARD' ? 'COINBASE' : shortAddr(tx.sender);
    console.log(`  ${sender}  ->  ${shortAddr(tx.receiver)}  ${c.green}${tx.amount} ${config.COIN_SYMBOL}${c.reset}`);
  }
  gap();
}

function cmdChain() {
  header(`${config.COIN_NAME} Chain (${blockchain.chain.length} blocks)`);

  for (const block of blockchain.chain) {
    console.log(`\n  ${c.bold}${c.purple}Block #${block.index}${c.reset}`);
    console.log(`  ${ln('~', 40)}`);
    row('  Timestamp', block.timestamp === 0 ? 'genesis' : new Date(block.timestamp).toISOString());
    row('  Transactions', block.transactions.length);
    row('  Nonce', block.nonce);
    row('  Hash', block.hash);
    row('  Prev Hash', block.previousHash);

    for (const tx of block.transactions) {
      const s = tx.sender === 'MINING_REWARD' ? `${c.yellow}COINBASE${c.reset}` : shortAddr(tx.sender);
      console.log(`\n    ${s}  ->  ${shortAddr(tx.receiver)}`);
      console.log(`    ${c.green}${tx.amount} ${config.COIN_SYMBOL}${c.reset}`);
    }
  }
  gap();
}

function cmdValidate() {
  header('Chain Validation');
  console.log(`  ${c.gray}Checking hashes, links, and signatures...${c.reset}`);
  gap();

  const valid = blockchain.isValid();
  if (valid) ok('Chain is VALID. No tampering detected.');
  else err('Chain is INVALID. Data has been tampered with.');
  gap();
}

function cmdInfo() {
  header(`${config.COIN_NAME} Info`);
  gap();
  row('Coin', `${config.COIN_NAME} (${config.COIN_SYMBOL})`);
  row('Based on', 'Bitcoin (simplified for learning)');
  gap();
  row('Blocks', blockchain.chain.length);
  row('Difficulty', blockchain.difficulty);
  row('Block Reward', `${blockchain.blockReward} ${config.COIN_SYMBOL}`);
  row('Pending Tx', blockchain.pendingTransactions.length);
  gap();
  row('Hashing', 'SHA-256');
  row('Signatures', 'Ed25519');
  row('Consensus', 'Longest valid chain (Nakamoto)');
  row('Wallets', `${wallets.length} loaded`);
  gap();
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
    case 'help': case 'h':
      cmdHelp(); break;

    case 'clear': case 'cls':
      console.clear(); break;

    case 'exit': case 'quit': case 'q':
      console.log(`\n  ${c.gray}Goodbye. Run ${c.cyan}anvil-chain${c.gray} to start again.${c.reset}\n`);
      rl.close(); process.exit(0); break;

    case 'explain': case 'ex': case 'learn':
      cmdExplain(args); break;

    case 'wallet': case 'w':
      if (sub_ === 'create' || sub_ === 'new') cmdWalletCreate();
      else if (sub_ === 'list' || sub_ === 'ls') cmdWalletList();
      else if (sub_ === 'switch' || sub_ === 'use') cmdWalletSwitch(subArgs);
      else if (sub_ === 'info' || sub_ === 'show') cmdWalletInfo();
      else if (sub_ === 'load') cmdWalletLoad(subArgs);
      else {
        err('Usage: /wallet <create|list|switch|info|load>');
        gap();
      }
      break;

    case 'balance': case 'bal':
      cmdBalance(); break;

    case 'send':
      cmdSend(args); break;

    case 'mine':
      cmdMine(); break;

    case 'pending': case 'mempool':
      cmdPending(); break;

    case 'chain':
      cmdChain(); break;

    case 'validate':
      cmdValidate(); break;

    case 'info':
      cmdInfo(); break;

    default:
      err(`Unknown command: ${cmd}`);
      console.log(`  ${c.gray}Type /help for commands. Press Tab for autocomplete.${c.reset}`);
      gap();
      break;
  }
}

// ============================================================================
// PROMPT
// ============================================================================

function prompt() {
  const w = activeWallet();
  const walletTag = w ? `#${activeIdx + 1} ${shortAddr(w.publicKey)}` : 'no wallet';
  const blocks = blockchain.chain.length;
  const p = `  ${c.purple}anvil${c.reset} ${c.dim}[${blocks} blocks]${c.reset} ${c.gray}(${walletTag})${c.reset} ${c.cyan}>${c.reset} `;

  rl.question(p, (input) => {
    handleInput(input);
    prompt();
  });
}

// ============================================================================
// STARTUP
// ============================================================================

console.log('');
console.log(`  ${c.dim}${'='.repeat(58)}${c.reset}`);
console.log('');
console.log(`  ${c.bold}${c.purple}   ___    _   ___    __ ___  _     ${c.reset}`);
console.log(`  ${c.bold}${c.purple}  / _ |  / | / / |  / //  / / /    ${c.reset}`);
console.log(`  ${c.bold}${c.purple} / __ | /  |/ /| | / // / / / /__  ${c.reset}`);
console.log(`  ${c.bold}${c.purple}/_/ |_|/_/|__/ |_|/_//_/ /_/____/  ${c.reset}`);
console.log(`  ${c.bold}${c.purple}              C H A I N            ${c.reset}`);
console.log('');
console.log(`  ${c.dim}${'='.repeat(58)}${c.reset}`);
console.log(`  ${c.gray}A sandbox recreation of Bitcoin's core mechanics.${c.reset}`);
console.log(`  ${c.gray}Not real cryptocurrency. Built for learning.${c.reset}`);
console.log('');
console.log(`  ${c.gray}Command:    ${c.bold}${c.cyan}anvil-chain${c.reset}`);
console.log(`  ${c.gray}Help:       ${c.cyan}/help${c.reset}`);
console.log(`  ${c.gray}Learn:      ${c.cyan}/explain mine${c.reset}`);
console.log(`  ${c.gray}Autocomplete: ${c.cyan}Tab${c.reset}`);
console.log(`  ${c.dim}${'='.repeat(58)}${c.reset}`);
console.log('');

prompt();
