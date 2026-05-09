/**
 * TWAP Service - Time-weighted average price operations
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import { extractFields, MarketStateFields, ProposalFields } from '../../types';
import type { Packages, SharedObjects } from '../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

const PRICE_SCALE = 1_000_000_000_000;

export interface TwapObservationSnapshot {
  marketStateId: string;
  observationCount: number;
  lastObservationTimeMs?: bigint;
  currentTwapRaw: bigint;
  currentTwapScaled: number;
  outcomeIndex?: number;
  source?: 'proposal_twap_prices' | 'market_state_frozen_twaps';
}

export interface ProposalTwapTiming {
  proposalId: string;
  marketStateId?: string;
  currentChainTimeMs: bigint;
  createdAtMs?: bigint;
  tradingPeriodMs?: bigint;
  tradingStartMs?: bigint;
  tradingEndMs?: bigint;
  twapStartDelayMs?: bigint;
  twapWindowStartMs?: bigint;
  finalizationTimeMs?: bigint;
  executionDeadlineMs?: bigint;
  lastTwapUpdateMs?: bigint;
  marketWinner?: number;
  twapPricesRaw: bigint[];
  twapPricesScaled: number[];
  frozenTwapsRaw?: bigint[];
  frozenTwapsScaled?: number[];
}

export class TwapService {
  private client: SuiClient;
  private packages: Packages;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
  }

  /**
   * Get current TWAP price for an outcome
   */
  async getCurrentPrice(proposalId: string, outcomeIndex: number): Promise<number> {
    const timing = await this.getProposalTwapTiming({ proposalId });
    if (outcomeIndex < 0 || outcomeIndex >= timing.twapPricesScaled.length) {
      throw new Error(
        `Outcome index ${outcomeIndex} out of bounds (have ${timing.twapPricesScaled.length} TWAP values)`
      );
    }
    return timing.twapPricesScaled[outcomeIndex];
  }

  /**
   * Get TWAP observations
   */
  async getObservations(proposalId: string): Promise<TwapObservationSnapshot[]> {
    const timing = await this.getProposalTwapTiming({ proposalId });
    if (!timing.marketStateId) return [];

    const sourceValues =
      timing.frozenTwapsRaw && timing.frozenTwapsRaw.length > 0
        ? timing.frozenTwapsRaw
        : timing.twapPricesRaw;
    const source: TwapObservationSnapshot['source'] =
      timing.frozenTwapsRaw && timing.frozenTwapsRaw.length > 0
        ? 'market_state_frozen_twaps'
        : 'proposal_twap_prices';

    return sourceValues.map((twap, outcomeIndex) => ({
      marketStateId: timing.marketStateId as string,
      observationCount: 1,
      lastObservationTimeMs: timing.lastTwapUpdateMs,
      currentTwapRaw: twap,
      currentTwapScaled: this.scalePrice(twap),
      outcomeIndex,
      source,
    }));
  }

  /**
   * Get TWAP + timing window details for a proposal.
   *
   * This is intended for strategy bots that need:
   * - current on-chain time
   * - TWAP values for all outcomes
   * - TWAP window start/end context
   */
  async getProposalTwapTiming(config: {
    proposalId: string;
    assetType?: string;
    stableType?: string;
    marketStateId?: string;
    clockId?: string;
  }): Promise<ProposalTwapTiming> {
    const currentChainTimeMs = await this.getCurrentChainTimeMs();

    const proposalObject = await this.client.getObject({
      id: config.proposalId,
      options: { showContent: true },
    });
    const proposalFields = extractFields<ProposalFields>(proposalObject);
    if (!proposalFields) {
      throw new Error(`Proposal ${config.proposalId} not found`);
    }

    const proposalRecord = proposalFields as Record<string, unknown>;
    const timingFields = extractStructFields(proposalRecord.timing);
    const twapConfigFields = extractStructFields(proposalRecord.twap_config);

    const marketStateId =
      config.marketStateId ||
      extractObjectId(extractOptionValue(proposalRecord.market_state_id) ?? proposalRecord.market_state_id) ||
      extractObjectId(proposalRecord.market_state);

    let twapPricesRaw =
      parseBigIntVector(twapConfigFields?.twap_prices ?? proposalRecord.twap_prices) ?? [];
    let lastTwapUpdateMs =
      parseBigIntValue(timingFields?.last_twap_update ?? proposalRecord.last_twap_update);
    let createdAtMs = parseBigIntValue(timingFields?.created_at ?? proposalRecord.created_at);
    let tradingPeriodMs =
      parseBigIntValue(timingFields?.trading_period_ms ?? proposalRecord.trading_period_ms);
    let twapStartDelayMs =
      parseBigIntValue(timingFields?.twap_start_delay ?? proposalRecord.twap_start_delay);

    if (config.assetType && config.stableType) {
      const proposalTiming = await this.readProposalTimingViaGetters({
        proposalId: config.proposalId,
        assetType: config.assetType,
        stableType: config.stableType,
      });
      if (proposalTiming.twapPricesRaw.length > 0) {
        twapPricesRaw = proposalTiming.twapPricesRaw;
      }
      lastTwapUpdateMs = proposalTiming.lastTwapUpdateMs ?? lastTwapUpdateMs;
      createdAtMs = proposalTiming.createdAtMs ?? createdAtMs;
      tradingPeriodMs = proposalTiming.tradingPeriodMs ?? tradingPeriodMs;
      twapStartDelayMs = proposalTiming.twapStartDelayMs ?? twapStartDelayMs;
    }

    const marketStateFields = await this.getMarketStateFields(marketStateId);
    const marketStateRecord = marketStateFields as Record<string, unknown> | null;
    const marketStatePackage = this.packages.futarchyMarketsPrimitives;

    const tradingStartMs = (await this.readMarketStateOptionU64(
      marketStateId,
      `${marketStatePackage}::market_state::get_trading_start`
    )) ?? parseBigIntValue(marketStateRecord?.trading_start);

    const tradingEndMs = (await this.readMarketStateOptionU64(
      marketStateId,
      `${marketStatePackage}::market_state::get_trading_end_time`
    )) ??
      parseOptionBigIntValue(marketStateRecord?.trading_end) ??
      parseOptionBigIntValue(marketStateRecord?.trading_end_time);

    const finalizationTimeMs =
      (await this.readMarketStateOptionU64(
        marketStateId,
        `${marketStatePackage}::market_state::get_finalization_time`
      )) ??
      parseOptionBigIntValue(marketStateRecord?.finalization_time);

    const executionDeadlineMs =
      (await this.readMarketStateOptionU64(
        marketStateId,
        `${marketStatePackage}::market_state::get_execution_deadline`
      )) ??
      parseOptionBigIntValue(marketStateRecord?.execution_deadline);

    const marketWinnerRaw =
      (await this.readMarketStateOptionU64(
        marketStateId,
        `${marketStatePackage}::market_state::get_market_winner`
      )) ??
      parseOptionBigIntValue(marketStateRecord?.market_winner);

    const frozenTwapsRaw =
      (await this.readMarketStateOptionVectorU128(
        marketStateId,
        `${marketStatePackage}::market_state::get_frozen_twaps`
      )) ??
      parseOptionBigIntVector(marketStateRecord?.frozen_twaps) ??
      parseBigIntVector(marketStateRecord?.frozen_twaps);

    const twapWindowStartMs =
      tradingStartMs !== undefined && twapStartDelayMs !== undefined
        ? tradingStartMs + twapStartDelayMs
        : undefined;

    return {
      proposalId: config.proposalId,
      marketStateId,
      currentChainTimeMs,
      createdAtMs,
      tradingPeriodMs,
      tradingStartMs,
      tradingEndMs,
      twapStartDelayMs,
      twapWindowStartMs,
      finalizationTimeMs,
      executionDeadlineMs,
      lastTwapUpdateMs,
      marketWinner: marketWinnerRaw !== undefined ? Number(marketWinnerRaw) : undefined,
      twapPricesRaw,
      twapPricesScaled: twapPricesRaw.map((p) => this.scalePrice(p)),
      frozenTwapsRaw,
      frozenTwapsScaled: frozenTwapsRaw?.map((p) => this.scalePrice(p)),
    };
  }

  /**
   * Read current on-chain time from the latest checkpoint.
   */
  async getCurrentChainTimeMs(): Promise<bigint> {
    try {
      const sequence = await this.client.getLatestCheckpointSequenceNumber();
      const checkpoint = await this.client.getCheckpoint({ id: sequence });
      return BigInt(checkpoint.timestampMs);
    } catch {
      return BigInt(Date.now());
    }
  }

  private scalePrice(raw: bigint): number {
    return Number(raw) / PRICE_SCALE;
  }

  private async getMarketStateFields(
    marketStateId?: string
  ): Promise<MarketStateFields | null> {
    if (!marketStateId) return null;
    const obj = await this.client.getObject({
      id: marketStateId,
      options: { showContent: true },
    });
    return extractFields<MarketStateFields>(obj);
  }

  private async readProposalTimingViaGetters(config: {
    proposalId: string;
    assetType: string;
    stableType: string;
  }): Promise<{
    twapPricesRaw: bigint[];
    lastTwapUpdateMs?: bigint;
    createdAtMs?: bigint;
    tradingPeriodMs?: bigint;
    twapStartDelayMs?: bigint;
  }> {
    const tx = new Transaction();
    const proposal = tx.object(config.proposalId);
    const targets = `${this.packages.futarchyProposal}::proposal`;
    const typeArguments = [config.assetType, config.stableType];

    tx.moveCall({
      target: `${targets}::get_twap_prices`,
      typeArguments,
      arguments: [proposal],
    });
    tx.moveCall({
      target: `${targets}::get_last_twap_update`,
      typeArguments,
      arguments: [proposal],
    });
    tx.moveCall({
      target: `${targets}::get_created_at`,
      typeArguments,
      arguments: [proposal],
    });
    tx.moveCall({
      target: `${targets}::get_trading_period_ms`,
      typeArguments,
      arguments: [proposal],
    });
    tx.moveCall({
      target: `${targets}::get_twap_start_delay`,
      typeArguments,
      arguments: [proposal],
    });

    try {
      const result = await this.client.devInspectTransactionBlock({
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
        transactionBlock: tx,
      });
      const values = result.results || [];

      const twapPricesRaw = this.decodeVectorU128(
        this.firstReturnValue(values[0])
      ) ?? [];

      return {
        twapPricesRaw,
        lastTwapUpdateMs: this.decodeU64(this.firstReturnValue(values[1])),
        createdAtMs: this.decodeU64(this.firstReturnValue(values[2])),
        tradingPeriodMs: this.decodeU64(this.firstReturnValue(values[3])),
        twapStartDelayMs: this.decodeU64(this.firstReturnValue(values[4])),
      };
    } catch {
      return {
        twapPricesRaw: [],
      };
    }
  }

  private async readMarketStateOptionU64(
    marketStateId: string | undefined,
    target: string
  ): Promise<bigint | undefined> {
    const bytes = await this.readMarketStateGetterBytes(marketStateId, target);
    return this.decodeOptionU64(bytes);
  }

  private async readMarketStateOptionVectorU128(
    marketStateId: string | undefined,
    target: string
  ): Promise<bigint[] | undefined> {
    const bytes = await this.readMarketStateGetterBytes(marketStateId, target);
    return this.decodeOptionVectorU128(bytes);
  }

  private async readMarketStateGetterBytes(
    marketStateId: string | undefined,
    target: string
  ): Promise<Uint8Array | undefined> {
    if (!marketStateId) return undefined;
    const tx = new Transaction();
    tx.moveCall({
      target,
      arguments: [tx.object(marketStateId)],
    });
    try {
      const result = await this.client.devInspectTransactionBlock({
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
        transactionBlock: tx,
      });
      return this.firstReturnValue(result.results?.[0]);
    } catch {
      return undefined;
    }
  }

  private firstReturnValue(
    result: { returnValues?: Array<[number[], string]> } | undefined
  ): Uint8Array | undefined {
    const bytes = result?.returnValues?.[0]?.[0];
    return bytes ? new Uint8Array(bytes) : undefined;
  }

  private decodeU64(bytes: Uint8Array | undefined): bigint | undefined {
    if (!bytes) return undefined;
    try {
      return BigInt(bcs.u64().parse(bytes));
    } catch {
      return undefined;
    }
  }

  private decodeVectorU128(bytes: Uint8Array | undefined): bigint[] | undefined {
    if (!bytes) return undefined;
    try {
      const parsed = bcs.vector(bcs.u128()).parse(bytes);
      return parsed.map((v) => BigInt(v));
    } catch {
      return undefined;
    }
  }

  private decodeOptionU64(bytes: Uint8Array | undefined): bigint | undefined {
    if (!bytes) return undefined;
    try {
      const parsed = bcs.option(bcs.u64()).parse(bytes);
      if (parsed === null || parsed === undefined) return undefined;
      return BigInt(parsed);
    } catch {
      return this.decodeU64(bytes);
    }
  }

  private decodeOptionVectorU128(bytes: Uint8Array | undefined): bigint[] | undefined {
    if (!bytes) return undefined;
    try {
      const parsed = bcs.option(bcs.vector(bcs.u128())).parse(bytes);
      if (parsed === null || parsed === undefined) return undefined;
      return parsed.map((v) => BigInt(v));
    } catch {
      return this.decodeVectorU128(bytes);
    }
  }
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  return 0n;
}

