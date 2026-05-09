/**
 * Governance PTB Executor
 *
 * PTB (Programmable Transaction Block) execution helpers for Futarchy proposals
 * with execution-required finalization.
 *
 * The frontend composes a programmable transaction that:
 * 1. Calls `begin_execution(proposal, spot_pool)` which:
 *    - Validates state and execution window
 *    - Finalizes market state and proposal (sets FINALIZED)
 *    - Restores quantum LP to spot pool (clears active_proposal_id)
 *    - Returns executable hot potato
 * 2. Invokes the relevant `do_init_*` action functions in order.
 *    Actions execute on a "normal" spot pool (no active proposal blocking).
 * 3. Calls `finalize_execution_success()` to confirm, emit events, and refund proposer.
 *
 * CRITICAL: Execution must succeed for accept outcomes to win.
 * - If execution succeeds: market_winner becomes actual winner
 * - If execution fails (PTB aborts): no state change, can retry
 * - If timeout: anyone calls force_reject_on_timeout() -> REJECT wins
 *
 * This ensures unexecutable proposals cannot win.
 *
 * @module governance-ptb-executor
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from './transaction';

/**
 * Governance PTB Executor
 *
 * Use this for advanced PTB composition where you need to execute proposal actions
 * with custom logic between begin and finalize steps.
 *
 * @example Execute proposal with custom logic
 * ```typescript
 * const tx = new Transaction();
 *
 * // Step 1: Begin execution (requires AWAITING_EXECUTION state)
 * // This also finalizes the proposal and restores quantum LP to spot pool
 * const [executable, executionTicket] = GovernancePTBExecutor.beginExecution(tx, {
 *   governancePackageId,
 *   daoId,
 *   proposalId,
 *   spotPoolId,
 *   registryId,
 *   mutationRegistryId,       // ProposalMutationRegistry
 *   spotPoolMutationRegistryId, // SpotPoolMutationRegistry
 *   assetType,
 *   stableType,
 *   lpType,
 * });
 *
 * // Step 2: Execute actions (custom logic here)
 * // The executable hot potato allows you to call do_init_* functions
 * // from account_actions package
 * // NOTE: Spot pool is now "normal" - no active proposal blocking
 *
 * // Step 3: Finalize execution (confirms success and emits events)
 * // Both executable and executionTicket must be consumed here
 * GovernancePTBExecutor.finalizeExecutionSuccess(tx, {
 *   governancePackageId,
 *   daoId,
 *   proposalId,
 *   registryId,
 *   mutationRegistryId,       // ProposalMutationRegistry
 *   assetType,
 *   stableType,
 * }, executable, executionTicket);
 * ```
 */
