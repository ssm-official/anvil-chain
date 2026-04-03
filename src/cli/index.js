#!/usr/bin/env node

// ============================================================================
// Anvil Chain CLI
// ============================================================================
// Uses inquirer for ALL input — no readline conflicts.
// Type commands in the input prompt, or just press Enter for the menu.
// ============================================================================

const path = require('path');
const Blockchain = require('../blockchain/chain');
const Wallet = require('../blockchain/wallet');
const config = require('../../config');

// --- State ---
const blockchain = new Blockchain();
const wallets = [];
let activeIdx = -1;
function aw() { return activeIdx >= 0 ? wallets[activeIdx] : null; }

let inq = null; // inquirer module (loaded async)

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
function err(m){console.log('\n  '+c.red+m+c.reset)}
function gap(){console.log('')}

function short(a) {
  if (!a) return 'none';
  if (a.length <= 20) return a;
  const u = a.length > 24 ? a.substring(24) : a;
  return u.substring(0, 12) + '...';
}

function needW() {
  if (!aw()) { err('No wallet active. Run /wallet create'); return false; }
  return true;
}

// ============================================================================
// PROMPT — single inquirer input, handles typed commands or opens menu
// ============================================================================

async function prompt() {
  const wl = aw();
  const tag = wl ? `#${activeIdx+1} ${short(wl.publicKey)}` : 'no wallet';
  const blocks = blockchain.chain.length;
  const label = `${c.purple}anvil${c.reset} ${c.dim}[${blocks}]${c.reset} ${c.gray}(${tag})${c.reset} ${c.cyan}>${c.reset}`;

  const { input } = await inq.prompt([{
    type: 'input',
    name: 'input',
    message: label,
    prefix: '',
  }]);

  const trimmed = input.trim();

  if (!trimmed) {
    // Empty enter = open the main menu
    await runMenu();
  } else {
    await handleTyped(trimmed);
  }

  return prompt();
}

// ============================================================================
// MAIN MENU
// ============================================================================

async function runMenu() {
  const { action } = await inq.prompt([{
    type: 'list',
    name: 'action',
    message: 'What do you want to do?',
    pageSize: 20,
    choices: [
      new inq.Separator(`${c.dim}--- Wallet ---${c.reset}`),
      { name: 'Create a new wallet', value: 'wallet-create' },
      { name: 'List all wallets', value: 'wallet-list' },
      { name: 'Switch active wallet', value: 'wallet-switch' },
      { name: 'Wallet info + full address', value: 'wallet-info' },
      { name: 'Load wallet from file', value: 'wallet-load' },
      new inq.Separator(`${c.dim}--- Blockchain ---${c.reset}`),
      { name: 'Mine a block', value: 'mine' },
      { name: 'Check balance', value: 'balance' },
      { name: 'Send coins', value: 'send' },
      { name: 'View the chain', value: 'chain' },
      { name: 'View mempool', value: 'pending' },
      { name: 'Validate chain', value: 'validate' },
      { name: 'Chain stats', value: 'info' },
      new inq.Separator(`${c.dim}--- Learn ---${c.reset}`),
      { name: 'Explain a topic (how Bitcoin works)', value: 'explain' },
      new inq.Separator(`${c.dim}--- System ---${c.reset}`),
      { name: 'Clear terminal', value: 'clear' },
      { name: 'Exit', value: 'exit' },
    ],
  }]);

  await runAction(action);
}

// ============================================================================
// ACTION RUNNER — from menu selections
// ============================================================================

