#!/usr/bin/env node

// ============================================================================
// Anvil Chain CLI
// ============================================================================
// Type commands freely OR use interactive menus.
// /help opens an arrow-key menu. You can also type /mine directly.
// ============================================================================

const readline = require('readline');
const path = require('path');
const fs = require('fs');
const Blockchain = require('../blockchain/chain');
const Wallet = require('../blockchain/wallet');
const config = require('../../config');

// --- State ---
const blockchain = new Blockchain();
const wallets = [];
let activeIdx = -1;
function w() { return activeIdx >= 0 ? wallets[activeIdx] : null; }

// inquirer loaded async (it's ESM)
let inquirer = null;

// ============================================================================
// UI
// ============================================================================
const c = {
  reset:'\x1b[0m', bold:'\x1b[1m', dim:'\x1b[2m',
  purple:'\x1b[35m', cyan:'\x1b[36m', green:'\x1b[32m',
  yellow:'\x1b[33m', red:'\x1b[31m', gray:'\x1b[90m', white:'\x1b[37m',
};

function ln(ch='-',len=58){return c.dim+ch.repeat(len)+c.reset}
function header(t){console.log('\n  '+ln()+'\n  '+c.bold+c.purple+t+c.reset+'\n  '+ln())}
function sub(t){console.log('\n  '+c.cyan+c.bold+t+c.reset)}
function row(l,v){console.log('  '+c.gray+l+':'+c.reset+' '+v)}
function ok(m){console.log('\n  '+c.green+m+c.reset)}
function warn(m){console.log('\n  '+c.yellow+m+c.reset)}
function err(m){console.log('\n  '+c.red+m+c.reset)}
function gap(){console.log('')}

function short(a) {
  if (!a) return 'none';
  if (a.length <= 20) return a;
  const u = a.length > 24 ? a.substring(24) : a;
  return u.substring(0, 12) + '...';
}

function needW() {
  if (!w()) { err('No wallet active. Run /wallet create first.'); return false; }
  return true;
}

// ============================================================================
// INTERACTIVE MENUS (inquirer)
// ============================================================================

async function menuMain() {
  const { action } = await inquirer.default.prompt([{
    type: 'list',
    name: 'action',
    message: 'What do you want to do?',
    pageSize: 15,
    choices: [
      new inquirer.default.Separator('--- Wallet ---'),
      { name: 'Create a new wallet', value: 'wallet create' },
      { name: 'List all wallets', value: 'wallet list' },
      { name: 'Switch active wallet', value: 'wallet switch' },
      { name: 'Wallet info + full address', value: 'wallet info' },
      { name: 'Load wallet from file', value: 'wallet load' },
      new inquirer.default.Separator('--- Blockchain ---'),
      { name: 'Mine a block', value: 'mine' },
      { name: 'Check balance', value: 'balance' },
      { name: 'Send coins', value: 'send' },
      { name: 'View the chain', value: 'chain' },
      { name: 'View mempool (pending tx)', value: 'pending' },
      { name: 'Validate chain integrity', value: 'validate' },
      { name: 'Chain info / stats', value: 'info' },
      new inquirer.default.Separator('--- Learn ---'),
      { name: 'Explain a topic (how Bitcoin works)', value: 'explain' },
      new inquirer.default.Separator('--- System ---'),
      { name: 'Clear terminal', value: 'clear' },
      { name: 'Exit', value: 'exit' },
    ],
  }]);
  return action;
}

async function menuExplain() {
  const topics = {
    'Mining — how proof-of-work works': 'mine',
    'Wallets — keys, addresses, ownership': 'wallet',
    'Transactions — signing and verification': 'transaction',
    'Blocks — structure and hashing': 'block',
    'The Blockchain — tamper-evidence': 'chain',
    'Consensus — how the network agrees': 'consensus',
    'Difficulty — what controls mining speed': 'difficulty',
    'Block Reward — how new coins are created': 'reward',
    'Hashing — SHA-256 and why it matters': 'hash',
    'Genesis Block — where it all started': 'genesis',
  };

  const { topic } = await inquirer.default.prompt([{
    type: 'list',
    name: 'topic',
    message: 'What do you want to learn about?',
    pageSize: 12,
    choices: Object.entries(topics).map(([name, value]) => ({ name, value })),
  }]);
  return topic;
}

