/**
 * Query Helper Utilities
 */

import { SuiClient, SuiObjectResponse } from '@mysten/sui/client';
import { extractFields } from '../../types';
import {
  getBalanceWrappers as getBalanceWrappersStandalone,
  type BalanceWrapperData,
} from './balance-wrappers';

// Re-export balance wrapper utilities for convenience
export {
  buildBalanceWrapperType,
  getBalanceWrappers as getBalanceWrappersStandalone,
  getConditionalCoinObjects,
  getConditionalCoinBalance,
  sumBalanceWrapperAmount,
} from './balance-wrappers';
export type { BalanceWrapperData, BalanceWrapperOutcome, OwnedCoinObject } from './balance-wrappers';

/**
 * Helper class for common Sui queries
 */
export class QueryHelper {
  private client: SuiClient;

  constructor(client: SuiClient) {
    this.client = client;
  }

  /**
   * Get a single object by ID
   */
  async getObject(objectId: string): Promise<SuiObjectResponse> {
    return this.client.getObject({
      id: objectId,
      options: {
        showContent: true,
        showType: true,
        showOwner: true,
      },
    });
  }

  /**
   * Get multiple objects by IDs
   */
  async getObjects(objectIds: string[]): Promise<SuiObjectResponse[]> {
    return this.client.multiGetObjects({
      ids: objectIds,
      options: {
        showContent: true,
        showType: true,
        showOwner: true,
      },
    });
  }

  /**
   * Get owned objects for an address
   */
  async getOwnedObjects(address: string, filter?: any): Promise<any[]> {
    const result = await this.client.getOwnedObjects({
      owner: address,
      filter,
      options: {
        showContent: true,
        showType: true,
      },
    });
    return result.data;
  }

  /**
   * Get dynamic fields for an object
   */
  async getDynamicFields(parentObjectId: string): Promise<any[]> {
    const result = await this.client.getDynamicFields({
      parentId: parentObjectId,
    });
    return result.data;
  }

  /**
   * Get a dynamic field object
   */
  async getDynamicFieldObject(parentObjectId: string, name: any): Promise<SuiObjectResponse> {
    return this.client.getDynamicFieldObject({
      parentId: parentObjectId,
      name,
    });
  }

  /**
   * Query events
   */
  async queryEvents(query: any): Promise<any[]> {
    const result = await this.client.queryEvents(query);
    return result.data;
  }

