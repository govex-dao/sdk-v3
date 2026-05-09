/**
 * Oracle Service - Price-based grant operations
 *
 * Handles oracle grants that unlock tokens based on price conditions.
 *
 * @module services/dao/oracle
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import { extractFields, OracleGrantFields } from '../../types';
import type { Packages, SharedObjects } from '../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export interface GrantInfo {
  id: string;
  daoId: string;
  totalAmount: bigint;
  claimedAmount: bigint;
  tierCount: number;
  description: string;
  isCanceled: boolean;
}

export interface ClaimGrantConfig {
  /** DAO account ID */
  accountId: string;
  /** Asset token type */
  assetType: string;
  /** Stable token type */
  stableType: string;
  /** LP type for the spot pool used in PCW TWAP checks */
  lpType: string;
  /** Grant object ID */
  grantId: string;
  /** Tier index to claim */
  tierIndex: number;
  /** Recipient address for minted tokens */
  recipient: string;
  /** UnifiedSpotPool object ID (price source) */
  spotPoolId: string;
  /** Clock object (defaults to 0x6) */
  clockId?: string;
}

/**
 * OracleService - Oracle grant operations
 *
 * @example
 * ```typescript
 * // Claim a grant tier
 * const tx = sdk.dao.oracle.claimGrant({
 *   accountId: daoId,
 *   assetType,
 *   stableType,
 *   lpType,
 *   grantId,
 *   tierIndex: 0,
 *   spotPoolId,
 *   clockId: "0x6",
 * });
 *
 * // Get grant info
 * const grants = await sdk.dao.oracle.getGrants(daoId);
 * ```
 */
