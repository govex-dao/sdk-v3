/**
 * Quantum LP Manager Module
 *
 * Wrapper for `futarchy_markets_core::quantum_lp_manager`.
 *
 * Note: these calls are auth-gated in Move and are typically used by
 * protocol-owned packages (governance/actions), not by end users directly.
 *
 * @module quantum-lp-manager
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Quantum LP Manager Static Functions
 */
export class QuantumLPManager {
  /**
   * Auto quantum split on proposal start.
   *
   * Current Move target:
   * `auto_quantum_split_on_proposal_start<AssetType, StableType, LPType>`
   */
  static autoQuantumSplitOnProposalStart(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      spotPool: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']>;
      proposalId: string;
      conditionalLiquidityRatioPercent: bigint;
      escrowMutationRegistry: ReturnType<Transaction['moveCall']> | string;
      spotPoolMutationAuth: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsCorePackageId,
        'quantum_lp_manager',
        'auto_quantum_split_on_proposal_start'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.spotPool,
        config.escrow,
        tx.pure.id(config.proposalId),
        tx.pure.u64(config.conditionalLiquidityRatioPercent),
        typeof config.escrowMutationRegistry === 'string'
          ? tx.object(config.escrowMutationRegistry)
          : config.escrowMutationRegistry,
        tx.object(config.clock || '0x6'),
        config.spotPoolMutationAuth,
      ],
    });
  }

  /**
   * Auto redeem on proposal end from escrow.
   *
   * Current Move target:
   * `auto_redeem_on_proposal_end_from_escrow<AssetType, StableType, LPType>`
   */
  static autoRedeemOnProposalEndFromEscrow(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      winningOutcome: bigint;
      spotPool: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']>;
      escrowMutationRegistry: ReturnType<Transaction['moveCall']> | string;
      marketStateMutationRegistry: ReturnType<Transaction['moveCall']> | string;
      spotPoolMutationAuth: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsCorePackageId,
        'quantum_lp_manager',
        'auto_redeem_on_proposal_end_from_escrow'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.pure.u64(config.winningOutcome),
        config.spotPool,
        config.escrow,
        typeof config.escrowMutationRegistry === 'string'
          ? tx.object(config.escrowMutationRegistry)
          : config.escrowMutationRegistry,
        typeof config.marketStateMutationRegistry === 'string'
          ? tx.object(config.marketStateMutationRegistry)
          : config.marketStateMutationRegistry,
        tx.object(config.clock || '0x6'),
        config.spotPoolMutationAuth,
      ],
    });
  }
}