  /**
   * Extract a field from an object's content
   */
  extractField(object: SuiObjectResponse, fieldPath: string): unknown {
    if (!object.data?.content || object.data.content.dataType !== 'moveObject') {
      return undefined;
    }
    const fields = extractFields(object);
    if (!fields) return undefined;

    const parts = fieldPath.split('.');
    let current: unknown = fields;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /**
   * Get balance for an address and coin type
   */
  async getBalance(address: string, coinType: string): Promise<bigint> {
    const result = await this.client.getBalance({
      owner: address,
      coinType,
    });
    return BigInt(result.totalBalance);
  }

  /**
   * Get all balances for an address
   */
  async getAllBalances(address: string): Promise<any[]> {
    const result = await this.client.getAllBalances({
      owner: address,
    });
    return result;
  }


  /**
   * Find treasury cap for a coin type
   */
  async findTreasuryCap(_coinType: string): Promise<string | null> {
    // This would search for TreasuryCap objects
    return null;
  }

  /**
   * Check if an object is shared
   */
  async isObjectShared(objectId: string): Promise<boolean> {
    const obj = await this.getObject(objectId);
    const owner = obj.data?.owner;
    return owner !== undefined && owner !== null && typeof owner === 'object' && 'Shared' in owner;
  }

  /**
   * Get all balances for a proposal (spot + conditional per outcome + balance wrappers)
   *
   * @param address - Wallet address
   * @param assetType - DAO's asset coin type
   * @param stableType - DAO's stable coin type
   * @param conditionalAssetTypes - Conditional asset coin types per outcome
   * @param conditionalStableTypes - Conditional stable coin types per outcome
   * @param assetSymbol - DAO's asset symbol (e.g., "SUI")
   * @param stableSymbol - DAO's stable symbol (e.g., "USDC")
   * @param outcomeMessages - Outcome messages for naming (e.g., ["Yes", "No"])
   * @param marketStateId - Optional market state ID to filter balance wrappers
   * @param balanceWrapperType - Optional full type for ConditionalMarketBalance (e.g., "0x...::conditional_balance::ConditionalMarketBalance<AssetType, StableType>")
   * @returns Complete balance info for trading with display names
   */
  async getProposalBalances(
    address: string,
    assetType: string,
    stableType: string,
    conditionalAssetTypes: string[],
    conditionalStableTypes: string[],
    assetSymbol: string,
    stableSymbol: string,
    outcomeMessages: string[],
    marketStateId?: string,
    balanceWrapperType?: string
  ): Promise<ProposalBalances> {
    const resolveDecimals = async (coinType: string): Promise<number> => {
      const metadata = await this.client.getCoinMetadata({ coinType });
      if (!metadata || metadata.decimals === undefined || metadata.decimals === null) {
        throw new Error(`Coin metadata missing decimals for ${coinType}`);
      }
      if (!Number.isInteger(metadata.decimals) || metadata.decimals < 0 || metadata.decimals > 18) {
        throw new Error(`Coin metadata decimals out of range for ${coinType}: ${metadata.decimals}`);
      }
      return metadata.decimals;
    };
    const [assetDecimals, stableDecimals] = await Promise.all([
      resolveDecimals(assetType),
      resolveDecimals(stableType),
    ]);

    const formatBalance = (raw: bigint, tokenDecimals: number): string => {
      const divisor = 10n ** BigInt(tokenDecimals);
      const whole = raw / divisor;
      if (tokenDecimals === 0) {
        return whole.toString();
      }
      const fraction = raw % divisor;
      const fractionStr = fraction.toString().padStart(tokenDecimals, '0').slice(0, 4);
      return `${whole}.${fractionStr}`;
    };

    // Fetch all balances in parallel
    const balancePromises: Promise<bigint>[] = [
      this.getBalance(address, assetType),
      this.getBalance(address, stableType),
    ];

    // Add conditional coin balance fetches
    for (const coinType of conditionalAssetTypes) {
      balancePromises.push(this.getBalance(address, coinType));
    }
    for (const coinType of conditionalStableTypes) {
      balancePromises.push(this.getBalance(address, coinType));
    }

    // Fetch balance wrappers in parallel if type provided
    const balanceWrappersPromise =
      balanceWrapperType && marketStateId
        ? this.getBalanceWrappers(
            address,
            balanceWrapperType,
            marketStateId,
            assetDecimals,
            stableDecimals
          )
        : Promise.resolve([]);

    const [rawBalances, balanceWrappers] = await Promise.all([
      Promise.all(balancePromises),
      balanceWrappersPromise,
    ]);

    // Parse results
    const spotAssetRaw = rawBalances[0];
    const spotStableRaw = rawBalances[1];

    const outcomeCount = conditionalAssetTypes.length;
    const outcomes: OutcomeBalances[] = [];

    for (let i = 0; i < outcomeCount; i++) {
      const condAssetRaw = rawBalances[2 + i];
      const condStableRaw = rawBalances[2 + outcomeCount + i];
      const outcomeLabel = outcomeMessages[i] || `Outcome ${i}`;

      outcomes.push({
        outcomeIndex: i,
        outcomeMessage: outcomeLabel,
        conditionalAsset: {
          coinType: conditionalAssetTypes[i],
          raw: condAssetRaw,
          formatted: formatBalance(condAssetRaw, assetDecimals),
          name: `${outcomeLabel} ${assetSymbol}`,
        },
        conditionalStable: {
          coinType: conditionalStableTypes[i],
          raw: condStableRaw,
          formatted: formatBalance(condStableRaw, stableDecimals),
          name: `${outcomeLabel} ${stableSymbol}`,
        },
      });
    }

    return {
      spot: {
        asset: {
          coinType: assetType,
          raw: spotAssetRaw,
          formatted: formatBalance(spotAssetRaw, assetDecimals),
          name: assetSymbol,
        },
        stable: {
          coinType: stableType,
          raw: spotStableRaw,
          formatted: formatBalance(spotStableRaw, stableDecimals),
          name: stableSymbol,
        },
      },
      outcomes,
      balanceWrappers,
    };
  }

  /**
   * Get balance wrapper (ConditionalMarketBalance) NFTs owned by an address
   *
   * Balance wrappers hold "incomplete sets" from spot swaps during active proposals.
   * They store per-outcome balances in a dense vector format.
   *
   * @param address - Wallet address
   * @param balanceWrapperType - Full type string for ConditionalMarketBalance (e.g., "0x...::conditional_balance::ConditionalMarketBalance<0x2::sui::SUI, 0x...::usdc::USDC>")
   * @param marketStateId - Market state ID to filter by (only return wrappers for this market)
   * @param assetDecimals - Asset coin decimals for formatting
   * @param stableDecimals - Stable coin decimals for formatting
   * @returns Array of balance wrapper data
   */
  async getBalanceWrappers(
    address: string,
    balanceWrapperType: string,
    marketStateId: string,
    assetDecimals: number,
    stableDecimals: number
  ): Promise<BalanceWrapperData[]> {
    // Delegate to standalone function
    return getBalanceWrappersStandalone(
      this.client,
      address,
      balanceWrapperType,
      marketStateId,
      assetDecimals,
      stableDecimals
    );
  }
}

// Types for proposal balances
export interface CoinBalance {
  coinType: string;
  raw: bigint;
  formatted: string;
  name: string;
}

export interface OutcomeBalances {
  outcomeIndex: number;
  outcomeMessage: string;
  conditionalAsset: CoinBalance;
  conditionalStable: CoinBalance;
}

export interface ProposalBalances {
  spot: {
    asset: CoinBalance;
    stable: CoinBalance;
  };
  outcomes: OutcomeBalances[];
  /** Balance wrapper NFTs owned by the user for this proposal */
  balanceWrappers: BalanceWrapperData[];
}
