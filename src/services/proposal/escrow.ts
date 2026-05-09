/**
 * Escrow Service - Proposal escrow operations
 */

import { SuiClient } from '@mysten/sui/client';
import { extractFields, EscrowFields, ProposalFields } from '../../types';
import { buildBalanceWrapperType, getBalanceWrappers } from '../utils/balance-wrappers';
import type { Packages, SharedObjects } from '../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export class EscrowService {
  private client: SuiClient;
  private packages: Packages;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
  }

  /**
   * Check if user has escrow receipt for an outcome
   */
  async hasEscrowReceipt(
    proposalId: string,
    outcomeIndex: number,
    assetType: string,
    stableType: string,
    owner?: string
  ): Promise<boolean> {
    try {
      const proposal = await this.client.getObject({
        id: proposalId,
        options: { showContent: true },
      });
      const fields = extractFields<
        ProposalFields & {
          outcome_count?: string | number;
          outcome_messages?: string[];
          market_state?: unknown;
        }
      >(proposal);
      if (!fields) {
        return false;
      }

      const outcomeCount =
        fields.outcome_count !== undefined
          ? Number(fields.outcome_count)
          : Array.isArray(fields.outcome_messages)
            ? fields.outcome_messages.length
            : 0;

      if (outcomeIndex < 0 || outcomeIndex >= outcomeCount) {
        return false;
      }

      if (!owner) {
        return true;
      }

      const marketStateId = extractObjectId(fields.market_state);
      if (!marketStateId) {
        return false;
      }

      const balanceWrapperType = buildBalanceWrapperType(
        this.packages.futarchyMarketsPrimitives,
        assetType,
        stableType
      );
      const [assetMetadata, stableMetadata] = await Promise.all([
        this.client.getCoinMetadata({ coinType: assetType }),
        this.client.getCoinMetadata({ coinType: stableType }),
      ]);
      if (!assetMetadata || assetMetadata.decimals === undefined || assetMetadata.decimals === null) {
        throw new Error(`Coin metadata missing decimals for ${assetType}`);
      }
      if (!stableMetadata || stableMetadata.decimals === undefined || stableMetadata.decimals === null) {
        throw new Error(`Coin metadata missing decimals for ${stableType}`);
      }
      if (!Number.isInteger(assetMetadata.decimals) || assetMetadata.decimals < 0 || assetMetadata.decimals > 18) {
        throw new Error(`Coin metadata decimals out of range for ${assetType}: ${assetMetadata.decimals}`);
      }
      if (!Number.isInteger(stableMetadata.decimals) || stableMetadata.decimals < 0 || stableMetadata.decimals > 18) {
        throw new Error(`Coin metadata decimals out of range for ${stableType}: ${stableMetadata.decimals}`);
      }
      const wrappers = await getBalanceWrappers(
        this.client,
        owner,
        balanceWrapperType,
        marketStateId,
        assetMetadata.decimals,
        stableMetadata.decimals
      );

      return wrappers.some((wrapper) => {
        const outcome = wrapper.outcomes[outcomeIndex];
        return Boolean(outcome && (outcome.asset.raw > 0n || outcome.stable.raw > 0n));
      });
    } catch {
      return false;
    }
  }

  /**
   * Get escrow balance
   */
  async getBalance(escrowId: string, _assetType: string): Promise<bigint> {
    try {
      const obj = await this.client.getObject({
        id: escrowId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return 0n;
      }

      return BigInt(extractFields<EscrowFields>(obj)?.balance || 0);
    } catch {
      return 0n;
    }
  }

  /**
   * Check if escrow is empty
   */
  async isEmpty(escrowId: string, assetType: string): Promise<boolean> {
    const balance = await this.getBalance(escrowId, assetType);
    return balance === 0n;
  }
}

function extractObjectId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return undefined;

  const obj = value as Record<string, unknown>;
  if (typeof obj.id === 'string') {
    return obj.id;
  }
  const idObj = obj.id as Record<string, unknown> | undefined;
  if (idObj && typeof idObj.id === 'string') {
    return idObj.id;
  }
  const fields = obj.fields as Record<string, unknown> | undefined;
  if (!fields) return undefined;
  if (typeof fields.id === 'string') {
    return fields.id;
  }
  const nested = fields.id as Record<string, unknown> | undefined;
  if (nested && typeof nested.id === 'string') {
    return nested.id;
  }
  return undefined;
}
