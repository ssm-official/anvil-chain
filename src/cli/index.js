#!/usr/bin/env node

// ============================================================================
// Anvil CLI
// ============================================================================
// Interactive command-line interface with /slash commands.
//
// Core commands:
//   /help             Show all commands
//   /wallet create    Generate a new wallet
//   /wallet load      Load wallet from file
//   /wallet info      Show current wallet details
//   /balance          Check balance
//   /send             Send coins
//   /mine             Mine a block
//   /chain            View the blockchain
//   /pending          View pending transactions
//   /validate         Validate the chain
//   /info             Chain stats
//
// NFT commands:
//   /nft mint         Mint a new NFT
//   /nft list         List your NFTs
//   /nft all          List all NFTs on chain
//   /nft view         View NFT details
//   /nft transfer     Transfer an NFT
//
// Contract commands:
//   /contract deploy  Deploy a smart contract
//   /contract call    Call a contract method
//   /contract list    List deployed contracts
//   /contract view    View contract details
//   /contract templates  Show available contract templates
//
// System:
//   /clear            Clear the terminal
//   /exit             Quit
// ============================================================================

const readline = require('readline');
const path = require('path');
const Blockchain = require('../blockchain/chain');
const Wallet = require('../blockchain/wallet');
const { ContractVM, CONTRACT_TEMPLATES } = require('../blockchain/contract');
const { NFTRegistry } = require('../blockchain/nft');
const config = require('../../config');

// --- State ---
const blockchain = new Blockchain();
const contractVM = new ContractVM(config.CONTRACT_GAS_LIMIT || 1000);
const nftRegistry = new NFTRegistry();
const contracts = new Map(); // address -> Contract
let currentWallet = null;

// --- Readline ---
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ============================================================================
// UI Helpers
// ============================================================================

const COLORS = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  purple:  '\x1b[35m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
};

const c = COLORS;

function line(char = '-', len = 56) {
  return c.dim + char.repeat(len) + c.reset;
}

function header(title) {
  console.log('');
  console.log(`  ${line()}`);
  console.log(`  ${c.bold}${c.purple}${title}${c.reset}`);
  console.log(`  ${line()}`);
}

function subheader(title) {
  console.log(`\n  ${c.cyan}${title}${c.reset}`);
  console.log(`  ${c.dim}${'~'.repeat(title.length)}${c.reset}`);
}

function info(label, value) {
  console.log(`  ${c.gray}${label}:${c.reset} ${value}`);
}

function success(msg) {
  console.log(`  ${c.green}${msg}${c.reset}`);
}

function warn(msg) {
  console.log(`  ${c.yellow}${msg}${c.reset}`);
}

function err(msg) {
  console.log(`  ${c.red}${msg}${c.reset}`);
}

function shortAddr(addr) {
  if (!addr) return 'none';
  if (addr.length <= 20) return addr;
  return addr.substring(0, 16) + '..';
}

function requireWallet() {
  if (!currentWallet) {
    err('No wallet loaded. Run: /wallet create');
    return false;
  }
  return true;
}

// ============================================================================
// CORE COMMANDS
// ============================================================================

