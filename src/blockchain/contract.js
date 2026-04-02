// ============================================================================
// Smart Contracts
// ============================================================================
// A smart contract is code that lives on the blockchain and runs automatically
// when someone interacts with it. Think of it like a vending machine:
//   - You put in money and press a button (call a method)
//   - The machine follows its programmed rules (executes code)
//   - Something happens (state changes, tokens move, events fire)
//
// HOW THIS MAPS TO REAL ETHEREUM/SOLIDITY:
//   - In Ethereum, contracts are written in Solidity and compiled to bytecode.
//   - The EVM (Ethereum Virtual Machine) executes that bytecode.
//   - Here, we use plain JavaScript and `new Function()` as our "VM".
//   - The concepts are the same: state, methods, msg.sender, gas, events.
//
// WHAT CONTRACTS CAN DO:
//   - Store data (like a database on the blockchain)
//   - Transfer value (send/receive ANV coins)
//   - Emit events (so external apps can react)
//   - Call other contracts (not implemented yet — an exercise for you!)
//
// SECURITY NOTE:
//   Real smart contracts are immutable once deployed. Here, we keep things
//   simpler for learning purposes. In production, you'd never use
//   `new Function()` — you'd use a proper sandboxed VM.
// ============================================================================

const crypto = require('crypto');

// ============================================================================
// Contract State — the key-value store each contract gets
// ============================================================================
// In Solidity, this is like the contract's storage variables.
// Every contract has its own isolated state that persists between calls.
// ============================================================================

class ContractState {
  constructor(initialData = {}) {
    this._data = { ...initialData };
    this._operationCount = 0; // Track operations for gas metering
  }

  /**
   * Read a value from contract storage.
   * Solidity equivalent: reading a state variable (e.g., `balances[addr]`)
   */
  get(key) {
    this._operationCount++;
    return this._data[key];
  }

  /**
   * Write a value to contract storage.
   * Solidity equivalent: writing a state variable (e.g., `balances[addr] = 100`)
   * This is the most expensive operation in a real blockchain — it changes
   * the world state that every node must store forever.
   */
  set(key, value) {
    this._operationCount++;
    this._data[key] = value;
  }

  /**
   * Check if a key exists in storage.
   */
  has(key) {
    this._operationCount++;
    return key in this._data;
  }

  /**
   * Delete a key from storage.
   * In Solidity, using `delete` on a variable refunds some gas.
   */
  delete(key) {
    this._operationCount++;
    delete this._data[key];
  }

  /**
   * Get all stored data (for serialization).
   */
  toJSON() {
    return { ...this._data };
  }

  /**
   * How many read/write operations have been performed?
   * Used for gas metering.
   */
  getOperationCount() {
    return this._operationCount;
  }

  resetOperationCount() {
    this._operationCount = 0;
  }
}

// ============================================================================
// Contract — a single smart contract on the chain
// ============================================================================
// Each contract has:
//   - address:  a unique identifier (like 0x... in Ethereum)
//   - owner:    the wallet that deployed it
//   - code:     the JavaScript source defining its methods
//   - state:    persistent key-value storage
//   - balance:  how much ANV the contract holds
//   - abi:      list of callable method names (like Solidity ABI)
// ============================================================================

class Contract {
  constructor({ address, owner, code, state, balance, abi, createdAt }) {
    this.address = address;        // Unique contract address
    this.owner = owner;            // Deployer's wallet address
    this.code = code;              // JS source code (string)
    this.state = new ContractState(state || {});
    this.balance = balance || 0;   // ANV held by this contract
    this.abi = abi || [];          // Method names this contract exposes
    this.createdAt = createdAt || Date.now();
    this.events = [];              // Log of emitted events (like Solidity events)
  }

  // -------------------------------------------------------------------------
  // Serialize the contract to plain JSON (for saving to blocks).
  // -------------------------------------------------------------------------
  toJSON() {
    return {
      address: this.address,
      owner: this.owner,
      code: this.code,
      state: this.state.toJSON(),
      balance: this.balance,
      abi: this.abi,
      createdAt: this.createdAt,
    };
  }

  // -------------------------------------------------------------------------
  // Recreate a Contract object from JSON data.
  // -------------------------------------------------------------------------
  static fromJSON(json) {
    return new Contract({
      address: json.address,
      owner: json.owner,
      code: json.code,
      state: json.state,
      balance: json.balance,
      abi: json.abi,
      createdAt: json.createdAt,
    });
  }
}

