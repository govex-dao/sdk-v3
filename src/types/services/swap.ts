/**
 * Swap Types
 *
 * Types for swap operations and quotes.
 *
 * @module types/services/swap
 */

/**
 * Direction of a swap
 */
export type SwapDirection = 'asset_to_stable' | 'stable_to_asset';

/**
 * Swap quote with expected output
 */
export interface SwapQuote {
  /** Input amount */
  amountIn: bigint;
  /** Expected output amount */
  amountOut: bigint;
  /** Minimum output (after slippage) */
  minAmountOut: bigint;
  /** Price impact percentage (0-100) */
  priceImpact: number;
  /** Fee amount */
  fee: bigint;
  /** Fee in basis points */
  feeBps: number;
  /** Swap direction */
  direction: SwapDirection;
}

/**
 * Pool reserves and state
 */
export interface PoolState {
  /** Asset reserve amount */
  assetReserve: bigint;
  /** Stable reserve amount */
  stableReserve: bigint;
  /** Total LP supply */
  lpSupply: bigint;
  /** Fee in basis points */
  feeBps: number;
  /**
   * Current spot price (stable per asset, scaled by 1e12).
   *
   * Uses 1e12 scaling (price_precision_scale from constants.move), matching
   * on-chain TWAP and AMM oracle prices.
   */
  price: bigint;
}

/**
 * Liquidity position
 */
export interface LiquidityPosition {
  /** LP token amount */
  lpAmount: bigint;
  /** Share of pool (0-1, scaled by 1e9) */
  poolShare: bigint;
  /** Underlying asset value */
  assetValue: bigint;
  /** Underlying stable value */
  stableValue: bigint;
}

/**
 * Add liquidity parameters
 */
export interface AddLiquidityParams {
  /** Asset amount to add */
  assetAmount: bigint;
  /** Stable amount to add */
  stableAmount: bigint;
  /** Minimum LP tokens to receive */
  minLpOut?: bigint;
  /** Slippage tolerance in basis points */
  slippageBps?: number;
}

/**
 * Remove liquidity parameters
 */
export interface RemoveLiquidityParams {
  /** LP tokens to burn */
  lpAmount: bigint;
  /** Minimum asset to receive */
  minAssetOut?: bigint;
  /** Minimum stable to receive */
  minStableOut?: bigint;
  /** Slippage tolerance in basis points */
  slippageBps?: number;
}

/**
 * Swap parameters
 */
export interface SwapParams {
  /** Amount to swap */
  amountIn: bigint;
  /** Minimum output amount */
  minAmountOut: bigint;
  /** Swap direction */
  direction: SwapDirection;
  /** Deadline timestamp (optional) */
  deadline?: number;
}
