/**
 * Version Module
 *
 * Version tracking helpers for the futarchy package.
 *
 * @module version
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Version Static Functions
 *
 * Provides version tracking and package-witness helpers.
 */
export class Version {
  /**
   * Get the version number
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Version number (u64)
   *
   * @example
   * ```typescript
   * const versionNumber = Version.get(tx, {
   *   futarchyCorePackageId,
   * });
   * ```
   */
  static get(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_version',
        'get'
      ),
    });
  }
}
