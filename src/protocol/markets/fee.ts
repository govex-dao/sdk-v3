/**
 * Fee Module
 *
 * Manages all fees earned by the protocol and provides admin fee withdrawal interface.
 *
 * Fee Types:
 * - DAO creation fee (SUI)
 * - Proposal creation fee (SUI, per-outcome)
 * - Launchpad creation fee (SUI)
 * - AMM fees (StableType, AssetType balances)
 *
 * Features:
 * - Fee update delays (6 months for increases)
 * - 10x cap on fee increases from baseline
 * - Baseline resets after 6 months
 *
 * @module fee
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Fee Static Functions
 *
 * Protocol fee management and withdrawal.
 */
export class Fee {
  // ============================================================================
  // Admin Cap Validation
  // ============================================================================

  /**
   * Assert that admin cap controls the fee manager
   *
   * Validates that the FeeAdminCap is the authorized admin for this FeeManager.
   * Used by collect_protocol_fees authorization gate.
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static assertAdminCap(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      feeManager: ReturnType<Transaction['moveCall']>;
      adminCap: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'fee', 'assert_admin_cap'),
      typeArguments: [],
      arguments: [config.feeManager, config.adminCap],
    });
  }

  // ============================================================================
  // Fee Collection Functions
  // ============================================================================

  /**
   * Collect DAO creation fee
   *
   * Deposits SUI payment for creating a new DAO.
   * Emits DAOCreationFeeCollected event.
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static depositDaoCreationPayment(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      feeManager: ReturnType<Transaction['moveCall']>;
      payment: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'fee', 'deposit_dao_creation_payment'),
      typeArguments: [],
      arguments: [
        config.feeManager,
        config.payment,
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Collect launchpad creation fee
   *
   * Deposits SUI payment for creating a new launchpad.
   * Emits LaunchpadCreationFeeCollected event.
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static depositLaunchpadCreationPayment(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      feeManager: ReturnType<Transaction['moveCall']>;
      payment: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'fee', 'deposit_launchpad_creation_payment'),
      typeArguments: [],
      arguments: [
        config.feeManager,
        config.payment,
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Collect proposal creation fee
   *
   * Deposits SUI payment for creating a new proposal.
   * Fee = proposal_creation_fee_per_outcome * outcome_count
   * Emits ProposalCreationFeeCollected event.
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static depositProposalCreationPayment(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      feeManager: ReturnType<Transaction['moveCall']>;
      payment: ReturnType<Transaction['moveCall']>;
      outcomeCount: bigint;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'fee', 'deposit_proposal_creation_payment'),
      typeArguments: [],
      arguments: [
        config.feeManager,
        config.payment,
        tx.pure.u64(config.outcomeCount),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // ============================================================================
  // Admin Fee Configuration Functions
  // ============================================================================

  /**
   * Update DAO creation fee
   *
   * Admin function to update fee for creating new DAOs.
   * Emits DAOCreationFeeUpdated event.
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static updateDaoCreationFee(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      feeManager: ReturnType<Transaction['moveCall']>;
      adminCap: ReturnType<Transaction['moveCall']>;
      newFee: bigint;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'fee', 'update_dao_creation_fee'),
      typeArguments: [],
      arguments: [
        config.feeManager,
        config.adminCap,
        tx.pure.u64(config.newFee),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Update proposal creation fee
   *
   * Admin function to update fee per outcome for creating proposals.
   * Emits ProposalCreationFeeUpdated event.
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static updateProposalCreationFee(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      feeManager: ReturnType<Transaction['moveCall']>;
      adminCap: ReturnType<Transaction['moveCall']>;
      newFeePerOutcome: bigint;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'fee', 'update_proposal_creation_fee'),
      typeArguments: [],
      arguments: [
        config.feeManager,
        config.adminCap,
        tx.pure.u64(config.newFeePerOutcome),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Update launchpad creation fee
   *
   * Admin function to update fee for creating launchpads.
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static updateLaunchpadCreationFee(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      feeManager: ReturnType<Transaction['moveCall']>;
      adminCap: ReturnType<Transaction['moveCall']>;
      newFee: bigint;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'fee', 'update_launchpad_creation_fee'),
      typeArguments: [],
      arguments: [
        config.feeManager,
        config.adminCap,
        tx.pure.u64(config.newFee),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // ============================================================================
  // View Functions
  // ============================================================================

  /**
   * Get DAO creation fee
   *
   * Returns the current fee for creating a new DAO.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Fee amount (u64)
   */
  static getDaoCreationFee(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      feeManager: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'fee', 'get_dao_creation_fee'),
      typeArguments: [],
      arguments: [config.feeManager],
    });
  }

  /**
   * Get proposal creation fee per outcome
   *
   * Returns the current fee per outcome for creating proposals.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Fee per outcome (u64)
   */
  static getProposalCreationFeePerOutcome(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      feeManager: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'fee', 'get_proposal_creation_fee_per_outcome'),
      typeArguments: [],
      arguments: [config.feeManager],
    });
  }

  /**
   * Get launchpad creation fee
   *
   * Returns the current fee for creating a launchpad.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Fee amount (u64)
   */
  static getLaunchpadCreationFee(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      feeManager: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'fee', 'get_launchpad_creation_fee'),
      typeArguments: [],
      arguments: [config.feeManager],
    });
  }

  /**
   * Get SUI balance
   *
   * Returns the total SUI balance held by the fee manager.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Balance (u64)
   */
  static getSuiBalance(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      feeManager: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'fee', 'get_sui_balance'),
      typeArguments: [],
      arguments: [config.feeManager],
    });
  }

  /**
   * Apply a matured pending proposal fee increase.
   */
  static applyPendingProposalFee(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      feeManager: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsCorePackageId, 'fee', 'apply_pending_proposal_fee'),
      typeArguments: [],
      arguments: [
        config.feeManager,
        tx.object(config.clock || '0x6'),
      ],
    });
  }

}