async function runAction(action) {
  switch (action) {
    case 'wallet-create': cmdWalletCreate(); break;
    case 'wallet-list':   cmdWalletList(); break;
    case 'wallet-info':   cmdWalletInfo(); break;
    case 'wallet-switch': await interactiveWalletSwitch(); break;
    case 'wallet-load':   await interactiveWalletLoad(); break;
    case 'mine':          cmdMine(); break;
    case 'balance':       cmdBalance(); break;
    case 'send':          await interactiveSend(); break;
    case 'chain':         cmdChain(); break;
    case 'pending':       cmdPending(); break;
    case 'validate':      cmdValidate(); break;
    case 'info':          cmdInfo(); break;
    case 'explain':       await interactiveExplain(); break;
    case 'clear':         console.clear(); break;
    case 'exit':
      console.log(`\n  ${c.gray}Goodbye. Run ${c.cyan}anvil-chain${c.gray} to start again.${c.reset}\n`);
      process.exit(0);
  }
}

// ============================================================================
// INTERACTIVE PROMPTS (for menu-triggered actions that need more input)
// ============================================================================

async function interactiveExplain() {
  const { topic } = await inq.prompt([{
    type: 'list',
    name: 'topic',
    message: 'What do you want to learn about?',
    pageSize: 12,
    choices: [
      { name: 'Mining — how proof-of-work works', value: 'mine' },
      { name: 'Wallets — keys, addresses, ownership', value: 'wallet' },
      { name: 'Transactions — signing and verification', value: 'transaction' },
      { name: 'Blocks — structure and hashing', value: 'block' },
      { name: 'Blockchain — tamper-evidence', value: 'chain' },
      { name: 'Consensus — how the network agrees', value: 'consensus' },
      { name: 'Difficulty — what controls mining speed', value: 'difficulty' },
      { name: 'Block Reward — how new coins are created', value: 'reward' },
      { name: 'Hashing — SHA-256 and why it matters', value: 'hash' },
      { name: 'Genesis Block — where it all started', value: 'genesis' },
    ],
  }]);
  cmdExplain(topic);
}

async function interactiveWalletSwitch() {
  if (wallets.length === 0) { err('No wallets. Run /wallet create first.'); gap(); return; }

  const { idx } = await inq.prompt([{
    type: 'list',
    name: 'idx',
    message: 'Switch to which wallet?',
    choices: wallets.map((wl, i) => {
      const bal = blockchain.getBalance(wl.publicKey);
      const tag = i === activeIdx ? ' (active)' : '';
      return { name: `#${i+1}  ${short(wl.publicKey)}  ${bal} ${config.COIN_SYMBOL}${tag}`, value: i };
    }),
  }]);
  cmdWalletSwitch(idx);
}

async function interactiveWalletLoad() {
  const { fp } = await inq.prompt([{
    type: 'input',
    name: 'fp',
    message: 'Path to wallet JSON file:',
    validate: v => v.trim().length > 0 || 'Path required',
  }]);
  cmdWalletLoad(fp.trim());
}

async function interactiveSend() {
  if (!needW()) return;
  const { address, amount } = await inq.prompt([
    {
      type: 'input',
      name: 'address',
      message: 'Recipient address:',
      validate: v => v.trim().length > 0 || 'Address required',
    },
    {
      type: 'input',
      name: 'amount',
      message: `Amount (${config.COIN_SYMBOL}):`,
      validate: v => (!isNaN(parseFloat(v)) && parseFloat(v) > 0) || 'Enter a positive number',
    },
  ]);
  cmdSend(address.trim(), parseFloat(amount));
}

// ============================================================================
// TYPED COMMAND HANDLER — parses /slash commands typed directly
// ============================================================================

