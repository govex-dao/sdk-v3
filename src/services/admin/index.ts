/**
 * Admin Service - Protocol administration operations
 *
 * @module services/admin
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import type { Packages, SharedObjects, FactoryFields, FeeManagerFields } from '../../types';
import { extractFields, extractTypeNameString, extractVecSetContents } from '../../types';

function allowedTypeStrings(value: unknown): string[] {
  return extractVecSetContents(value)
    .map(extractTypeNameString)
    .filter((type): type is string => typeof type === 'string');
}

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

/**
 * Factory Admin Service
 */
export class FactoryAdminService {
  private client: SuiClient;
  private packages: Packages;
  private sharedObjects: SharedObjects;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
    this.sharedObjects = params.sharedObjects;
  }

  togglePause(factoryOwnerCapId: string): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.packages.futarchyFactory}::factory::toggle_pause`,
      arguments: [
        tx.object(this.sharedObjects.factory.id),
        tx.object(factoryOwnerCapId),
      ],
    });
    return tx;
  }

  addAllowedStableType(stableCoinType: string, factoryOwnerCapId: string, clock?: string): Transaction {
    const tx = new Transaction();
    const clockId = clock || '0x6';
    tx.moveCall({
      target: `${this.packages.futarchyFactory}::factory::add_allowed_stable_type`,
      typeArguments: [stableCoinType],
      arguments: [
        tx.object(this.sharedObjects.factory.id),
        tx.object(factoryOwnerCapId),
        tx.object(clockId),
      ],
    });
    return tx;
  }

  addAllowedLegacyAssetType(assetCoinType: string, factoryOwnerCapId: string, clock?: string): Transaction {
    const tx = new Transaction();
    const clockId = clock || '0x6';
    tx.moveCall({
      target: `${this.packages.futarchyFactory}::factory::add_allowed_legacy_asset_type`,
      typeArguments: [assetCoinType],
      arguments: [
        tx.object(this.sharedObjects.factory.id),
        tx.object(factoryOwnerCapId),
        tx.object(clockId),
      ],
    });
    return tx;
  }

  removeAllowedLegacyAssetType(assetCoinType: string, factoryOwnerCapId: string, clock?: string): Transaction {
    const tx = new Transaction();
    const clockId = clock || '0x6';
    tx.moveCall({
      target: `${this.packages.futarchyFactory}::factory::remove_allowed_legacy_asset_type`,
      typeArguments: [assetCoinType],
      arguments: [
        tx.object(this.sharedObjects.factory.id),
        tx.object(factoryOwnerCapId),
        tx.object(clockId),
      ],
    });
    return tx;
  }

  async getDaoCount(): Promise<number> {
    try {
      const obj = await this.client.getObject({
        id: this.sharedObjects.factory.id,
        options: { showContent: true },
      });
      const fields = extractFields<FactoryFields>(obj);
      return Number(fields?.dao_count || 0);
    } catch {
      return 0;
    }
  }

  async isPaused(): Promise<boolean> {
    try {
      const obj = await this.client.getObject({
        id: this.sharedObjects.factory.id,
        options: { showContent: true },
      });
      const fields = extractFields<FactoryFields>(obj);
      return fields?.paused || false;
    } catch {
      return false;
    }
  }

  async isStableTypeAllowed(stableType: string): Promise<boolean> {
    try {
      const obj = await this.client.getObject({
        id: this.sharedObjects.factory.id,
        options: { showContent: true },
      });
      const fields = extractFields<FactoryFields>(obj);
      const allowedTypes = allowedTypeStrings(fields?.allowed_stable_types);
      return allowedTypes.includes(stableType);
    } catch {
      return false;
    }
  }

  async isLegacyAssetTypeAllowed(assetType: string): Promise<boolean> {
    try {
      const obj = await this.client.getObject({
        id: this.sharedObjects.factory.id,
        options: { showContent: true },
      });
      const fields = extractFields<FactoryFields>(obj);
      const allowedTypes = allowedTypeStrings(fields?.allowed_legacy_asset_types);
      return allowedTypes.includes(assetType);
    } catch {
      return false;
    }
  }

}

/**
 * Package Registry Admin Service
 * Reserved for future package registry admin operations
 */
export class PackageRegistryService {
  constructor(_params: ServiceParams) {
    // Reserved for future package registry admin operations
  }
}

/**
 * Fee Manager Service
 */
export class FeeManagerService {
  private client: SuiClient;
  private sharedObjects: SharedObjects;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.sharedObjects = params.sharedObjects;
  }

  async getDaoCreationFee(): Promise<bigint> {
    try {
      const obj = await this.client.getObject({
        id: this.sharedObjects.feeManager.id,
        options: { showContent: true },
      });
      const fields = extractFields<FeeManagerFields>(obj);
      return BigInt(fields?.dao_creation_fee || 0);
    } catch {
      return 0n;
    }
  }

  async getProposalCreationFee(): Promise<bigint> {
    try {
      const obj = await this.client.getObject({
        id: this.sharedObjects.feeManager.id,
        options: { showContent: true },
      });
      const fields = extractFields<FeeManagerFields>(obj);
      return BigInt(fields?.proposal_creation_fee || 0);
    } catch {
      return 0n;
    }
  }
}

/**
 * AdminService - Protocol administration operations
 */
export class AdminService {
  /** Factory admin operations */
  public factory: FactoryAdminService;

  /** Package registry admin */
  public packageRegistry: PackageRegistryService;

  /** Fee manager operations */
  public feeManager: FeeManagerService;

  constructor(params: ServiceParams) {
    this.factory = new FactoryAdminService(params);
    this.packageRegistry = new PackageRegistryService(params);
    this.feeManager = new FeeManagerService(params);
  }
}
