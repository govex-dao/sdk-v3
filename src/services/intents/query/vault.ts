/**
 * Vault Query Service
 */

import { SuiClient } from '@mysten/sui/client';
import { extractFields, StreamFields } from '../../../types';
import { calculateStreamAvailableWithTracking } from '../../../utils/stream';
import type { Packages, SharedObjects } from '../../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export interface StreamInfo {
  id: string;
  beneficiary?: string;
  amountPerIteration: bigint;
  claimedAmount: bigint;
  firstUnclaimedIteration?: bigint;
  partialClaimedInIteration?: bigint;
  startTime: number;
  claimWindowMs?: number;
  iterationsTotal: number;
  iterationPeriodMs: number;
  totalAmount: bigint;
}

export class VaultQueryService {
  private client: SuiClient;
  private packages: Packages;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
  }

  async getStream(streamId: string): Promise<StreamInfo | null> {
    try {
      const obj = await this.client.getObject({
        id: streamId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return null;
      }

      const fields = extractFields<StreamFields>(obj);
      if (!fields) return null;

      return {
        id: streamId,
        beneficiary: fields.beneficiary,
        amountPerIteration: BigInt(fields.amount_per_iteration),
        claimedAmount: BigInt(fields.claimed_amount || fields.iterations_claimed || 0),
        firstUnclaimedIteration: fields.first_unclaimed_iteration !== undefined ? BigInt(fields.first_unclaimed_iteration) : undefined,
        partialClaimedInIteration: fields.partial_claimed_in_iteration !== undefined ? BigInt(fields.partial_claimed_in_iteration) : undefined,
        startTime: Number(fields.start_time),
        claimWindowMs: fields.claim_window_ms ? Number(fields.claim_window_ms) : undefined,
        iterationsTotal: Number(fields.iterations_total),
        iterationPeriodMs: Number(fields.iteration_period_ms || fields.period_ms || 0),
        totalAmount: BigInt(fields.amount_per_iteration) * BigInt(fields.iterations_total),
      };
    } catch {
      return null;
    }
  }

  async getClaimableAmount(streamId: string): Promise<bigint> {
    const stream = await this.getStream(streamId);
    if (!stream) return 0n;

    try {
      return calculateStreamAvailableWithTracking({
        amountPerIteration: stream.amountPerIteration,
        firstUnclaimedIteration: stream.firstUnclaimedIteration ?? 0n,
        partialClaimedInIteration: stream.partialClaimedInIteration ?? 0n,
        startTimeMs: BigInt(stream.startTime),
        iterationsTotal: BigInt(stream.iterationsTotal),
        iterationPeriodMs: BigInt(stream.iterationPeriodMs),
        currentTimeMs: BigInt(Date.now()),
        claimWindowMs: stream.claimWindowMs !== undefined ? BigInt(stream.claimWindowMs) : undefined,
      });
    } catch {
      return 0n;
    }
  }

  async listStreamsForBeneficiary(beneficiary: string): Promise<StreamInfo[]> {
    const streams: StreamInfo[] = [];
    let cursor: string | null | undefined = null;
    const streamTypePrefix = `${this.packages.accountActions}::vault::Stream<`;

    do {
      const page = await this.client.getOwnedObjects({
        owner: beneficiary,
        cursor,
        options: { showType: true },
      });

      for (const obj of page.data) {
        const objectId = obj.data?.objectId;
        const type = obj.data?.type;
        if (!objectId || !type || !type.startsWith(streamTypePrefix)) {
          continue;
        }

        const stream = await this.getStream(objectId);
        if (stream) {
          streams.push(stream);
        }
      }

      cursor = page.hasNextPage ? page.nextCursor : null;
    } while (cursor);

    return streams;
  }
}