export class OracleService {
  private client: SuiClient;
  private packages: Packages;
  private sharedObjects: SharedObjects;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
    this.sharedObjects = params.sharedObjects;
  }

  // ============================================================================
  // GRANT OPERATIONS
  // ============================================================================

  /**
   * Claim a grant tier when price conditions are met
   */
  claimGrant(config: ClaimGrantConfig): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    // Step 1: validate eligibility + price conditions (spot pool geometric TWAP / PCW-backed)
    const claimRequest = tx.moveCall({
      target: `${this.packages.futarchyOracleActions}::oracle_actions::claim_grant`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.accountId),
        tx.object(this.sharedObjects.packageRegistry.id),
        tx.object(config.grantId),
        tx.pure.u64(config.tierIndex),
        tx.pure.address(config.recipient),
        tx.object(config.spotPoolId),
        tx.object(clockId),
      ],
    });

    // Step 2: fulfill claim request and mint from DAO treasury context
    tx.moveCall({
      target: `${this.packages.futarchyOracleActions}::oracle_actions::fulfill_claim_grant_from_account`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        claimRequest,
        tx.object(config.grantId),
        tx.object(config.accountId),
        tx.object(this.sharedObjects.packageRegistry.id),
        tx.object(clockId),
      ],
    });

    return tx;
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get all grants for a DAO
   */
  async getGrants(daoId: string): Promise<GrantInfo[]> {
    try {
      const grantIds = await this.getAllGrantIdsForAccount(daoId);
      const grants: GrantInfo[] = [];
      for (const grantId of grantIds) {
        const grantInfo = await this.getGrantInfo(grantId);
        if (grantInfo && grantInfo.daoId === daoId) {
          grants.push(grantInfo);
        }
      }
      return grants;
    } catch {
      return [];
    }
  }

  private async getAllGrantIdsForAccount(accountId: string): Promise<string[]> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packages.futarchyOracleActions}::oracle_actions::get_all_grant_ids`,
      arguments: [
        tx.object(accountId),
        tx.object(this.sharedObjects.packageRegistry.id),
      ],
    });

    const result = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    const raw = result.results?.[0]?.returnValues?.[0]?.[0];
    if (!raw) return [];
    return decodeVectorIdBytes(new Uint8Array(raw));
  }

  /**
   * Get grant info by ID
   */
  async getGrantInfo(grantId: string): Promise<GrantInfo | null> {
    try {
      const obj = await this.client.getObject({
        id: grantId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return null;
      }

      const fields = extractFields<OracleGrantFields>(obj);
      if (!fields) {
        return null;
      }

      const tierCount = getTierCountFromFields(fields);
      const claimedAmount = getClaimedAmountFromFields(fields);

      return {
        id: grantId,
        daoId: normalizeHexId(fields.dao_id || ''),
        totalAmount: BigInt(fields.total_amount || 0),
        claimedAmount,
        tierCount,
        description: fields.description || '',
        isCanceled: fields.canceled === true || fields.is_canceled === true,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a grant is canceled
   */
  async isCanceled(grantId: string): Promise<boolean> {
    const info = await this.getGrantInfo(grantId);
    return info?.isCanceled ?? false;
  }

  /**
   * Get total amount for a grant
   */
  async getTotalAmount(grantId: string): Promise<bigint> {
    const info = await this.getGrantInfo(grantId);
    return info?.totalAmount ?? 0n;
  }

  /**
   * Get description for a grant
   */
  async getDescription(grantId: string): Promise<string> {
    const info = await this.getGrantInfo(grantId);
    return info?.description ?? '';
  }

  /**
   * Get tier count for a grant
   */
  async getTierCount(grantId: string): Promise<number> {
    const info = await this.getGrantInfo(grantId);
    return info?.tierCount ?? 0;
  }
}

function getTierCountFromFields(fields: OracleGrantFields): number {
  const tiers = extractVectorValues(fields.tiers);
  if (tiers) return tiers.length;
  if (typeof fields.tier_count === 'number') return fields.tier_count;
  if (typeof fields.tier_count === 'string') return Number(fields.tier_count);
  return 0;
}

function getClaimedAmountFromFields(fields: OracleGrantFields): bigint {
  if (fields.claimed_amount !== undefined) {
    try {
      return BigInt(fields.claimed_amount);
    } catch {
      // Fall through to derive from tier execution flags.
    }
  }
  return deriveClaimedAmountFromTiers(fields.tiers);
}

function deriveClaimedAmountFromTiers(tiersValue: unknown): bigint {
  const tiers = extractVectorValues(tiersValue);
  if (!tiers) return 0n;

  let claimed = 0n;
  for (const tier of tiers) {
    const tierFields = extractStructFields(tier);
    if (!tierFields) continue;

    const recipients = extractVectorValues(tierFields.recipients) ?? [];
    const executed = extractVectorValues(tierFields.executed) ?? [];

    const count = Math.min(recipients.length, executed.length);
    for (let i = 0; i < count; i++) {
      const executedFlag = parseBoolean(executed[i]);
      if (!executedFlag) continue;

      const recipientFields = extractStructFields(recipients[i]);
      if (!recipientFields) continue;
      const amount = toBigIntSafe(recipientFields.amount);
      claimed += amount;
    }
  }

  return claimed;
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  if (typeof value === 'number') return value !== 0;

  const fields = extractStructFields(value);
  if (fields && typeof fields.value === 'boolean') return fields.value;
  return false;
}

function toBigIntSafe(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function extractStructFields(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  if (obj.fields && typeof obj.fields === 'object') {
    return obj.fields as Record<string, unknown>;
  }
  return obj;
}

function extractVectorValues(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  const record = extractStructFields(value);
  if (!record) return undefined;
  if (Array.isArray(record.vec)) return record.vec;
  if (Array.isArray(record.contents)) return record.contents;
  if (record.fields && typeof record.fields === 'object') {
    const nested = record.fields as Record<string, unknown>;
    if (Array.isArray(nested.vec)) return nested.vec;
    if (Array.isArray(nested.contents)) return nested.contents;
  }
  return undefined;
}

function decodeVectorIdBytes(bytes: Uint8Array): string[] {
  try {
    const parsed = bcs.vector(bcs.Address).parse(bytes);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => normalizeHexId(v));
    }
  } catch {
    // Fallback to manual parser below.
  }

  const [length, startOffset] = decodeUleb128(bytes, 0);
  const ids: string[] = [];
  let offset = startOffset;
  for (let i = 0; i < length; i++) {
    if (offset + 32 > bytes.length) break;
    ids.push(normalizeHexId(bytes.slice(offset, offset + 32)));
    offset += 32;
  }
  return ids;
}

function decodeUleb128(bytes: Uint8Array, start: number): [number, number] {
  let value = 0;
  let shift = 0;
  let offset = start;

  while (offset < bytes.length) {
    const byte = bytes[offset];
    value |= (byte & 0x7f) << shift;
    offset += 1;
    if ((byte & 0x80) === 0) return [value, offset];
    shift += 7;
    if (shift > 35) break;
  }

  return [0, start];
}

function normalizeHexId(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array)) {
    const record = value as Record<string, unknown>;
    const nested =
      record.id ??
      record.objectId ??
      record.object_id ??
      record.bytes ??
      (record.fields && typeof record.fields === 'object'
        ? ((record.fields as Record<string, unknown>).id ??
          (record.fields as Record<string, unknown>).bytes)
        : undefined);
    if (nested !== undefined) return normalizeHexId(nested);
  }
  if (typeof value === 'string') {
    return value.startsWith('0x') ? value : `0x${value}`;
  }
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  if (Array.isArray(value)) {
    const arr = Uint8Array.from(value as number[]);
    return `0x${Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return String(value);
}
