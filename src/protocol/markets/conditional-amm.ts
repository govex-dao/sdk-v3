/**
 * Conditional AMM Operations
 *
 * Automated market maker for outcome-specific conditional tokens.
 * Each outcome has its own AMM pool with separate reserves and pricing.
 *
 * Supports:
 * - Swaps (asset <-> stable for specific outcomes)
 * - Liquidity provision/removal
 * - TWAP oracle integration
 * - Protocol fee collection
 * - Bucket-based liquidity management
 *
 * @module conditional-amm
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Conditional AMM Static Functions
 *
 * Trading and liquidity operations for outcome-specific AMM pools.
 *
 * @example Swap in conditional pool
 * ```typescript
 * ConditionalAMM.swapAssetToStable(tx, {
 *   marketsPackageId,
 *   pool,
 *   marketId,
 *   assetIn: 100_000n,
 *   minStableOut: 95_000n,
 *   clock: '0x6',
 * });
 * ```
 */
export class ConditionalAMM {
  // ============================================================================
  // Pool Creation
  // ============================================================================

  /**
   * Create new conditional AMM pool
   *
   * Initializes pool with reserves, oracle, and fee configuration.
   *
   * @param tx - Transaction
   * @param config - Pool creation configuration
   * @returns LiquidityPool object
   *
   * @example
   * ```typescript
   * const pool = ConditionalAMM.newPool(tx, {
   *   marketsPackageId,
   *   marketId: proposalId,
   *   outcomeIdx: 0,
   *   feePercent: 30n, // 0.3%
   *   initialAsset: 1_000_000n,
   *   initialStable: 1_000_000n,
   *   twapInitialObservation: 1_000_000_000n, // $1 price
   *   twapStartDelay: 300_000n, // 5 min
   *   twapCapPpm: 3600_000n, // 1 hour
   *   auth: marketStateAuth,
   *   clock: '0x6',
   * });
   * ```
   */
  static newPool(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      marketId: string;
      outcomeIdx: number;
      feePercent: bigint;
      initialAsset: bigint;
      initialStable: bigint;
      /** Option<u128> - pass null/undefined for None, bigint for Some(value) */
      twapInitialObservation: bigint | null;
      twapStartDelay: bigint;
      twapCapPpm: bigint;
      /** MarketStateMutationAuth reference */
      auth: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    const twapObs = config.twapInitialObservation !== null && config.twapInitialObservation !== undefined
      ? tx.moveCall({
          target: '0x1::option::some',
          typeArguments: ['u128'],
          arguments: [tx.pure.u128(config.twapInitialObservation)],
        })
      : tx.moveCall({
          target: '0x1::option::none',
          typeArguments: ['u128'],
          arguments: [],
        });

    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'conditional_amm',
        'new_pool'
      ),
      // Move: new_pool(market_id, outcome_idx, fee_percent, initial_asset, initial_stable,
      //                twap_initial_observation, twap_start_delay, twap_cap_ppm, _auth, clock, ctx)
      arguments: [
        tx.pure.id(config.marketId),
        tx.pure.u8(config.outcomeIdx),
        tx.pure.u64(config.feePercent),
        tx.pure.u64(config.initialAsset),
        tx.pure.u64(config.initialStable),
        twapObs,
        tx.pure.u64(config.twapStartDelay),
        tx.pure.u64(config.twapCapPpm),
        config.auth,
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // ============================================================================
  // Swap Functions
  // ============================================================================

  /**
   * Swap asset tokens for stable tokens in conditional pool
   *
   * Trades outcome-specific asset for stable coins.
   *
   * @param tx - Transaction
   * @param config - Swap configuration
   *
   * @example
   * ```typescript
   * ConditionalAMM.swapAssetToStable(tx, {
   *   marketsPackageId,
   *   pool,
   *   marketId,
   *   assetIn: 100_000n,
   *   minStableOut: 95_000n,
   *   clock: '0x6',
   * });
   * ```
   */
  static swapAssetToStable(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      pool: ReturnType<Transaction['moveCall']>;
      marketId: string;
      assetIn: bigint;
      minStableOut: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'conditional_amm',
        'swap_asset_to_stable'
      ),
      arguments: [
        config.pool,
        tx.pure.id(config.marketId),
        tx.pure.u64(config.assetIn),
        tx.pure.u64(config.minStableOut),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Swap stable tokens for asset tokens in conditional pool
   *
   * Trades stable coins for outcome-specific asset.
   *
   * @param tx - Transaction
   * @param config - Swap configuration
   *
   * @example
   * ```typescript
   * ConditionalAMM.swapStableToAsset(tx, {
   *   marketsPackageId,
   *   pool,
   *   marketId,
   *   stableIn: 100_000n,
   *   minAssetOut: 95_000n,
   *   clock: '0x6',
   * });
   * ```
   */
  static swapStableToAsset(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      pool: ReturnType<Transaction['moveCall']>;
      marketId: string;
      stableIn: bigint;
      minAssetOut: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'conditional_amm',
        'swap_stable_to_asset'
      ),
      arguments: [
        config.pool,
        tx.pure.id(config.marketId),
        tx.pure.u64(config.stableIn),
        tx.pure.u64(config.minAssetOut),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // ============================================================================
  // Liquidity Functions
  // ============================================================================

  /**
   * Add liquidity proportionally to pool
   *
   * Mints LP tokens in proportion to deposits.
   *
   * @param tx - Transaction
   * @param config - Liquidity addition configuration
   * @returns LP tokens minted
   *
   * @example
   * ```typescript
   * const lpTokens = ConditionalAMM.addLiquidityProportional(tx, {
   *   marketsPackageId,
   *   pool,
   *   assetAmount: 1_000n,
   *   stableAmount: 1_000n,
   *   minLpOut: 900n,
   *   clock: '0x6',
   * });
   * ```
   */
  static addLiquidityProportional(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      pool: ReturnType<Transaction['moveCall']>;
      assetAmount: bigint;
      stableAmount: bigint;
      minLpOut: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'conditional_amm',
        'add_liquidity_proportional'
      ),
      arguments: [
        config.pool,
        tx.pure.u64(config.assetAmount),
        tx.pure.u64(config.stableAmount),
        tx.pure.u64(config.minLpOut),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Remove liquidity proportionally from pool
   *
   * Burns LP tokens and receives proportional reserves.
   *
   * @param tx - Transaction
   * @param config - Liquidity removal configuration
   * @returns Tuple of (asset_out, stable_out)
   *
   * @example
   * ```typescript
   * const [assetOut, stableOut] = ConditionalAMM.removeLiquidityProportional(tx, {
   *   marketsPackageId,
   *   pool,
   *   lpAmount: 900n,
   *   clock: '0x6',
   * });
   * ```
   */
  static removeLiquidityProportional(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      pool: ReturnType<Transaction['moveCall']>;
      lpAmount: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'conditional_amm',
        'remove_liquidity_proportional'
      ),
      arguments: [
        config.pool,
        tx.pure.u64(config.lpAmount),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Empty all AMM liquidity from pool
   *
   * Withdraws all reserves. Used during settlement.
   *
   * @returns Tuple of (asset_amount, stable_amount)
   */
  static emptyAllAmmLiquidity(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      pool: ReturnType<Transaction['moveCall']>;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'conditional_amm',
        'empty_all_amm_liquidity'
      ),
      arguments: [config.pool, config.auth],
    });
  }

  // ============================================================================
  // Query Functions
  // ============================================================================

  /**
   * Get pool's TWAP oracle reference
   */
  static getOracle(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'conditional_amm', 'get_oracle'),
      arguments: [pool],
    });
  }

  /**
   * Get pool reserves
   *
   * @returns Tuple of (asset_reserve, stable_reserve)
   */
  static getReserves(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'conditional_amm', 'get_reserves'),
      arguments: [pool],
    });
  }

  /**
   * Get total LP token supply for pool
   */
  static getLpSupply(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'conditional_amm', 'get_lp_supply'),
      arguments: [pool],
    });
  }

  /**
   * Get fee in basis points
   */
  static getFeeBps(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'conditional_amm', 'get_fee_bps'),
      arguments: [pool],
    });
  }

  /**
   * Get current price (stable per asset)
   *
   * @returns Price as u128
   */
  static getPrice(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'conditional_amm', 'get_price'),
      arguments: [pool],
    });
  }

  /**
   * Get current price (alias)
   */
  static getCurrentPrice(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'conditional_amm',
        'get_current_price'
      ),
      arguments: [pool],
    });
  }

  /**
   * Get TWAP (time-weighted average price)
   *
   * Requires MarketStateMutationAuth (writes oracle observation).
   *
   * @returns TWAP as u128
   */
  static getTwap(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      pool: ReturnType<Transaction['moveCall']>;
      clock?: string;
      /** MarketStateMutationAuth reference */
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsPackageId, 'conditional_amm', 'get_twap'),
      // Move: get_twap(pool, clock, _auth)
      arguments: [config.pool, tx.object(config.clock || '0x6'), config.auth],
    });
  }

  /**
   * Get constant product K
   *
   * @returns K = asset_reserve * stable_reserve
   */
  static getK(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'conditional_amm', 'get_k'),
      arguments: [pool],
    });
  }

  /**
   * Get outcome index for this pool
   */
  static getOutcomeIdx(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'conditional_amm',
        'get_outcome_idx'
      ),
      arguments: [pool],
    });
  }

  /**
   * Get pool object ID
   */
  static getId(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'conditional_amm', 'get_id'),
      arguments: [pool],
    });
  }

  /**
   * Get market state ID for this pool
   */
  static getMsId(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'conditional_amm', 'get_ms_id'),
      arguments: [pool],
    });
  }

  // ============================================================================
  // Protocol Fees
  // ============================================================================

  /**
   * Get accumulated protocol fees for asset
   */
  static getProtocolFeesAsset(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'conditional_amm',
        'get_protocol_fees_asset'
      ),
      arguments: [pool],
    });
  }

  /**
   * Get accumulated protocol fees for stable
   */
  static getProtocolFeesStable(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'conditional_amm',
        'get_protocol_fees_stable'
      ),
      arguments: [pool],
    });
  }

  /**
   * Get both protocol fees
   *
   * @returns Tuple of (asset_fees, stable_fees)
   */
  static getProtocolFees(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'conditional_amm',
        'get_protocol_fees'
      ),
      arguments: [pool],
    });
  }

  // ============================================================================
  // Quote & Simulation Functions
  // ============================================================================

  /**
   * Quote swap asset to stable (dry run)
   *
   * Calculate expected output without executing swap.
   *
   * @returns Expected stable out (after fees)
   */
  static quoteSwapAssetToStable(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>,
    assetIn: bigint
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'conditional_amm',
        'quote_swap_asset_to_stable'
      ),
      arguments: [pool, tx.pure.u64(assetIn)],
    });
  }

  /**
   * Quote swap stable to asset (dry run)
   *
   * Calculate expected output without executing swap.
   *
   * @returns Expected asset out (after fees)
   */
  static quoteSwapStableToAsset(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>,
    stableIn: bigint
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'conditional_amm',
        'quote_swap_stable_to_asset'
      ),
      arguments: [pool, tx.pure.u64(stableIn)],
    });
  }

  /**
   * Simulate swap asset to stable
   *
   * Returns detailed simulation results.
   *
   * @returns Tuple of (stable_out, new_asset_reserve, new_stable_reserve, new_price)
   */
  static simulateSwapAssetToStable(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>,
    assetIn: bigint
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'conditional_amm',
        'simulate_swap_asset_to_stable'
      ),
      arguments: [pool, tx.pure.u64(assetIn)],
    });
  }

  /**
   * Simulate swap stable to asset
   *
   * Returns detailed simulation results.
   *
   * @returns Tuple of (asset_out, new_asset_reserve, new_stable_reserve, new_price)
   */
  static simulateSwapStableToAsset(
    tx: Transaction,
    marketsPackageId: string,
    pool: ReturnType<Transaction['moveCall']>,
    stableIn: bigint
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'conditional_amm',
        'simulate_swap_stable_to_asset'
      ),
      arguments: [pool, tx.pure.u64(stableIn)],
    });
  }

  /**
   * Calculate output for constant product formula
   *
   * Pure function: output = (amount_in_with_fee * reserve_out) / (reserve_in + amount_in_with_fee)
   * Note: fee must already be deducted from amountIn before calling.
   *
   * @returns Output amount
   */
  static calculateOutput(
    tx: Transaction,
    marketsPackageId: string,
    amountInWithFee: bigint,
    reserveIn: bigint,
    reserveOut: bigint
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'conditional_amm',
        'calculate_output'
      ),
      arguments: [
        tx.pure.u64(amountInWithFee),
        tx.pure.u64(reserveIn),
        tx.pure.u64(reserveOut),
      ],
    });
  }

  /**
   * Set oracle start time
   *
   * Configures when TWAP oracle begins recording.
   */
  static setOracleStartTime(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      pool: ReturnType<Transaction['moveCall']>;
      marketId: string;
      startTime: bigint;
      clock?: string;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'conditional_amm',
        'set_oracle_start_time'
      ),
      arguments: [
        config.pool,
        tx.pure.id(config.marketId),
        tx.pure.u64(config.startTime),
        tx.object(config.clock || '0x6'),
        config.auth,
      ],
    });
  }

  /**
   * Check if price is under maximum allowed
   *
   * Validates price doesn't exceed safety bounds.
   */
  static checkPriceUnderMax(
    tx: Transaction,
    marketsPackageId: string,
    price: bigint
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'conditional_amm',
        'check_price_under_max'
      ),
      arguments: [tx.pure.u128(price)],
    });
  }
}