function toOptionalBigInt(value: unknown): bigint | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    return toBigInt(value);
  } catch {
    return undefined;
  }
}

function parseBigIntValue(value: unknown): bigint | undefined {
  const direct = toOptionalBigInt(value);
  if (direct !== undefined) return direct;

  const option = extractOptionValue(value);
  if (option !== undefined) {
    const optionParsed = toOptionalBigInt(option);
    if (optionParsed !== undefined) return optionParsed;
  }

  const fields = extractStructFields(value);
  if (!fields) return undefined;
  return toOptionalBigInt(fields.value);
}

function parseOptionBigIntValue(value: unknown): bigint | undefined {
  const option = extractOptionValue(value);
  if (option === undefined) return parseBigIntValue(value);
  return parseBigIntValue(option);
}

function parseBigIntVector(value: unknown): bigint[] | undefined {
  const vector = extractVectorValues(value);
  if (!vector) return undefined;

  const parsed = vector
    .map((v) => parseBigIntValue(v))
    .filter((v): v is bigint => v !== undefined);

  return parsed.length === vector.length ? parsed : undefined;
}

function parseOptionBigIntVector(value: unknown): bigint[] | undefined {
  const option = extractOptionValue(value);
  if (option === undefined) return undefined;
  return parseBigIntVector(option);
}

