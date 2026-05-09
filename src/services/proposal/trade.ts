/**
 * Trade Service - Proposal trading operations
 *
 * Provides quote and trade execution for proposal conditional markets.
 * This service is conditional-market-only.
 * Protective-bid quoting/routing is intentionally excluded from this module.
 * Uses devInspect for accurate quotes and handles the full swap flow.
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import type { Packages, SharedObjects } from '../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

/**
 * Quote result with detailed info
 */
export interface QuoteResult {
  amountOut: bigint;
  effectivePrice: number;
  priceImpactBps: bigint;
  feeAmountIn: bigint;
  protocolFeeAmountIn: bigint;
  lpFeeAmountIn: bigint;
  protocolFeeBps: bigint;
  lpFeeBps: bigint;
  totalFeeBps: bigint;
  outcomeIndex: number;
  direction: 'stableToAsset' | 'assetToStable';
}

/**
 * Outcome oracle snapshot pulled from proposal::get_oracle_state_by_outcome.
 *
 * This reflects the futarchy conditional oracle state (not PCW spot oracle state).
 */
export interface OutcomeOracleState {
  outcomeIndex: number;
  lastPrice: bigint;
  lastTimestampMs: bigint;
  totalCumulativePrice: bigint;
  lastWindowEndCumulativePrice: bigint;
  lastWindowEndMs: bigint;
  lastWindowTwapRaw: bigint;
  lastWindowTwapScaled: number;
  marketStartTimeMs?: bigint;
  twapInitializationPrice: bigint;
  twapStartDelayMs: bigint;
  twapCapStep: bigint;
  assetReserve: bigint;
  stableReserve: bigint;
}

/**
 * Trade execution config
 */
export interface TradeConfig {
  proposalId: string;
  escrowId: string;
  spotPoolId: string;
  assetType: string;
  stableType: string;
  lpType: string;
  outcomeIndex: number;
  direction: 'stableToAsset' | 'assetToStable';
  amountIn: bigint;
  minAmountOut: bigint;
  recipient: string;
  /** Coin object IDs to use for input */
  inputCoinIds: string[];
  /** Conditional coin types for all outcomes - array indexed by outcome */
  conditionalCoinTypes: Array<{
    outcomeIndex: number;
    assetCoinType: string;
    stableCoinType: string;
  }>;
  clockId?: string;
}

export type ConditionalTradingStrategyId =
  | 'direct_outcome_swap'
  | 'best_outcome_swap'
  | 'inventory_first_swap'
  | 'laddered_conditional_swap';

export interface ConditionalTradingStrategyDescriptor {
  id: ConditionalTradingStrategyId;
  name: string;
  description: string;
  requiredMethods: string[];
}

const PRICE_SCALE = 1_000_000_000_000;
const DEFAULT_TOTAL_FEE_BPS = 10_000n;
const DEFAULT_PROTOCOL_FEE_BPS = 50n;

function mulDivFloor(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) {
    throw new Error('divide by zero');
  }
  return (a * b) / c;
}

function decodeBigInt(value: unknown, label: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  throw new Error(`Failed to decode ${label}`);
}

