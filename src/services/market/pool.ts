/**
 * Pool Service - Liquidity pool operations
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { extractFields, DAOFields, PoolFields } from '../../types';
import type { Packages, SharedObjects } from '../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export interface AddLiquidityConfig {
  poolId: string;
  assetType: string;
  stableType: string;
  lpType: string;
  /** Coin object ID to split asset amount from */
  assetCoinId: string;
  /** Coin object ID to split stable amount from */
  stableCoinId: string;
  assetAmount: bigint;
  stableAmount: bigint;
  minLpOut: bigint;
  clock?: string;
}

export interface RemoveLiquidityConfig {
  poolId: string;
  assetType: string;
  stableType: string;
  lpType: string;
  /** LP coin object ID to split from */
  lpCoinId: string;
  lpAmount: bigint;
  minAssetOut: bigint;
  minStableOut: bigint;
}

export class PoolService {
  private client: SuiClient;
  private packages: Packages;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
  }

  /**
   * Add liquidity to a pool
   */
  addLiquidity(config: AddLiquidityConfig): Transaction {
    const tx = new Transaction();

    // Split exact amounts from provided coin objects (Move expects Coin<T>, not u64)
    const [assetCoin] = tx.splitCoins(tx.object(config.assetCoinId), [tx.pure.u64(config.assetAmount)]);
    const [stableCoin] = tx.splitCoins(tx.object(config.stableCoinId), [tx.pure.u64(config.stableAmount)]);

    tx.moveCall({
      target: `${this.packages.futarchyMarketsCore}::unified_spot_pool::add_liquidity`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.poolId),
        assetCoin,
        stableCoin,
        tx.pure.u64(config.minLpOut),
        tx.object(config.clock || '0x6'),
      ],
    });

    return tx;
  }

  /**
   * Remove liquidity from a pool
   */
  removeLiquidity(config: RemoveLiquidityConfig): Transaction {
    const tx = new Transaction();

    // Split exact LP amount from provided coin object (Move expects Coin<LPType>, not u64)
    const [lpCoin] = tx.splitCoins(tx.object(config.lpCoinId), [tx.pure.u64(config.lpAmount)]);

    tx.moveCall({
      target: `${this.packages.futarchyMarketsCore}::unified_spot_pool::remove_liquidity`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.poolId),
        lpCoin,
        tx.pure.u64(config.minAssetOut),
        tx.pure.u64(config.minStableOut),
      ],
    });

    return tx;
  }

  /**
   * Get pool info by DAO ID
   */
  async get(daoId: string): Promise<{
    daoId: string;
    poolId: string;
    reserves: { asset: bigint; stable: bigint };
    feeBps: number;
    lpSupply: bigint;
  } | null> {
    try {
      const dao = await this.client.getObject({
        id: daoId,
        options: { showContent: true },
      });
      const daoFields = extractFields<DAOFields>(dao);
      const poolId = daoFields?.config?.fields?.spot_pool_id;
      if (!poolId) {
        return null;
      }

      const [reserves, feeBps, lpSupply] = await Promise.all([
        this.getReserves(poolId),
        this.getTotalFeeBps(poolId),
        this.getLpTokenSupply(poolId),
      ]);

      return {
        daoId,
        poolId,
        reserves,
        feeBps,
        lpSupply,
      };
    } catch {
      return null;
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
   * Get LP balance for an address
   */
  async getLpBalance(daoId: string, owner: string): Promise<bigint> {
    try {
      const daoPool = await this.get(daoId);
      if (!daoPool) {
        return 0n;
      }

      const pool = await this.client.getObject({
        id: daoPool.poolId,
        options: { showType: true },
      });
      const poolType = pool.data?.type;
      if (!poolType) {
        return 0n;
      }

      const lpType = extractThirdTypeArg(poolType);
      if (!lpType) {
        return 0n;
      }

      const coins = await this.client.getCoins({
        owner,
        coinType: lpType,
      });

      return coins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
    } catch {
      return 0n;
    }
  }

  /**
   * Get total fee bps
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
   * Get LP token supply
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

function extractThirdTypeArg(poolType: string): string | null {
  const start = poolType.indexOf('<');
  const end = poolType.lastIndexOf('>');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  const inner = poolType.slice(start + 1, end);
  const args: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of inner) {
    if (ch === '<') depth += 1;
    if (ch === '>') depth -= 1;
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) {
    args.push(current.trim());
  }

  return args[2] || null;
}