function cmdHelp() {
  header(`${config.COIN_NAME} CLI -- Commands`);

  subheader('Core');
  console.log(`  ${c.cyan}/wallet create${c.reset}           Generate a new wallet`);
  console.log(`  ${c.cyan}/wallet load ${c.gray}<file>${c.reset}      Load wallet from file`);
  console.log(`  ${c.cyan}/wallet info${c.reset}             Show wallet details`);
  console.log(`  ${c.cyan}/balance${c.reset}                 Check your balance`);
  console.log(`  ${c.cyan}/send ${c.gray}<addr> <amt>${c.reset}      Send ${config.COIN_SYMBOL} coins`);
  console.log(`  ${c.cyan}/mine${c.reset}                    Mine the next block`);
  console.log(`  ${c.cyan}/chain${c.reset}                   View the blockchain`);
  console.log(`  ${c.cyan}/pending${c.reset}                 View pending transactions`);
  console.log(`  ${c.cyan}/validate${c.reset}                Validate chain integrity`);
  console.log(`  ${c.cyan}/info${c.reset}                    Chain statistics`);

  if (config.ENABLE_NFTS) {
    subheader('NFTs');
    console.log(`  ${c.cyan}/nft mint ${c.gray}<name>${c.reset}        Mint a new NFT (costs ${config.NFT_MINT_COST} ${config.COIN_SYMBOL})`);
    console.log(`  ${c.cyan}/nft list${c.reset}                Your NFTs`);
    console.log(`  ${c.cyan}/nft all${c.reset}                 All NFTs on chain`);
    console.log(`  ${c.cyan}/nft view ${c.gray}<id>${c.reset}          View NFT details`);
    console.log(`  ${c.cyan}/nft transfer ${c.gray}<id> <to>${c.reset} Transfer an NFT`);
  }

  if (config.ENABLE_CONTRACTS) {
    subheader('Smart Contracts');
    console.log(`  ${c.cyan}/contract templates${c.reset}      Show built-in templates`);
    console.log(`  ${c.cyan}/contract deploy ${c.gray}<tpl>${c.reset}  Deploy from template`);
    console.log(`  ${c.cyan}/contract list${c.reset}           List deployed contracts`);
    console.log(`  ${c.cyan}/contract view ${c.gray}<addr>${c.reset}   View contract details`);
    console.log(`  ${c.cyan}/contract call ${c.gray}<addr> <method> [args...]${c.reset}`);
  }

  subheader('System');
  console.log(`  ${c.cyan}/clear${c.reset}                   Clear terminal`);
  console.log(`  ${c.cyan}/exit${c.reset}                    Quit`);
  console.log('');
}

function cmdWalletCreate() {
  currentWallet = Wallet.create();
  const walletsDir = path.join(process.cwd(), 'wallets');
  const filePath = path.join(walletsDir, `wallet-${Date.now()}.json`);
  currentWallet.save(filePath);

  header('Wallet Created');
  info('Address', shortAddr(currentWallet.publicKey));
  info('Full Key', c.dim + currentWallet.publicKey.substring(0, 40) + '..');
  info('Saved', filePath);
  console.log(`\n  ${c.yellow}Keep your wallet file safe. Never share your private key.${c.reset}`);
}

function cmdWalletLoad(args) {
  const filePath = args[0];
  if (!filePath) { err('Usage: /wallet load <path>'); return; }
  try {
    currentWallet = Wallet.load(filePath);
    header('Wallet Loaded');
    info('Address', shortAddr(currentWallet.publicKey));
  } catch (e) { err(e.message); }
}

function cmdWalletInfo() {
  if (!requireWallet()) return;
  const bal = blockchain.getBalance(currentWallet.publicKey);
  header('Wallet Info');
  info('Address', shortAddr(currentWallet.publicKey));
  info('Full Key', c.dim + currentWallet.publicKey);
  info('Balance', `${bal} ${config.COIN_SYMBOL}`);

  if (config.ENABLE_NFTS) {
    const nfts = nftRegistry.getByOwner(currentWallet.publicKey);
    info('NFTs Owned', nfts.length);
  }
}

function cmdBalance() {
  if (!requireWallet()) return;
  const bal = blockchain.getBalance(currentWallet.publicKey);
  header('Balance');
  info('Address', shortAddr(currentWallet.publicKey));
  info('Balance', `${c.bold}${c.green}${bal} ${config.COIN_SYMBOL}${c.reset}`);
}

function cmdSend(args) {
  if (!requireWallet()) return;
  const receiver = args[0];
  const amount = parseFloat(args[1]);
  if (!receiver || isNaN(amount)) { err('Usage: /send <address> <amount>'); return; }
  try {
    const tx = currentWallet.createTransaction(receiver, amount);
    blockchain.addTransaction(tx);
    success(`Transaction queued: ${amount} ${config.COIN_SYMBOL} -> ${shortAddr(receiver)}`);
    console.log(`  ${c.gray}Will be included in the next mined block.${c.reset}`);
  } catch (e) { err(e.message); }
}