async function menuWalletSwitch() {
  if (wallets.length === 0) { err('No wallets. Run /wallet create first.'); return null; }
  const choices = wallets.map((wl, i) => {
    const bal = blockchain.getBalance(wl.publicKey);
    const tag = i === activeIdx ? ' (active)' : '';
    return { name: `#${i+1}  ${short(wl.publicKey)}  ${bal} ${config.COIN_SYMBOL}${tag}`, value: i };
  });

  const { idx } = await inquirer.default.prompt([{
    type: 'list',
    name: 'idx',
    message: 'Switch to which wallet?',
    choices,
  }]);
  return idx;
}

async function menuSend() {
  if (!needW()) return null;
  const { address, amount } = await inquirer.default.prompt([
    {
      type: 'input',
      name: 'address',
      message: 'Recipient address:',
      validate: v => v.trim().length > 0 ? true : 'Address required',
    },
    {
      type: 'input',
      name: 'amount',
      message: `Amount (${config.COIN_SYMBOL}):`,
      validate: v => {
        const n = parseFloat(v);
        if (isNaN(n) || n <= 0) return 'Enter a positive number';
        return true;
      },
    },
  ]);
  return { address: address.trim(), amount: parseFloat(amount) };
}

async function menuWalletLoad() {
  const { filePath } = await inquirer.default.prompt([{
    type: 'input',
    name: 'filePath',
    message: 'Path to wallet JSON file:',
    validate: v => v.trim().length > 0 ? true : 'Path required',
  }]);
  return filePath.trim();
}

// ============================================================================
// EXPLANATIONS
// ============================================================================

const EXPLAINS = {
mine: `
  ${c.bold}${c.white}What is mining?${c.reset}

  Mining adds new blocks to the blockchain:

    1. Collect pending transactions
    2. Bundle them into a candidate block
    3. Hash with different nonce values
    4. Keep going until the hash starts with enough zeros

  This is ${c.bold}proof-of-work${c.reset}.

  ${c.cyan}In Bitcoin:${c.reset}
    - Requires ASIC hardware ($5K-$15K per unit)
    - ~10 minutes per block for the entire network
    - Miners compete globally — first valid hash wins
    - Difficulty adjusts every 2016 blocks
    - Current reward: 3.125 BTC (~$200K+ per block)

  ${c.yellow}In this sandbox:${c.reset}
    - ~1 second on a laptop. Same SHA-256, just easier.
    - Difficulty fixed at ${config.MINING_DIFFICULTY}
`,
wallet: `
  ${c.bold}${c.white}What is a wallet?${c.reset}

    ${c.green}Public key${c.reset}  = your address. Share freely.
    ${c.red}Private key${c.reset} = your secret. Signs transactions. NEVER share.

  Lose the private key = lose the coins forever.

  ${c.cyan}In Bitcoin:${c.reset} ECDSA (secp256k1), Base58Check addresses
  ${c.yellow}In this sandbox:${c.reset} Ed25519, raw hex keys, plain JSON storage
`,
transaction: `
  ${c.bold}${c.white}What is a transaction?${c.reset}

  A signed instruction: "I authorize sending X coins to Y."

  ${c.cyan}In Bitcoin:${c.reset} UTXO model, Script system, transaction fees
  ${c.yellow}In this sandbox:${c.reset} Account balances, no fees, no Script
`,
block: `
  ${c.bold}${c.white}What is a block?${c.reset}

  A container: transactions + index + timestamp + previousHash + nonce + hash.
  Each block stores the hash of the previous one — that's the "chain."

  ${c.cyan}In Bitcoin:${c.reset} 80-byte header, Merkle root, ~2000-3000 tx, ~10 min
  ${c.yellow}In this sandbox:${c.reset} Flat array, max ${config.MAX_TRANSACTIONS_PER_BLOCK} tx per block
`,
chain: `
  ${c.bold}${c.white}What is the blockchain?${c.reset}

  A linked list of blocks. Change any block and everything after it breaks.
  Rewriting history requires re-mining everything — the 51% attack problem.

  ${c.cyan}In Bitcoin:${c.reset} 800,000+ blocks, ~600GB, started Jan 3 2009
  ${c.yellow}In this sandbox:${c.reset} In-memory only (lost when you exit)
`,
consensus: `
  ${c.bold}${c.white}What is Nakamoto consensus?${c.reset}

  1. Anyone can propose a block by mining it
  2. Nodes accept the longest valid chain
  3. Forks resolve when one chain gets ahead
  Requires >50% of hash power to attack.

  ${c.cyan}In Bitcoin:${c.reset} ~20,000 nodes, P2P gossip protocol
  ${c.yellow}In this sandbox:${c.reset} Local HTTP nodes, same longest-chain rule
`,
difficulty: `
  ${c.bold}${c.white}What is mining difficulty?${c.reset}

  Hash must start with N zeros:
    Difficulty 1: instant  |  3: ~1s  |  5: ~minutes
    Bitcoin: ~19 hex zeros for 600 EH/s network

  ${c.cyan}In Bitcoin:${c.reset} Adjusts every 2016 blocks
  ${c.yellow}In this sandbox:${c.reset} Fixed at ${config.MINING_DIFFICULTY}
`,
reward: `
  ${c.bold}${c.white}What is the block reward?${c.reset}

  New coins for the miner — the "coinbase transaction."
  The ONLY way new coins enter circulation.

  ${c.cyan}In Bitcoin:${c.reset} 50 -> 25 -> 12.5 -> 6.25 -> 3.125 BTC (halves every ~4 years)
  Total cap: 21,000,000 BTC. Runs out ~2140.

  ${c.yellow}In this sandbox:${c.reset} Fixed ${config.BLOCK_REWARD} ${config.COIN_SYMBOL}. No halving, no cap.
`,
hash: `
  ${c.bold}${c.white}What is a hash?${c.reset}

  SHA-256: any input -> fixed 64-char hex output.
  Deterministic, one-way, avalanche effect, collision-resistant.
  Change one bit of input = ~50% of output bits flip.

  Both Bitcoin and this sandbox use SHA-256.
`,
genesis: `
  ${c.bold}${c.white}What is the genesis block?${c.reset}

  Block #0. No predecessor. Every blockchain starts here.

  ${c.cyan}In Bitcoin:${c.reset} Mined Jan 3 2009 by Satoshi Nakamoto.
  Contains: "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks"
  The 50 BTC reward is unspendable (by design).

  ${c.yellow}In this sandbox:${c.reset} "${config.GENESIS_MESSAGE}"
`,
};