function extractVectorValues(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  const record = extractStructFields(value);
  if (!record) return undefined;

  if (Array.isArray(record.vec)) return record.vec;
  if (Array.isArray(record.contents)) return record.contents;

  const nested = record.fields;
  if (nested && typeof nested === 'object') {
    const nestedRecord = nested as Record<string, unknown>;
    if (Array.isArray(nestedRecord.vec)) return nestedRecord.vec;
    if (Array.isArray(nestedRecord.contents)) return nestedRecord.contents;
  }
  return undefined;
}

function extractStructFields(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  const fields = obj.fields;
  if (fields && typeof fields === 'object') {
    return fields as Record<string, unknown>;
  }
  return obj;
}

function extractOptionValue(value: unknown): unknown | undefined {
  if (value === undefined || value === null) return undefined;

  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : undefined;
  }

  const record = extractStructFields(value);
  if (!record) return undefined;

  if ('some' in record) return record.some;
  if ('value' in record && record.value !== null) return record.value;
  if (Array.isArray(record.vec)) return record.vec.length > 0 ? record.vec[0] : undefined;

  return undefined;
}

function extractObjectId(value: unknown, depth: number = 0): string | undefined {
  if (depth > 8 || value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = extractObjectId(item, depth + 1);
      if (id) return id;
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