function cmdMine() {
  if (!requireWallet()) return;
  header('Mining');
  const block = blockchain.minePendingTransactions(currentWallet.publicKey);
  console.log('');
  success(`Block #${block.index} mined successfully.`);
  success(`Reward: +${config.BLOCK_REWARD} ${config.COIN_SYMBOL}`);
}

function cmdPending() {
  const pending = blockchain.pendingTransactions;
  header(`Pending Transactions (${pending.length})`);
  if (pending.length === 0) { console.log(`  ${c.gray}No pending transactions.${c.reset}`); return; }
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
  const valid = blockchain.isValid();
  if (valid) success('Chain is VALID');
  else err('Chain is INVALID');
}

function cmdInfo() {
  header(`${config.COIN_NAME} Info`);
  info('Coin', `${config.COIN_NAME} (${config.COIN_SYMBOL})`);
  info('Blocks', blockchain.chain.length);
  info('Difficulty', blockchain.difficulty);
  info('Block Reward', `${blockchain.blockReward} ${config.COIN_SYMBOL}`);
  info('Pending Tx', blockchain.pendingTransactions.length);
  info('Contracts', config.ENABLE_CONTRACTS ? `enabled (${contracts.size} deployed)` : 'disabled');
  info('NFTs', config.ENABLE_NFTS ? `enabled (${nftRegistry.totalSupply()} minted)` : 'disabled');
}

// ============================================================================
// NFT COMMANDS
// ============================================================================

function cmdNftMint(args) {
  if (!config.ENABLE_NFTS) { err('NFTs are disabled in config.'); return; }
  if (!requireWallet()) return;
  const name = args.join(' ');
  if (!name) { err('Usage: /nft mint <name>  [optionally: /nft mint <name> | <description>]'); return; }

  const parts = name.split('|').map(s => s.trim());
  const nftName = parts[0];
  const nftDesc = parts[1] || '';

  // Check balance for mint cost
  const balance = blockchain.getBalance(currentWallet.publicKey);
  if (balance < config.NFT_MINT_COST) {
    err(`Insufficient balance. Minting costs ${config.NFT_MINT_COST} ${config.COIN_SYMBOL}. You have ${balance}.`);
    return;
  }

  try {
    const nft = nftRegistry.mint(currentWallet.publicKey, {
      name: nftName,
      description: nftDesc,
      properties: { mintedBy: shortAddr(currentWallet.publicKey) },
    });

    header('NFT Minted');
    info('Token ID', shortAddr(nft.tokenId));
    info('Name', nft.metadata.name);
    if (nftDesc) info('Description', nftDesc);
    info('Owner', shortAddr(nft.owner));
    info('Mint Cost', `${config.NFT_MINT_COST} ${config.COIN_SYMBOL}`);
    console.log(`\n  ${c.gray}Full ID: ${nft.tokenId}${c.reset}`);
  } catch (e) { err(e.message); }
}

function cmdNftList() {
  if (!config.ENABLE_NFTS) { err('NFTs are disabled in config.'); return; }
  if (!requireWallet()) return;

  const nfts = nftRegistry.getByOwner(currentWallet.publicKey);
  header(`Your NFTs (${nfts.length})`);

  if (nfts.length === 0) {
    console.log(`  ${c.gray}No NFTs. Mint one with /nft mint <name>${c.reset}`);
    return;
  }

  for (const nft of nfts) {
    console.log(`  ${c.cyan}${nft.metadata.name}${c.reset}  ${c.gray}${shortAddr(nft.tokenId)}${c.reset}`);
  }
}

function cmdNftAll() {
  if (!config.ENABLE_NFTS) { err('NFTs are disabled in config.'); return; }
  const all = nftRegistry.getAll();
  header(`All NFTs (${all.length})`);

  if (all.length === 0) {
    console.log(`  ${c.gray}No NFTs minted yet.${c.reset}`);
    return;
  }

  for (const nft of all) {
    console.log(`  ${c.cyan}${nft.metadata.name}${c.reset}  owner: ${shortAddr(nft.owner)}  ${c.gray}${shortAddr(nft.tokenId)}${c.reset}`);
  }
}

