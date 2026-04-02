#!/usr/bin/env node

// ============================================================================
// Anvil CLI
// ============================================================================
// An interactive command-line interface for the Anvil blockchain.
//
// Commands:
//   help           — show available commands
//   create-wallet  — generate a new wallet (key pair)
//   load-wallet    — load a wallet from a file
//   balance        — check balance of the current wallet
//   send           — send coins to another address
//   mine           — mine a block (process pending transactions + earn reward)
//   pending        — view pending transactions
//   chain          — view the full blockchain
//   validate       — check if the chain is valid
//   info           — show chain stats
//   exit           — quit the CLI
//
// This operates on a LOCAL blockchain instance (no network).
// For networked mode, use the node server (npm run node).
// ============================================================================

const readline = require('readline');
const path = require('path');
const Blockchain = require('../blockchain/chain');
const Wallet = require('../blockchain/wallet');
const config = require('../../config');

// --- State ---
const blockchain = new Blockchain();
let currentWallet = null;

// --- Readline interface ---
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ============================================================================
// Pretty printing helpers
// ============================================================================
function line(char = '─', len = 50) {
  return char.repeat(len);
}

function header(title) {
  console.log(`\n  ${line()}`);
  console.log(`  ${title}`);
  console.log(`  ${line()}`);
}

function printBlock(block) {
  console.log(`\n  Block #${block.index}`);
  console.log(`  ${line('─', 40)}`);
  console.log(`  Timestamp:    ${new Date(block.timestamp).toISOString()}`);
  console.log(`  Transactions: ${block.transactions.length}`);
  console.log(`  Nonce:        ${block.nonce}`);
  console.log(`  Prev Hash:    ${block.previousHash.substring(0, 20)}...`);
  console.log(`  Hash:         ${block.hash.substring(0, 20)}...`);

  for (const tx of block.transactions) {
    const sender = tx.sender === 'MINING_REWARD' ? 'COINBASE' : tx.sender.substring(0, 12) + '..';
    const receiver = tx.receiver.substring(0, 12) + '..';
    console.log(`    ${sender} -> ${receiver}  ${tx.amount} ${config.COIN_SYMBOL}`);
  }
}

// ============================================================================
// Command handlers
// ============================================================================

function cmdHelp() {
  header(`${config.COIN_NAME} CLI — Commands`);
  console.log(`
  create-wallet .... Generate a new wallet
  load-wallet ..... Load wallet from file
  balance ......... Check your balance
  send <addr> <amt> Send coins
  mine ............ Mine a block
  pending ......... View pending transactions
  chain ........... View the blockchain
  validate ........ Validate the chain
  info ............ Show chain stats
  exit ............ Quit
  `);
}

function cmdCreateWallet() {
  currentWallet = Wallet.create();

  const walletsDir = path.join(process.cwd(), 'wallets');
  const filePath = path.join(walletsDir, `wallet-${Date.now()}.json`);
  currentWallet.save(filePath);

  header('New Wallet Created');
  console.log(`  Address: ${currentWallet.shortAddress}`);
  console.log(`  Saved:   ${filePath}`);
  console.log(`\n  IMPORTANT: Your private key is in that file.`);
  console.log(`  Never share it with anyone!`);
}

