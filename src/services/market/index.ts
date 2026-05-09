/**
 * Market Service - AMM and trading operations
 *
 * Provides spot pool trading and quote functionality.
 * Uses devInspect for accurate quotes.
 *
 * @module services/market
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import { extractFields, PoolFields } from '../../types';
import type { Packages, SharedObjects } from '../../types';

// Re-export sub-services
export { PoolService } from './pool';

import { PoolService } from './pool';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

/**
 * Quote result for spot pool swaps
 */
export interface SpotQuoteResult {
  amountOut: bigint;
  effectivePrice: number;
  feeBps: number;
}

/**
 * MarketService - AMM and trading operations
 *
 * @example
 * ```typescript
 * // Get quote for swap
 * const quote = await sdk.market.getQuote({
 *   poolId: '0x...',
 *   assetType: '0x...::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   amountIn: 100_000_000n,
 *   isAssetToStable: true,
 * });
 *
 * // Pool operations
 * const tx = sdk.market.pool.addLiquidity({...});
 * ```
 */
export class MarketService {
  private client: SuiClient;
  private packages: Packages;

  /** Pool operations (liquidity add/remove) */
  public pool: PoolService;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;

    // Initialize sub-services
    this.pool = new PoolService(params);
  }

  // ============================================================================
  // QUOTES (devInspect)
  // ============================================================================

  /**
   * Get quote for a spot pool swap using devInspect
   *
   * Simulates the swap to get accurate output amount.
   *
   * @example
   * ```typescript
   * const quote = await sdk.market.getQuote({
   *   poolId: '0x...',
   *   assetType: '0x...::coin::COIN',
   *   stableType: '0x2::sui::SUI',
   *   amountIn: 1_000_000_000n,
   *   isAssetToStable: true,
   * });
   * console.log(`Expected out: ${quote.amountOut}`);
   * ```
   */
  async getQuote(config: {
    poolId: string;
    assetType: string;
    stableType: string;
    lpType: string;
    amountIn: bigint;
    isAssetToStable: boolean;
  }): Promise<SpotQuoteResult> {
    const tx = new Transaction();

    // Build simulation call using accurate variants (include clock for fee schedule)
    if (config.isAssetToStable) {
      tx.moveCall({
        target: `${this.packages.futarchyMarketsCore}::unified_spot_pool::simulate_swap_asset_to_stable_accurate`,
        typeArguments: [config.assetType, config.stableType, config.lpType],
        arguments: [tx.object(config.poolId), tx.pure.u64(config.amountIn), tx.object('0x6')],
      });
    } else {
      tx.moveCall({
        target: `${this.packages.futarchyMarketsCore}::unified_spot_pool::simulate_swap_stable_to_asset_accurate`,
        typeArguments: [config.assetType, config.stableType, config.lpType],
        arguments: [tx.object(config.poolId), tx.pure.u64(config.amountIn), tx.object('0x6')],
      });
    }
    tx.moveCall({
      target: `${this.packages.futarchyMarketsCore}::unified_spot_pool::current_fee_bps`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [tx.object(config.poolId), tx.object('0x6')],
    });

    // Execute devInspect
    const result = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    if (!result.results || result.results.length < 2) {
      throw new Error('Quote simulation failed - no results');
    }

    const amountOutBytes = result.results[0]?.returnValues?.[0]?.[0];
    const feeBpsBytes = result.results[1]?.returnValues?.[0]?.[0];
    if (!amountOutBytes || !feeBpsBytes) {
      throw new Error('Quote simulation returned no data');
    }

    // Parse the u64 result
    const amountOut = BigInt(bcs.u64().parse(new Uint8Array(amountOutBytes)));
    const feeBps = Number(bcs.u64().parse(new Uint8Array(feeBpsBytes)));

    // Calculate effective price
    const effectivePrice =
      amountOut === 0n
        ? 0
        : config.isAssetToStable
          ? Number(amountOut) / Number(config.amountIn)
          : Number(config.amountIn) / Number(amountOut);

    return {
      amountOut,
      effectivePrice,
      feeBps,
    };
  }

  /**
   * Get current price from a pool by reserves
   */
  async getPrice(poolId: string): Promise<number> {
    return this.getPriceByPoolId(poolId);
  }

  /**
   * Get steady-state LP fee bps configured on a pool
   */
  async getTotalFeeBps(poolId: string): Promise<number> {
    try {
      const obj = await this.client.getObject({
        id: poolId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return 0;
      }

      return Number(extractFields<PoolFields>(obj)?.fee_bps || 0);
    } catch {
      return 0;
    }
  }

  /**
   * Get price by pool ID (from reserves)
   */
  async getPriceByPoolId(poolId: string): Promise<number> {
    try {
      const obj = await this.client.getObject({
        id: poolId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return 0;
      }

      const fields = extractFields<PoolFields>(obj);
      const assetReserve = BigInt(fields?.asset_reserve || 0);
      const stableReserve = BigInt(fields?.stable_reserve || 0);

      if (assetReserve === 0n) return 0;
      return Number(stableReserve) / Number(assetReserve);
    } catch {
      return 0;
    }
  }

  /**
   * Get pool reserves
   */
  async getReserves(poolId: string): Promise<{ asset: bigint; stable: bigint }> {
    try {
      const obj = await this.client.getObject({
        id: poolId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return { asset: 0n, stable: 0n };
      }

      const fields = extractFields<PoolFields>(obj);
      return {
        asset: BigInt(fields?.asset_reserve || 0),
        stable: BigInt(fields?.stable_reserve || 0),
      };
    } catch {
      return { asset: 0n, stable: 0n };
    }
  }

  /**
   * Get LP token supply for a pool
   */
  async getLpTokenSupply(poolId: string): Promise<bigint> {
    try {
      const obj = await this.client.getObject({
        id: poolId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return 0n;
      }

      return BigInt(extractFields<PoolFields>(obj)?.lp_supply || 0);
    } catch {
      return 0n;
    }
  }
}