function quoteXykSwap(params: {
  amountIn: bigint;
  reserveIn: bigint;
  reserveOut: bigint;
  lpFeeBps: bigint;
  protocolFeeBps: bigint;
  totalFeeBps: bigint;
}): {
  amountOut: bigint;
  amountInAfterFee: bigint;
  totalFee: bigint;
  protocolFee: bigint;
  lpFee: bigint;
  priceImpactBps: bigint;
} {
  const { amountIn, reserveIn, reserveOut, lpFeeBps, protocolFeeBps, totalFeeBps } = params;

  if (amountIn <= 0n) {
    return {
      amountOut: 0n,
      amountInAfterFee: 0n,
      totalFee: 0n,
      protocolFee: 0n,
      lpFee: 0n,
      priceImpactBps: 0n,
    };
  }
  if (reserveIn <= 0n || reserveOut <= 0n) {
    return {
      amountOut: 0n,
      amountInAfterFee: 0n,
      totalFee: 0n,
      protocolFee: 0n,
      lpFee: 0n,
      priceImpactBps: 0n,
    };
  }
  if (totalFeeBps <= 0n) {
    return {
      amountOut: 0n,
      amountInAfterFee: 0n,
      totalFee: 0n,
      protocolFee: 0n,
      lpFee: 0n,
      priceImpactBps: 0n,
    };
  }

  // Match on-chain fee model in futarchy_markets_primitives::conditional_amm:
  // total_fee = protocol_fee (fixed 0.5%) + lp_fee (configurable bps)
  const protocolFee = mulDivFloor(amountIn, protocolFeeBps, totalFeeBps);
  const lpFee = mulDivFloor(amountIn, lpFeeBps, totalFeeBps);
  const totalFee = protocolFee + lpFee;

  if (amountIn <= totalFee) {
    return {
      amountOut: 0n,
      amountInAfterFee: 0n,
      totalFee,
      protocolFee,
      lpFee,
      priceImpactBps: 0n,
    };
  }

  const amountInAfterFee = amountIn - totalFee;

  // UniswapV2-style x*y=k output: out = in * reserveOut / (reserveIn + in)
  const amountOut =
    (amountInAfterFee * reserveOut) / (reserveIn + amountInAfterFee);

  // Match conditional_amm::calculate_price_impact:
  // ideal_out = amount_in_after_fee * reserve_out / reserve_in
  const idealOut = (amountInAfterFee * reserveOut) / reserveIn;
  if (idealOut === 0n) {
    return {
      amountOut,
      amountInAfterFee,
      totalFee,
      protocolFee,
      lpFee,
      priceImpactBps: totalFeeBps,
    };
  }

  // Defensive: idealOut >= amountOut should always hold for this formula.
  const diff = idealOut > amountOut ? idealOut - amountOut : 0n;
  const priceImpactBps = (diff * totalFeeBps) / idealOut;

  return { amountOut, amountInAfterFee, totalFee, protocolFee, lpFee, priceImpactBps };
}