// ============================================================================
// COMMAND IMPLEMENTATIONS
// ============================================================================

function cmdWalletCreate() {
  const wl = Wallet.create();
  const dir = path.join(process.cwd(), 'wallets');
  const fp = path.join(dir, `wallet-${Date.now()}.json`);
  wl.save(fp);
  wallets.push(wl);
  activeIdx = wallets.length - 1;

  header('Wallet Created');
  row('Wallet #', activeIdx + 1);
  row('Short', short(wl.publicKey));
  row('Full Address', wl.publicKey);
  row('Saved', fp);
  gap();
  console.log(`  ${c.yellow}Your private key is in that file. Never share it.${c.reset}`);
  gap();
}

function cmdWalletList() {
  header(`Wallets (${wallets.length})`);
  if (wallets.length === 0) { console.log(`  ${c.gray}No wallets yet.${c.reset}`); gap(); return; }
  for (let i = 0; i < wallets.length; i++) {
    const wl = wallets[i];
    const bal = blockchain.getBalance(wl.publicKey);
    const tag = i === activeIdx ? `${c.green} *active*${c.reset}` : '';
    console.log(`\n  ${c.bold}#${i+1}${c.reset}  ${short(wl.publicKey)}  ${c.green}${bal} ${config.COIN_SYMBOL}${c.reset}${tag}`);
    console.log(`       ${c.dim}${wl.publicKey}${c.reset}`);
  }
  gap();
}

function cmdWalletSwitch(idx) {
  activeIdx = idx;
  const wl = wallets[activeIdx];
  ok(`Switched to wallet #${idx + 1}`);
  row('Address', short(wl.publicKey));
  row('Balance', `${blockchain.getBalance(wl.publicKey)} ${config.COIN_SYMBOL}`);
  gap();
}

function cmdWalletInfo() {
  if (!needW()) return;
  const wl = w();
  const bal = blockchain.getBalance(wl.publicKey);
  header(`Wallet #${activeIdx + 1}`);
  row('Short', short(wl.publicKey));
  row('Full Address', wl.publicKey);
  row('Balance', `${c.bold}${c.green}${bal} ${config.COIN_SYMBOL}${c.reset}`);
  gap();
}

function cmdWalletLoad(fp) {
  try {
    const wl = Wallet.load(fp);
    wallets.push(wl);
    activeIdx = wallets.length - 1;
    ok(`Wallet loaded as #${wallets.length}`);
    row('Address', short(wl.publicKey));
    gap();
  } catch (e) { err(e.message); gap(); }
}

function cmdBalance() {
  if (!needW()) return;
  header('Balance');
  row('Wallet', `#${activeIdx+1}  ${short(w().publicKey)}`);
  row('Balance', `${c.bold}${c.green}${blockchain.getBalance(w().publicKey)} ${config.COIN_SYMBOL}${c.reset}`);
  gap();
}