function cmdNftView(args) {
  if (!config.ENABLE_NFTS) { err('NFTs are disabled in config.'); return; }
  const id = args[0];
  if (!id) { err('Usage: /nft view <tokenId>'); return; }

  // Try partial match
  const all = nftRegistry.getAll();
  const nft = all.find(n => n.tokenId === id || n.tokenId.startsWith(id));

  if (!nft) { err(`NFT not found: ${id}`); return; }

  header(`NFT: ${nft.metadata.name}`);
  info('Token ID', nft.tokenId);
  info('Creator', shortAddr(nft.creator));
  info('Owner', shortAddr(nft.owner));
  info('Description', nft.metadata.description || '(none)');
  info('Created', new Date(nft.createdAt).toISOString());

  if (Object.keys(nft.metadata.properties || {}).length > 0) {
    subheader('Properties');
    for (const [k, v] of Object.entries(nft.metadata.properties)) {
      info(`  ${k}`, v);
    }
  }

  subheader('Provenance History');
  for (const entry of nft.history) {
    const from = entry.from ? shortAddr(entry.from) : 'genesis';
    const to = shortAddr(entry.to);
    console.log(`  ${c.gray}${entry.type}${c.reset}  ${from} -> ${to}  ${c.dim}${new Date(entry.timestamp).toISOString()}${c.reset}`);
  }
}

function cmdNftTransfer(args) {
  if (!config.ENABLE_NFTS) { err('NFTs are disabled in config.'); return; }
  if (!requireWallet()) return;
  const id = args[0];
  const to = args[1];
  if (!id || !to) { err('Usage: /nft transfer <tokenId> <toAddress>'); return; }

  // Partial match
  const all = nftRegistry.getAll();
  const nft = all.find(n => n.tokenId === id || n.tokenId.startsWith(id));
  if (!nft) { err(`NFT not found: ${id}`); return; }

  try {
    nftRegistry.transfer(nft.tokenId, currentWallet.publicKey, to);
    success(`NFT "${nft.metadata.name}" transferred to ${shortAddr(to)}`);
  } catch (e) { err(e.message); }
}

// ============================================================================
// CONTRACT COMMANDS
// ============================================================================

function cmdContractTemplates() {
  if (!config.ENABLE_CONTRACTS) { err('Contracts are disabled in config.'); return; }

  header('Contract Templates');
  console.log(`  Deploy with: ${c.cyan}/contract deploy <template-name>${c.reset}\n`);

  const templates = Object.keys(CONTRACT_TEMPLATES);
  for (const name of templates) {
    const code = CONTRACT_TEMPLATES[name];
    // Extract function names
    const fns = [];
    const regex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    let match;
    while ((match = regex.exec(code)) !== null) fns.push(match[1]);

    console.log(`  ${c.purple}${name}${c.reset}`);
    console.log(`  ${c.gray}Methods: ${fns.join(', ')}${c.reset}`);
    console.log('');
  }
}

function cmdContractDeploy(args) {
  if (!config.ENABLE_CONTRACTS) { err('Contracts are disabled in config.'); return; }
  if (!requireWallet()) return;
  const templateName = args[0];

  if (!templateName) {
    err('Usage: /contract deploy <template>');
    console.log(`  ${c.gray}Available: ${Object.keys(CONTRACT_TEMPLATES).join(', ')}${c.reset}`);
    return;
  }

  const code = CONTRACT_TEMPLATES[templateName];
  if (!code) {
    err(`Template "${templateName}" not found.`);
    console.log(`  ${c.gray}Available: ${Object.keys(CONTRACT_TEMPLATES).join(', ')}${c.reset}`);
    return;
  }

  try {
    const contract = contractVM.deploy(currentWallet.publicKey, code);
    contracts.set(contract.address, contract);

    header('Contract Deployed');
    info('Address', shortAddr(contract.address));
    info('Template', templateName);
    info('Owner', shortAddr(contract.owner));
    info('Methods', contract.abi.join(', '));
    console.log(`\n  ${c.gray}Full address: ${contract.address}${c.reset}`);
  } catch (e) { err(e.message); }
}

