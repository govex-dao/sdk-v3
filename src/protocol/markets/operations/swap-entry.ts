/**
 * Swap Entry Module
 *
 * User-facing swap API with automatic arbitrage.
 * Provides entry functions for spot swaps with auto-arb execution.
 *
 * Key features:
 * - Auto-arbitrage with swap output
 * - DCA bot compatible (auto-merge balances)
 * - Incomplete set handling (NFT balances)
 * - Hot potato batch swapping pattern
 *
 * @module swap-entry
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../../services/transaction';

/**
 * Swap Entry Static Functions
 *
 * User-facing swap operations with automatic arbitrage.
 *
 * @example Swap stable to asset
 * ```typescript
 * const [assetOut, balanceOpt] = SwapEntry.swapSpotStableToAsset(tx, {
 *   marketsOperationsPackageId,
 *   assetType,
 *   stableType,
 *   spotPool,
 *   stableIn: stableCoin,
 *   minAssetOut: 95_000_000n,
 *   recipient: '0x...',
 *   existingBalanceOpt: null,
 *   returnBalance: false,
 *   spotPoolMutationRegistry,
 *   clock: '0x6',
 * });
 * ```
 */
export class SwapEntry {
  // ============================================================================
  // Spot Swaps with Auto-Arb
  // ============================================================================

