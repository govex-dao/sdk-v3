/**
 * Protective Bid Registry Operations
 *
 * Manages protective bid tracking as Account managed data.
 * Each DAO can have up to 1 active protective bid.
 *
 * View functions to check bid count and retrieve bid IDs.
 *
 * @module protocol/futarchy/protective-bid-registry
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

export class ProtectiveBidRegistry {
  /**
   * Check if account has a protective bid registry
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
        'protective_bid_registry',
        'has_registry'
      ),
      arguments: [tx.object(config.accountId)],
    });
  }

  /**
   * Get the number of active protective bids for an account
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns u64 - number of active bids
   */
  static bidCount(
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
        'protective_bid_registry',
        'bid_count'
      ),
      arguments: [tx.object(config.accountId), tx.object(config.registryId)],
    });
  }

  /**
   * Get all active protective bid IDs for an account
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns vector<ID> - list of bid IDs
   */
  static bidIds(
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
        'protective_bid_registry',
        'bid_ids'
      ),
      arguments: [tx.object(config.accountId), tx.object(config.registryId)],
    });
  }
}
