/**
 * Unified Spot Pool Module
 *
 * UNIFIED SPOT POOL - Single pool type with optional aggregator support
 *
 * Design Goals:
 * - Replace both SpotAMM and AccountSpotPool with single unified type
 * - Optional aggregator features (zero overhead when disabled)
 * - NO circular dependencies (uses IDs, not concrete types)
 *
 * Key Features:
 * - Constant product AMM (x * y = k)
 * - Coin-based LP tokens (standard Sui Coins via TreasuryCap)
 * - Quantum liquidity (LP splits to conditional markets during proposals)
 * - TWAP oracle integration
 * - Dynamic fee scheduling (anti-snipe for launchpads)
 * - Protocol fee collection (proportional split model)
 *
 * @module unified-spot-pool
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Unified Spot Pool Static Functions
 *
 * AMM pool with full futarchy features.
 */
export class UnifiedSpotPool {
  // ============================================================================
  // Pool Creation Functions
  // ============================================================================

  /**
   * Create a futarchy spot pool with FULL features
   *
   * All futarchy pools have: TWAP oracle, escrow tracking, bucket management.
   * There is NO "simple" mode - all pools need these features for governance.
   *
   * SECURITY: Returns a tuple [pool, mustShare]. The MustShare hot potato MUST be
   * passed to share() in the same transaction to prevent freeze attacks.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns [UnifiedSpotPool, MustShare] - tuple that must be destructured
   */
  static new(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      marketsPrimitivesPackageId: string; // For FeeSchedule type
      assetType: string;
      stableType: string;
      lpType: string;
      lpTreasuryCap: ReturnType<Transaction['moveCall']> | string; // TreasuryCap<LPType>
      lpCurrency: ReturnType<Transaction['moveCall']> | string; // &mut Currency<LPType>
      feeBps: bigint;
      feeSchedule: ReturnType<Transaction['moveCall']> | null; // Option<FeeSchedule> - use FeeScheduler.newSchedule() or null
      oracleConditionalThresholdBps: bigint; // When to use conditional vs spot oracle (typically 5000 = 50%)
      conditionalLiquidityRatioPercent: bigint; // DAO's configured ratio for quantum split (1-99)
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    // Build Option<FeeSchedule> - either wrap the provided schedule or create Option::none
    const feeScheduleArg =
      config.feeSchedule ??
      tx.moveCall({
        target: '0x1::option::none',
        typeArguments: [`${config.marketsPrimitivesPackageId}::fee_scheduler::FeeSchedule`],
      });

    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'new'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        typeof config.lpTreasuryCap === 'string' ? tx.object(config.lpTreasuryCap) : config.lpTreasuryCap,
        typeof config.lpCurrency === 'string' ? tx.object(config.lpCurrency) : config.lpCurrency,
        tx.pure.u64(config.feeBps),
        feeScheduleArg,
        tx.pure.u64(config.oracleConditionalThresholdBps),
        tx.pure.u64(config.conditionalLiquidityRatioPercent),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // ============================================================================
  // Escrow Management Functions (Aggregator Only)
  // ============================================================================

  /**
   * Store active escrow object when proposal starts trading
   *
   * Requires SpotPoolMutationAuth from an authorized package.
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static storeActiveEscrow(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']> | string;
      auth: ReturnType<Transaction['moveCall']>; // SpotPoolMutationAuth
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'store_active_escrow'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool, typeof config.escrow === 'string' ? tx.object(config.escrow) : config.escrow, config.auth],
    });
  }

  /**
   * Archive a finalized escrow without occupying the active escrow slot.
   *
   * Use this after proposal finalization so spot swaps are not blocked by a
   * finalized active escrow.
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static archiveFinalizedEscrow(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']> | string;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'archive_finalized_escrow'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.pool,
        typeof config.escrow === 'string' ? tx.object(config.escrow) : config.escrow,
        config.auth,
      ],
    });
  }

  /**
   * Extract active escrow object when proposal ends
   *
   * Returns the wrapped `TokenEscrow` object.
   * Requires SpotPoolMutationAuth from an authorized package.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns TokenEscrow object
   */
  static extractActiveEscrow(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      auth: ReturnType<Transaction['moveCall']>; // SpotPoolMutationAuth
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'extract_active_escrow'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool, config.auth],
    });
  }

  /**
   * Get active escrow ID (read-only)
   *
   * Returns None if no active escrow.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Option<ID>
   */
  static getActiveEscrowId(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_active_escrow_id'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  // ============================================================================
  // Core AMM Functions
  // ============================================================================

  /**
   * Add liquidity to the pool and return LP token with excess coins
   *
   * IMPORTANT: LP can be added anytime, including during active proposals.
   * - If no proposal active: LP goes to LIVE bucket (participates immediately)
   * - If proposal active: LP goes to PENDING bucket (joins spot pool when proposal ends)
   *
   * This prevents new LP from unfairly benefiting from conditional market outcomes.
   * Returns: (LPToken, excess_asset_coin, excess_stable_coin)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Tuple of (LPToken, excess_asset, excess_stable)
   */
  static addLiquidity(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      assetCoin: ReturnType<Transaction['moveCall']>;
      stableCoin: ReturnType<Transaction['moveCall']>;
      minLpOut: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'add_liquidity'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.pool,
        config.assetCoin,
        config.stableCoin,
        tx.pure.u64(config.minLpOut),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Remove liquidity from the pool
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Tuple of (asset_coin, stable_coin)
   */
  static removeLiquidity(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      lpToken: ReturnType<Transaction['moveCall']>;
      minAssetOut: bigint;
      minStableOut: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'remove_liquidity'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.pool,
        config.lpToken,
        tx.pure.u64(config.minAssetOut),
        tx.pure.u64(config.minStableOut),
      ],
    });
  }

  /**
   * Check if pool can create proposals
   *
   * Returns true if the fee schedule has expired (or doesn't exist)
   * and the pool is eligible for proposals. Requires clock to check
   * fee schedule timing.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns true if can create proposals
   */
  static canCreateProposals(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'can_create_proposals'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool, tx.object(config.clock || '0x6')],
    });
  }

  // ============================================================================
  // Swap Functions
  // ============================================================================

  /**
   * Swap stable for asset
   *
   * Swaps stable coins for asset coins using constant product AMM.
   * Applies dynamic fees if fee_schedule is configured.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Asset coin
   */
  static swapStableForAsset(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      stableCoin: ReturnType<Transaction['moveCall']>;
      minAssetOut: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'swap_stable_for_asset'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.pool,
        config.stableCoin,
        tx.pure.u64(config.minAssetOut),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Swap asset for stable
   *
   * Swaps asset coins for stable coins using constant product AMM.
   * Applies dynamic fees if fee_schedule is configured.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Stable coin
   */
  static swapAssetForStable(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      assetCoin: ReturnType<Transaction['moveCall']>;
      minStableOut: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'swap_asset_for_stable'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.pool,
        config.assetCoin,
        tx.pure.u64(config.minStableOut),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // ============================================================================
  // View Functions
  // ============================================================================

  /**
   * Get pool reserves
   *
   * Returns (asset_reserve, stable_reserve).
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Tuple of (asset_reserve: u64, stable_reserve: u64)
   */
  static getReserves(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_reserves'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  /**
   * Get LP supply
   *
   * Returns total LP supply for the pool.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns LP supply (u64)
   */
  static lpSupply(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'lp_supply'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  /**
   * Get spot price
   *
   * Returns current price (stable per asset) with PRECISION scaling (1e12).
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Price (u128)
   */
  static getSpotPrice(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_spot_price'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  /**
   * Check if aggregator is enabled
   *
   * Returns true if pool has aggregator features.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns true if enabled
   */
  static isAggregatorEnabled(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'is_aggregator_enabled'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  /**
   * Check if pool has active escrow
   *
   * Returns true if proposal is active and trading.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns true if has active escrow
   */
  static hasActiveEscrow(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'has_active_escrow'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  /**
   * Check if pool is locked for proposal
   *
   * Returns true if proposal is active.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns true if locked
   */
  static isLockedForProposal(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'is_locked_for_proposal'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  /**
   * Get the currently active proposal ID, if any.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Option<ID>
   */
  static getActiveProposalId(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_active_proposal_id'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  /**
   * Get conditional liquidity ratio percent
   *
   * Returns the percentage of liquidity that gets quantum-split (1-99).
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Ratio percent (u64)
   */
  static getConditionalLiquidityRatioPercent(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_conditional_liquidity_ratio_percent'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  /**
   * Get oracle conditional threshold bps
   *
   * Returns the threshold for switching between conditional and spot oracles.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Threshold (u64)
   */
  static getOracleConditionalThresholdBps(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_oracle_conditional_threshold_bps'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  /**
   * Mark liquidity allocation for a proposal
   *
   * Updates conditional_liquidity_ratio_percent, records proposal usage timestamp,
   * snapshots spot cumulative for oracle switching logic.
   * Requires SpotPoolMutationAuth from an authorized package.
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static markLiquidityToProposal(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      conditionalLiquidityRatioPercent: bigint;
      clock?: string;
      auth: ReturnType<Transaction['moveCall']>; // SpotPoolMutationAuth
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'mark_liquidity_to_proposal'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.pool,
        tx.pure.u64(config.conditionalLiquidityRatioPercent),
        tx.object(config.clock || '0x6'),
        config.auth,
      ],
    });
  }

  // ============================================================================
  // TWAP Functions
  // ============================================================================

  /**
   * Check if TWAP is ready
   *
   * Returns true if enough observations have been made.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns true if ready
   */
  static isTwapReady(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'is_twap_ready'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool, tx.object(config.clock || '0x6')],
    });
  }

  /**
   * Get geometric TWAP
   *
   * Returns geometric mean TWAP price.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns TWAP price (u128)
   */
  static getGeometricTwap(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_geometric_twap'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool, tx.object(config.clock || '0x6')],
    });
  }

  /**
   * Get simple TWAP
   *
   * Returns reference to SimpleTWAP from spot pool oracle.
   * Contract signature: get_simple_twap(pool) -> &SimpleTWAP
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns &SimpleTWAP reference
   */
  static getSimpleTwap(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_simple_twap'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  /**
   * Get fee bps
   *
   * Returns the current fee in basis points.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Fee bps (u64)
   */
  static getFeeBps(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_fee_bps'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  // ============================================================================
  // Simulation Functions
  // ============================================================================

  /**
   * Simulate swap asset to stable (ACCURATE)
   *
   * Uses the full fee calculation including protocol fee and fee schedule decay.
   * This is the recommended function for accurate swap quotes.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Expected stable out (u64)
   */
  static simulateSwapAssetToStableAccurate(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      assetIn: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'simulate_swap_asset_to_stable_accurate'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool, tx.pure.u64(config.assetIn), tx.object(config.clock || '0x6')],
    });
  }

  /**
   * Simulate swap stable to asset (ACCURATE)
   *
   * Uses the full fee calculation including protocol fee and fee schedule decay.
   * This is the recommended function for accurate swap quotes.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Expected asset out (u64)
   */
  static simulateSwapStableToAssetAccurate(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      stableIn: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'simulate_swap_stable_to_asset_accurate'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool, tx.pure.u64(config.stableIn), tx.object(config.clock || '0x6')],
    });
  }


  // ============================================================================
  // DAO Dissolution Functions
  // ============================================================================

  /**
   * Remove liquidity during DAO dissolution
   *
   * The bypass_minimum flag allows complete pool drainage during dissolution.
   * Requires SpotPoolMutationAuth from an authorized package.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Tuple of (asset_coin, stable_coin)
   */
  static removeLiquidityForDissolution(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      lpCoin: ReturnType<Transaction['moveCall']>; // Coin<LPType>
      bypassMinimum: boolean;
      auth: ReturnType<Transaction['moveCall']>; // SpotPoolMutationAuth
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'remove_liquidity_for_dissolution'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.pool,
        config.lpCoin,
        tx.pure.bool(config.bypassMinimum),
        config.auth,
      ],
    });
  }

  /**
   * Get DAO LP value
   *
   * Returns the current value of DAO-owned LP.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Tuple of (asset_value: u64, stable_value: u64)
   */
  static getDaoLpValue(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      daoLpAmount: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_dao_lp_value'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool, tx.pure.u64(config.daoLpAmount)],
    });
  }

  /**
   * Get protocol fee amounts
   *
   * Returns the current protocol fee balances.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Tuple of (asset_fees: u64, stable_fees: u64)
   */
  static getProtocolFeeAmounts(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'get_protocol_fee_amounts'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  /**
   * Share pool object
   *
   * Makes pool a shared object (callable by anyone).
   *
   * SECURITY: This MUST be called in the same transaction as new().
   * The MustShare hot potato enforces atomic sharing to prevent freeze attacks.
   *
   * @param tx - Transaction
   * @param config - Configuration including mustShare from new()
   */
  static share(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      mustShare: ReturnType<Transaction['moveCall']>; // MustShare hot potato from new()
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'unified_spot_pool', 'share'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool, config.mustShare],
    });
  }

  // ============================================================================
  // Fee Query Functions (Added for proportional fee split model)
  // ============================================================================

  /**
   * Get current total fee in basis points
   *
   * Returns the current TOTAL fee (protocol + LP) including any launch fee decay.
   * This is what the user pays as swap fee.
   *
   * Fee Model:
   * - Steady-state: Protocol (50 bps) + LP (25 bps) = 75 bps total
   * - Launch mode: Decays exponentially from 99% (9900 bps) to steady-state total over time
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Current total fee in bps (u64)
   */
  static currentFeeBps(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsCorePackageId,
        'unified_spot_pool',
        'current_fee_bps'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool, tx.object(config.clock || '0x6')],
    });
  }

  /**
   * Get LP's share of the steady-state fee
   *
   * Returns the LP fee portion in basis points (typically 25 bps = 0.25%).
   * This is the LP's share BEFORE any proportional split during launch mode.
   *
   * During launch mode with elevated fees, LPs get a proportional share:
   *   LP fee = total_fee * (steady_lp_bps / steady_total_bps)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns LP fee in bps (u64)
   */
  static lpFeeBps(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsCorePackageId,
        'unified_spot_pool',
        'lp_fee_bps'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  /**
   * Get initial reserves (write-once snapshot from first liquidity add)
   *
   * Returns (Option<u64>, Option<u64>) for initial asset and stable reserves.
   * Both are None if pool hasn't received first liquidity yet.
   * Used by protective bid NAV calculation as principal baseline.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns (Option<u64>, Option<u64>) - initial asset and stable reserves
   */
  static getInitialReserves(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsCorePackageId,
        'unified_spot_pool',
        'get_initial_reserves'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }

  /**
   * Get pool ID
   *
   * Returns the unique ID of the pool object.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Pool ID
   */
  static getPoolId(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      pool: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsCorePackageId,
        'unified_spot_pool',
        'get_pool_id'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [config.pool],
    });
  }
}
