/**
 * Coin Escrow Operations
 *
 * Escrow system for conditional tokens with per-outcome allocation tracking.
 *
 * Manages:
 * - Minting conditional tokens by depositing spot coins
 * - Burning conditional tokens to withdraw spot coins
 * - Split operations (spot -> conditional)
 * - Recombine operations (conditional -> spot)
 * - Supply tracking for all conditional coin types
 * - Per-outcome escrow allocation tracking
 *
 * Key Invariant:
 *   outcome_escrowed[i] == supply[i] + wrapped[i] for each token type per outcome
 *
 * This invariant ensures solvency - the escrow always holds enough backing
 * to pay out winners after market finalization.
 *
 * @module coin-escrow
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Coin Escrow Static Functions
 *
 * Manage conditional token minting, burning, and escrow operations.
 *
 * @example Burn conditional tokens and withdraw
 * ```typescript
 * const spotAsset = CoinEscrow.burnConditionalAssetAndWithdraw(tx, {
 *   marketsPackageId,
 *   assetType,
 *   stableType,
 *   conditionalType,
 *   escrow,
 *   conditionalCoin,
 * });
 * ```
 */
export class CoinEscrow {
  // ============================================================================
  // Creation & Registration
  // ============================================================================

  /**
   * Create new conditional coin escrow
   *
   * Initializes escrow for a specific market/proposal.
   *
   * @param tx - Transaction
   * @param config - Escrow creation configuration
   * @returns CoinEscrow object
   */
  static new(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      marketState: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsPackageId, 'coin_escrow', 'new'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.marketState],
    });
  }

  /**
   * Register conditional coin treasury capabilities
   *
   * Registers TreasuryCaps for minting/burning conditional coins.
   * Must be called for each outcome before minting is possible.
   *
   * @param tx - Transaction
   * @param config - Registration configuration
   */
  static registerConditionalCaps(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      assetConditionalType: string;
      stableConditionalType: string;
      escrowId: string;
      outcomeIdx: number;
      assetTreasuryCap: ReturnType<Transaction['moveCall']>;
      stableTreasuryCap: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'register_conditional_caps'
      ),
      typeArguments: [
        config.assetType,
        config.stableType,
        config.assetConditionalType,
        config.stableConditionalType,
      ],
      arguments: [
        tx.object(config.escrowId),
        tx.pure.u64(config.outcomeIdx),
        config.assetTreasuryCap,
        config.stableTreasuryCap,
      ],
    });
  }

  // ============================================================================
  // Auth-Gated Mint/Burn (Requires EscrowMutationAuth)
  // ============================================================================

  /**
   * Mint conditional coins (asset or stable)
   *
   * Requires EscrowMutationAuth for authorization.
   * Use isAsset=true for asset coins, false for stable coins.
   *
   * @param tx - Transaction
   * @param config - Minting configuration
   * @returns Conditional coin
   */
  static mintConditional(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      conditionalType: string;
      escrowId: string;
      outcomeIndex: number;
      isAsset: boolean;
      amount: bigint;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'mint_conditional'
      ),
      typeArguments: [config.assetType, config.stableType, config.conditionalType],
      arguments: [
        tx.object(config.escrowId),
        tx.pure.u64(config.outcomeIndex),
        tx.pure.bool(config.isAsset),
        tx.pure.u64(config.amount),
        config.auth,
      ],
    });
  }

  /**
   * Burn conditional coins (asset or stable)
   *
   * Requires EscrowMutationAuth for authorization.
   * Use isAsset=true for asset coins, false for stable coins.
   *
   * @param tx - Transaction
   * @param config - Burning configuration
   */
  static burnConditional(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      conditionalType: string;
      escrowId: string;
      outcomeIndex: number;
      isAsset: boolean;
      coin: ReturnType<Transaction['moveCall']>;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'burn_conditional'
      ),
      typeArguments: [config.assetType, config.stableType, config.conditionalType],
      arguments: [
        tx.object(config.escrowId),
        tx.pure.u64(config.outcomeIndex),
        tx.pure.bool(config.isAsset),
        config.coin,
        config.auth,
      ],
    });
  }

  // ============================================================================
  // Burn/Withdraw
  // ============================================================================
  // NOTE: depositAssetAndMintConditional and depositStableAndMintConditional were
  // REMOVED. Single-outcome minting bypasses the quantum invariant and exposes a
  // post-finalization attack surface. Use split_*_to_balance for all deposits.

  /**
   * Burn conditional asset and withdraw spot asset
   *
   * High-level: Burns conditional asset and withdraws underlying spot asset.
   *
   * @returns Spot asset coin
   */
  static burnConditionalAssetAndWithdraw(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      conditionalType: string;
      escrowId: string;
      conditionalCoin: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'burn_conditional_asset_and_withdraw'
      ),
      typeArguments: [config.assetType, config.stableType, config.conditionalType],
      arguments: [tx.object(config.escrowId), config.conditionalCoin],
    });
  }

  /**
   * Burn conditional stable and withdraw spot stable
   *
   * High-level: Burns conditional stable and withdraws underlying spot stable.
   *
   * @returns Spot stable coin
   */
  static burnConditionalStableAndWithdraw(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      conditionalType: string;
      escrowId: string;
      conditionalCoin: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'burn_conditional_stable_and_withdraw'
      ),
      typeArguments: [config.assetType, config.stableType, config.conditionalType],
      arguments: [tx.object(config.escrowId), config.conditionalCoin],
    });
  }

  /**
   * Deposit spot liquidity (both asset and stable)
   *
   * Convenience function for depositing both coins at once.
   */
  static depositSpotLiquidity(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      escrowId: string;
      assetBalance: ReturnType<Transaction['moveCall']>;
      stableBalance: ReturnType<Transaction['moveCall']>;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'deposit_spot_liquidity'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.escrowId),
        config.assetBalance,
        config.stableBalance,
        config.auth,
      ],
    });
  }

  // ============================================================================
  // Query Functions
  // ============================================================================

  /**
   * Get conditional asset supply for specific outcome
   *
   * @returns Total supply of conditional asset coins
   */
  static getAssetSupply(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      conditionalType: string;
      escrowId: string;
      /** Outcome index (0-based) */
      outcomeIndex: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'get_asset_supply'
      ),
      typeArguments: [config.assetType, config.stableType, config.conditionalType],
      // Move: get_asset_supply(escrow, outcome_index)
      arguments: [tx.object(config.escrowId), tx.pure.u64(config.outcomeIndex)],
    });
  }

  /**
   * Get conditional stable supply for specific outcome
   *
   * @returns Total supply of conditional stable coins
   */
  static getStableSupply(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      conditionalType: string;
      escrowId: string;
      /** Outcome index (0-based) */
      outcomeIndex: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'get_stable_supply'
      ),
      typeArguments: [config.assetType, config.stableType, config.conditionalType],
      // Move: get_stable_supply(escrow, outcome_index)
      arguments: [tx.object(config.escrowId), tx.pure.u64(config.outcomeIndex)],
    });
  }

  /**
   * Get spot balances in escrow
   *
   * @returns Tuple of (asset_balance, stable_balance)
   */
  static getSpotBalances(
    tx: Transaction,
    marketsPackageId: string,
    assetType: string,
    stableType: string,
    escrowId: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'coin_escrow',
        'get_spot_balances'
      ),
      typeArguments: [assetType, stableType],
      arguments: [tx.object(escrowId)],
    });
  }

  /**
   * Get market state reference
   */
  static getMarketState(
    tx: Transaction,
    marketsPackageId: string,
    assetType: string,
    stableType: string,
    escrowId: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'coin_escrow',
        'get_market_state'
      ),
      typeArguments: [assetType, stableType],
      arguments: [tx.object(escrowId)],
    });
  }

  /**
   * Get mutable market state reference
   *
   * Requires EscrowMutationAuth for authorization.
   */
  static getMarketStateMut(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      escrowId: string;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'get_market_state_mut'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [tx.object(config.escrowId), config.auth],
    });
  }

  /**
   * Get market state ID
   */
  static marketStateId(
    tx: Transaction,
    marketsPackageId: string,
    assetType: string,
    stableType: string,
    escrowId: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'coin_escrow',
        'market_state_id'
      ),
      typeArguments: [assetType, stableType],
      arguments: [tx.object(escrowId)],
    });
  }

  /**
   * Get number of conditional caps registered
   *
   * @returns Count of registered TreasuryCaps
   */
  static capsRegisteredCount(
    tx: Transaction,
    marketsPackageId: string,
    assetType: string,
    stableType: string,
    escrowId: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'coin_escrow',
        'caps_registered_count'
      ),
      typeArguments: [assetType, stableType],
      arguments: [tx.object(escrowId)],
    });
  }

  // ============================================================================
  // Per-Outcome Escrow Allocation Queries
  // ============================================================================

  /**
   * Get escrowed asset amount for a specific outcome
   *
   * Returns the total asset allocation for the given outcome.
   * This equals supply[outcome] + wrapped[outcome] for asset type.
   *
   * @param tx - Transaction
   * @param marketsPackageId - Package ID
   * @param assetType - Asset coin type
   * @param stableType - Stable coin type
   * @param escrowId - TokenEscrow object ID
   * @param outcomeIndex - Outcome index (0-based)
   * @returns Escrowed asset amount (u64)
   */
  static getOutcomeEscrowedAsset(
    tx: Transaction,
    marketsPackageId: string,
    assetType: string,
    stableType: string,
    escrowId: string,
    outcomeIndex: number
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'coin_escrow',
        'get_outcome_escrowed_asset'
      ),
      typeArguments: [assetType, stableType],
      arguments: [tx.object(escrowId), tx.pure.u64(outcomeIndex)],
    });
  }

  /**
   * Get escrowed stable amount for a specific outcome
   *
   * Returns the total stable allocation for the given outcome.
   * This equals supply[outcome] + wrapped[outcome] for stable type.
   *
   * @param tx - Transaction
   * @param marketsPackageId - Package ID
   * @param assetType - Asset coin type
   * @param stableType - Stable coin type
   * @param escrowId - TokenEscrow object ID
   * @param outcomeIndex - Outcome index (0-based)
   * @returns Escrowed stable amount (u64)
   */
  static getOutcomeEscrowedStable(
    tx: Transaction,
    marketsPackageId: string,
    assetType: string,
    stableType: string,
    escrowId: string,
    outcomeIndex: number
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'coin_escrow',
        'get_outcome_escrowed_stable'
      ),
      typeArguments: [assetType, stableType],
      arguments: [tx.object(escrowId), tx.pure.u64(outcomeIndex)],
    });
  }

  /**
   * Withdraw asset balance from escrow
   *
   * Requires EscrowMutationAuth for authorization.
   *
   * @returns Asset coin
   */
  static withdrawAssetBalance(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      escrowId: string;
      amount: bigint;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'withdraw_asset_balance'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [tx.object(config.escrowId), tx.pure.u64(config.amount), config.auth],
    });
  }

  /**
   * Withdraw stable balance from escrow
   *
   * Requires EscrowMutationAuth for authorization.
   *
   * @returns Stable coin
   */
  static withdrawStableBalance(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      escrowId: string;
      amount: bigint;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'withdraw_stable_balance'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [tx.object(config.escrowId), tx.pure.u64(config.amount), config.auth],
    });
  }

  // ============================================================================
  // Progressive Split Operations (for large amounts)
  // ============================================================================

  /**
   * Start progressive asset split operation
   *
   * For splitting large amounts across multiple transactions.
   *
   * @returns SplitAssetProgress hot potato
   */
  static startSplitAssetProgress(
    tx: Transaction,
    marketsPackageId: string,
    assetType: string,
    stableType: string,
    escrowId: string,
    assetCoin: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'coin_escrow',
        'start_split_asset_progress'
      ),
      typeArguments: [assetType, stableType],
      arguments: [tx.object(escrowId), assetCoin],
    });
  }

  /**
   * Execute one step of asset split
   *
   * Mints conditional coins for one outcome.
   * Move: split_asset_progress_step(progress, escrow, outcome_index, ctx)
   */
  static splitAssetProgressStep(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      conditionalType: string;
      progress: ReturnType<Transaction['moveCall']>;
      /** TokenEscrow object (mut ref) */
      escrow: ReturnType<Transaction['moveCall']> | string;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'split_asset_progress_step'
      ),
      typeArguments: [config.assetType, config.stableType, config.conditionalType],
      // Move: split_asset_progress_step(progress, escrow, outcome_index, ctx)
      arguments: [
        config.progress,
        typeof config.escrow === 'string' ? tx.object(config.escrow) : config.escrow,
        tx.pure.u64(config.outcomeIdx),
      ],
    });
  }

  /**
   * Finish asset split operation
   *
   * Completes the split and destroys progress hot potato.
   * Move: finish_split_asset_progress(progress, escrow)
   */
  static finishSplitAssetProgress(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      progress: ReturnType<Transaction['moveCall']>;
      /** TokenEscrow object (ref) */
      escrow: ReturnType<Transaction['moveCall']> | string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'finish_split_asset_progress'
      ),
      typeArguments: [config.assetType, config.stableType],
      // Move: finish_split_asset_progress(progress, escrow)
      arguments: [
        config.progress,
        typeof config.escrow === 'string' ? tx.object(config.escrow) : config.escrow,
      ],
    });
  }

  /**
   * Start progressive stable split operation
   *
   * @returns SplitStableProgress hot potato
   */
  static startSplitStableProgress(
    tx: Transaction,
    marketsPackageId: string,
    assetType: string,
    stableType: string,
    escrowId: string,
    stableCoin: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'coin_escrow',
        'start_split_stable_progress'
      ),
      typeArguments: [assetType, stableType],
      arguments: [tx.object(escrowId), stableCoin],
    });
  }

  /**
   * Execute one step of stable split
   * Move: split_stable_progress_step(progress, escrow, outcome_index, ctx)
   */
  static splitStableProgressStep(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      conditionalType: string;
      progress: ReturnType<Transaction['moveCall']>;
      /** TokenEscrow object (mut ref) */
      escrow: ReturnType<Transaction['moveCall']> | string;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'split_stable_progress_step'
      ),
      typeArguments: [config.assetType, config.stableType, config.conditionalType],
      // Move: split_stable_progress_step(progress, escrow, outcome_index, ctx)
      arguments: [
        config.progress,
        typeof config.escrow === 'string' ? tx.object(config.escrow) : config.escrow,
        tx.pure.u64(config.outcomeIdx),
      ],
    });
  }

  /**
   * Finish stable split operation
   * Move: finish_split_stable_progress(progress, escrow)
   */
  static finishSplitStableProgress(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      progress: ReturnType<Transaction['moveCall']>;
      /** TokenEscrow object (ref) */
      escrow: ReturnType<Transaction['moveCall']> | string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'finish_split_stable_progress'
      ),
      typeArguments: [config.assetType, config.stableType],
      // Move: finish_split_stable_progress(progress, escrow)
      arguments: [
        config.progress,
        typeof config.escrow === 'string' ? tx.object(config.escrow) : config.escrow,
      ],
    });
  }

  // ============================================================================
  // Progressive Recombine Operations
  // ============================================================================

  /**
   * Start progressive asset recombine operation
   *
   * Combines conditional assets back into spot asset.
   * Move: start_recombine_asset_progress<AssetType, StableType, ConditionalCoinType>(escrow, outcome_index, coin)
   *
   * @returns RecombineAssetProgress hot potato
   */
  static startRecombineAssetProgress(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      /** ConditionalCoinType for outcome 0 */
      conditionalType: string;
      escrowId: string;
      /** Must be 0 (first outcome starts the recombine) */
      outcomeIndex: number;
      /** Conditional coin to burn for outcome 0 */
      conditionalCoin: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'start_recombine_asset_progress'
      ),
      // Move requires 3 type args: <AssetType, StableType, ConditionalCoinType>
      typeArguments: [config.assetType, config.stableType, config.conditionalType],
      // Move: start_recombine_asset_progress(escrow, outcome_index, coin)
      arguments: [
        tx.object(config.escrowId),
        tx.pure.u64(config.outcomeIndex),
        config.conditionalCoin,
      ],
    });
  }

  /**
   * Execute one step of asset recombine
   * Move: recombine_asset_progress_step(progress, escrow, outcome_index, coin)
   */
  static recombineAssetProgressStep(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      conditionalType: string;
      progress: ReturnType<Transaction['moveCall']>;
      /** TokenEscrow object (mut ref) */
      escrow: ReturnType<Transaction['moveCall']> | string;
      /** Outcome index for this step */
      outcomeIndex: number;
      conditionalCoin: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'recombine_asset_progress_step'
      ),
      typeArguments: [config.assetType, config.stableType, config.conditionalType],
      // Move: recombine_asset_progress_step(progress, escrow, outcome_index, coin)
      arguments: [
        config.progress,
        typeof config.escrow === 'string' ? tx.object(config.escrow) : config.escrow,
        tx.pure.u64(config.outcomeIndex),
        config.conditionalCoin,
      ],
    });
  }

  /**
   * Finish asset recombine operation
   * Move: finish_recombine_asset_progress(progress, escrow, ctx)
   *
   * @returns Spot asset coin
   */
  static finishRecombineAssetProgress(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      progress: ReturnType<Transaction['moveCall']>;
      /** TokenEscrow object (mut ref) */
      escrow: ReturnType<Transaction['moveCall']> | string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'finish_recombine_asset_progress'
      ),
      typeArguments: [config.assetType, config.stableType],
      // Move: finish_recombine_asset_progress(progress, escrow, ctx)
      arguments: [
        config.progress,
        typeof config.escrow === 'string' ? tx.object(config.escrow) : config.escrow,
      ],
    });
  }

  /**
   * Start progressive stable recombine operation
   * Move: start_recombine_stable_progress<AssetType, StableType, ConditionalCoinType>(escrow, outcome_index, coin)
   *
   * @returns RecombineStableProgress hot potato
   */
  static startRecombineStableProgress(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      /** ConditionalCoinType for outcome 0 */
      conditionalType: string;
      escrowId: string;
      /** Must be 0 (first outcome starts the recombine) */
      outcomeIndex: number;
      /** Conditional coin to burn for outcome 0 */
      conditionalCoin: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'start_recombine_stable_progress'
      ),
      // Move requires 3 type args: <AssetType, StableType, ConditionalCoinType>
      typeArguments: [config.assetType, config.stableType, config.conditionalType],
      // Move: start_recombine_stable_progress(escrow, outcome_index, coin)
      arguments: [
        tx.object(config.escrowId),
        tx.pure.u64(config.outcomeIndex),
        config.conditionalCoin,
      ],
    });
  }

  /**
   * Execute one step of stable recombine
   * Move: recombine_stable_progress_step(progress, escrow, outcome_index, coin)
   */
  static recombineStableProgressStep(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      conditionalType: string;
      progress: ReturnType<Transaction['moveCall']>;
      /** TokenEscrow object (mut ref) */
      escrow: ReturnType<Transaction['moveCall']> | string;
      /** Outcome index for this step */
      outcomeIndex: number;
      conditionalCoin: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'recombine_stable_progress_step'
      ),
      typeArguments: [config.assetType, config.stableType, config.conditionalType],
      // Move: recombine_stable_progress_step(progress, escrow, outcome_index, coin)
      arguments: [
        config.progress,
        typeof config.escrow === 'string' ? tx.object(config.escrow) : config.escrow,
        tx.pure.u64(config.outcomeIndex),
        config.conditionalCoin,
      ],
    });
  }

  /**
   * Finish stable recombine operation
   * Move: finish_recombine_stable_progress(progress, escrow, ctx)
   *
   * @returns Spot stable coin
   */
  static finishRecombineStableProgress(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      assetType: string;
      stableType: string;
      progress: ReturnType<Transaction['moveCall']>;
      /** TokenEscrow object (mut ref) */
      escrow: ReturnType<Transaction['moveCall']> | string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'coin_escrow',
        'finish_recombine_stable_progress'
      ),
      typeArguments: [config.assetType, config.stableType],
      // Move: finish_recombine_stable_progress(progress, escrow, ctx)
      arguments: [
        config.progress,
        typeof config.escrow === 'string' ? tx.object(config.escrow) : config.escrow,
      ],
    });
  }

}
