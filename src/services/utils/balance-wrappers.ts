/**
 * Balance Wrapper Utilities
 *
 * Utilities for working with ConditionalMarketBalance (balance wrapper) NFTs.
 * These hold "incomplete sets" from spot swaps during active proposals.
 */

import { SuiClient } from '@mysten/sui/client';
import { extractFields } from '../../types';

/**
 * Balance wrapper (ConditionalMarketBalance) object data
 *
 * Stores "incomplete set" balances from spot swaps during active proposals.
 * Dense vector format: [out0_asset, out0_stable, out1_asset, out1_stable, ...]
 */
export interface BalanceWrapperData {
  /** Object ID of the balance wrapper */
  objectId: string;
  /** Market ID this balance belongs to (matches proposal.market_state_id) */
  marketId: string;
  /** Number of outcomes in the market */
  outcomeCount: number;
  /** Version for future migrations */
  version: number;
  /** Per-outcome balances with formatted values */
  outcomes: BalanceWrapperOutcome[];
  /** Whether all balances are zero (can be destroyed) */
  isEmpty: boolean;
}

export interface BalanceWrapperOutcome {
  outcomeIndex: number;
  asset: { raw: bigint; formatted: string };
  stable: { raw: bigint; formatted: string };
}

/**
 * Build the ConditionalMarketBalance type string for querying balance wrappers
 *
 * @param primitivesPackageId - The futarchy_markets_primitives package ID
 * @param assetType - The DAO's asset coin type (e.g., "0x2::sui::SUI")
 * @param stableType - The DAO's stable coin type (e.g., "0x...::usdc::USDC")
 * @returns Full type string for ConditionalMarketBalance
 */
export function buildBalanceWrapperType(
  primitivesPackageId: string,
  assetType: string,
  stableType: string
): string {
  return `${primitivesPackageId}::conditional_balance::ConditionalMarketBalance<${assetType}, ${stableType}>`;
}

/**
 * Format a raw balance value to a string with decimals
 */
function formatBalance(raw: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error(`Invalid decimals: ${decimals}. Expected integer in [0, 18].`);
  }
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  if (decimals === 0) {
    return whole.toString();
  }
  const fraction = raw % divisor;
  const fractionStr = fraction
    .toString()
    .padStart(decimals, '0')
    .slice(0, 4);
  return `${whole}.${fractionStr}`;
}

/**
 * Get balance wrapper (ConditionalMarketBalance) NFTs owned by an address
 *
 * Balance wrappers hold "incomplete sets" from spot swaps during active proposals.
 * They store per-outcome balances in a dense vector format.
 *
 * @param client - SuiClient instance
 * @param address - Wallet address
 * @param balanceWrapperType - Full type string for ConditionalMarketBalance
 * @param marketStateId - Market state ID to filter by (only return wrappers for this market)
 * @param assetDecimals - Asset coin decimals for formatting
 * @param stableDecimals - Stable coin decimals for formatting
 * @returns Array of balance wrapper data
 */
export async function getBalanceWrappers(
  client: SuiClient,
  address: string,
  balanceWrapperType: string,
  marketStateId: string,
  assetDecimals: number,
  stableDecimals: number
): Promise<BalanceWrapperData[]> {
  // Query all pages of owned objects for the balance wrapper type.
  const ownedObjects: any[] = [];
  let cursor: string | null | undefined = undefined;
  for (;;) {
    const page = await client.getOwnedObjects({
      owner: address,
      filter: { StructType: balanceWrapperType },
      cursor,
      options: {
        showContent: true,
        showType: true,
      },
    });
    ownedObjects.push(...page.data);

    if (!page.hasNextPage || !page.nextCursor) {
      break;
    }
    cursor = page.nextCursor;
  }

  const results: BalanceWrapperData[] = [];

  for (const obj of ownedObjects) {
    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      continue;
    }

    const fields = extractFields(obj);
    if (!fields) continue;

    // Extract market_id and filter
    const objMarketId = (fields as Record<string, unknown>).market_id as string;
    if (objMarketId !== marketStateId) {
      continue;
    }

    const objectId = obj.data.objectId;
    const outcomeCount = Number((fields as Record<string, unknown>).outcome_count);
    const version = Number((fields as Record<string, unknown>).version);
    const balancesRaw = (fields as Record<string, unknown>).balances as string[];

    // Parse dense vector: [out0_asset, out0_stable, out1_asset, out1_stable, ...]
    const outcomes: BalanceWrapperOutcome[] = [];
    let isEmpty = true;

    for (let i = 0; i < outcomeCount; i++) {
      const assetIdx = i * 2;
      const stableIdx = i * 2 + 1;
      const assetRaw = BigInt(balancesRaw[assetIdx] || '0');
      const stableRaw = BigInt(balancesRaw[stableIdx] || '0');

      if (assetRaw > 0n || stableRaw > 0n) {
        isEmpty = false;
      }

      outcomes.push({
        outcomeIndex: i,
        asset: { raw: assetRaw, formatted: formatBalance(assetRaw, assetDecimals) },
        stable: { raw: stableRaw, formatted: formatBalance(stableRaw, stableDecimals) },
      });
    }

    results.push({
      objectId,
      marketId: objMarketId,
      outcomeCount,
      version,
      outcomes,
      isEmpty,
    });
  }

  return results;
}

/**
 * Owned coin object with balance information
 */
export interface OwnedCoinObject {
  objectId: string;
  balance: bigint;
}

/**
 * Get owned conditional coin objects for an address and coin type
 *
 * This returns the individual coin objects (not just total balance) so they
 * can be referenced in PTBs for merging and swapping.
 *
 * @param client - SuiClient instance
 * @param address - Wallet address
 * @param coinType - The conditional coin type to query
 * @returns Array of owned coin objects with their balances
 */
export async function getConditionalCoinObjects(
  client: SuiClient,
  address: string,
  coinType: string
): Promise<OwnedCoinObject[]> {
  const allCoins: OwnedCoinObject[] = [];
  let cursor: string | null | undefined = undefined;

  for (;;) {
    const page = await client.getCoins({
      owner: address,
      coinType,
      cursor,
    });

    allCoins.push(
      ...page.data.map((coin) => ({
        objectId: coin.coinObjectId,
        balance: BigInt(coin.balance),
      }))
    );

    if (!page.hasNextPage || !page.nextCursor) {
      break;
    }
    cursor = page.nextCursor;
  }

  return allCoins;
}

/**
 * Get total balance of conditional coins for an address
 *
 * @param client - SuiClient instance
 * @param address - Wallet address
 * @param coinType - The conditional coin type to query
 * @returns Total balance as bigint
 */
export async function getConditionalCoinBalance(
  client: SuiClient,
  address: string,
  coinType: string
): Promise<bigint> {
  const result = await client.getBalance({
    owner: address,
    coinType,
  });
  return BigInt(result.totalBalance);
}

/**
 * Calculate the total balance available for a specific outcome from balance wrappers
 *
 * @param wrappers - Array of balance wrapper data
 * @param outcomeIndex - The outcome index to sum
 * @param isAsset - Whether to sum asset (true) or stable (false) balances
 * @returns Total balance from all wrappers for the specified outcome
 */
export function sumBalanceWrapperAmount(
  wrappers: BalanceWrapperData[],
  outcomeIndex: number,
  isAsset: boolean
): bigint {
  let total = 0n;
  for (const wrapper of wrappers) {
    const outcome = wrapper.outcomes[outcomeIndex];
    if (outcome) {
      total += isAsset ? outcome.asset.raw : outcome.stable.raw;
    }
  }
  return total;
}
