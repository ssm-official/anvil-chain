// ============================================================================
// Transaction
// ============================================================================
// A transaction records the transfer of coins from one address to another.
//
// Structure:
//   sender    — public key of the sender (or 'MINING_REWARD' for coinbase)
//   receiver  — public key of the receiver
//   amount    — number of coins transferred
//   timestamp — when the transaction was created
//   signature — digital signature proving the sender authorized this
//
// HOW SIGNING WORKS:
//   1. The sender creates a transaction (sender, receiver, amount, timestamp).
//   2. They hash the transaction data to get a compact digest.
//   3. They sign that digest with their private key.
//   4. Anyone can verify the signature with the sender's public key.
//
// SECURITY NOTE:
//   In a real system, you'd also include a nonce per account to prevent
//   replay attacks (re-submitting old valid transactions). We skip that
//   here because timestamps + chain validation keep things simple enough
//   for learning.
// ============================================================================

const { sha256, sign, verify } = require('../utils/crypto');

class Transaction {
  constructor(sender, receiver, amount) {
    this.sender = sender;
    this.receiver = receiver;
    this.amount = amount;
    this.timestamp = Date.now();
    this.signature = null;
  }

  // ---------------------------------------------------------------------------
  // Compute a hash of the transaction data (used for signing & verification).
  // The signature is NOT included in the hash — it's computed separately.
  // ---------------------------------------------------------------------------
  computeHash() {
    return sha256(
      this.sender + this.receiver + this.amount + this.timestamp
    );
  }

  // ---------------------------------------------------------------------------
  // Sign this transaction with the sender's private key.
  // After calling this, `this.signature` is set.
  // ---------------------------------------------------------------------------
  signTransaction(privateKey) {
    const hash = this.computeHash();
    this.signature = sign(hash, privateKey);
  }

  // ---------------------------------------------------------------------------
  // Validate that the transaction is properly formed and signed.
  //
  // Checks:
  //   1. Mining reward transactions don't need signatures (they're created
  //      by the system, not by a user).
  //   2. Amount must be positive (no zero or negative transfers).
  //   3. A signature must exist.
  //   4. The signature must be valid for this transaction's data.
  // ---------------------------------------------------------------------------
  isValid() {
    // Mining rewards are system-generated — no sender to sign.
    if (this.sender === 'MINING_REWARD') return true;

    if (!this.signature) {
      console.log('  [!] Transaction has no signature.');
      return false;
    }

    if (this.amount <= 0) {
      console.log('  [!] Transaction amount must be positive.');
      return false;
    }

    const hash = this.computeHash();
    const valid = verify(hash, this.signature, this.sender);

    if (!valid) {
      console.log('  [!] Transaction signature is invalid.');
    }

    return valid;
  }

  // ---------------------------------------------------------------------------
  // Convert to a plain object (for JSON serialization over the network).
  // ---------------------------------------------------------------------------
  toJSON() {
    return {
      sender: this.sender,
      receiver: this.receiver,
      amount: this.amount,
      timestamp: this.timestamp,
      signature: this.signature,
    };
  }

  // ---------------------------------------------------------------------------
  // Recreate a Transaction instance from a plain object.
  // ---------------------------------------------------------------------------
  static fromJSON(data) {
    const tx = new Transaction(data.sender, data.receiver, data.amount);
    tx.timestamp = data.timestamp;
    tx.signature = data.signature;
    return tx;
  }
}

module.exports = Transaction;