function cmdContractList() {
  if (!config.ENABLE_CONTRACTS) { err('Contracts are disabled in config.'); return; }

  header(`Deployed Contracts (${contracts.size})`);
  if (contracts.size === 0) {
    console.log(`  ${c.gray}No contracts deployed. Try: /contract deploy token${c.reset}`);
    return;
  }

  for (const [addr, ct] of contracts) {
    console.log(`  ${c.cyan}${shortAddr(addr)}${c.reset}  owner: ${shortAddr(ct.owner)}  methods: ${ct.abi.length}`);
  }
}

function cmdContractView(args) {
  if (!config.ENABLE_CONTRACTS) { err('Contracts are disabled in config.'); return; }
  const addr = args[0];
  if (!addr) { err('Usage: /contract view <address>'); return; }

  // Partial match
  const contract = findContract(addr);
  if (!contract) { err(`Contract not found: ${addr}`); return; }

  header(`Contract: ${shortAddr(contract.address)}`);
  info('Full Address', contract.address);
  info('Owner', shortAddr(contract.owner));
  info('Balance', `${contract.balance} ${config.COIN_SYMBOL}`);
  info('Methods', contract.abi.join(', '));
  info('Created', new Date(contract.createdAt).toISOString());

  subheader('State');
  const stateData = contract.state.toJSON();
  const keys = Object.keys(stateData);
  if (keys.length === 0) {
    console.log(`  ${c.gray}(empty)${c.reset}`);
  } else {
    for (const k of keys.slice(0, 20)) {
      const v = stateData[k];
      const display = typeof v === 'string' && v.length > 40 ? v.substring(0, 40) + '..' : v;
      console.log(`  ${c.gray}${k}${c.reset} = ${c.green}${display}${c.reset}`);
    }
    if (keys.length > 20) console.log(`  ${c.dim}...and ${keys.length - 20} more${c.reset}`);
  }
}

function cmdContractCall(args) {
  if (!config.ENABLE_CONTRACTS) { err('Contracts are disabled in config.'); return; }
  if (!requireWallet()) return;

  const addr = args[0];
  const method = args[1];
  const callArgs = args.slice(2).map(a => {
    // Try to parse numbers and booleans
    if (a === 'true') return true;
    if (a === 'false') return false;
    const n = Number(a);
    if (!isNaN(n) && a !== '') return n;
    return a;
  });

  if (!addr || !method) {
    err('Usage: /contract call <address> <method> [arg1] [arg2] ...');
    return;
  }

  const contract = findContract(addr);
  if (!contract) { err(`Contract not found: ${addr}`); return; }

  try {
    const result = contractVM.call(contract, method, callArgs, currentWallet.publicKey, 0);

    header('Contract Call');
    info('Contract', shortAddr(contract.address));
    info('Method', method);
    info('Gas Used', result.gasUsed);

    if (result.result !== undefined && result.result !== null) {
      subheader('Result');
      if (typeof result.result === 'object') {
        for (const [k, v] of Object.entries(result.result)) {
          const display = typeof v === 'string' && v.length > 40 ? shortAddr(v) : v;
          console.log(`  ${c.gray}${k}${c.reset}: ${c.green}${display}${c.reset}`);
        }
      } else {
        console.log(`  ${c.green}${result.result}${c.reset}`);
      }
    }

    if (result.events.length > 0) {
      subheader('Events');
      for (const evt of result.events) {
        console.log(`  ${c.yellow}${evt.event}${c.reset} ${c.gray}${JSON.stringify(evt.data)}${c.reset}`);
      }
    }
  } catch (e) { err(e.message); }
}

function findContract(partialAddr) {
  // Exact match first
  if (contracts.has(partialAddr)) return contracts.get(partialAddr);
  // Partial match
  for (const [addr, ct] of contracts) {
    if (addr.startsWith(partialAddr) || addr.includes(partialAddr)) return ct;
  }
  return null;
}

// ============================================================================
// COMMAND ROUTER
// ============================================================================

