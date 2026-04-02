// ============================================================================
// NFTs (Non-Fungible Tokens)
// ============================================================================
// An NFT is a unique digital token on the blockchain. Unlike regular coins
// (which are all identical — "fungible"), each NFT is one-of-a-kind.
//
// HOW THIS MAPS TO REAL ETHEREUM (ERC-721):
//   - ERC-721 is the standard interface for NFTs on Ethereum.
//   - Key functions: ownerOf(tokenId), transferFrom(from, to, tokenId),
//     balanceOf(owner), tokenURI(tokenId)
//   - Our implementation covers the same concepts in a simpler way.
//
// WHAT MAKES AN NFT UNIQUE:
//   - Each NFT has a unique tokenId (hash-based, like a fingerprint)
//   - Metadata describes it: name, description, custom properties
//   - Ownership is tracked on-chain — only the owner can transfer it
//   - Full provenance history: every transfer is recorded forever
//
// REAL-WORLD USES:
//   - Digital art, collectibles, game items
//   - Proof of ownership for real-world assets
//   - Event tickets, membership passes
//   - Domain names (ENS on Ethereum)
// ============================================================================

const crypto = require('crypto');

// ============================================================================
// NFT — a single non-fungible token
// ============================================================================
// In ERC-721 terms, this is one token instance.
// The tokenId is like the uint256 tokenId in Solidity.
// Metadata is what tokenURI() would point to (usually IPFS JSON in practice).
// ============================================================================

