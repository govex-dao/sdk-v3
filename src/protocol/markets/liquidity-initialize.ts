/**
 * Liquidity Initialize Module
 *
 * Creates empty conditional AMM pools for each outcome.
 * Liquidity is injected later via auto_quantum_split_on_proposal_start.
 *
 * @module liquidity-initialize
 */

import { Transaction } from '@mysten/sui/transactions';

/**
 * Liquidity Initialize Static Functions
 *
 * Create empty outcome markets. Pools start with zero reserves;
 * liquidity is injected later at advance-to-trading.
 */
export class LiquidityInitialize {
  /**
   * Create empty outcome markets using TreasuryCap-based conditional coins
   *
   * IMPORTANT: This function is `public(package)` and cannot be called
   * from off-chain PTBs. Use `futarchy_proposal::proposal::finalize_proposal` instead.
   */
  static createOutcomeMarkets(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      escrow: ReturnType<Transaction['moveCall']>;
      outcomeCount: bigint;
      twapStartDelay: bigint;
      twapInitialObservation: bigint;
      twapCapPpm: bigint;
      ammTotalFeeBps: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    void tx;
    void config;
    throw new Error(
      'liquidity_initialize::create_outcome_markets is public(package) and cannot be called from off-chain PTBs. Use proposal::finalize_proposal instead.'
    );
  }
}