function cmdSend(address, amount) {
  if (!needW()) return;
  try {
    const tx = w().createTransaction(address, amount);
    blockchain.addTransaction(tx);
    ok(`Transaction queued: ${amount} ${config.COIN_SYMBOL}`);
    row('From', short(w().publicKey));
    row('To', short(address));
    gap();
    console.log(`  ${c.gray}Waiting to be included in a mined block.${c.reset}`);
    gap();
  } catch (e) { err(e.message); gap(); }
}

function cmdMine() {
  if (!needW()) return;
  header('Mining');
  console.log(`  ${c.gray}Finding a nonce where SHA-256 starts with "${'0'.repeat(blockchain.difficulty)}"...${c.reset}`);
  console.log(`  ${c.gray}(In real Bitcoin this takes ~10 min with specialized hardware)${c.reset}`);
  gap();
  const block = blockchain.minePendingTransactions(w().publicKey);
  ok(`Block #${block.index} mined successfully.`);
  gap();
  row('Nonce', block.nonce);
  row('Hash', block.hash);
  row('Transactions', block.transactions.length);
  row('Reward', `+${config.BLOCK_REWARD} ${config.COIN_SYMBOL} (coinbase)`);
  gap();
}

function cmdPending() {
  const p = blockchain.pendingTransactions;
  header(`Mempool (${p.length} pending)`);
  if (!p.length) { console.log(`  ${c.gray}Empty.${c.reset}`); gap(); return; }
  for (const tx of p) {
    const s = tx.sender === 'MINING_REWARD' ? 'COINBASE' : short(tx.sender);
    console.log(`  ${s}  ->  ${short(tx.receiver)}  ${c.green}${tx.amount} ${config.COIN_SYMBOL}${c.reset}`);
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
      const s = tx.sender === 'MINING_REWARD' ? `${c.yellow}COINBASE${c.reset}` : short(tx.sender);
      console.log(`\n    ${s}  ->  ${short(tx.receiver)}`);
      console.log(`    ${c.green}${tx.amount} ${config.COIN_SYMBOL}${c.reset}`);
    }
  }
  gap();
}

