/**
 * Protective Bid Operations
 *
 * SDK module for interacting with the protective bid system.
 * Allows token holders to sell back to the DAO at discounted LIVE NAV.
 *
 * NAV is calculated at sell time from:
 * - DAO AMM principal (bid override, or pool initial reserves)
 * - Treasury stable balance (across all vaults)
 * - Reserved bid capacity held against a DAO vault
 *
 * NAV = (dao_amm_stable + treasury_stable) / circulating
 * Where: circulating = total_supply - dao_vault_tokens - dao_amm_tokens
 *
 * Release options:
 * - close(): Permissionless after the configured release deadline
 * - cancel(): Via governance proposal (DAO can cancel anytime)
 *
 * @module protocol/futarchy/protective-bid
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

export interface ProtectiveBidConfig {
  /** Package ID where protective_bid module lives (futarchy_markets_core) */
  marketsPackageId: string;
}

/**
 * Protective Bid Static Functions
 *
 * Sell tokens back to the DAO at discounted LIVE NAV-based price floor.
 *
 * @example Sell tokens to bid (discounted LIVE NAV)
 * ```typescript
 * const stableOut = ProtectiveBid.sellToBid(tx, {
 *   marketsPackageId,
 *   bidId: '0x...',
 *   configType: '0x...::config::Config',
 *   raiseTokenType: '0x...::token::TOKEN',
 *   stableCoinType: '0x2::sui::SUI',
 *   lpType: '0x...::lp::LP',
 *   accountId: '0x...',
 *   registryId: '0x...',
 *   poolId: '0x...',
 *   tokens: tokenCoin,
 *   clockId: '0x6',
 * });
 * // Transfer stableOut to recipient
 * ```
 */
export class ProtectiveBid {
  // ============================================================================
  // Creation Functions
  // ============================================================================

