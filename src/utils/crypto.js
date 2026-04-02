// ============================================================================
// Cryptographic Utilities
// ============================================================================
// All crypto operations in one place. Uses Node.js built-in 'crypto' module
// so there are zero external dependencies for the core chain.
//
// SECURITY NOTE (educational):
//   - We use SHA-256 for hashing (same as Bitcoin).
//   - We use Ed25519 for digital signatures (modern, fast, secure).
//   - This is real cryptography, but the *system around it* is simplified.
//   - A production blockchain needs peer review, formal audits, and more.
// ============================================================================

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Hashing — SHA-256
// ---------------------------------------------------------------------------
// SHA-256 produces a fixed 256-bit (64 hex character) digest.
// Even a tiny change in input produces a completely different hash.
// This "avalanche effect" is what makes blockchains tamper-evident.
// ---------------------------------------------------------------------------

/**
 * Hash any string with SHA-256 and return the hex digest.
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ---------------------------------------------------------------------------
// Digital Signatures — Ed25519
// ---------------------------------------------------------------------------
// Every wallet has a key pair:
//   - Private key: kept secret, used to SIGN transactions.
//   - Public key:  shared freely, used to VERIFY signatures.
//
// When Alice sends coins, she signs the transaction with her private key.
// Anyone can verify the signature using her public key, proving:
//   1. Alice authorized the transaction (authenticity).
//   2. The transaction wasn't altered after signing (integrity).
// ---------------------------------------------------------------------------

/**
 * Generate a new Ed25519 key pair.
 * Returns { publicKey, privateKey } as hex strings.
 */
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('hex'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex'),
  };
}

/**
 * Sign a message with a private key (hex string).
 * Returns the signature as a hex string.
 */
function sign(message, privateKeyHex) {
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(privateKeyHex, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });

  return crypto.sign(null, Buffer.from(message), privateKey).toString('hex');
}

/**
 * Verify a signature against a message and public key (hex strings).
 * Returns true if the signature is valid.
 */
function verify(message, signatureHex, publicKeyHex) {
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKeyHex, 'hex'),
      format: 'der',
      type: 'spki',
    });

    return crypto.verify(
      null,
      Buffer.from(message),
      publicKey,
      Buffer.from(signatureHex, 'hex')
    );
  } catch {
    // If the key or signature is malformed, verification fails.
    return false;
  }
}

module.exports = { sha256, generateKeyPair, sign, verify };
