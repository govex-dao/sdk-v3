/**
 * DAO Operations - High-level DAO account management
 *
 * Provides simple, user-friendly API for managing DAO accounts.
 * Hides all complexity: package IDs, type arguments, and package witnesses.
 *
 * @module dao-operations
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { BaseTransactionBuilder, TransactionUtils } from '../../services/transaction';
import { extractFields, DAOFields } from '../../types';

/**
 * Configuration for DAOOperations
 */
export interface DAOOperationsConfig {
  client: SuiClient;
  accountProtocolPackageId: string;
}

/**
 * Managed object info
 */
export interface ManagedObjectInfo {
  name: string;
  objectId: string;
  objectType: string;
}

/**
 * DAO configuration info
 */
export interface DAOConfigInfo {
  name: string;
  description: string;
  iconUrl: string;
  assetType: string;
  stableType: string;
  tradingPeriodMs: number;
  reviewPeriodMs: number;
  proposalsEnabled: boolean;
}

/**
 * High-level DAO account management operations
 *
 * @example
 * ```typescript
 * // Add managed object
 * const versionWitness = myVersionWitness;
 * const tx = sdk.dao.addManagedObject({
 *   daoId: "0x123...",
 *   name: "team_treasury",
 *   objectId: "0xabc...",
 *   versionWitness,
 * });
 *
 * // Get DAO config
 * const config = await sdk.dao.getConfig("0x123...");
 * ```
 *
 * `versionWitness` must come from the package version module and be created
 * in the same transaction that uses it.
 */
export class DAOOperations {
  private client: SuiClient;
  private accountProtocolPackageId: string;

  constructor(config: DAOOperationsConfig) {
    this.client = config.client;
    this.accountProtocolPackageId = config.accountProtocolPackageId;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Get object type from an object ID
   */
  private async getObjectType(objectId: string): Promise<string> {
    const obj = await this.client.getObject({
      id: objectId,
      options: { showType: true },
    });

    if (!obj.data?.type) {
      throw new Error(`Could not determine type for object: ${objectId}`);
    }

    return obj.data.type;
  }

  // ============================================================================
  // OBJECT DEPOSITS (keep/receive pattern)
  // ============================================================================
  // NOTE: Managed object operations (add/remove/borrow) require a VersionWitness
  // which can only be created inside the Move package (public(package) function).
  // Use governance intents for managed object operations instead.

  /**
   * Deposit an object to the DAO account
   *
   * Uses the "keep" pattern to store objects with tracking.
   *
   * @param config - Configuration
   * @returns Transaction to execute
   *
   * @example
   * ```typescript
   * const tx = await sdk.dao.depositObject({
   *   daoId: "0x123...",
   *   objectId: "0xabc...",
   * });
   * ```
   */
  async depositObject(config: {
    daoId: string;
    objectId: string;
  }): Promise<Transaction> {
    // Auto-fetch objectType from objectId
    const objectType = await this.getObjectType(config.objectId);

    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    // Use keep to deposit with tracking
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.accountProtocolPackageId,
        'account',
        'keep'
      ),
      typeArguments: [objectType],
      arguments: [
        tx.object(config.daoId),
        tx.object(config.objectId),
      ],
    });

    return tx;
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  // NOTE: configureDeposits, addToWhitelist, removeFromWhitelist removed --
  // configure_object_deposits and manage_type_whitelist do not exist in the Move contracts.

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get DAO configuration
   *
   * @param daoId - DAO account ID
   * @returns DAO configuration info
   *
   * @example
   * ```typescript
   * const config = await sdk.dao.getConfig("0x123...");
   * console.log(config.name, config.tradingPeriodMs);
   * ```
   */
  async getConfig(daoId: string): Promise<DAOConfigInfo> {
    const obj = await this.client.getObject({
      id: daoId,
      options: { showContent: true },
    });

    const fields = extractFields<DAOFields>(obj);
    if (!fields) {
      throw new Error(`DAO not found: ${daoId}`);
    }

    const metadata = fields.metadata?.fields || {};
    const config = fields.config?.fields || {};

    return {
      name: metadata.name || '',
      description: metadata.description || '',
      iconUrl: metadata.icon_url || '',
      assetType: '', // Would need type info
      stableType: '',
      tradingPeriodMs: Number(config.trading_period_ms || 0),
      reviewPeriodMs: Number(config.review_period_ms || 0),
      proposalsEnabled: config.proposals_enabled !== false,
    };
  }

  /**
   * Check if a managed object exists
   *
   * @param daoId - DAO account ID
   * @param name - Object name
   * @returns True if object exists
   */
  async hasManagedObject(daoId: string, name: string): Promise<boolean> {
    // Use devInspect to check existence
    const tx = new Transaction();

    const key = tx.moveCall({
      target: '0x1::string::utf8',
      arguments: [tx.pure.vector('u8', Array.from(new TextEncoder().encode(name)))],
    });

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.accountProtocolPackageId,
        'account',
        'has_managed_data'
      ),
      typeArguments: ['0x1::string::String'],
      arguments: [
        tx.object(daoId),
        key,
      ],
    });

    try {
      const result = await this.client.devInspectTransactionBlock({
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
        transactionBlock: tx,
      });

      if (result.results && result.results[0]?.returnValues) {
        return result.results[0].returnValues[0][0][0] === 1;
      }
    } catch {
      // Ignore errors
    }

    return false;
  }

  /**
   * Get the object tracker state
   *
   * @param daoId - DAO account ID
   * @returns Tracker state info
   */
  async getObjectTrackerState(daoId: string): Promise<{
    depositsEnabled: boolean;
    currentCount: number;
    maxObjects: number;
  }> {
    const obj = await this.client.getObject({
      id: daoId,
      options: { showContent: true },
    });

    const fields = extractFields<DAOFields>(obj);
    if (!fields) {
      throw new Error(`DAO not found: ${daoId}`);
    }

    const tracker = fields.object_tracker?.fields || {};

    return {
      depositsEnabled: tracker.deposits_enabled !== false,
      currentCount: Number(tracker.current_count || 0),
      maxObjects: Number(tracker.max_objects || 0),
    };
  }
}
