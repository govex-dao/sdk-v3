/**
 * Protective Ask Registry Operations
 *
 * Manages protective ask tracking as Account managed data.
 * Each DAO can have up to 10 active protective asks.
 *
 * View functions to check ask count and retrieve ask IDs.
 *
 * @module protocol/futarchy/protective-ask-registry
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

export class ProtectiveAskRegistry {
  /**
   * Check if account has a protective ask registry
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Boolean indicating if registry exists
   */
  static hasRegistry(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      accountId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsCorePackageId,
        'protective_ask_registry',
        'has_registry'
      ),
      arguments: [tx.object(config.accountId)],
    });
  }

  /**
   * Get the number of active protective asks for an account
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns u64 - number of active asks
   */
  static askCount(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      accountId: string;
      registryId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsCorePackageId,
        'protective_ask_registry',
        'ask_count'
      ),
      arguments: [tx.object(config.accountId), tx.object(config.registryId)],
    });
  }

  /**
   * Get all active protective ask IDs for an account
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns vector<ID> - list of ask IDs
   */
  static askIds(
    tx: Transaction,
    config: {
      marketsCorePackageId: string;
      accountId: string;
      registryId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsCorePackageId,
        'protective_ask_registry',
        'ask_ids'
      ),
      arguments: [tx.object(config.accountId), tx.object(config.registryId)],
    });
  }
}
