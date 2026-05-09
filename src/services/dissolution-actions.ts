/**
 * Dissolution Actions Operations
 *
 * DAO dissolution and redemption pool operations.
 * Allows token holders to redeem their tokens for a pro-rata share of pool assets.
 *
 * ## Dissolution Proposal Checklist
 *
 * A dissolution proposal must compose the following actions in order.
 * All actions execute within a single proposal — coins flow through
 * `executable_resources` (a temporary holding area), then into the RedemptionPool.
 *
 * ### 1. Cancel all protective bid and ask walls
 *
 * Cancel any active walls so their reserved funds are released back to the vault.
 *
 * - **Find active bids:** `ProtectiveBidRegistry.bidIds(tx, { marketsCorePackageId, accountId, registryId })`
 *   See: `src/protocol/futarchy/protective-bid-registry.ts`
 * - **Cancel each bid:** use `CancelProtectiveBid<RaiseToken, StableCoin>` action
 *   See: `src/protocol/futarchy/protective-bid.ts`
 * - **Find active asks:** `ProtectiveAskRegistry.askIds(tx, { marketsCorePackageId, accountId, registryId })`
 *   See: `src/protocol/futarchy/protective-ask-registry.ts`
 * - **Cancel each ask:** use `CancelProtectiveAsk<RaiseToken, StableCoin>` action
 *   See: `src/protocol/futarchy/protective-ask.ts`
 *
 * ### 2. Unwind AMM LP positions
 *
 * - **VaultSpend** LP tokens from treasury → executable_resources
 * - **RemoveLiquidityToResources** with `forDissolution: true` — burns LP, outputs
 *   asset + stable coins into executable_resources (bypasses minimum liquidity).
 *   See: `src/workflows/types/actions/futarchy.ts` (RemoveLiquidityToResourcesActionConfig)
 *
 * ### 3. Burn DAO-held asset tokens
 *
 * - **CurrencyBurn** any asset coins in executable_resources (from LP unwind).
 *   This reduces total supply so pro-rata redemption math is correct.
 *
 * ### 4. VaultSpend stable from every vault → executable_resources
 *
 * - Default vault: `"treasury"`
 * - Launchpad DAOs also have: `"amm_liquidity"`, `"bid_wall_funds"`
 * - Each VaultSpend outputs stable coins into executable_resources under a named key.
 *   See: `src/workflows/types/actions/account.ts` (SpendActionConfig)
 *
 * ### 5. Terminate the DAO
 *
 * - **TerminateDAO** sets state to TERMINATED and configures dissolution_unlock_delay_ms.
 *   See: `src/workflows/types/actions/futarchy.ts` (TerminateDaoActionConfig)
 *
 * ### 6. Create dissolution capability + redemption pool
 *
 * - **CreateDissolutionCapabilityUnshared** — creates owned capability
 * - **CreateRedemptionPool** — merges all stable from executable_resources into one pool
 * - **ShareDissolutionCapability** — shares the capability last
 *
 * ### 7. Token holders claim (permissionless, after unlock)
 *
 * - `DissolutionActions.claim()` — burns asset tokens, returns pro-rata stable
 *
 * @module dissolution-actions
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from './transaction';

/**
 * Dissolution Actions Static Functions
 *
 * Manage DAO dissolution and redemption pools.
 *
 * @example Claim from redemption pool
 * ```typescript
 * const redeemCoins = DissolutionActions.claim(tx, {
 *   futarchyActionsPackageId,
 *   assetType,
 *   redeemCoinType,
 *   poolId,
 *   accountId,
 *   packageRegistryId,
 *   assetCoins,
 *   clock: '0x6',
 * });
 * ```
 */
export class DissolutionActions {
  // ============================================================================
  // Dissolution Capability Queries
  // ============================================================================

  /**
   * Get dissolution capability info
   *
   * @returns Tuple of (dao_address, created_at_ms, unlock_at_ms, total_asset_supply)
   */
  static capabilityInfo(
    tx: Transaction,
    config: {
      futarchyActionsPackageId: string;
      capabilityId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyActionsPackageId,
        'dissolution_actions',
        'capability_info'
      ),
      arguments: [tx.object(config.capabilityId)],
    });
  }

  /**
   * Check if dissolution capability is unlocked
   *
   * @returns True if capability is unlocked and ready for redemption
   */
  static isUnlocked(
    tx: Transaction,
    config: {
      futarchyActionsPackageId: string;
      capabilityId: string;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyActionsPackageId,
        'dissolution_actions',
        'is_unlocked'
      ),
      arguments: [tx.object(config.capabilityId), tx.object(config.clock || '0x6')],
    });
  }

  // ============================================================================
  // Redemption Pool
  // ============================================================================

  /**
   * Get redemption pool info
   *
   * @returns Tuple of (dao_address, capability_id, total_asset_supply, remaining_asset_supply, balance)
   */
  static poolInfo(
    tx: Transaction,
    config: {
      futarchyActionsPackageId: string;
      redeemCoinType: string;
      poolId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyActionsPackageId,
        'dissolution_actions',
        'pool_info'
      ),
      typeArguments: [config.redeemCoinType],
      arguments: [tx.object(config.poolId)],
    });
  }

  /**
   * Check if redemption pool is unlocked
   *
   * @returns True if pool is unlocked and accepting claims
   */
  static poolIsUnlocked(
    tx: Transaction,
    config: {
      futarchyActionsPackageId: string;
      redeemCoinType: string;
      poolId: string;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyActionsPackageId,
        'dissolution_actions',
        'pool_is_unlocked'
      ),
      typeArguments: [config.redeemCoinType],
      arguments: [tx.object(config.poolId), tx.object(config.clock || '0x6')],
    });
  }

  /**
   * Get redemption pool balance
   *
   * @returns Pool balance (u64)
   */
  static poolBalance(
    tx: Transaction,
    config: {
      futarchyActionsPackageId: string;
      redeemCoinType: string;
      poolId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyActionsPackageId,
        'dissolution_actions',
        'pool_balance'
      ),
      typeArguments: [config.redeemCoinType],
      arguments: [tx.object(config.poolId)],
    });
  }

  // ============================================================================
  // Claim (Redemption)
  // ============================================================================

  /**
   * Claim pro-rata share from redemption pool
   *
   * Burns asset tokens and returns proportional coins from pool.
   * PERMISSIONLESS: Anyone holding asset tokens can claim after unlock.
   *
   * @param tx - Transaction
   * @param config - Claim configuration
   * @returns Redeemed coins
   */
  static claim(
    tx: Transaction,
    config: {
      futarchyActionsPackageId: string;
      assetType: string;
      redeemCoinType: string;
      poolId: string;
      accountId: string;
      packageRegistryId: string;
      assetCoins: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyActionsPackageId,
        'dissolution_actions',
        'claim'
      ),
      typeArguments: [config.assetType, config.redeemCoinType],
      arguments: [
        tx.object(config.poolId),
        tx.object(config.accountId),
        tx.object(config.packageRegistryId),
        config.assetCoins,
        tx.object(config.clock || '0x6'),
      ],
    });
  }
}
