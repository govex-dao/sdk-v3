/**
 * Coin Registry Operations
 *
 * Registry of pre-created "blank" coin types for conditional tokens.
 * Solves the problem that coin types can't be created dynamically in Sui.
 * Allows proposal creators to acquire coin pairs without requiring two transactions.
 *
 * **Workflow:**
 * 1. Users deposit pre-created TreasuryCap/Metadata pairs into the registry
 * 2. Proposal creators acquire these pairs via `takeCoinSet` in their PTB
 * 3. Multiple pairs can be acquired in one transaction for N-outcome proposals
 * 4. Original depositor gets paid the fixed protocol listing fee when their coin set is taken
 *
 * @module coin-registry
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from './transaction';
import { validateObjectId } from '../utils/validation';

/**
 * Configuration for depositing a coin set
 */
export interface DepositCoinSetConfig {
  /** The BlankCoinsRegistry object ID */
  registryId: string;
  /** Currency<T> object ID (shared, from coin_registry::finalize) - needed to read decimals */
  currencyId: string;
  /** TreasuryCap object ID for the blank coin type */
  treasuryCap: string;
  /** MetadataCap object ID for the blank coin type (from coin_registry::new_currency_with_otw) */
  metadataCap: string;
  /**
   * Expected decimals for the coin (0-18)
   * This is VALIDATED against the actual Currency<T>.decimals() on-chain.
   * - Asset tokens typically use 9 decimals
   * - Stable tokens typically use 6 decimals
   */
  expectedDecimals: number;
  /** @deprecated Ignored. Acquisition now uses the fixed protocol listing fee on take. */
  fee?: bigint | number;
  /** The coin type (e.g., "0x123::my_coin::MyCoin") */
  coinType: string;
  /** Clock object ID (default: 0x6) */
  clock?: string;
}

/**
 * Configuration for taking a coin set
 */
export interface TakeCoinSetConfig {
  /** The coin registry object ID */
  registryId: string;
  /**
   * Desired decimals for the coin set (0-18)
   * Routes to the correct bucket in the registry.
   * - Use 9 for asset-conditional coins
   * - Use 6 for stable-conditional coins
   */
  desiredDecimals: number;
  /** ID of the TreasuryCap to acquire */
  capId: string;
  /** Coin<SUI> payment object for the fee */
  feePayment: ReturnType<Transaction['moveCall']>;
  /** The coin type (e.g., "0x123::my_coin::MyCoin") */
  coinType: string;
  /** Clock object ID (default: 0x6) */
  clock?: string;
}

/**
 * Blank Coins Registry SDK Operations
 *
 * Provides TypeScript wrappers for blank coins registry operations.
 * Uses the new Sui Currency system (MetadataCap instead of CoinMetadata).
 *
 * @example Share a registry
 * ```typescript
 * const tx = new Transaction();
 * CoinRegistry.shareRegistry(tx, {
 *   oneShotUtilsPackageId: '0x...',
 * }, registry);
 * ```
 *
 * @example Deposit a coin set
 * ```typescript
 * const tx = new Transaction();
 * CoinRegistry.depositCoinSet(tx, {
 *   oneShotUtilsPackageId: '0x...',
 * }, {
 *   registryId: '0x...',
 *   currencyId: '0x...', // Currency<T> from coin_registry::finalize
 *   treasuryCap: '0x...',
 *   metadataCap: '0x...', // MetadataCap from coin_registry::new_currency_with_otw
 *   expectedDecimals: 9, // Must match Currency<T>.decimals()
 *   coinType: '0x123::my_coin::MyCoin',
 * });
 * ```
 *
 * @example Take a coin set (for proposal creation)
 * ```typescript
 * const tx = new Transaction();
 *
 * // Split payment from wallet
 * const [payment] = tx.splitCoins(tx.gas, [totalFee]);
 *
 * // Take coin sets for all outcomes (chained)
 * const remainingPayment1 = CoinRegistry.takeCoinSet(tx, {
 *   oneShotUtilsPackageId: '0x...',
 * }, {
 *   registryId: '0x...',
 *   capId: '0x...cap1',
 *   feePayment: payment,
 *   coinType: '0x123::outcome1::Outcome1',
 * });
 *
 * const remainingPayment2 = CoinRegistry.takeCoinSet(tx, {
 *   oneShotUtilsPackageId: '0x...',
 * }, {
 *   registryId: '0x...',
 *   capId: '0x...cap2',
 *   feePayment: remainingPayment1,
 *   coinType: '0x123::outcome2::Outcome2',
 * });
 *
 * // Return unused payment to sender
 * tx.transferObjects([remainingPayment2], tx.pure.address(senderAddress));
 * ```
 */
