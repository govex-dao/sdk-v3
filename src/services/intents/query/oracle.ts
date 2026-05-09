/**
 * Oracle Query Service
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { extractFields, OracleGrantFields } from '../../../types';
import type { Packages, SharedObjects } from '../../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export class OracleQueryService {
  private client: SuiClient;
  private packages: Packages;
  private sharedObjects: SharedObjects;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
    this.sharedObjects = params.sharedObjects;
  }

  async getTotalAmount(grantId: string): Promise<bigint> {
    try {
      const obj = await this.client.getObject({
        id: grantId,
        options: { showContent: true },
      });
      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return 0n;
      return BigInt(extractFields<OracleGrantFields>(obj)?.total_amount || 0);
    } catch {
      return 0n;
    }
  }

  async isCanceled(grantId: string): Promise<boolean> {
    try {
      const obj = await this.client.getObject({
        id: grantId,
        options: { showContent: true },
      });
      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return false;
      const fields = extractFields<OracleGrantFields>(obj);
      return fields?.canceled === true || fields?.is_canceled === true;
    } catch {
      return false;
    }
  }

  async getDescription(grantId: string): Promise<string> {
    try {
      const obj = await this.client.getObject({
        id: grantId,
        options: { showContent: true },
      });
      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return '';
      return extractFields<OracleGrantFields>(obj)?.description || '';
    } catch {
      return '';
    }
  }

  async getTierCount(grantId: string): Promise<number> {
    try {
      const obj = await this.client.getObject({
        id: grantId,
        options: { showContent: true },
      });
      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return 0;
      const fields = extractFields<OracleGrantFields>(obj);
      const tiers = extractVectorValues(fields?.tiers);
      if (tiers) return tiers.length;
      if (typeof fields?.tier_count === 'number') return fields.tier_count;
      if (typeof fields?.tier_count === 'string') return Number(fields.tier_count);
      return 0;
    } catch {
      return 0;
    }
  }

  async getAllGrantIds(accountId: string): Promise<string[]> {
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
}

function extractVectorValues(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
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
