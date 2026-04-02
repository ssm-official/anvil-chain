// ============================================================================
// Wallet
// ============================================================================
// A wallet is just a key pair:
//   - Public key  = your "address" (like a bank account number)
//   - Private key = your "password" (NEVER share this)
//
// The wallet can:
//   - Generate a new key pair
//   - Create and sign transactions
//   - Save/load keys to disk (so you don't lose your wallet)
//
// HOW ADDRESSES WORK:
//   In this system, your address IS your public key (hex string).
//   In Bitcoin, the address is a shortened, checksummed version of the
//   public key. We keep it simple here — public key = address.
//
// SECURITY NOTE:
//   Private keys are stored as plain text files. In a real wallet, you'd
//   encrypt them with a passphrase. Never share your private key!
// ============================================================================

const fs = require('fs');
const path = require('path');
const { generateKeyPair } = require('../utils/crypto');
const Transaction = require('./transaction');

class Wallet {
  constructor(publicKey = null, privateKey = null) {
    this.publicKey = publicKey;   // This is your address
    this.privateKey = privateKey; // Keep this secret!
  }

  // ---------------------------------------------------------------------------
  // Generate a brand new wallet with fresh keys.
  // ---------------------------------------------------------------------------
  static create() {
    const keys = generateKeyPair();
    return new Wallet(keys.publicKey, keys.privateKey);
  }

  // ---------------------------------------------------------------------------
  // Create and sign a transaction.
  //
  // Steps:
  //   1. Build a Transaction object (sender=our public key).
  //   2. Sign it with our private key.
  //   3. Return the signed transaction (ready to submit to the chain).
  // ---------------------------------------------------------------------------
  createTransaction(receiverAddress, amount) {
    const tx = new Transaction(this.publicKey, receiverAddress, amount);
    tx.signTransaction(this.privateKey);
    return tx;
  }

  // ---------------------------------------------------------------------------
  // Save wallet keys to a JSON file.
  // In a real system you'd encrypt this with a password.
  // ---------------------------------------------------------------------------
  save(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          publicKey: this.publicKey,
          privateKey: this.privateKey,
        },
        null,
        2
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Load a wallet from a saved JSON file.
  // ---------------------------------------------------------------------------
  static load(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Wallet file not found: ${filePath}`);
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return new Wallet(data.publicKey, data.privateKey);
  }

  // ---------------------------------------------------------------------------
  // Get a short, readable version of the address (first 16 hex characters).
  // ---------------------------------------------------------------------------
  get shortAddress() {
    return this.publicKey ? this.publicKey.substring(0, 16) + '...' : 'none';
  }
}

module.exports = Wallet;