class NFT {
  constructor({ tokenId, creator, owner, metadata, createdAt, history }) {
    this.tokenId = tokenId;          // Unique identifier (hash string)
    this.creator = creator;          // Original minter's wallet address
    this.owner = owner;              // Current owner's wallet address
    this.metadata = metadata || {};  // { name, description, properties }
    this.createdAt = createdAt || Date.now();

    // Provenance chain — every transfer is recorded here.
    // In Ethereum, this would be a series of Transfer events in the logs.
    // Having it directly on the token makes it easy to inspect.
    this.history = history || [
      {
        type: 'mint',
        from: null,
        to: creator,
        timestamp: this.createdAt,
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Serialize to plain JSON for storage/transmission.
  // -------------------------------------------------------------------------
  toJSON() {
    return {
      tokenId: this.tokenId,
      creator: this.creator,
      owner: this.owner,
      metadata: this.metadata,
      createdAt: this.createdAt,
      history: this.history,
    };
  }

  // -------------------------------------------------------------------------
  // Recreate an NFT from saved JSON data.
  // -------------------------------------------------------------------------
  static fromJSON(json) {
    return new NFT({
      tokenId: json.tokenId,
      creator: json.creator,
      owner: json.owner,
      metadata: json.metadata,
      createdAt: json.createdAt,
      history: json.history,
    });
  }
}

// ============================================================================
// NFTRegistry — tracks all NFTs on the chain
// ============================================================================
// This is like the ERC-721 contract itself. In Ethereum, a single NFT contract
// (e.g., Bored Ape Yacht Club) manages all tokens in that collection.
// Our registry manages ALL NFTs on the Anvil chain.
//
// Key operations:
//   mint()      — create a new NFT (like _mint in ERC-721)
//   transfer()  — move an NFT to a new owner (like transferFrom)
//   getById()   — look up an NFT by tokenId (like ownerOf + tokenURI)
//   getByOwner()— get all NFTs owned by an address (like balanceOf + enumeration)
// ============================================================================

class NFTRegistry {
  constructor() {
    // All NFTs indexed by tokenId for O(1) lookup
    // In Solidity: mapping(uint256 => NFT) private _tokens;
    this.tokens = new Map();

    // Index of owner -> [tokenId, ...] for fast owner queries
    // In Solidity: mapping(address => uint256[]) private _ownedTokens;
    this.ownerIndex = new Map();
  }

  // -------------------------------------------------------------------------
  // Mint (create) a new NFT.
  //
  // Parameters:
  //   creator  — wallet address of the person minting
  //   metadata — { name, description, properties } describing the NFT
  //
  // Returns: the newly created NFT
  //
  // In ERC-721: function _mint(address to, uint256 tokenId) internal
  // The big difference: in Ethereum, tokenIds are usually sequential integers.
  // Here, we generate a hash-based ID for uniqueness.
  // -------------------------------------------------------------------------
  mint(creator, metadata = {}) {
    if (!creator) {
      throw new Error('Creator address is required to mint an NFT');
    }

    if (!metadata.name) {
      throw new Error('NFT must have a name in metadata');
    }

    // Generate a unique tokenId by hashing the creator + metadata + timestamp
    // This ensures every NFT has a unique, deterministic-ish identifier.
    // In Ethereum, tokenIds are often sequential (1, 2, 3...) or random.
    const tokenId = this._generateTokenId(creator, metadata);

    // Make sure this ID doesn't already exist (extremely unlikely but safe)
    if (this.tokens.has(tokenId)) {
      throw new Error('Token ID collision — try minting again');
    }

    // Create the NFT
    const nft = new NFT({
      tokenId,
      creator,
      owner: creator,  // Minter starts as the owner
      metadata: {
        name: metadata.name,
        description: metadata.description || '',
        properties: metadata.properties || {},
      },
    });

    // Store it in our registry
    this.tokens.set(tokenId, nft);

    // Update the owner index
    if (!this.ownerIndex.has(creator)) {
      this.ownerIndex.set(creator, []);
    }
    this.ownerIndex.get(creator).push(tokenId);

    return nft;
  }

  // -------------------------------------------------------------------------
  // Transfer an NFT from one address to another.
  //
  // Only the current owner can transfer their NFT.
  // Every transfer is recorded in the NFT's history for provenance.
  //
  // In ERC-721:
  //   function transferFrom(address from, address to, uint256 tokenId) public
  //   Requires: msg.sender == owner || isApprovedForAll(owner, msg.sender)
  //
  // We skip the "approval" system for simplicity, but in a real NFT contract,
  // you can approve another address to transfer on your behalf (e.g., a
  // marketplace contract).
  // -------------------------------------------------------------------------
  transfer(tokenId, from, to) {
    if (!tokenId || !from || !to) {
      throw new Error('tokenId, from, and to are all required');
    }

    // Look up the NFT
    const nft = this.tokens.get(tokenId);
    if (!nft) {
      throw new Error(`NFT with tokenId "${tokenId}" not found`);
    }

    // Only the owner can transfer (no approval system in this simple version)
    if (nft.owner !== from) {
      throw new Error(
        `Transfer failed: "${from}" is not the owner of token "${tokenId}". ` +
        `Current owner is "${nft.owner}".`
      );
    }

    // Can't transfer to yourself
    if (from === to) {
      throw new Error('Cannot transfer to yourself');
    }

    // Update ownership
    nft.owner = to;

    // Record the transfer in provenance history
    nft.history.push({
      type: 'transfer',
      from,
      to,
      timestamp: Date.now(),
    });

    // Update the owner index: remove from old owner, add to new owner
    const fromTokens = this.ownerIndex.get(from);
    if (fromTokens) {
      const idx = fromTokens.indexOf(tokenId);
      if (idx !== -1) fromTokens.splice(idx, 1);
      // Clean up empty arrays
      if (fromTokens.length === 0) this.ownerIndex.delete(from);
    }

    if (!this.ownerIndex.has(to)) {
      this.ownerIndex.set(to, []);
    }
    this.ownerIndex.get(to).push(tokenId);

    return nft;
  }

  // -------------------------------------------------------------------------
  // Get all NFTs owned by a specific address.
  // In ERC-721 Enumerable: balanceOf(owner) + tokenOfOwnerByIndex(owner, i)
  // -------------------------------------------------------------------------
  getByOwner(address) {
    const tokenIds = this.ownerIndex.get(address) || [];
    return tokenIds.map((id) => this.tokens.get(id)).filter(Boolean);
  }

  // -------------------------------------------------------------------------
  // Get a single NFT by its tokenId.
  // In ERC-721: ownerOf(tokenId) + tokenURI(tokenId)
  // -------------------------------------------------------------------------
  getById(tokenId) {
    const nft = this.tokens.get(tokenId);
    if (!nft) return null;
    return nft;
  }

  // -------------------------------------------------------------------------
  // Get ALL NFTs in the registry.
  // Useful for exploring/browsing. In a real blockchain, you'd paginate this.
  // -------------------------------------------------------------------------
  getAll() {
    return Array.from(this.tokens.values());
  }

  // -------------------------------------------------------------------------
  // Get total number of NFTs minted.
  // In ERC-721 Enumerable: totalSupply()
  // -------------------------------------------------------------------------
  totalSupply() {
    return this.tokens.size;
  }

  // -------------------------------------------------------------------------
  // Serialize the entire registry to JSON.
  // -------------------------------------------------------------------------
  toJSON() {
    const allNFTs = this.getAll().map((nft) => nft.toJSON());
    return { tokens: allNFTs };
  }

  // -------------------------------------------------------------------------
  // Restore the registry from saved JSON data.
  // -------------------------------------------------------------------------
  static fromJSON(json) {
    const registry = new NFTRegistry();

    if (json && json.tokens) {
      for (const nftData of json.tokens) {
        const nft = NFT.fromJSON(nftData);
        registry.tokens.set(nft.tokenId, nft);

        // Rebuild the owner index
        if (!registry.ownerIndex.has(nft.owner)) {
          registry.ownerIndex.set(nft.owner, []);
        }
        registry.ownerIndex.get(nft.owner).push(nft.tokenId);
      }
    }

    return registry;
  }

  // -------------------------------------------------------------------------
  // Internal: generate a unique token ID.
  //
  // We hash the creator address + metadata + timestamp + random salt.
  // This gives us a unique, unpredictable identifier for each NFT.
  //
  // In Ethereum, token IDs are typically uint256 values. Collections often
  // use sequential IDs (1, 2, 3...) but some use random hashes like we do.
  // -------------------------------------------------------------------------
  _generateTokenId(creator, metadata) {
    const raw = [
      creator,
      metadata.name || '',
      metadata.description || '',
      JSON.stringify(metadata.properties || {}),
      Date.now().toString(),
      Math.random().toString(),
    ].join('|');

    return 'nft_' + crypto.createHash('sha256').update(raw).digest('hex').substring(0, 40);
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = { NFT, NFTRegistry };