// ============================================================================
// ContractVM — the "virtual machine" that executes contract code
// ============================================================================
// In Ethereum, the EVM interprets bytecode opcodes.
// Here, we compile the contract's JS code into a function and run it in a
// limited sandbox. The sandbox provides:
//
//   state.get(key)       — read from storage
//   state.set(key, val)  — write to storage
//   msg.sender           — who is calling this method
//   msg.value            — how much ANV they sent with the call
//   this.balance         — the contract's current ANV balance
//   this.address         — the contract's address
//   emit(event, data)    — fire an event (like Solidity's `emit Transfer(...)`)
//
// GAS:
//   Every operation costs "gas". If the contract exceeds its gas limit,
//   execution is halted. This prevents infinite loops from freezing the chain.
//   In Ethereum, gas is paid with ETH. Here, we just count operations.
// ============================================================================

class ContractVM {
  constructor(gasLimit = 1000) {
    this.gasLimit = gasLimit;  // Max operations before we stop execution
  }

  // -------------------------------------------------------------------------
  // Deploy a new contract.
  // Returns a Contract instance with a generated address.
  //
  // In Ethereum, deploying a contract means sending a transaction with no
  // `to` address, and the data field contains the compiled bytecode.
  // The network assigns it an address based on the deployer + nonce.
  // -------------------------------------------------------------------------
  deploy(owner, code, initialState = {}) {
    // Generate a unique address for this contract
    // Real Ethereum: address = keccak256(rlp([sender, nonce]))[12:]
    const address = 'contract_' + crypto
      .createHash('sha256')
      .update(owner + code + Date.now().toString() + Math.random().toString())
      .digest('hex')
      .substring(0, 40);

    // Parse the code to discover which methods it exposes
    const abi = this._extractABI(code);

    const contract = new Contract({
      address,
      owner,
      code,
      state: initialState,
      balance: 0,
      abi,
    });

    // Run the constructor/init method if it exists
    try {
      this._execute(contract, 'init', [], owner, 0);
    } catch (err) {
      // init is optional — if it doesn't exist, that's fine
      if (!err.message.includes('Method "init" not found')) {
        throw new Error(`Contract deployment failed: ${err.message}`);
      }
    }

    return contract;
  }

  // -------------------------------------------------------------------------
  // Call a method on a deployed contract.
  //
  // Parameters:
  //   contract — the Contract instance to call
  //   method   — name of the method to invoke (string)
  //   args     — array of arguments to pass
  //   sender   — wallet address of the caller (msg.sender)
  //   value    — amount of ANV sent with this call (msg.value)
  //
  // Returns: { result, events, gasUsed }
  //
  // In Ethereum, this is like sending a transaction to a contract address
  // with calldata encoding the method name and arguments.
  // -------------------------------------------------------------------------
  call(contract, method, args = [], sender = null, value = 0) {
    if (!contract || !(contract instanceof Contract)) {
      throw new Error('Invalid contract');
    }

    // Add the value to the contract's balance (like sending ETH to a contract)
    contract.balance += value;

    // Reset operation count so we can measure gas for this call
    contract.state.resetOperationCount();
    contract.events = [];

    // Execute the method in our sandbox
    const result = this._execute(contract, method, args, sender, value);

    const gasUsed = contract.state.getOperationCount();

    return {
      result,
      events: [...contract.events],
      gasUsed,
    };
  }