export class CoinRegistry {
  // ============================================================================
  // ADMIN / SETUP
  // ============================================================================

  /**
   * Share a CoinRegistry to make it publicly accessible
   *
   * This is a one-time setup function. After sharing, anyone can deposit
   * coin sets into the registry and anyone can acquire them.
   *
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.oneShotUtilsPackageId - The futarchy_one_shot_utils package ID
   * @param registry - The CoinRegistry object to share
   *
   * @example
   * ```typescript
   * const tx = new Transaction();
   * const registry = CoinRegistry.createRegistry(tx, config);
   * CoinRegistry.shareRegistry(tx, config, registry);
   * ```
   */
  static shareRegistry(
    tx: Transaction,
    config: {
      oneShotUtilsPackageId: string;
    },
    registry: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.oneShotUtilsPackageId, 'blank_coins', 'share_registry'),
      arguments: [registry],
    });
  }

  // ============================================================================
  // DEPOSIT FUNCTIONS
  // ============================================================================

  /**
   * Deposit a TreasuryCap/Metadata pair into the registry
   *
   * **Requirements:**
   * - Coin supply must be zero (no minted coins)
   * - Metadata must be empty (name, symbol, description, icon all empty)
   * - Registry must not be full (max 100,000 coin sets)
   *
   * **Process:**
   * 1. Transfers ownership of TreasuryCap and MetadataCap to registry
   * 2. Registers the coin set for later acquisition
   * 3. When taken, depositor receives the fixed protocol listing fee
   *
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.oneShotUtilsPackageId - The futarchy_one_shot_utils package ID
   * @param depositConfig - Deposit configuration
   *
   * @throws {Error} If validation fails (object IDs)
   *
   * @example
   * ```typescript
   * const tx = new Transaction();
   *
   * CoinRegistry.depositCoinSet(tx, {
   *   oneShotUtilsPackageId: '0x...',
   * }, {
   *   registryId: '0x...',
   *   treasuryCap: '0x...', // Your blank TreasuryCap
   *   metadataCap: '0x...', // MetadataCap from coin_registry::new_currency_with_otw
   *   currencyId: '0x...', // Currency<T> from coin_registry::finalize
   *   expectedDecimals: 9, // Must match Currency<T>.decimals()
   *   coinType: '0x123::blank_coin::BlankCoin',
   * });
   * ```
   */
  static depositCoinSet(
    tx: Transaction,
    config: {
      oneShotUtilsPackageId: string;
    },
    depositConfig: DepositCoinSetConfig
  ): void {
    // Validate inputs
    validateObjectId(depositConfig.registryId, 'registryId');
    validateObjectId(depositConfig.currencyId, 'currencyId');
    validateObjectId(depositConfig.treasuryCap, 'treasuryCap');
    validateObjectId(depositConfig.metadataCap, 'metadataCap');

    // Validate decimals is in valid range (0-18)
    if (depositConfig.expectedDecimals < 0 || depositConfig.expectedDecimals > 18) {
      throw new Error('expectedDecimals must be between 0 and 18');
    }

    const clock = depositConfig.clock || '0x6';

    tx.moveCall({
      target: TransactionUtils.buildTarget(config.oneShotUtilsPackageId, 'blank_coins', 'deposit_coin_set_entry'),
      typeArguments: [depositConfig.coinType],
      arguments: [
        tx.object(depositConfig.registryId),
        tx.object(depositConfig.currencyId),
        tx.object(depositConfig.treasuryCap),
        tx.object(depositConfig.metadataCap),
        tx.pure.u8(depositConfig.expectedDecimals),
        tx.object(clock),
      ],
    });
  }

  // ============================================================================
  // TAKE FUNCTIONS
  // ============================================================================

  /**
   * Take a coin set from the registry (acquire TreasuryCap/Metadata pair)
   *
   * **Critical for optimized proposal creation:**
   * - Call this N times in a PTB to acquire N conditional token pairs
   * - Returns remaining payment coin for chaining multiple takes
   * - TreasuryCap and MetadataCap are transferred to transaction sender
   * - Fee is paid to original depositor
   *
   * **Workflow:**
   * 1. Split total payment from gas or another coin
   * 2. Call takeCoinSet for first outcome → get remaining payment
   * 3. Pass remaining payment to takeCoinSet for second outcome → get remaining payment
   * 4. Repeat for all N outcomes
   * 5. Transfer unused payment back to sender
   *
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.oneShotUtilsPackageId - The futarchy_one_shot_utils package ID
   * @param takeConfig - Take configuration
   * @returns Remaining payment coin (Coin<SUI>) for chaining
   *
   * @throws {Error} If validation fails or insufficient payment
   *
   * @example Single take
   * ```typescript
   * const tx = new Transaction();
   *
   * const [payment] = tx.splitCoins(tx.gas, [1_000_000_000]); // 1 SUI
   *
   * const remainingPayment = CoinRegistry.takeCoinSet(tx, {
   *   oneShotUtilsPackageId: '0x...',
   * }, {
   *   registryId: '0x...',
   *   capId: '0x...treasury_cap_id',
   *   feePayment: payment,
   *   coinType: '0x123::outcome::Outcome',
   * });
   *
   * // Transfer unused payment back
   * tx.transferObjects([remainingPayment], tx.pure.address(myAddress));
   * ```
   *
   * @example Multiple takes (N-outcome proposal)
   * ```typescript
   * const tx = new Transaction();
   *
   * // Calculate total: fee1 + fee2 + fee3
   * const totalFee = 3_000_000_000n; // 3 SUI
   * const [payment] = tx.splitCoins(tx.gas, [totalFee]);
   *
   * // Take first outcome's coin set
   * const remaining1 = CoinRegistry.takeCoinSet(tx, config, {
   *   registryId,
   *   capId: capId1,
   *   feePayment: payment,
   *   coinType: 'outcome1_type',
   * });
   *
   * // Take second outcome's coin set (chain remaining payment)
   * const remaining2 = CoinRegistry.takeCoinSet(tx, config, {
   *   registryId,
   *   capId: capId2,
   *   feePayment: remaining1,
   *   coinType: 'outcome2_type',
   * });
   *
   * // Take third outcome's coin set
   * const remaining3 = CoinRegistry.takeCoinSet(tx, config, {
   *   registryId,
   *   capId: capId3,
   *   feePayment: remaining2,
   *   coinType: 'outcome3_type',
   * });
   *
   * // Return any leftover
   * tx.transferObjects([remaining3], tx.pure.address(myAddress));
   *
   * // Now use the acquired TreasuryCaps in proposal creation...
   * ```
   */
  static takeCoinSet(
    tx: Transaction,
    config: {
      oneShotUtilsPackageId: string;
    },
    takeConfig: TakeCoinSetConfig
  ): ReturnType<Transaction['moveCall']> {
    // Validate inputs
    validateObjectId(takeConfig.registryId, 'registryId');
    validateObjectId(takeConfig.capId, 'capId');

    // Validate decimals is in valid range (0-18)
    if (takeConfig.desiredDecimals < 0 || takeConfig.desiredDecimals > 18) {
      throw new Error('desiredDecimals must be between 0 and 18');
    }

    const clock = takeConfig.clock || '0x6';

    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.oneShotUtilsPackageId, 'blank_coins', 'take_coin_set'),
      typeArguments: [takeConfig.coinType],
      arguments: [
        tx.object(takeConfig.registryId),
        tx.pure.u8(takeConfig.desiredDecimals),
        tx.pure.id(takeConfig.capId),
        takeConfig.feePayment,
        tx.object(clock),
      ],
    });
  }

  // ============================================================================
  // VIEW FUNCTIONS
  // ============================================================================

  /**
   * Get total number of coin sets available in the registry
   *
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.oneShotUtilsPackageId - The futarchy_one_shot_utils package ID
   * @param registryId - The coin registry object ID
   * @returns Total count of available coin sets
   */
  static totalSets(
    tx: Transaction,
    config: {
      oneShotUtilsPackageId: string;
    },
    registryId: string
  ): ReturnType<Transaction['moveCall']> {
    validateObjectId(registryId, 'registryId');

    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.oneShotUtilsPackageId, 'blank_coins', 'total_sets'),
      arguments: [tx.object(registryId)],
    });
  }

  /**
   * Get the number of coin sets available for a specific decimal value
   *
   * Use this to check if there are coins available matching your asset/stable decimals.
   *
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.oneShotUtilsPackageId - The futarchy_one_shot_utils package ID
   * @param registryId - The coin registry object ID
   * @param decimals - The decimal value to check (0-18)
   * @returns Number of coin sets available for that decimal value
   */
  static setsAvailableForDecimals(
    tx: Transaction,
    config: {
      oneShotUtilsPackageId: string;
    },
    registryId: string,
    decimals: number
  ): ReturnType<Transaction['moveCall']> {
    validateObjectId(registryId, 'registryId');

    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.oneShotUtilsPackageId,
        'blank_coins',
        'sets_available_for_decimals'
      ),
      arguments: [tx.object(registryId), tx.pure.u8(decimals)],
    });
  }

  /**
   * Check if a specific coin set is available in a given bucket
   *
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.oneShotUtilsPackageId - The futarchy_one_shot_utils package ID
   * @param registryId - The coin registry object ID
   * @param decimals - The decimal bucket to check (0-18)
   * @param capId - The TreasuryCap ID to check
   * @returns Boolean indicating if the coin set exists
   */
  static hasCoinSet(
    tx: Transaction,
    config: {
      oneShotUtilsPackageId: string;
    },
    registryId: string,
    decimals: number,
    capId: string
  ): ReturnType<Transaction['moveCall']> {
    validateObjectId(registryId, 'registryId');
    validateObjectId(capId, 'capId');

    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.oneShotUtilsPackageId, 'blank_coins', 'has_coin_set'),
      arguments: [tx.object(registryId), tx.pure.u8(decimals), tx.pure.id(capId)],
    });
  }

  /**
   * Get the fixed protocol listing fee required to acquire any coin set
   *
   * Move function: blank_coins::listing_fee() -> u64
   * Takes no arguments, returns the constant LISTING_FEE (0.01 SUI = 10_000_000 MIST).
   *
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.oneShotUtilsPackageId - The futarchy_one_shot_utils package ID
   * @returns Fee amount in SUI MIST (u64)
   */
  static getFee(
    tx: Transaction,
    config: {
      oneShotUtilsPackageId: string;
    },
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.oneShotUtilsPackageId, 'blank_coins', 'listing_fee'),
      arguments: [],
    });
  }

  /**
   * Get the owner (depositor) of a specific coin set
   *
   * The owner will receive the fee payment when the coin set is taken.
   *
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.oneShotUtilsPackageId - The futarchy_one_shot_utils package ID
   * @param registryId - The coin registry object ID
   * @param decimals - The decimal bucket (0-18)
   * @param capId - The TreasuryCap ID
   * @param coinType - The coin type
   * @returns Address of the coin set owner
   */
  static getOwner(
    tx: Transaction,
    config: {
      oneShotUtilsPackageId: string;
    },
    registryId: string,
    decimals: number,
    capId: string,
    coinType: string
  ): ReturnType<Transaction['moveCall']> {
    validateObjectId(registryId, 'registryId');
    validateObjectId(capId, 'capId');

    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.oneShotUtilsPackageId, 'blank_coins', 'get_owner'),
      typeArguments: [coinType],
      arguments: [tx.object(registryId), tx.pure.u8(decimals), tx.pure.id(capId)],
    });
  }

  /**
   * Get the decimals of a specific coin set
   *
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.oneShotUtilsPackageId - The futarchy_one_shot_utils package ID
   * @param registryId - The coin registry object ID
   * @param decimals - The decimal bucket (0-18)
   * @param capId - The TreasuryCap ID
   * @param coinType - The coin type
   * @returns Decimals value (should match the bucket)
   */
  static getDecimals(
    tx: Transaction,
    config: {
      oneShotUtilsPackageId: string;
    },
    registryId: string,
    decimals: number,
    capId: string,
    coinType: string
  ): ReturnType<Transaction['moveCall']> {
    validateObjectId(registryId, 'registryId');
    validateObjectId(capId, 'capId');

    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.oneShotUtilsPackageId, 'blank_coins', 'get_decimals'),
      typeArguments: [coinType],
      arguments: [tx.object(registryId), tx.pure.u8(decimals), tx.pure.id(capId)],
    });
  }
}
