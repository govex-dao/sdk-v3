/**
 * Arbitrage Math Module
 *
 * N-OUTCOME ARBITRAGE MATH - EFFICIENT B-PARAMETERIZATION
 *
 * Key Improvements:
 * - B-parameterization (no square roots, cleaner math)
 * - Early exit checks (BOTH directions optimized)
 * - Bidirectional solving (catches all opportunities)
 * - Min profit threshold (simple profitability check)
 * - u256 arithmetic (accurate overflow-free calculations)
 * - Ternary search precision (max(1%, MIN_COARSE_THRESHOLD) to prevent infinite loops)
 * - Concavity proof (F(b) is strictly concave, ternary search is optimal)
 * - Smart bounding (95%+ gas reduction via 1.1x user swap hint)
 *
 * Smart Bounding Insight:
 * The optimization is mathematically correct because the max arbitrage opportunity
 * ≤ the swap that created it! User swaps 1,000 tokens → search [0, 1,100] not [0, 10^18].
 * This is not an approximation - it's exact search in a tighter, correct bound.
 *
 * @module arbitrage-math
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Arbitrage Math Static Functions
 *
 * Wrappers for current spot/conditional routing helpers.
 */
export class ArbitrageMath {
  /**
   * Compute the best internal system rebalance after a conditional swap.
   * Returns `(amount, is_cond_to_spot, k_gain)`.
   */
  static computeOptimalInternalRebalance(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      spot: ReturnType<Transaction['moveCall']>;
      conditionals: ReturnType<Transaction['moveCall']>;
      userSwapOutput: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'arbitrage_math', 'compute_optimal_internal_rebalance'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.spot,
        config.conditionals,
        tx.pure.u64(config.userSwapOutput),
      ],
    });
  }

  /**
   * Compute best asset-to-stable route split.
   * Returns `(spot_asset_in, conditional_asset_in, expected_stable_out)`.
   */
  static computeBestAssetToStableSplit(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      spot: ReturnType<Transaction['moveCall']>;
      conditionals: ReturnType<Transaction['moveCall']>;
      assetAmount: bigint;
      conditionalStableOutputCap: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'arbitrage_math', 'compute_best_asset_to_stable_split'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.spot,
        config.conditionals,
        tx.pure.u64(config.assetAmount),
        tx.pure.u64(config.conditionalStableOutputCap),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Compute best stable-to-asset route split.
   * Returns `(spot_stable_in, conditional_stable_in, expected_asset_out)`.
   */
  static computeBestStableToAssetSplit(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      spot: ReturnType<Transaction['moveCall']>;
      conditionals: ReturnType<Transaction['moveCall']>;
      stableAmount: bigint;
      conditionalAssetOutputCap: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'arbitrage_math', 'compute_best_stable_to_asset_split'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.spot,
        config.conditionals,
        tx.pure.u64(config.stableAmount),
        tx.pure.u64(config.conditionalAssetOutputCap),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

}