  // -------------------------------------------------------------------------
  // Internal: execute contract code in a sandboxed environment.
  //
  // We use `new Function()` to create an isolated scope. The contract code
  // defines methods, and we call the requested one.
  //
  // IMPORTANT: This is NOT truly secure. A real blockchain VM would use
  // WebAssembly or a proper sandbox. This is for learning only!
  // -------------------------------------------------------------------------
  _execute(contract, method, args, sender, value) {
    const gasLimit = this.gasLimit;
    const state = contract.state;
    const events = contract.events;
    let opsCount = 0;

    // Build the sandbox — these are the only things contract code can access
    const sandbox = {
      // --- Storage ---
      state: {
        get: (key) => {
          opsCount++;
          if (opsCount > gasLimit) throw new Error('Out of gas! Execution halted.');
          return state.get(key);
        },
        set: (key, val) => {
          opsCount++;
          if (opsCount > gasLimit) throw new Error('Out of gas! Execution halted.');
          state.set(key, val);
        },
        has: (key) => {
          opsCount++;
          if (opsCount > gasLimit) throw new Error('Out of gas! Execution halted.');
          return state.has(key);
        },
        delete: (key) => {
          opsCount++;
          if (opsCount > gasLimit) throw new Error('Out of gas! Execution halted.');
          state.delete(key);
        },
      },

      // --- Message context (who is calling and how much they sent) ---
      // In Solidity: msg.sender and msg.value
      msg: {
        sender: sender,
        value: value,
      },

      // --- Contract info ---
      // In Solidity: address(this) and address(this).balance
      self: {
        balance: contract.balance,
        address: contract.address,
        owner: contract.owner,
      },

      // --- Events ---
      // In Solidity: emit Transfer(from, to, amount);
      emit: (eventName, data) => {
        opsCount++;
        if (opsCount > gasLimit) throw new Error('Out of gas! Execution halted.');
        events.push({
          event: eventName,
          data,
          timestamp: Date.now(),
        });
      },

      // --- Utility: revert with a reason (like Solidity's require/revert) ---
      require: (condition, message) => {
        if (!condition) {
          throw new Error(`Contract reverted: ${message || 'requirement not met'}`);
        }
      },
    };

    // Wrap the contract code so each method is accessible
    // The contract code should define methods like:
    //   function transfer(to, amount) { ... }
    //   function balanceOf(addr) { ... }
    //
    // We wrap it so we can call specific methods.
    const wrappedCode = `
      "use strict";
      const state = this.state;
      const msg = this.msg;
      const self = this.self;
      const emit = this.emit;
      const require = this.require;

      // --- Contract code starts here ---
      ${contract.code}
      // --- Contract code ends here ---

      // Call the requested method
      if (typeof ${method} !== 'function') {
        throw new Error('Method "${method}" not found in contract');
      }
      return ${method}.apply(null, __args__);
    `;

    try {
      // `new Function` creates a function from a string.
      // The first arguments are parameter names, the last is the body.
      // We bind `sandbox` as `this` so the contract code can access it.
      const fn = new Function('__args__', wrappedCode);
      return fn.call(sandbox, args);
    } catch (err) {
      // If the contract reverted or ran out of gas, we re-throw
      throw new Error(`Contract execution failed: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Extract method names from contract code (builds the ABI).
  // Looks for `function methodName(...)` patterns.
  // In Ethereum, the ABI is a JSON description of all callable functions.
  // -------------------------------------------------------------------------
  _extractABI(code) {
    const methodRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    const methods = [];
    let match;
    while ((match = methodRegex.exec(code)) !== null) {
      methods.push(match[1]);
    }
    return methods;
  }
}

// ============================================================================
// Built-in Contract Templates
// ============================================================================
// These are pre-written contracts you can deploy to learn from.
// Each one teaches a different smart contract pattern.
//
// In the real world, OpenZeppelin provides similar battle-tested templates.
// ============================================================================

const CONTRACT_TEMPLATES = {

  // ---------------------------------------------------------------------------
  // TOKEN CONTRACT
  // ---------------------------------------------------------------------------
  // Creates a fungible token (like ERC-20 on Ethereum).
  // The deployer starts with the entire supply. They can transfer tokens to
  // others, and anyone can check any address's balance.
  //
  // Solidity equivalent concepts:
  //   mapping(address => uint256) public balances;
  //   function transfer(address to, uint256 amount) public { ... }
  // ---------------------------------------------------------------------------
  token: `
    // Initialize the token — only runs once at deploy time
    function init() {
      state.set('name', 'MyToken');
      state.set('symbol', 'MTK');
      state.set('totalSupply', 1000);
      // Give all tokens to the deployer
      state.set('balance_' + msg.sender, 1000);
    }

    // Transfer tokens from caller to another address
    function transfer(to, amount) {
      require(to, 'Must specify a recipient');
      require(amount > 0, 'Amount must be positive');

      const senderBalance = state.get('balance_' + msg.sender) || 0;
      require(senderBalance >= amount, 'Insufficient token balance');

      const recipientBalance = state.get('balance_' + to) || 0;

      state.set('balance_' + msg.sender, senderBalance - amount);
      state.set('balance_' + to, recipientBalance + amount);

      emit('Transfer', { from: msg.sender, to: to, amount: amount });
      return true;
    }

    // Check the token balance of an address
    function balanceOf(addr) {
      return state.get('balance_' + addr) || 0;
    }

    // Get token info
    function info() {
      return {
        name: state.get('name'),
        symbol: state.get('symbol'),
        totalSupply: state.get('totalSupply'),
      };
    }
  `,

  // ---------------------------------------------------------------------------
  // ESCROW CONTRACT
  // ---------------------------------------------------------------------------
  // Holds funds until both buyer and seller agree the deal is done.
  // This is one of the most common smart contract use cases.
  //
  // Flow:
  //   1. Buyer deploys the escrow and sends ANV (msg.value)
  //   2. Seller delivers the goods/service off-chain
  //   3. Buyer calls release() to send funds to seller
  //   OR
  //   3. Buyer calls refund() to get their money back (only before release)
  //
  // Solidity equivalent: a basic Escrow contract with buyer, seller, release
  // ---------------------------------------------------------------------------
  escrow: `
    function init() {
      // The deployer is the buyer
      state.set('buyer', msg.sender);
      state.set('seller', null);
      state.set('amount', msg.value);
      state.set('released', false);
      state.set('refunded', false);
    }

    // Seller registers themselves
    function setSeller(sellerAddr) {
      require(msg.sender === state.get('buyer'), 'Only buyer can set seller');
      require(!state.get('seller'), 'Seller already set');
      state.set('seller', sellerAddr);
      emit('SellerSet', { seller: sellerAddr });
    }

    // Buyer releases funds to seller
    function release() {
      require(msg.sender === state.get('buyer'), 'Only buyer can release');
      require(state.get('seller'), 'No seller set');
      require(!state.get('released'), 'Already released');
      require(!state.get('refunded'), 'Already refunded');

      state.set('released', true);
      emit('FundsReleased', {
        to: state.get('seller'),
        amount: state.get('amount'),
      });
      return { to: state.get('seller'), amount: state.get('amount') };
    }

    // Buyer reclaims funds (before release)
    function refund() {
      require(msg.sender === state.get('buyer'), 'Only buyer can refund');
      require(!state.get('released'), 'Already released');
      require(!state.get('refunded'), 'Already refunded');

      state.set('refunded', true);
      emit('FundsRefunded', {
        to: state.get('buyer'),
        amount: state.get('amount'),
      });
      return { to: state.get('buyer'), amount: state.get('amount') };
    }

    // Check escrow status
    function status() {
      return {
        buyer: state.get('buyer'),
        seller: state.get('seller'),
        amount: state.get('amount'),
        released: state.get('released'),
        refunded: state.get('refunded'),
      };
    }
  `,

  // ---------------------------------------------------------------------------
  // VOTING CONTRACT
  // ---------------------------------------------------------------------------
  // A simple on-chain voting system. The deployer creates a proposal and
  // anyone can vote once. Transparent and tamper-proof!
  //
  // This demonstrates:
  //   - Access control (one vote per address)
  //   - Counting/aggregation in contract state
  //   - Time-based logic (voting deadline)
  //
  // Solidity equivalent: a simplified Governor / ballot contract
  // ---------------------------------------------------------------------------
  voting: `
    function init() {
      state.set('proposal', 'Default Proposal');
      state.set('creator', msg.sender);
      state.set('votesFor', 0);
      state.set('votesAgainst', 0);
      state.set('voterCount', 0);
      state.set('closed', false);
    }

    // Set the proposal text (only creator)
    function setProposal(text) {
      require(msg.sender === state.get('creator'), 'Only creator can set proposal');
      require(!state.get('closed'), 'Voting is closed');
      state.set('proposal', text);
      emit('ProposalSet', { text: text });
    }

    // Cast a vote: true = for, false = against
    function vote(support) {
      require(!state.get('closed'), 'Voting is closed');

      // Check if this address already voted (one vote per person!)
      const voterKey = 'voted_' + msg.sender;
      require(!state.get(voterKey), 'You have already voted');

      // Record the vote
      state.set(voterKey, true);
      state.set('voterCount', state.get('voterCount') + 1);

      if (support) {
        state.set('votesFor', state.get('votesFor') + 1);
      } else {
        state.set('votesAgainst', state.get('votesAgainst') + 1);
      }

      emit('VoteCast', { voter: msg.sender, support: support });
      return true;
    }

    // Close voting (only creator)
    function close() {
      require(msg.sender === state.get('creator'), 'Only creator can close voting');
      require(!state.get('closed'), 'Already closed');
      state.set('closed', true);

      const result = state.get('votesFor') > state.get('votesAgainst')
        ? 'PASSED' : 'REJECTED';
      emit('VotingClosed', { result: result });
      return result;
    }

    // Get current results
    function results() {
      return {
        proposal: state.get('proposal'),
        votesFor: state.get('votesFor'),
        votesAgainst: state.get('votesAgainst'),
        voterCount: state.get('voterCount'),
        closed: state.get('closed'),
      };
    }
  `,
};

// ============================================================================
// Exports
// ============================================================================

module.exports = { Contract, ContractState, ContractVM, CONTRACT_TEMPLATES };
