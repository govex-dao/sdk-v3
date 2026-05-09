/**
 * DAO Service - Unified DAO operations
 *
 * Provides a clean API for all DAO-related operations:
 * - DAO queries and management
 * - Vault operations (sdk.dao.vault.*)
 * - Oracle operations (sdk.dao.oracle.*)
 *
 * @module services/dao
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, SuiEvent } from '@mysten/sui/client';
import type { Packages, SharedObjects, DAOFields, DAOCreatedEvent, ProposalCreatedEvent } from '../../types';
import { isMoveObject } from '../../types';

// Re-export sub-services
export { VaultService } from './vault';
export { OracleService } from './oracle';

import { VaultService } from './vault';
import { OracleService } from './oracle';

/**
 * Service params shared across all services
 */
export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

/**
 * DAO info helper for fetching DAO data
 */
export class DAOInfoHelper {
  private client: SuiClient;

  constructor(params: ServiceParams) {
    this.client = params.client;
  }

  /**
   * Get DAO config from account object
   */
  async getConfig(daoId: string): Promise<DAOFields> {
    const obj = await this.client.getObject({
      id: daoId,
      options: { showContent: true },
    });

    if (!obj.data || !isMoveObject(obj.data)) {
      throw new Error(`Could not fetch DAO config for: ${daoId}`);
    }

    return obj.data.content.fields as DAOFields;
  }

  /**
   * Get DAO info including config and metadata
   */
  async getInfo(daoId: string): Promise<DAOFields> {
    const config = await this.getConfig(daoId);
    // id is already in DAOFields
    return config;
  }
}

/**
 * DAOService - Main service for DAO operations
 *
 * @example
 * ```typescript
 * // Get DAO info
 * const info = await sdk.dao.getInfo(daoId);
 *
 * // Vault operations
 * const tx = await sdk.dao.vault.depositApproved({...});
 *
 * // Oracle operations
 * const tx = sdk.dao.oracle.claimGrant({
 *   accountId: daoId,
 *   assetType,
 *   stableType,
 *   lpType,
 *   grantId,
 *   tierIndex: 0,
 *   spotPoolId,
 * });
 * ```
 */
export class DAOService {
  private client: SuiClient;
  private packages: Packages;
  private sharedObjects: SharedObjects;
  private infoHelper: DAOInfoHelper;

  /** Vault operations (deposits, streams, balances) */
  public vault: VaultService;

  /** Oracle operations (price-based grants) */
  public oracle: OracleService;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
    this.sharedObjects = params.sharedObjects;
    this.infoHelper = new DAOInfoHelper(params);

    // Initialize sub-services
    this.vault = new VaultService(params);
    this.oracle = new OracleService(params);
  }

  // ============================================================================
  // DAO QUERIES
  // ============================================================================

  /**
   * Get DAO info
   */
  async getInfo(daoId: string): Promise<DAOFields> {
    return this.infoHelper.getInfo(daoId);
  }

  /**
   * Get DAO config
   */
  async getConfig(daoId: string): Promise<DAOFields> {
    return this.infoHelper.getConfig(daoId);
  }

  /**
   * Get all DAOs from factory events
   */
  async getAll(factoryPackageId: string): Promise<DAOCreatedEvent[]> {
    const events = await this.client.queryEvents({
      query: {
        MoveEventType: `${factoryPackageId}::factory::DAOCreated`,
      },
      limit: 50,
    });

    return events.data.map((e: SuiEvent) => e.parsedJson as DAOCreatedEvent);
  }

  /**
   * Get DAOs created by a specific address
   */
  async getByCreator(factoryPackageId: string, creator: string): Promise<DAOCreatedEvent[]> {
    const all = await this.getAll(factoryPackageId);
    return all.filter((dao) => dao.creator === creator);
  }

  /**
   * Get proposals for a DAO
   */
  async getProposals(daoId: string): Promise<ProposalCreatedEvent[]> {
    const events = await this.client.queryEvents({
      query: {
        MoveEventType: `${this.packages.futarchyProposal}::proposal::ProposalCreated`,
      },
      limit: 50,
    });

    return events.data
      .map((e: SuiEvent) => e.parsedJson as ProposalCreatedEvent)
      .filter((p) => p.dao_id === daoId);
  }

  // ============================================================================
  // MANAGED OBJECTS
  // ============================================================================

  /**
   * Add a managed object to the DAO account
   */
  async addManagedObject(config: {
    daoId: string;
    name: string;
    objectId: string;
    versionWitness: ReturnType<Transaction['moveCall']>;
  }): Promise<Transaction> {
    const objectType = await this.getObjectType(config.objectId);
    const tx = new Transaction();

    const key = tx.moveCall({
      target: '0x1::string::utf8',
      arguments: [tx.pure.vector('u8', Array.from(new TextEncoder().encode(config.name)))],
    });

    tx.moveCall({
      target: `${this.packages.accountProtocol}::account::add_managed_asset_with_package_witness`,
      typeArguments: ['0x1::string::String', objectType],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
        key,
        tx.object(config.objectId),
        config.versionWitness,
      ],
    });

    return tx;
  }

  /**
   * Remove a managed object from the DAO account
   */
  async removeManagedObject(config: {
    daoId: string;
    name: string;
    objectType: string;
    versionWitness: ReturnType<Transaction['moveCall']>;
  }): Promise<Transaction> {
    const tx = new Transaction();

    const key = tx.moveCall({
      target: '0x1::string::utf8',
      arguments: [tx.pure.vector('u8', Array.from(new TextEncoder().encode(config.name)))],
    });

    tx.moveCall({
      target: `${this.packages.accountProtocol}::account::remove_managed_asset_with_package_witness`,
      typeArguments: ['0x1::string::String', config.objectType],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
        key,
        config.versionWitness,
      ],
    });

    return tx;
  }

  /**
   * Check if DAO has a managed object with given name
   */
  async hasManagedObject(daoId: string, name: string): Promise<boolean> {
    try {
      const obj = await this.client.getDynamicFieldObject({
        parentId: daoId,
        name: { type: '0x1::string::String', value: name },
      });
      return !!obj.data;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

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
}