function cmdLoadWallet(args) {
  const filePath = args[0];
  if (!filePath) {
    console.log('  Usage: load-wallet <path-to-wallet.json>');
    return;
  }

  try {
    currentWallet = Wallet.load(filePath);
    header('Wallet Loaded');
    console.log(`  Address: ${currentWallet.shortAddress}`);
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
}

function cmdBalance() {
  if (!currentWallet) {
    console.log('  No wallet loaded. Run: create-wallet');
    return;
  }

  const balance = blockchain.getBalance(currentWallet.publicKey);
  header('Balance');
  console.log(`  Address: ${currentWallet.shortAddress}`);
  console.log(`  Balance: ${balance} ${config.COIN_SYMBOL}`);
}

function cmdSend(args) {
  if (!currentWallet) {
    console.log('  No wallet loaded. Run: create-wallet');
    return;
  }

  const receiver = args[0];
  const amount = parseFloat(args[1]);

  if (!receiver || isNaN(amount)) {
    console.log('  Usage: send <receiver-address> <amount>');
    return;
  }

  try {
    const tx = currentWallet.createTransaction(receiver, amount);
    blockchain.addTransaction(tx);
    console.log(`  Transaction created: ${amount} ${config.COIN_SYMBOL} -> ${receiver.substring(0, 16)}...`);
    console.log(`  It will be included in the next mined block.`);
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
}

function cmdMine() {
  if (!currentWallet) {
    console.log('  No wallet loaded. Run: create-wallet');
    return;
  }

  header('Mining');
  const block = blockchain.minePendingTransactions(currentWallet.publicKey);
  console.log(`\n  You earned ${config.BLOCK_REWARD} ${config.COIN_SYMBOL} for mining this block!`);
}

function cmdPending() {
  const pending = blockchain.pendingTransactions;

  header(`Pending Transactions (${pending.length})`);

  if (pending.length === 0) {
    console.log('  No pending transactions.');
    return;
  }

  for (const tx of pending) {
    const sender = tx.sender === 'MINING_REWARD' ? 'COINBASE' : tx.sender.substring(0, 12) + '..';
    const receiver = tx.receiver.substring(0, 12) + '..';
    console.log(`  ${sender} -> ${receiver}  ${tx.amount} ${config.COIN_SYMBOL}`);
  }
}

function cmdChain() {
  header(`${config.COIN_NAME} Blockchain (${blockchain.chain.length} blocks)`);

  for (const block of blockchain.chain) {
    printBlock(block);
  }
}

function cmdValidate() {
  header('Chain Validation');
  const valid = blockchain.isValid();
  console.log(`  Chain is ${valid ? 'VALID' : 'INVALID'}`);
}

function cmdInfo() {
  header(`${config.COIN_NAME} Info`);
  console.log(`  Coin:         ${config.COIN_NAME} (${config.COIN_SYMBOL})`);
  console.log(`  Blocks:       ${blockchain.chain.length}`);
  console.log(`  Difficulty:   ${blockchain.difficulty}`);
  console.log(`  Block Reward: ${blockchain.blockReward} ${config.COIN_SYMBOL}`);
  console.log(`  Pending Tx:   ${blockchain.pendingTransactions.length}`);
}

// ============================================================================
// Main loop
// ============================================================================
function prompt() {
  const walletTag = currentWallet ? currentWallet.shortAddress : 'no wallet';
  rl.question(`  anvil (${walletTag}) > `, (input) => {
    const parts = input.trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'help':           cmdHelp(); break;
      case 'create-wallet':  cmdCreateWallet(); break;
      case 'load-wallet':    cmdLoadWallet(args); break;
      case 'balance':        cmdBalance(); break;
      case 'send':           cmdSend(args); break;
      case 'mine':           cmdMine(); break;
      case 'pending':        cmdPending(); break;
      case 'chain':          cmdChain(); break;
      case 'validate':       cmdValidate(); break;
      case 'info':           cmdInfo(); break;
      case 'exit':
      case 'quit':
        console.log('\n  Goodbye!\n');
        rl.close();
        process.exit(0);
        break;
      default:
        if (command) console.log(`  Unknown command: ${command}. Type "help" for commands.`);
        break;
    }

    prompt();
  });
}

// --- Start ---
console.log(`\n  ========================================`);
console.log(`   Welcome to ${config.COIN_NAME} (${config.COIN_SYMBOL})`);
console.log(`   A beginner-friendly blockchain`);
console.log(`  ========================================`);
console.log(`  Type "help" for available commands.\n`);

prompt();
