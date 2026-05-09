/**
 * Markets/AMM Operations
 *
 * TWAP oracle operations for futarchy markets.
 *
 * @module markets
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import type { EventId } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import { TransactionUtils } from './transaction';
import { extractFields, PoolFields } from '../types';

/**
 * TWAP Oracle operations
 *
 * Conditional AMM TWAP helpers.
 *
 * @example Read current TWAP
 * ```typescript
 * const twap = await sdk.twap.getCurrentTWAP(poolId);
 * ```
 */
export class TWAPOperations {
  private client: SuiClient;
  private marketsPackageId: string;

  constructor(client: SuiClient, marketsPackageId: string) {
    this.client = client;
    this.marketsPackageId = marketsPackageId;
  }

  /**
   * View: Get current TWAP value
   *
   * @param poolId - Conditional AMM pool object ID
   * @param clock - Clock object
   * @returns Current TWAP value
   */
  async getCurrentTWAP(poolId: string, clock: string = '0x6'): Promise<bigint> {
    const tx = new Transaction();
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.marketsPackageId,
        'conditional_amm',
        'get_twap'
      ),
      arguments: [tx.object(poolId), tx.object(clock)],
    });

    const result = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    const bytes = result.results?.[0]?.returnValues?.[0]?.[0];
    if (!bytes) {
      throw new Error('Could not read TWAP from pool');
    }

    return BigInt(bcs.u128().parse(new Uint8Array(bytes)));
  }

  /**
   * Observation count derived from futarchy oracle `PriceEvent` history.
   */
  async getObservationCount(poolId: string): Promise<number> {
    const obj = await this.client.getObject({
      id: poolId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      return 0;
    }

    const poolFields = extractFields<PoolFields>(obj) as Record<string, unknown> | null;
    const oracleId =
      extractObjectId(poolFields?.oracle) ??
      extractObjectId((obj.data.content as { fields?: Record<string, unknown> }).fields?.oracle);
    if (!oracleId) {
      return 0;
    }

    let count = 0;
    let cursor: EventId | null | undefined = null;

    do {
      const events = await this.client.queryEvents({
        query: {
          MoveEventType: `${this.marketsPackageId}::futarchy_twap_oracle::PriceEvent`,
        },
        cursor,
        limit: 100,
      });

      for (const event of events.data) {
        const parsed = event.parsedJson as { oracle_id?: unknown } | null;
        const eventOracleId = extractObjectId(parsed?.oracle_id);
        if (eventOracleId && normalizeHexId(eventOracleId) === normalizeHexId(oracleId)) {
          count += 1;
        }
      }

      cursor = events.hasNextPage ? events.nextCursor : null;
    } while (cursor);

    return count;
  }
}

function extractObjectId(value: unknown, depth: number = 0): string | undefined {
  if (depth > 8 || value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractObjectId(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;

  const obj = value as Record<string, unknown>;
  for (const key of ['id', 'objectId', 'object_id', 'bytes']) {
    const candidate = obj[key];
    if (typeof candidate === 'string') return candidate;
  }

  for (const key of ['id', 'objectId', 'object_id', 'value', 'some', 'fields', 'vec']) {
    if (!(key in obj)) continue;
    const nested = extractObjectId(obj[key], depth + 1);
    if (nested) return nested;
  }

  return undefined;
}

function normalizeHexId(id: string): string {
  return id.startsWith('0x') ? id.toLowerCase() : `0x${id.toLowerCase()}`;
}