function handleInput(input) {
  const trimmed = input.trim();
  if (!trimmed) return;

  // Support both /command and plain command
  const normalized = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed;
  const parts = normalized.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const sub = parts[1]?.toLowerCase();
  const args = parts.slice(1);
  const subArgs = parts.slice(2);

  switch (cmd) {
    case 'help':    case 'h':  cmdHelp(); break;
    case 'clear':   case 'cls': console.clear(); break;
    case 'exit':    case 'quit': case 'q':
      console.log(`\n  ${c.gray}Goodbye.${c.reset}\n`);
      rl.close(); process.exit(0); break;

    // -- Wallet --
    case 'wallet':
      if (sub === 'create' || sub === 'new') cmdWalletCreate();
      else if (sub === 'load') cmdWalletLoad(subArgs);
      else if (sub === 'info') cmdWalletInfo();
      else { err('Usage: /wallet <create|load|info>'); }
      break;
    case 'create-wallet': cmdWalletCreate(); break;

    // -- Core --
    case 'balance':  case 'bal': cmdBalance(); break;
    case 'send':     cmdSend(args); break;
    case 'mine':     cmdMine(); break;
    case 'pending':  cmdPending(); break;
    case 'chain':    cmdChain(); break;
    case 'validate': cmdValidate(); break;
    case 'info':     cmdInfo(); break;

    // -- NFT --
    case 'nft':
      if (sub === 'mint') cmdNftMint(subArgs);
      else if (sub === 'list' || sub === 'my') cmdNftList();
      else if (sub === 'all') cmdNftAll();
      else if (sub === 'view' || sub === 'show') cmdNftView(subArgs);
      else if (sub === 'transfer' || sub === 'send') cmdNftTransfer(subArgs);
      else { err('Usage: /nft <mint|list|all|view|transfer>'); }
      break;

    // -- Contract --
    case 'contract': case 'ct':
      if (sub === 'deploy') cmdContractDeploy(subArgs);
      else if (sub === 'call') cmdContractCall(subArgs);
      else if (sub === 'list' || sub === 'ls') cmdContractList();
      else if (sub === 'view' || sub === 'show') cmdContractView(subArgs);
      else if (sub === 'templates' || sub === 'tpl') cmdContractTemplates();
      else { err('Usage: /contract <deploy|call|list|view|templates>'); }
      break;

    default:
      err(`Unknown command: ${cmd}`);
      console.log(`  ${c.gray}Type /help for available commands.${c.reset}`);
      break;
  }
}

// ============================================================================
// PROMPT
// ============================================================================

function prompt() {
  const walletTag = currentWallet ? shortAddr(currentWallet.publicKey) : 'no wallet';
  const blockCount = blockchain.chain.length;
  const prefix = `${c.purple}anvil${c.reset} ${c.dim}[${blockCount} blocks]${c.reset} ${c.gray}(${walletTag})${c.reset}`;

  rl.question(`  ${prefix} ${c.cyan}>${c.reset} `, (input) => {
    handleInput(input);
    prompt();
  });
}

// ============================================================================
// STARTUP
// ============================================================================

console.log('');
console.log(`  ${c.dim}${line('=', 56)}${c.reset}`);
console.log(`  ${c.bold}${c.purple} ANVIL${c.reset}  ${c.dim}${config.COIN_NAME} (${config.COIN_SYMBOL})${c.reset}`);
console.log(`  ${c.dim}${line('=', 56)}${c.reset}`);
console.log(`  ${c.gray}Educational blockchain sandbox.${c.reset}`);
console.log(`  ${c.gray}Type ${c.cyan}/help${c.gray} for commands.${c.reset}`);

if (config.ENABLE_CONTRACTS) {
  console.log(`  ${c.gray}Smart contracts: ${c.green}enabled${c.reset}`);
}
if (config.ENABLE_NFTS) {
  console.log(`  ${c.gray}NFTs: ${c.green}enabled${c.reset} ${c.dim}(mint cost: ${config.NFT_MINT_COST} ${config.COIN_SYMBOL})${c.reset}`);
}

console.log(`  ${c.dim}${line('=', 56)}${c.reset}`);
console.log('');

prompt();
