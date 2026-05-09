/**
 * Action Validation Module
 *
 * Optional preflight/read-only validation for action specifications in intents.
 * Action handlers themselves now rely on typed `increment_action_idx` on-chain.
 *
 * @module action-validation
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Action Validation Static Functions
 *
 * Validates that action specs match expected types when a client wants an explicit check.
 */
export class ActionValidation {
  /**
   * Assert that an action spec matches the expected action type
   *
   * Validates that the action type in the spec matches the type T.
   * Aborts with EActionTypeMismatch if types don't match.
   *
   * @param tx - Transaction
   * @param config - Configuration
   *
   * @example
   * ```typescript
   * ActionValidation.assertActionType(tx, {
   *   accountProtocolPackageId,
   *   actionType: '0xPKG::module::ActionType',
   *   actionSpec,
   * });
   * ```
   */
  static assertActionType(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      actionType: string;
      actionSpec: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.accountProtocolPackageId,
        'action_validation',
        'assert_action_type'
      ),
      typeArguments: [config.actionType],
      arguments: [config.actionSpec],
    });
  }
}