  /**
   * Swap stable → asset in spot market with automatic arbitrage
   *
   * DCA BOT & AGGREGATOR COMPATIBLE - Supports auto-merge and return modes
   *
   * @param tx - Transaction
   * @param config - Swap configuration
   * @returns Tuple of (option<asset_coin>, optional_balance)
   *
   * @example Regular user (one swap)
   * ```typescript
   * const [assetOut, _] = SwapEntry.swapSpotStableToAsset(tx, {
   *   ...config,
   *   existingBalanceOpt: null,
   *   returnBalance: false, // Transfer balance to recipient
   * });
   * ```
   *
   * @example DCA bot (100 swaps → 1 NFT)
   * ```typescript
   * let balance = null;
   * for (let i = 0; i < 100; i++) {
   *   const [assetOut, balanceOpt] = SwapEntry.swapSpotStableToAsset(tx, {
   *     ...config,
   *     existingBalanceOpt: balance,
   *     returnBalance: true, // Return balance to accumulate
   *   });
   *   balance = balanceOpt;
   * }
   * // Final: 1 NFT with all dust!
   * tx.transferObjects([balance], user);
   * ```
   */
  static swapSpotStableToAsset(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      /** Package ID for futarchy_markets_primitives (needed for ConditionalMarketBalance type) */
      marketsPrimitivesPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      spotPool: ReturnType<Transaction['moveCall']>;
      stableIn: ReturnType<Transaction['moveCall']>;
      minAssetOut: bigint;
      recipient: string;
      existingBalanceOpt: ReturnType<Transaction['moveCall']> | null;
      returnBalance: boolean;
      spotPoolMutationRegistry: string;
      escrowRegistry: string;
      marketStateRegistry: string;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    // Construct proper Option::None when no existing balance provided
    const balanceOpt = config.existingBalanceOpt ?? tx.moveCall({
      target: '0x1::option::none',
      typeArguments: [
        `${config.marketsPrimitivesPackageId}::conditional_balance::ConditionalMarketBalance<${config.assetType}, ${config.stableType}>`,
      ],
      arguments: [],
    });

    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'swap_entry',
        'swap_spot_stable_to_asset'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.spotPool,
        config.stableIn,
        tx.pure.u64(config.minAssetOut),
        tx.pure.address(config.recipient),
        balanceOpt,
        tx.pure.bool(config.returnBalance),
        tx.object(config.spotPoolMutationRegistry),
        tx.object(config.escrowRegistry),
        tx.object(config.marketStateRegistry),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Swap asset → stable in spot market with automatic arbitrage
   *
   * DCA BOT & AGGREGATOR COMPATIBLE - Supports auto-merge and return modes
   *
   * @param tx - Transaction
   * @param config - Swap configuration
   * @returns Tuple of (option<stable_coin>, optional_balance)
   *
   * @example Regular user (one swap)
   * ```typescript
   * const [stableOut, _] = SwapEntry.swapSpotAssetToStable(tx, {
   *   ...config,
   *   existingBalanceOpt: null,
   *   returnBalance: false, // Transfer balance to recipient
   * });
   * ```
   */
  static swapSpotAssetToStable(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      /** Package ID for futarchy_markets_primitives (needed for ConditionalMarketBalance type) */
      marketsPrimitivesPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      spotPool: ReturnType<Transaction['moveCall']>;
      assetIn: ReturnType<Transaction['moveCall']>;
      minStableOut: bigint;
      recipient: string;
      existingBalanceOpt: ReturnType<Transaction['moveCall']> | null;
      returnBalance: boolean;
      spotPoolMutationRegistry: string;
      escrowRegistry: string;
      marketStateRegistry: string;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    // Construct proper Option::None when no existing balance provided
    const balanceOpt = config.existingBalanceOpt ?? tx.moveCall({
      target: '0x1::option::none',
      typeArguments: [
        `${config.marketsPrimitivesPackageId}::conditional_balance::ConditionalMarketBalance<${config.assetType}, ${config.stableType}>`,
      ],
      arguments: [],
    });

    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'swap_entry',
        'swap_spot_asset_to_stable'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.spotPool,
        config.assetIn,
        tx.pure.u64(config.minStableOut),
        tx.pure.address(config.recipient),
        balanceOpt,
        tx.pure.bool(config.returnBalance),
        tx.object(config.spotPoolMutationRegistry),
        tx.object(config.escrowRegistry),
        tx.object(config.marketStateRegistry),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // ============================================================================
  // Conditional Swap Batching (Hot Potato Pattern)
  // ============================================================================

  /**
   * Begin a conditional swap batch (returns hot potato)
   *
   * Creates hot potato with empty balance. Must be consumed by finalizeConditionalSwaps().
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns ConditionalSwapBatch hot potato
   *
   * @example PTB Flow
   * ```typescript
   * const batch = SwapEntry.beginConditionalSwaps(tx, {
   *   marketsOperationsPackageId,
   *   assetType,
   *   stableType,
   *   escrow,
   * });
   *
   * // Chain swaps...
   * const batch2 = SwapEntry.swapInBatch(tx, {
   *   ...config,
   *   batch,
   *   // ...
   * });
   *
   * // Must finalize at end
   * SwapEntry.finalizeConditionalSwaps(tx, {
   *   ...config,
   *   batch: batch2,
   * });
   * ```
   */
  static beginConditionalSwaps(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      assetType: string;
      stableType: string;
      escrow: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'swap_entry',
        'begin_conditional_swaps'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.escrow, tx.object(config.clock || '0x6')],
    });
  }

  /**
   * Swap in batch (consumes and returns hot potato)
   *
   * Can be called N times in a PTB to chain swaps across multiple outcomes.
   * Each call mutates the balance in the hot potato and returns it for next call.
   *
   * @param tx - Transaction
   * @param config - Swap configuration
   * @returns Tuple of (modified_hot_potato, output_coin)
   *
   * @example Chain swaps
   * ```typescript
   * // Swap in outcome 0: stable → asset
   * const [batch1, assetOut0] = SwapEntry.swapInBatch(tx, {
   *   ...config,
   *   batch,
   *   inputCoinType: cond0StableType,
   *   outputCoinType: cond0AssetType,
   *   outcomeIndex: 0,
   *   coinIn: stableCoin,
   *   isAssetToStable: false,
   *   minAmountOut: 95_000_000n,
   * });
   *
   * // Swap in outcome 1: asset → stable
   * const [batch2, stableOut1] = SwapEntry.swapInBatch(tx, {
   *   ...config,
   *   batch: batch1,
   *   inputCoinType: cond1AssetType,
   *   outputCoinType: cond1StableType,
   *   outcomeIndex: 1,
   *   coinIn: assetCoin,
   *   isAssetToStable: true,
   *   minAmountOut: 95_000_000n,
   * });
   * ```
   */
  static swapInBatch(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      assetType: string;
      stableType: string;
      inputCoinType: string;
      outputCoinType: string;
      batch: ReturnType<Transaction['moveCall']>;
      session: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']>;
      outcomeIndex: number;
      coinIn: ReturnType<Transaction['moveCall']>;
      isAssetToStable: boolean;
      minAmountOut: bigint;
      escrowMutationRegistryId: string;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'swap_entry',
        'swap_in_batch'
      ),
      typeArguments: [
        config.assetType,
        config.stableType,
        config.inputCoinType,
        config.outputCoinType,
      ],
      arguments: [
        config.batch,
        config.session,
        config.escrow,
        tx.pure.u8(config.outcomeIndex),
        config.coinIn,
        tx.pure.bool(config.isAssetToStable),
        tx.pure.u64(config.minAmountOut),
        tx.object(config.escrowMutationRegistryId),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Finalize conditional swaps (consumes hot potato)
   *
   * Closes complete sets from accumulated balance, withdraws spot coins as profit,
   * and transfers to recipient. Returns remaining incomplete set as ConditionalMarketBalance.
   *
   * This MUST be called at end of PTB to consume hot potato.
   *
   * @param tx - Transaction
   * @param config - Configuration
   *
   * @example
   * ```typescript
   * SwapEntry.finalizeConditionalSwaps(tx, {
   *   marketsOperationsPackageId,
   *   assetType,
   *   stableType,
   *   batch,
   *   spotPool,
   *   proposal,
   *   escrow,
   *   session,
   *   recipient: '0x...',
   *   clock: '0x6',
   * });
   * ```
   */
  static finalizeConditionalSwaps(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      batch: ReturnType<Transaction['moveCall']>;
      spotPool: ReturnType<Transaction['moveCall']>;
      proposal: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']>;
      session: ReturnType<Transaction['moveCall']>;
      recipient: string;
      escrowRegistry: string;
      marketStateRegistry: string;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'swap_entry',
        'finalize_conditional_swaps'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.batch,
        config.spotPool,
        config.proposal,
        config.escrow,
        config.session,
        tx.pure.address(config.recipient),
        tx.object(config.escrowRegistry),
        tx.object(config.marketStateRegistry),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // ============================================================================
  // Read Functions (devInspect)
  // ============================================================================

  /**
   * Read escrow state with wrapped escrow from a proposal's spot pool
   *
   * Returns escrow state tuple for devInspect calls.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Tuple of escrow state values
   */
  static readEscrowStateWithWrappedEscrow(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      proposal: string;
      spotPool: string;
      spotPoolMutationRegistry: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'swap_entry',
        'read_escrow_state_with_wrapped_escrow'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.proposal),
        tx.object(config.spotPool),
        tx.object(config.spotPoolMutationRegistry),
      ],
    });
  }

  /**
   * Read spot oracle state from a unified spot pool
   *
   * Returns oracle state tuple for devInspect calls.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Tuple of oracle state values
   */
  static readSpotOracleState(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      spotPool: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'swap_entry',
        'read_spot_oracle_state'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.spotPool),
      ],
    });
  }
}