export class GovernancePTBExecutor {
  /**
   * Begin execution of proposal actions (Step 1 of 3)
   *
   * Creates an Executable hot potato that must be consumed by finalizeExecutionSuccess.
   * Between begin and finalize, you can call do_init_* actions.
   *
   * CRITICAL: This function does the following BEFORE returning the Executable:
   * - Validates state and execution window
   * - Finalizes market state and proposal (sets FINALIZED)
   * - Restores quantum LP to spot pool (clears active_proposal_id)
   *
   * This means actions execute on a "normal" spot pool with no active proposal.
   *
   * Requirements:
   * - Proposal must be in AWAITING_EXECUTION state
   * - Market winner must be an accept outcome (> 0)
   * - Must be within the 30-minute execution deadline
   *
   * @param tx - Transaction to add the call to
   * @param config - Execution configuration
   * @returns [executable, executionTicket] - Executable for do_* actions, ExecutionTicket hot potato for finalize
   *
   * @example
   * ```typescript
   * const tx = new Transaction();
   *
   * const [executable, executionTicket] = GovernancePTBExecutor.beginExecution(tx, {
   *   governancePackageId,
   *   daoId,
   *   proposalId,
   *   spotPoolId,
   *   registryId,
   *   mutationRegistryId,
   *   spotPoolMutationRegistryId,
   *   assetType,
   *   stableType,
   *   lpType,
   *   clock: '0x6',
   * });
   * ```
   */
  static beginExecution(
    tx: Transaction,
    config: {
      governancePackageId: string;
      daoId: string;
      proposalId: string;
      spotPoolId: string;
      registryId: string;
      /** ProposalMutationRegistry shared object ID */
      mutationRegistryId: string;
      /** SpotPoolMutationRegistry shared object ID */
      spotPoolMutationRegistryId: string;
      /** MarketStateMutationRegistry shared object ID */
      marketStateMutationRegistryId: string;
      /** EscrowMutationRegistry shared object ID */
      escrowMutationRegistryId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'ptb_executor',
        'begin_execution'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.daoId), // account
        tx.object(config.registryId), // registry
        tx.object(config.mutationRegistryId), // mutation_registry
        tx.object(config.spotPoolMutationRegistryId), // spot_pool_mutation_registry
        tx.object(config.marketStateMutationRegistryId), // market_state_mutation_registry
        tx.object(config.escrowMutationRegistryId), // escrow_mutation_registry
        tx.object(config.proposalId), // proposal
        tx.object(config.spotPoolId), // spot_pool
        tx.object(config.clock || '0x6'), // clock
      ],
    });
  }

  /**
   * Finalize execution success (Step 3 of 3)
   *
   * Consumes the Executable hot potato, confirms all actions were executed,
   * cancels losing outcome intents, emits events, and refunds proposer fee.
   *
   * NOTE: Market state finalization and proposal state transition happen in
   * beginExecution(), not here. This function only confirms and cleans up.
   *
   * @param tx - Transaction to add the call to
   * @param config - Execution configuration
   * @param executable - The Executable hot potato from beginExecution
   * @param executionTicket - The ExecutionTicket hot potato from beginExecution
   *
   * @example
   * ```typescript
   * const tx = new Transaction();
   *
   * // After begin_execution and do_init_* calls
   * GovernancePTBExecutor.finalizeExecutionSuccess(tx, {
   *   governancePackageId,
   *   daoId,
   *   proposalId,
   *   registryId,
   *   assetType,
   *   stableType,
   *   clock: '0x6',
   * }, executable, executionTicket);
   * ```
   */
  static finalizeExecutionSuccess(
    tx: Transaction,
    config: {
      governancePackageId: string;
      daoId: string;
      proposalId: string;
      registryId: string;
      /** ProposalMutationRegistry shared object ID */
      mutationRegistryId: string;
      assetType: string;
      stableType: string;
      clock?: string;
    },
    executable: ReturnType<Transaction['moveCall']>,
    executionTicket: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'ptb_executor',
        'finalize_execution_success'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.daoId), // account
        tx.object(config.registryId), // registry
        tx.object(config.mutationRegistryId), // mutation_registry
        tx.object(config.proposalId), // proposal
        executable, // executable
        executionTicket, // execution ticket (hot potato)
        tx.object(config.clock || '0x6'), // clock
      ],
    });
  }

  /**
   * Force reject on timeout (permissionless)
   *
   * Anyone can call this when the 30-minute execution window has expired
   * without successful execution. REJECT wins regardless of what TWAP said.
   *
   * NOTE: This function is in proposal_lifecycle module, not ptb_executor.
   * It's included here for convenience since it's part of the execution flow.
   *
   * @param tx - Transaction to add the call to
   * @param config - Configuration
   *
   * @example
   * ```typescript
   * const tx = new Transaction();
   *
   * // Execution window expired, force REJECT to win
   * GovernancePTBExecutor.forceRejectOnTimeout(tx, {
   *   governancePackageId,
   *   daoAccountId,
   *   proposalId,
   *   spotPoolId,
   *   packageRegistryId,
   *   mutationRegistryId,
   *   spotPoolMutationRegistryId,
   *   assetType,
   *   stableType,
   *   lpType,
   *   clock: '0x6',
   * });
   * ```
   */
  static forceRejectOnTimeout(
    tx: Transaction,
    config: {
      governancePackageId: string;
      daoAccountId: string;
      proposalId: string;
      spotPoolId: string;
      /** PackageRegistry shared object ID */
      packageRegistryId: string;
      /** ProposalMutationRegistry shared object ID */
      mutationRegistryId: string;
      /** SpotPoolMutationRegistry shared object ID */
      spotPoolMutationRegistryId: string;
      /** MarketStateMutationRegistry shared object ID */
      marketStateMutationRegistryId: string;
      /** EscrowMutationRegistry shared object ID */
      escrowMutationRegistryId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.governancePackageId,
        'proposal_lifecycle',
        'force_reject_on_timeout'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.daoAccountId), // account
        tx.object(config.mutationRegistryId), // mutation_registry
        tx.object(config.spotPoolMutationRegistryId), // spot_pool_mutation_registry
        tx.object(config.marketStateMutationRegistryId), // market_state_mutation_registry
        tx.object(config.escrowMutationRegistryId), // escrow_mutation_registry
        tx.object(config.proposalId), // proposal
        tx.object(config.spotPoolId), // spot_pool
        tx.object(config.packageRegistryId), // registry
        tx.object(config.clock || '0x6'), // clock
      ],
    });
  }

}
