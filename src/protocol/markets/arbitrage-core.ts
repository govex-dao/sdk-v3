/**
 * Arbitrage Core Module
 *
 * The old ArbitrageCore class has been removed. It targeted a non-existent
 * `arbitrage_core` module. The actual contract module is `futarchy_markets_core::arbitrage`
 * with a single public function: `auto_rebalance_spot_after_conditional_swaps`.
 *
 * Use ArbitrageRebalance below for the correct contract wrapper.
 *
 * @module arbitrage-core
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Arbitrage Rebalance - wrapper for the actual arbitrage module
 *
 * The contract module `futarchy_markets_core::arbitrage` has a single public function:
 * `auto_rebalance_spot_after_conditional_swaps` which performs internal balance-based
 * arbitrage to bring spot price back into equilibrium after conditional swaps.
 */
export class ArbitrageCore {
  /**
   * Automatic arbitrage after conditional swaps to bring spot price back into safe range.
   *
   * After users swap in conditional pools, spot price can drift outside the conditional
   * price range. This function atomically arbitrages using pool liquidity (no user coins
   * required) to bring spot price back into equilibrium.
   *
   * Uses ternary search to find the globally optimal arbitrage amount in a single call.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Option<ConditionalMarketBalance> - Some(balance) if arbitrage ran, None otherwise
   */
  static autoRebalanceSpotAfterConditionalSwaps(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      spotPool: ReturnType<Transaction['moveCall']> | string;
      escrow: ReturnType<Transaction['moveCall']> | string;
      existingBalanceOpt: ReturnType<Transaction['moveCall']>;
      escrowRegistry: string;
      marketStateRegistry: string;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'arbitrage', 'auto_rebalance_spot_after_conditional_swaps'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        typeof config.spotPool === 'string' ? tx.object(config.spotPool) : config.spotPool,
        typeof config.escrow === 'string' ? tx.object(config.escrow) : config.escrow,
        config.existingBalanceOpt,
        tx.object(config.escrowRegistry),
        tx.object(config.marketStateRegistry),
        tx.object(config.clock || '0x6'),
      ],
    });
  }
}
