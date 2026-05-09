/**
 * Liquidity Interact Module
 *
 * Methods to interact with AMM liquidity and escrow balances using
 * TreasuryCap-based conditional coins.
 *
 * Key features:
 * - Complete set minting/redemption
 * - AMM liquidity management
 * - Protocol fee collection
 * - LP withdrawal cranking
 *
 * @module liquidity-interact
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../../services/transaction';

/**
 * Liquidity Interact Static Functions
 *
 * Manage liquidity operations and escrow interactions.
 *
 * @example Redeem conditional tokens
 * ```typescript
 * const spotAsset = LiquidityInteract.redeemConditionalAsset(tx, {
 *   marketsOperationsPackageId,
 *   assetType,
 *   stableType,
 *   conditionalCoinType,
 *   proposal,
 *   escrow,
 *   conditionalCoin,
 *   outcomeIndex: 0n,
 * });
 * ```
 */
export class LiquidityInteract {
  // ============================================================================
  // Redemption
  // ============================================================================
  // NOTE: Single-outcome mint functions (mintConditionalAssetForOutcome,
  // mintConditionalStableForOutcome) were REMOVED. Single-outcome minting bypasses
  // the quantum invariant. All production deposits go through split_*_to_balance.

  /**
   * Redeem conditional asset coin back to spot asset
   *
   * Burns conditional coin and returns spot asset (1:1).
   * Only works for winning outcome after finalization.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Spot asset coin
   */
  static redeemConditionalAsset(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      assetType: string;
      stableType: string;
      conditionalCoinType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']>;
      conditionalCoin: ReturnType<Transaction['moveCall']>;
      outcomeIndex: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'liquidity_interact',
        'redeem_conditional_asset'
      ),
      typeArguments: [config.assetType, config.stableType, config.conditionalCoinType],
      arguments: [
        config.proposal,
        config.escrow,
        config.conditionalCoin,
        tx.pure.u64(config.outcomeIndex),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Redeem conditional stable coin back to spot stable
   *
   * Burns conditional coin and returns spot stable (1:1).
   * Only works for winning outcome after finalization.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Spot stable coin
   */
  static redeemConditionalStable(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      assetType: string;
      stableType: string;
      conditionalCoinType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']>;
      conditionalCoin: ReturnType<Transaction['moveCall']>;
      outcomeIndex: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'liquidity_interact',
        'redeem_conditional_stable'
      ),
      typeArguments: [config.assetType, config.stableType, config.conditionalCoinType],
      arguments: [
        config.proposal,
        config.escrow,
        config.conditionalCoin,
        tx.pure.u64(config.outcomeIndex),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // ============================================================================
  // AMM Liquidity Management
  // ============================================================================

  /**
   * Add liquidity to AMM pool for specific outcome (entry function)
   *
   * Takes asset and stable conditional coins and mints LP tokens.
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static addLiquidityEntry(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      assetType: string;
      stableType: string;
      assetConditionalCoin: string;
      stableConditionalCoin: string;
      lpConditionalCoin: string;
      proposal: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']>;
      outcomeIdx: bigint;
      assetIn: ReturnType<Transaction['moveCall']>;
      stableIn: ReturnType<Transaction['moveCall']>;
      minLpOut: bigint;
      escrowRegistry: string;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'liquidity_interact',
        'add_liquidity_entry'
      ),
      typeArguments: [
        config.assetType,
        config.stableType,
        config.assetConditionalCoin,
        config.stableConditionalCoin,
        config.lpConditionalCoin,
      ],
      arguments: [
        config.proposal,
        config.escrow,
        tx.pure.u64(config.outcomeIdx),
        config.assetIn,
        config.stableIn,
        tx.pure.u64(config.minLpOut),
        tx.object(config.escrowRegistry),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Remove liquidity from AMM pool proportionally (entry function)
   *
   * Burns LP tokens and returns asset and stable conditional coins.
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static removeLiquidityEntry(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      assetType: string;
      stableType: string;
      assetConditionalCoin: string;
      stableConditionalCoin: string;
      lpConditionalCoin: string;
      proposal: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']>;
      outcomeIdx: bigint;
      lpToken: ReturnType<Transaction['moveCall']>;
      minAssetOut: bigint;
      minStableOut: bigint;
      escrowRegistry: string;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'liquidity_interact',
        'remove_liquidity_entry'
      ),
      typeArguments: [
        config.assetType,
        config.stableType,
        config.assetConditionalCoin,
        config.stableConditionalCoin,
        config.lpConditionalCoin,
      ],
      arguments: [
        config.proposal,
        config.escrow,
        tx.pure.u64(config.outcomeIdx),
        config.lpToken,
        tx.pure.u64(config.minAssetOut),
        tx.pure.u64(config.minStableOut),
        tx.object(config.escrowRegistry),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // ============================================================================
  // Protocol Fee Collection
  // ============================================================================

  /**
   * Collect protocol fees from winning pool after finalization
   *
   * Withdraws fees from escrow and deposits them to fee manager.
   * Collects both asset and stable token fees.
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
	  static collectProtocolFees(
	    tx: Transaction,
	    config: {
	      marketsOperationsPackageId: string;
	      assetType: string;
	      stableType: string;
	      proposal: ReturnType<Transaction['moveCall']>;
	      escrow: ReturnType<Transaction['moveCall']>;
	      feeManager: ReturnType<Transaction['moveCall']>;
	      adminCap: ReturnType<Transaction['moveCall']>;
	      escrowRegistry: string;
	      marketStateRegistry: string;
	      clock?: string;
	    }
	  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'liquidity_interact',
        'collect_protocol_fees'
      ),
      typeArguments: [config.assetType, config.stableType],
	      arguments: [
	        config.proposal,
	        config.escrow,
	        config.feeManager,
	        config.adminCap,
	        tx.object(config.escrowRegistry),
	        tx.object(config.marketStateRegistry),
	        tx.object(config.clock || '0x6'),
	      ],
	    });
	  }

  // ============================================================================
  // Emergency Recovery (Wrapped Escrow)
  // ============================================================================

  /**
   * Emergency withdraw escrow balances while escrow is wrapped in the spot pool
   */
  static emergencyWithdrawEscrowToSenderWithWrappedEscrow(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      spotPool: ReturnType<Transaction['moveCall']>;
      assetAmount: bigint;
      stableAmount: bigint;
      spotPoolMutationRegistry: string;
      clock?: string;
      emergencyCap: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'liquidity_interact',
        'emergency_withdraw_escrow_to_sender_with_wrapped_escrow'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.proposal,
        config.spotPool,
        tx.pure.u64(config.assetAmount),
        tx.pure.u64(config.stableAmount),
        tx.object(config.spotPoolMutationRegistry),
        tx.object(config.clock || '0x6'),
        config.emergencyCap,
      ],
    });
  }

  /**
   * Emergency take asset treasury cap while escrow is wrapped in the spot pool
   */
  static emergencyTakeAssetTreasuryCapToSenderWithWrappedEscrow(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      conditionalCoinType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      spotPool: ReturnType<Transaction['moveCall']>;
      outcomeIndex: bigint;
      spotPoolMutationRegistry: string;
      clock?: string;
      emergencyCap: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'liquidity_interact',
        'emergency_take_asset_treasury_cap_to_sender_with_wrapped_escrow'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType, config.conditionalCoinType],
      arguments: [
        config.proposal,
        config.spotPool,
        tx.pure.u64(config.outcomeIndex),
        tx.object(config.spotPoolMutationRegistry),
        tx.object(config.clock || '0x6'),
        config.emergencyCap,
      ],
    });
  }

  /**
   * Emergency take stable treasury cap while escrow is wrapped in the spot pool
   */
  static emergencyTakeStableTreasuryCapToSenderWithWrappedEscrow(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      conditionalCoinType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      spotPool: ReturnType<Transaction['moveCall']>;
      outcomeIndex: bigint;
      spotPoolMutationRegistry: string;
      clock?: string;
      emergencyCap: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'liquidity_interact',
        'emergency_take_stable_treasury_cap_to_sender_with_wrapped_escrow'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType, config.conditionalCoinType],
      arguments: [
        config.proposal,
        config.spotPool,
        tx.pure.u64(config.outcomeIndex),
        tx.object(config.spotPoolMutationRegistry),
        tx.object(config.clock || '0x6'),
        config.emergencyCap,
      ],
    });
  }

  /**
   * Emergency burn asset treasury cap while escrow is wrapped in the spot pool
   */
  static emergencyBurnAssetTreasuryCapWithWrappedEscrow(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      conditionalCoinType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      spotPool: ReturnType<Transaction['moveCall']>;
      outcomeIndex: bigint;
      spotPoolMutationRegistry: string;
      clock?: string;
      emergencyCap: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'liquidity_interact',
        'emergency_burn_asset_treasury_cap_with_wrapped_escrow'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType, config.conditionalCoinType],
      arguments: [
        config.proposal,
        config.spotPool,
        tx.pure.u64(config.outcomeIndex),
        tx.object(config.spotPoolMutationRegistry),
        tx.object(config.clock || '0x6'),
        config.emergencyCap,
      ],
    });
  }

  /**
   * Emergency burn stable treasury cap while escrow is wrapped in the spot pool
   */
  static emergencyBurnStableTreasuryCapWithWrappedEscrow(
    tx: Transaction,
    config: {
      marketsOperationsPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      conditionalCoinType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      spotPool: ReturnType<Transaction['moveCall']>;
      outcomeIndex: bigint;
      spotPoolMutationRegistry: string;
      clock?: string;
      emergencyCap: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsOperationsPackageId,
        'liquidity_interact',
        'emergency_burn_stable_treasury_cap_with_wrapped_escrow'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType, config.conditionalCoinType],
      arguments: [
        config.proposal,
        config.spotPool,
        tx.pure.u64(config.outcomeIndex),
        tx.object(config.spotPoolMutationRegistry),
        tx.object(config.clock || '0x6'),
        config.emergencyCap,
      ],
    });
  }

}