function cmdValidate() {
  header('Chain Validation');
  console.log(`  ${c.gray}Checking hashes, links, signatures...${c.reset}`);
  gap();
  const valid = blockchain.isValid();
  if (valid) ok('Chain is VALID. No tampering detected.');
  else err('Chain is INVALID.');
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

function cmdExplain(topic) {
  if (EXPLAINS[topic]) console.log(EXPLAINS[topic]);
  else { err(`Unknown topic: ${topic}`); gap(); }
}

// ============================================================================
// COMMAND ROUTER — handles both typed commands and menu results
// ============================================================================

async function handleAction(action) {
  switch (action) {
    case 'help':           await runMenu(); return;
    case 'wallet create':  cmdWalletCreate(); break;
    case 'wallet list':    cmdWalletList(); break;
    case 'wallet switch': {
      const idx = await menuWalletSwitch();
      if (idx !== null) cmdWalletSwitch(idx);
      break;
    }
    case 'wallet info':    cmdWalletInfo(); break;
    case 'wallet load': {
      const fp = await menuWalletLoad();
      if (fp) cmdWalletLoad(fp);
      break;
    }
    case 'mine':           cmdMine(); break;
    case 'balance':        cmdBalance(); break;
    case 'send': {
      const data = await menuSend();
      if (data) cmdSend(data.address, data.amount);
      break;
    }
    case 'chain':          cmdChain(); break;
    case 'pending':        cmdPending(); break;
    case 'validate':       cmdValidate(); break;
    case 'info':           cmdInfo(); break;
    case 'explain': {
      const topic = await menuExplain();
      cmdExplain(topic);
      break;
    }
    case 'clear':          console.clear(); break;
    case 'exit':
      console.log(`\n  ${c.gray}Goodbye. Run ${c.cyan}anvil-chain${c.gray} to start again.${c.reset}\n`);
      process.exit(0);
    default:
      err(`Unknown: ${action}`);
      console.log(`  ${c.gray}Type /help for menu. Press Tab for autocomplete.${c.reset}`);
      gap();
  }
}

async function runMenu() {
  const action = await menuMain();
  await handleAction(action);
}

// ============================================================================
// TYPED INPUT PARSER — maps raw text to actions
// ============================================================================

function parseInput(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const norm = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed;
  const parts = norm.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const sub_ = parts[1]?.toLowerCase();
  const rest = parts.slice(2);

  // Direct mappings
  if (cmd === 'help' || cmd === 'h') return { action: 'help' };
  if (cmd === 'clear' || cmd === 'cls') return { action: 'clear' };
  if (cmd === 'exit' || cmd === 'quit' || cmd === 'q') return { action: 'exit' };
  if (cmd === 'mine') return { action: 'mine' };
  if (cmd === 'balance' || cmd === 'bal') return { action: 'balance' };
  if (cmd === 'chain') return { action: 'chain' };
  if (cmd === 'pending' || cmd === 'mempool') return { action: 'pending' };
  if (cmd === 'validate') return { action: 'validate' };
  if (cmd === 'info') return { action: 'info' };

  // Wallet subcommands
  if (cmd === 'wallet' || cmd === 'w') {
    if (sub_ === 'create' || sub_ === 'new') return { action: 'wallet create' };
    if (sub_ === 'list' || sub_ === 'ls') return { action: 'wallet list' };
    if (sub_ === 'info' || sub_ === 'show') return { action: 'wallet info' };
    if (sub_ === 'switch' || sub_ === 'use') {
      const num = parseInt(rest[0]);
      if (!isNaN(num) && num >= 1 && num <= wallets.length)
        return { action: 'wallet switch direct', idx: num - 1 };
      return { action: 'wallet switch' }; // open menu
    }
    if (sub_ === 'load') {
      if (rest[0]) return { action: 'wallet load direct', path: rest[0] };
      return { action: 'wallet load' }; // open menu
    }
    return { action: 'wallet unknown' };
  }

  // Send — can be typed directly or open menu
  if (cmd === 'send') {
    const addr = parts[1];
    const amt = parseFloat(parts[2]);
    if (addr && !isNaN(amt)) return { action: 'send direct', address: addr, amount: amt };
    return { action: 'send' }; // open interactive menu
  }

  // Explain
  if (cmd === 'explain' || cmd === 'ex' || cmd === 'learn') {
    if (sub_ && sub_ !== 'list' && EXPLAINS[sub_]) return { action: 'explain direct', topic: sub_ };
    return { action: 'explain' }; // open menu
  }

  return { action: cmd };
}

// ============================================================================
// MAIN LOOP
// ============================================================================

const COMMANDS = [
  '/help','/wallet create','/wallet list','/wallet switch','/wallet info','/wallet load',
  '/balance','/send','/mine','/chain','/pending','/validate','/info',
  '/explain','/explain mine','/explain wallet','/explain transaction','/explain block',
  '/explain chain','/explain consensus','/explain difficulty','/explain reward',
  '/explain hash','/explain genesis','/clear','/exit',
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

async function prompt() {
  if (rl.closed) return;
  const wl = w();
  const tag = wl ? `#${activeIdx+1} ${short(wl.publicKey)}` : 'no wallet';
  const blocks = blockchain.chain.length;
  const p = `  ${c.purple}anvil${c.reset} ${c.dim}[${blocks} blocks]${c.reset} ${c.gray}(${tag})${c.reset} ${c.cyan}>${c.reset} `;

  rl.question(p, async (input) => {
    const parsed = parseInput(input);
    if (!parsed) { prompt(); return; }

    // Handle direct-data actions without opening menus
    switch (parsed.action) {
      case 'wallet switch direct': cmdWalletSwitch(parsed.idx); break;
      case 'wallet load direct':   cmdWalletLoad(parsed.path); break;
      case 'send direct':          cmdSend(parsed.address, parsed.amount); break;
      case 'explain direct':       cmdExplain(parsed.topic); break;
      case 'wallet unknown':
        err('Usage: /wallet <create|list|switch|info|load>'); gap(); break;
      default:
        // Close readline temporarily so inquirer can take over
        rl.pause();
        try { await handleAction(parsed.action); } catch(e) {}
        rl.resume();
        break;
    }

    prompt();
  });
}

// ============================================================================
// STARTUP
// ============================================================================

async function main() {
  // Load inquirer (ESM module)
  inquirer = await import('inquirer');

  rl.on('close', () => process.exit(0));

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
  console.log(`  ${c.gray}Command:      ${c.bold}${c.cyan}anvil-chain${c.reset}`);
  console.log(`  ${c.gray}Menu:         ${c.cyan}/help${c.gray}  (arrow keys to pick)${c.reset}`);
  console.log(`  ${c.gray}Autocomplete: ${c.cyan}Tab${c.reset}`);
  console.log(`  ${c.gray}Type freely:  ${c.cyan}/mine${c.gray}, ${c.cyan}/balance${c.gray}, ${c.cyan}/send${c.gray}, etc.${c.reset}`);
  console.log(`  ${c.dim}${'='.repeat(58)}${c.reset}`);
  console.log('');

  prompt();
}

main();