async function handleTyped(raw) {
  const norm = raw.startsWith('/') ? raw.substring(1) : raw;
  const parts = norm.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const sub_ = parts[1]?.toLowerCase();
  const rest = parts.slice(2);

  switch (cmd) {
    case 'help': case 'h': await runMenu(); return;
    case 'clear': case 'cls': console.clear(); return;
    case 'exit': case 'quit': case 'q':
      console.log(`\n  ${c.gray}Goodbye. Run ${c.cyan}anvil-chain${c.gray} to start again.${c.reset}\n`);
      process.exit(0);

    case 'mine': cmdMine(); return;
    case 'balance': case 'bal': cmdBalance(); return;
    case 'chain': cmdChain(); return;
    case 'pending': case 'mempool': cmdPending(); return;
    case 'validate': cmdValidate(); return;
    case 'info': cmdInfo(); return;

    case 'wallet': case 'w':
      if (sub_ === 'create' || sub_ === 'new') { cmdWalletCreate(); return; }
      if (sub_ === 'list' || sub_ === 'ls') { cmdWalletList(); return; }
      if (sub_ === 'info' || sub_ === 'show') { cmdWalletInfo(); return; }
      if (sub_ === 'switch' || sub_ === 'use') {
        const n = parseInt(rest[0]);
        if (!isNaN(n) && n >= 1 && n <= wallets.length) { cmdWalletSwitch(n - 1); return; }
        await interactiveWalletSwitch(); return;
      }
      if (sub_ === 'load') {
        if (rest[0]) { cmdWalletLoad(rest[0]); return; }
        await interactiveWalletLoad(); return;
      }
      err('Usage: /wallet <create|list|switch|info|load>'); gap(); return;

    case 'send':
      if (parts[1] && !isNaN(parseFloat(parts[2]))) {
        cmdSend(parts[1], parseFloat(parts[2])); return;
      }
      await interactiveSend(); return;

    case 'explain': case 'ex': case 'learn':
      if (sub_ && sub_ !== 'list' && EXPLAINS[sub_]) { cmdExplain(sub_); return; }
      await interactiveExplain(); return;

    default:
      err(`Unknown command: ${cmd}`);
      console.log(`  ${c.gray}Type /help or press Enter for the menu.${c.reset}`);
      gap();
  }
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

  Both Bitcoin and this sandbox use SHA-256.
`,
genesis: `
  ${c.bold}${c.white}What is the genesis block?${c.reset}

  Block #0. No predecessor. Every blockchain starts here.

  ${c.cyan}In Bitcoin:${c.reset} Mined Jan 3 2009 by Satoshi Nakamoto.
  Contains: "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks"

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
  const wl = aw();
  header(`Wallet #${activeIdx + 1}`);
  row('Short', short(wl.publicKey));
  row('Full Address', wl.publicKey);
  row('Balance', `${c.bold}${c.green}${blockchain.getBalance(wl.publicKey)} ${config.COIN_SYMBOL}${c.reset}`);
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
  row('Wallet', `#${activeIdx+1}  ${short(aw().publicKey)}`);
  row('Balance', `${c.bold}${c.green}${blockchain.getBalance(aw().publicKey)} ${config.COIN_SYMBOL}${c.reset}`);
  gap();
}

function cmdSend(address, amount) {
  if (!needW()) return;
  try {
    const tx = aw().createTransaction(address, amount);
    blockchain.addTransaction(tx);
    ok(`Transaction queued: ${amount} ${config.COIN_SYMBOL}`);
    row('From', short(aw().publicKey));
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
  const block = blockchain.minePendingTransactions(aw().publicKey);
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
  if (blockchain.isValid()) ok('Chain is VALID. No tampering detected.');
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
// STARTUP
// ============================================================================

async function main() {
  inq = (await import('inquirer')).default;

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
  console.log(`  ${c.gray}Command:  ${c.bold}${c.cyan}anvil-chain${c.reset}`);
  console.log(`  ${c.gray}Menu:     Press ${c.cyan}Enter${c.gray} or type ${c.cyan}/help${c.reset}`);
  console.log(`  ${c.gray}Type:     ${c.cyan}/mine${c.gray}, ${c.cyan}/balance${c.gray}, ${c.cyan}/explain mine${c.gray}, etc.${c.reset}`);
  console.log(`  ${c.dim}${'='.repeat(58)}${c.reset}`);
  console.log('');

  prompt();
}

main();