  /**
   * Create a vault-backed protective bid using pool initial reserves for NAV.
   */
  static create(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      raiseTokenType: string;
      stableCoinType: string;
      accountId: string;
      poolId: string;
      baseFeeBps: bigint;
      surgeFeeBps: bigint;
      surgeDurationMs: bigint;
      releaseDurationMs?: bigint;
      vaultAdminCap: ReturnType<Transaction['moveCall']> | ReturnType<Transaction['object']>;
      reservedAmount: bigint;
      navDiscountBps?: bigint;
      clockId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'create'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [
        tx.pure.id(config.accountId),
        tx.pure.id(config.poolId),
        tx.pure.u64(config.baseFeeBps),
        tx.pure.u64(config.surgeFeeBps),
        tx.pure.u64(config.surgeDurationMs),
        tx.pure.u64(config.releaseDurationMs ?? 0n),
        config.vaultAdminCap,
        tx.pure.u64(config.reservedAmount),
        tx.pure.u64(config.navDiscountBps ?? 0n),
        tx.object(config.clockId),
      ],
    });
  }

  /**
   * Create a vault-backed protective bid with explicit AMM principal override.
   */
  static createWithPrincipal(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      raiseTokenType: string;
      stableCoinType: string;
      accountId: string;
      poolId: string;
      baseFeeBps: bigint;
      surgeFeeBps: bigint;
      surgeDurationMs: bigint;
      releaseDurationMs?: bigint;
      daoAmmAssetPrincipal: bigint;
      daoAmmStablePrincipal: bigint;
      vaultAdminCap: ReturnType<Transaction['moveCall']> | ReturnType<Transaction['object']>;
      reservedAmount: bigint;
      navDiscountBps?: bigint;
      clockId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'create_with_principal'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [
        tx.pure.id(config.accountId),
        tx.pure.id(config.poolId),
        tx.pure.u64(config.baseFeeBps),
        tx.pure.u64(config.surgeFeeBps),
        tx.pure.u64(config.surgeDurationMs),
        tx.pure.u64(config.releaseDurationMs ?? 0n),
        tx.pure.u64(config.daoAmmAssetPrincipal),
        tx.pure.u64(config.daoAmmStablePrincipal),
        config.vaultAdminCap,
        tx.pure.u64(config.reservedAmount),
        tx.pure.u64(config.navDiscountBps ?? 0n),
        tx.object(config.clockId),
      ],
    });
  }

  // ============================================================================
  // Sell Operations
  // ============================================================================

  /**
   * Sell tokens to the protective bid at discounted LIVE NAV price
   *
   * LIVE NAV = (dao_amm_stable + treasury_stable) / circulating
   *
   * Requires:
   * - Pool for validation + principal (initial reserves or override)
   * - Account to burn tokens and read treasury balances
   * - Proposals must NOT be active (pump-and-dump protection)
   *
   * @param tx - Transaction
   * @param config - Sell configuration
   * @returns Stable coin received
   *
   * @example
   * ```typescript
   * const stableOut = ProtectiveBid.sellToBid(tx, {
   *   marketsPackageId,
   *   bidId: '0x...',
   *   configType: '0x...::config::Config',
   *   raiseTokenType: '0x...::token::TOKEN',
   *   stableCoinType: '0x2::sui::SUI',
   *   lpType: '0x...::lp::LP',
   *   accountId: '0x...',
   *   registryId: '0x...',
   *   poolId: '0x...',
   *   tokens: tokenCoin,
   *   clockId: '0x6',
   * });
   * tx.transferObjects([stableOut], tx.pure.address(recipient));
   * ```
   */
  static sellToBid(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      configType: string;
      raiseTokenType: string;
      stableCoinType: string;
      lpType: string;
      accountId: string;
      registryId: string;
      poolId: string;
      tokens: ReturnType<Transaction['object']>;
      clockId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'sell_to_bid'
      ),
      typeArguments: [
        config.configType,
        config.raiseTokenType,
        config.stableCoinType,
        config.lpType,
      ],
      arguments: [
        tx.object(config.bidId),
        tx.object(config.accountId),
        tx.object(config.registryId),
        tx.object(config.poolId),
        config.tokens,
        tx.object(config.clockId),
      ],
    });
  }

  // ============================================================================
  // Permissionless Operations
  // ============================================================================

  /**
   * Close the bid wall permissionlessly after its release deadline.
   *
   * This deactivates the bid, destroys its VaultAdminCap, and leaves funds in
   * the underlying DAO vault.
   *
   * @param tx - Transaction
   * @param config - Close configuration
   */
  static close(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
      accountId: string;
      registryId: string;
      clockId: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'close'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [
        tx.object(config.bidId),
        tx.object(config.accountId),
        tx.object(config.registryId),
        tx.object(config.clockId),
      ],
    });
  }

  // ============================================================================
  // View Functions (Require Pool for LIVE NAV)
  // ============================================================================

  /**
   * Calculate NAV (requires pool for initial-reserve principal or override validation)
   *
   * NAV = (dao_amm_stable + treasury_stable) / circulating
   *
   * @param tx - Transaction
   * @param config - NAV calculation configuration
   * @returns NAV scaled by 1e12
   */
  static calculateNav(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      configType: string;
      raiseTokenType: string;
      stableCoinType: string;
      lpType: string;
      accountId: string;
      registryId: string;
      poolId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'calculate_nav'
      ),
      typeArguments: [
        config.configType,
        config.raiseTokenType,
        config.stableCoinType,
        config.lpType,
      ],
      arguments: [
        tx.object(config.bidId),
        tx.object(config.accountId),
        tx.object(config.registryId),
        tx.object(config.poolId),
      ],
    });
  }

  /**
   * Get quote for selling tokens (LIVE NAV)
   *
   * @param tx - Transaction
   * @param config - Quote configuration
   * @returns Quoted stable amount after fees
   */
  static quoteSell(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      configType: string;
      raiseTokenType: string;
      stableCoinType: string;
      lpType: string;
      accountId: string;
      registryId: string;
      poolId: string;
      tokenAmount: bigint;
      clockId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'quote_sell'
      ),
      typeArguments: [
        config.configType,
        config.raiseTokenType,
        config.stableCoinType,
        config.lpType,
      ],
      arguments: [
        tx.object(config.bidId),
        tx.object(config.accountId),
        tx.object(config.registryId),
        tx.object(config.poolId),
        tx.pure.u64(config.tokenAmount),
        tx.object(config.clockId),
      ],
    });
  }

  // ============================================================================
  // View Functions (No Pool Required)
  // ============================================================================

  /**
   * Get remaining reserved spending capacity.
   */
  static reservedAmount(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'reserved_amount'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get the configured NAV discount in basis points.
   */
  static navDiscountBps(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'nav_discount_bps'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get pool ID (for validation)
   */
  static poolId(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'pool_id'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get base bought amount (tokens bought back / burned)
   */
  static baseBoughtAmount(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'base_bought_amount'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Check if bid is still active
   */
  static isActive(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'is_active'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get base fee in basis points (final fee after surge)
   */
  static baseFeeBps(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'base_fee_bps'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get surge fee in basis points (starting elevated fee, 0 = no surge)
   */
  static surgeFeeBps(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'surge_fee_bps'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get surge end timestamp (0 = no surge)
   */
  static surgeEndMs(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'surge_end_ms'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get creation timestamp
   */
  static createdAtMs(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'created_at_ms'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get current fee in basis points (accounting for surge decay)
   */
  static currentFeeBps(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
      clockId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'current_fee_bps'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId), tx.object(config.clockId)],
    });
  }

  /**
   * Get fees collected
   */
  static feesCollected(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'fees_collected'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get sequence number
   */
  static seqNum(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'seq_num'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get release deadline timestamp
   */
  static releaseDeadlineMs(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'release_deadline_ms'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get account ID
   */
  static accountId(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      bidId: string;
      raiseTokenType: string;
      stableCoinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'account_id'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [tx.object(config.bidId)],
    });
  }

  /**
   * Get the precision constant (1e12)
   */
  static precision(
    tx: Transaction,
    config: {
      marketsPackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_bid',
        'precision'
      ),
      typeArguments: [],
      arguments: [],
    });
  }
}