export class TradeService {
  private client: SuiClient;
  private packages: Packages;
  private sharedObjects: SharedObjects;
  private feeConstantsPromise:
    | Promise<{ protocolFeeBps: bigint; totalFeeBps: bigint }>
    | null = null;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
    this.sharedObjects = params.sharedObjects;
  }

  private async getFeeConstantsBps(): Promise<{
    protocolFeeBps: bigint;
    totalFeeBps: bigint;
  }> {
    if (this.feeConstantsPromise) {
      return this.feeConstantsPromise;
    }

    const fallback = {
      protocolFeeBps: DEFAULT_PROTOCOL_FEE_BPS,
      totalFeeBps: DEFAULT_TOTAL_FEE_BPS,
    };

    this.feeConstantsPromise = (async () => {
      const oneShotUtilsPkg = this.packages.oneShotUtils;
      if (!oneShotUtilsPkg) {
        return fallback;
      }

      try {
        const tx = new Transaction();
        tx.moveCall({
          target: `${oneShotUtilsPkg}::constants::protocol_fee_bps`,
          arguments: [],
        });
        tx.moveCall({
          target: `${oneShotUtilsPkg}::constants::total_fee_bps`,
          arguments: [],
        });

        const result = await this.client.devInspectTransactionBlock({
          sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
          transactionBlock: tx,
        });

        const protocolBytes = result.results?.[0]?.returnValues?.[0]?.[0];
        const totalBytes = result.results?.[1]?.returnValues?.[0]?.[0];
        if (!protocolBytes || !totalBytes) {
          return fallback;
        }

        const protocolFeeBps = decodeBigInt(
          bcs.u64().parse(new Uint8Array(protocolBytes)),
          'protocol_fee_bps'
        );
        const totalFeeBps = decodeBigInt(
          bcs.u64().parse(new Uint8Array(totalBytes)),
          'total_fee_bps'
        );

        if (
          protocolFeeBps < 0n ||
          totalFeeBps <= 0n ||
          protocolFeeBps > totalFeeBps
        ) {
          return fallback;
        }

        return { protocolFeeBps, totalFeeBps };
      } catch {
        return fallback;
      }
    })();

    return this.feeConstantsPromise;
  }

  /**
   * Get protocol-wide fee constants used by conditional swap math.
   *
   * `protocolFeeBps` is the fixed protocol share.
   * `feeDenominatorBps` is the 10_000 bps denominator used in on-chain fee math.
   * For the per-proposal LP fee, read the DAO-configured conditional AMM fee.
   */
  async getFeeBps(): Promise<{
    protocolFeeBps: number;
    totalFeeBps: number;
    feeDenominatorBps: number;
  }> {
    const constants = await this.getFeeConstantsBps();
    const feeDenominatorBps = Number(constants.totalFeeBps);
    return {
      protocolFeeBps: Number(constants.protocolFeeBps),
      totalFeeBps: feeDenominatorBps,
      feeDenominatorBps,
    };
  }

  /**
   * Agent-facing index of conditional swap strategies.
   *
   * All strategies returned here are conditional-market-only.
   */
  getConditionalTradingStrategies(): ConditionalTradingStrategyDescriptor[] {
    return [
      {
        id: 'direct_outcome_swap',
        name: 'Direct Outcome Swap',
        description:
          'Swap directly in a chosen conditional outcome when outcome preference is predefined.',
        requiredMethods: ['sdk.proposal.trade.getQuote', 'sdk.proposal.conditionalSwap'],
      },
      {
        id: 'best_outcome_swap',
        name: 'Best Outcome Route',
        description:
          'Find the best outcome index by quote, enrich it with futarchy oracle TWAP state, then execute conditional swap on that outcome.',
        requiredMethods: [
          'sdk.proposal.trade.findBestRoute',
          'sdk.proposal.trade.getOutcomeOracleState',
          'sdk.proposal.conditionalSwap',
        ],
      },
      {
        id: 'inventory_first_swap',
        name: 'Inventory-first Smart Swap',
        description:
          'Execute a conditional outcome swap while preferring existing conditional inventory and wrappers before optional spot conversion.',
        requiredMethods: [
          'sdk.proposal.querySmartSwapAvailableCoins',
          'sdk.proposal.smartConditionalSwap',
        ],
      },
      {
        id: 'laddered_conditional_swap',
        name: 'Laddered Conditional Execution',
        description:
          'Split a large conditional trade into smaller slices and execute sequentially with re-quoting.',
        requiredMethods: [
          'sdk.proposal.trade.buildLadderedExecutionPlan',
          'sdk.proposal.trade.getQuote',
          'sdk.proposal.conditionalSwap',
        ],
      },
    ];
  }

  /**
   * Build a slice plan for laddered conditional execution.
   *
   * Returns per-slice input amounts that sum exactly to totalAmountIn.
   */
  buildLadderedExecutionPlan(config: {
    totalAmountIn: bigint;
    slices: number;
    minSliceAmount?: bigint;
  }): bigint[] {
    const { totalAmountIn, slices, minSliceAmount } = config;

    if (totalAmountIn <= 0n) {
      throw new Error('totalAmountIn must be > 0');
    }
    if (!Number.isInteger(slices) || slices <= 0) {
      throw new Error('slices must be a positive integer');
    }

    const sliceCount = BigInt(slices);
    const base = totalAmountIn / sliceCount;
    if (base === 0n) {
      throw new Error('slices is too high for totalAmountIn');
    }

    if (minSliceAmount !== undefined && base < minSliceAmount) {
      throw new Error(
        `slice amount ${base} is below minSliceAmount ${minSliceAmount}`
      );
    }

    const remainder = totalAmountIn % sliceCount;
    const plan = new Array<bigint>(slices).fill(base);
    if (remainder > 0n) {
      plan[0] = plan[0] + remainder;
    }
    return plan;
  }

  /**
   * Get quote for a swap using devInspect
   *
   * Simulates the swap to get accurate output amount, price, and impact.
   *
   * @example
   * ```typescript
 * const quote = await sdk.proposal.trade.getQuote({
 *   proposalId: '0x...',
 *   escrowId: '0x...',
 *   spotPoolId: '0x...',
 *   assetType: '0x...::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   lpType: '0x...::lp::LP',
 *   outcomeIndex: 0,
 *   amountIn: 1_000_000n,
 *   direction: 'stableToAsset',
 * });
   * console.log(`Expected out: ${quote.amountOut}, price impact: ${quote.priceImpactBps}bps`);
   * ```
   */
  async getQuote(config: {
    proposalId: string;
    escrowId: string;
    spotPoolId: string;
    assetType: string;
    stableType: string;
    lpType: string;
    outcomeIndex: number;
    amountIn: bigint;
    direction: 'stableToAsset' | 'assetToStable';
    clockId?: string;
  }): Promise<QuoteResult> {
    if (!Number.isInteger(config.outcomeIndex) || config.outcomeIndex < 0 || config.outcomeIndex > 255) {
      throw new Error('outcomeIndex must be an integer between 0 and 255');
    }
    if (config.amountIn <= 0n) {
      throw new Error('amountIn must be > 0');
    }
    const { protocolFeeBps, totalFeeBps } = await this.getFeeConstantsBps();

    const tx = new Transaction();
    const operationsPkg = this.packages.futarchyMarketsOperations;
    const proposalPkg = this.packages.futarchyProposal;

    const spotPoolMutationRegistry = tx.sharedObjectRef({
      objectId: this.sharedObjects.spotPoolMutationRegistry.id,
      initialSharedVersion: this.sharedObjects.spotPoolMutationRegistry.version,
      mutable: false,
    });

    // 1) Read proposal-level AMM fee config (LP fee bps configured by the DAO).
    tx.moveCall({
      target: `${proposalPkg}::proposal::get_amm_total_fee_bps`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [tx.object(config.proposalId)],
    });

    // 2) Read oracle+reserve state for this outcome via wrapped-escrow-safe wrapper.
    tx.moveCall({
      target: `${operationsPkg}::swap_entry::read_oracle_state_by_outcome_with_wrapped_escrow`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.proposalId),
        tx.object(config.spotPoolId),
        tx.pure.u8(config.outcomeIndex),
        spotPoolMutationRegistry,
      ],
    });

    const result = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    if (!result.results || result.results.length < 2) {
      throw new Error('Quote simulation failed - no results');
    }

    const feeBpsBytes = result.results[0]?.returnValues?.[0]?.[0];
    if (!feeBpsBytes) {
      throw new Error('Quote simulation returned incomplete fee data');
    }
    const lpFeeBps = decodeBigInt(bcs.u64().parse(new Uint8Array(feeBpsBytes)), 'amm_total_fee_bps');

    const oracleReturnValues = result.results[1]?.returnValues;
    if (!oracleReturnValues || oracleReturnValues.length < 12) {
      throw new Error('Quote simulation returned incomplete oracle state');
    }

    const assetReserve = decodeBigInt(
      bcs.u64().parse(new Uint8Array(oracleReturnValues[10][0])),
      'asset_reserve'
    );
    const stableReserve = decodeBigInt(
      bcs.u64().parse(new Uint8Array(oracleReturnValues[11][0])),
      'stable_reserve'
    );

    const isSell = config.direction === 'assetToStable';
    const reserveIn = isSell ? assetReserve : stableReserve;
    const reserveOut = isSell ? stableReserve : assetReserve;

    const {
      amountOut,
      totalFee,
      protocolFee,
      lpFee,
      priceImpactBps,
    } = quoteXykSwap({
      amountIn: config.amountIn,
      reserveIn,
      reserveOut,
      lpFeeBps,
      protocolFeeBps,
      totalFeeBps,
    });

    if (amountOut <= 0n) {
      throw new Error('Quote produced zero output (trade too small or insufficient liquidity)');
    }

    // Return effective price in stable per asset (scaled by PRICE_SCALE on-chain).
    const effectivePriceScaled = isSell
      ? mulDivFloor(amountOut, BigInt(PRICE_SCALE), config.amountIn)
      : mulDivFloor(config.amountIn, BigInt(PRICE_SCALE), amountOut);

    const effectivePrice = Number(effectivePriceScaled) / PRICE_SCALE;

    return {
      amountOut,
      effectivePrice,
      priceImpactBps,
      feeAmountIn: totalFee,
      protocolFeeAmountIn: protocolFee,
      lpFeeAmountIn: lpFee,
      protocolFeeBps,
      lpFeeBps,
      totalFeeBps,
      outcomeIndex: config.outcomeIndex,
      direction: config.direction,
    };
  }

  /**
   * Find best outcome to route swap through
   *
   * Compares quotes across all outcomes and returns the best route.
   */
  async findBestRoute(config: {
    proposalId: string;
    escrowId: string;
    spotPoolId: string;
    assetType: string;
    stableType: string;
    lpType: string;
    amountIn: bigint;
    direction: 'stableToAsset' | 'assetToStable';
    clockId?: string;
  }): Promise<{ outcomeIndex: number; quote: QuoteResult; oracleState?: OutcomeOracleState }> {
    if (config.amountIn <= 0n) {
      throw new Error('amountIn must be > 0');
    }

    // Read outcome_count from on-chain proposal view function (avoid parsing object layout).
    const countTx = new Transaction();
    countTx.moveCall({
      target: `${this.packages.futarchyProposal}::proposal::outcome_count`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [countTx.object(config.proposalId)],
    });

    const countRes = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: countTx,
    });

    const countBytes = countRes.results?.[0]?.returnValues?.[0]?.[0];
    if (!countBytes) {
      throw new Error('Failed to read proposal outcome_count');
    }
    const outcomeCount = Number(
      decodeBigInt(
        bcs.u64().parse(new Uint8Array(countBytes)),
        'outcome_count'
      )
    );
    if (!Number.isFinite(outcomeCount) || outcomeCount <= 0) {
      throw new Error(`Invalid outcome_count=${outcomeCount}`);
    }

    let bestOutcome = 0;
    let bestQuote: QuoteResult | null = null;

    for (let i = 0; i < outcomeCount; i++) {
      const q = await this.getQuote({ ...config, outcomeIndex: i });
      if (!bestQuote || q.amountOut > bestQuote.amountOut) {
        bestQuote = q;
        bestOutcome = i;
      }
    }

    const outcomeIndex = bestOutcome;
    const quote = bestQuote as QuoteResult;

    let oracleState: OutcomeOracleState | undefined;
    try {
      oracleState = await this.getOutcomeOracleState({
        proposalId: config.proposalId,
        escrowId: config.escrowId,
        spotPoolId: config.spotPoolId,
        lpType: config.lpType,
        assetType: config.assetType,
        stableType: config.stableType,
        outcomeIndex,
      });
    } catch {
      // Keep route finding resilient even if oracle state getter is unavailable.
      oracleState = undefined;
    }

    return { outcomeIndex, quote, oracleState };
  }

  /**
   * Read futarchy conditional oracle state for a proposal outcome.
   *
   * This uses `proposal::get_oracle_state_by_outcome`, which reads the underlying
   * `futarchy_twap_oracle` attached to the conditional AMM pool.
   */
  async getOutcomeOracleState(config: {
    proposalId: string;
    escrowId: string;
    spotPoolId?: string;
    lpType?: string;
    assetType: string;
    stableType: string;
    outcomeIndex: number;
  }): Promise<OutcomeOracleState> {
    if (!Number.isInteger(config.outcomeIndex) || config.outcomeIndex < 0 || config.outcomeIndex > 255) {
      throw new Error('outcomeIndex must be an integer between 0 and 255');
    }

    const tx = new Transaction();
    const operationsPkg = this.packages.futarchyMarketsOperations;
    const useWrappedEscrowPath = Boolean(config.spotPoolId && config.lpType);

    if (useWrappedEscrowPath) {
      const spotPoolMutationRegistry = tx.sharedObjectRef({
        objectId: this.sharedObjects.spotPoolMutationRegistry.id,
        initialSharedVersion: this.sharedObjects.spotPoolMutationRegistry.version,
        mutable: false,
      });
      tx.moveCall({
        target: `${operationsPkg}::swap_entry::read_oracle_state_by_outcome_with_wrapped_escrow`,
        typeArguments: [config.assetType, config.stableType, config.lpType!],
        arguments: [
          tx.object(config.proposalId),
          tx.object(config.spotPoolId!),
          tx.pure.u8(config.outcomeIndex),
          spotPoolMutationRegistry,
        ],
      });
    } else {
      tx.moveCall({
        target: `${this.packages.futarchyProposal}::proposal::get_oracle_state_by_outcome`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [
          tx.object(config.proposalId),
          tx.object(config.escrowId),
          tx.pure.u8(config.outcomeIndex),
        ],
      });
    }

    const result = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    const values = result.results?.[0]?.returnValues;
    if (!values || values.length < 12) {
      throw new Error('Oracle state query returned incomplete data');
    }

    const decodeU64 = (index: number): bigint =>
      BigInt(bcs.u64().parse(new Uint8Array(values[index][0])));
    const decodeU128 = (index: number): bigint =>
      BigInt(bcs.u128().parse(new Uint8Array(values[index][0])));
    const decodeU256 = (index: number): bigint =>
      BigInt(bcs.u256().parse(new Uint8Array(values[index][0])));
    const decodeOptionU64 = (index: number): bigint | undefined => {
      const parsed = bcs.option(bcs.u64()).parse(new Uint8Array(values[index][0]));
      if (parsed === null || parsed === undefined) return undefined;
      return BigInt(parsed);
    };

    const lastWindowTwapRaw = decodeU128(5);

    return {
      outcomeIndex: config.outcomeIndex,
      lastPrice: decodeU128(0),
      lastTimestampMs: decodeU64(1),
      totalCumulativePrice: decodeU256(2),
      lastWindowEndCumulativePrice: decodeU256(3),
      lastWindowEndMs: decodeU64(4),
      lastWindowTwapRaw,
      lastWindowTwapScaled: Number(lastWindowTwapRaw) / PRICE_SCALE,
      marketStartTimeMs: decodeOptionU64(6),
      twapInitializationPrice: decodeU128(7),
      twapStartDelayMs: decodeU64(8),
      twapCapStep: decodeU64(9),
      assetReserve: decodeU64(10),
      stableReserve: decodeU64(11),
    };
  }

  /**
   * Get current price for an outcome from the conditional AMM
   *
   * Price is expressed as stable per asset.
   */
  async getPrice(config: {
    proposalId: string;
    escrowId: string;
    spotPoolId: string;
    assetType: string;
    stableType: string;
    lpType: string;
    outcomeIndex: number;
    clockId?: string;
  }): Promise<number> {
    // Use a minimal quote to get the effective price at that outcome
    try {
      const quote = await this.getQuote({
        ...config,
        amountIn: 1_000_000n, // Small amount for price discovery
        direction: 'stableToAsset',
      });
      return quote.effectivePrice;
    } catch {
      // If quote fails, return 0 (market may not be initialized)
      return 0;
    }
  }

}
