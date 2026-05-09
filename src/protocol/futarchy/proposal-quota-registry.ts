/**
 * Proposal Quota Registry Module
 *
 * Manages two independent quota types for allowlisted addresses:
 * 1. Feeless proposal quota - N free proposals per period (no proposal creation fee)
 * 2. Sponsor quota - M TWAP sponsorships per period (can sponsor any proposal before trading)
 *
 * FEATURES:
 * - Two independent quota types sharing a single period duration
 * - Period alignment (no drift)
 * - Batch operations for multiple users
 * - Sponsor quota can be used on ANY proposal (not just your own)
 *
 * @module proposal-quota-registry
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Proposal Quota Registry Static Functions
 *
 * Manages feeless proposal quotas and sponsorship quotas for DAOs.
 */
export class ProposalQuotaRegistry {
  /**
   * Create a new quota registry
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns ProposalQuotaRegistry object
   *
   * @example
   * ```typescript
   * const registry = ProposalQuotaRegistry.new(tx, {
   *   futarchyCorePackageId,
   * });
   * ```
   */
  static new(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'new'
      ),
      arguments: [],
    });
  }

  /**
   * Set quotas for multiple users (batch operation)
   *
   * Both feeless_proposal_amount and sponsor_amount can be set independently.
   * Pass both amounts as 0 to remove quotas entirely.
   *
   * @param tx - Transaction
   * @param config - Configuration
   *
   * @example
   * ```typescript
   * // Set VIP tier with both quotas
   * ProposalQuotaRegistry.setQuotas(tx, {
   *   futarchyCorePackageId,
   *   registry,
   *   daoId,
   *   users: ['0xUSER1', '0xUSER2'],
   *   periodMs: 2_592_000_000n, // 30 days
   *   feelessProposalAmount: 10n, // 10 free proposals per period
   *   sponsorAmount: 5n, // 5 sponsorships per period
   *   clock: '0x6',
   * });
   *
   * // Set feeless only (no sponsor quota)
   * ProposalQuotaRegistry.setQuotas(tx, {
   *   futarchyCorePackageId,
   *   registry,
   *   daoId,
   *   users: ['0xUSER'],
   *   periodMs: 2_592_000_000n,
   *   feelessProposalAmount: 5n,
   *   sponsorAmount: 0n, // no sponsor quota
   *   clock: '0x6',
   * });
   *
   * // Remove quotas entirely
   * ProposalQuotaRegistry.setQuotas(tx, {
   *   futarchyCorePackageId,
   *   registry,
   *   daoId,
   *   users: ['0xUSER'],
   *   periodMs: 0n, // ignored for removal
   *   feelessProposalAmount: 0n,
   *   sponsorAmount: 0n,
   *   clock: '0x6',
   * });
   * ```
   */
  static setQuotas(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      registry: ReturnType<Transaction['moveCall']>;
      daoId: string;
      users: string[];
      periodMs: bigint;
      feelessProposalAmount: bigint;
      sponsorAmount: bigint;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'set_quotas'
      ),
      arguments: [
        config.registry,
        tx.pure.id(config.daoId),
        tx.pure.vector('address', config.users),
        tx.pure.u64(config.periodMs),
        tx.pure.u64(config.feelessProposalAmount),
        tx.pure.u64(config.sponsorAmount),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // === Feeless Proposal Quota Functions ===

  /**
   * Check feeless proposal quota availability (read-only, no state mutation)
   *
   * Returns true if user has remaining feeless proposal quota.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Boolean indicating if user has available feeless quota
   *
   * @example
   * ```typescript
   * const hasFeelessQuota = ProposalQuotaRegistry.checkFeelessQuotaAvailable(tx, {
   *   futarchyCorePackageId,
   *   registry,
   *   user: '0xUSER',
   *   clock: '0x6',
   * });
   * ```
   */
  static checkFeelessQuotaAvailable(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      registry: ReturnType<Transaction['moveCall']>;
      user: string;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'check_feeless_quota_available'
      ),
      arguments: [
        config.registry,
        tx.pure.address(config.user),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Use one feeless proposal quota slot (called AFTER proposal succeeds)
   *
   * This prevents quota loss if proposal creation fails.
   *
   * @param tx - Transaction
   * @param config - Configuration
   *
   * @example
   * ```typescript
   * ProposalQuotaRegistry.useFeelessQuota(tx, {
   *   futarchyCorePackageId,
   *   registry,
   *   daoId,
   *   user: '0xUSER',
   *   clock: '0x6',
   * });
   * ```
   */
  static useFeelessQuota(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      registry: ReturnType<Transaction['moveCall']>;
      daoId: string;
      user: string;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'use_feeless_quota'
      ),
      arguments: [
        config.registry,
        tx.pure.id(config.daoId),
        tx.pure.address(config.user),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Get feeless quota status for a user
   *
   * Returns (has_feeless_quota, remaining_feeless).
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Tuple of (bool, u64) for quota availability and remaining count
   *
   * @example
   * ```typescript
   * const [hasFeelessQuota, remaining] = ProposalQuotaRegistry.getFeelessQuotaStatus(tx, {
   *   futarchyCorePackageId,
   *   registry,
   *   user: '0xUSER',
   *   clock: '0x6',
   * });
   * ```
   */
  static getFeelessQuotaStatus(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      registry: ReturnType<Transaction['moveCall']>;
      user: string;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'get_feeless_quota_status'
      ),
      arguments: [
        config.registry,
        tx.pure.address(config.user),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // === Sponsor Quota Functions ===

  /**
   * Check sponsorship quota availability (read-only, no state mutation)
   *
   * Returns (has_quota, remaining).
   * Sponsor quota can be used on ANY proposal before trading starts.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Tuple of (bool, u64) for quota availability and remaining count
   *
   * @example
   * ```typescript
   * const [hasQuota, remaining] = ProposalQuotaRegistry.checkSponsorQuotaAvailable(tx, {
   *   futarchyCorePackageId,
   *   registry,
   *   sponsor: '0xSPONSOR',
   *   clock: '0x6',
   * });
   * ```
   */
  static checkSponsorQuotaAvailable(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      registry: ReturnType<Transaction['moveCall']>;
      sponsor: string;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'check_sponsor_quota_available'
      ),
      arguments: [
        config.registry,
        tx.pure.address(config.sponsor),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Use one sponsorship quota slot (called AFTER sponsorship succeeds)
   *
   * Can sponsor ANY proposal before trading starts (not just your own).
   *
   * @param tx - Transaction
   * @param config - Configuration
   *
   * @example
   * ```typescript
   * ProposalQuotaRegistry.useSponsorQuota(tx, {
   *   futarchyCorePackageId,
   *   registry,
   *   daoId,
   *   sponsor: '0xSPONSOR',
   *   proposalId,
   *   clock: '0x6',
   * });
   * ```
   */
  static useSponsorQuota(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      registry: ReturnType<Transaction['moveCall']>;
      daoId: string;
      sponsor: string;
      proposalId: string;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'use_sponsor_quota'
      ),
      arguments: [
        config.registry,
        tx.pure.id(config.daoId),
        tx.pure.address(config.sponsor),
        tx.pure.id(config.proposalId),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // === View Functions ===

  /**
   * Check if user has any quota entry (feeless or sponsor)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Boolean indicating if user has any quota entry
   */
  static hasQuota(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      registry: ReturnType<Transaction['moveCall']>;
      user: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'has_quota'
      ),
      arguments: [
        config.registry,
        tx.pure.address(config.user),
      ],
    });
  }

  // === QuotaInfo Getters ===

  /**
   * Get period duration in milliseconds (shared by both quota types)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Period duration in milliseconds (u64)
   */
  static periodMs(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      quotaInfo: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'period_ms'
      ),
      arguments: [config.quotaInfo],
    });
  }

  /**
   * Get feeless proposal amount (N free proposals per period)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Feeless proposal amount (u64)
   */
  static feelessProposalAmount(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      quotaInfo: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'feeless_proposal_amount'
      ),
      arguments: [config.quotaInfo],
    });
  }

  /**
   * Get feeless proposals used in current period
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Feeless proposals used (u64)
   */
  static feelessProposalUsed(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      quotaInfo: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'feeless_proposal_used'
      ),
      arguments: [config.quotaInfo],
    });
  }

  /**
   * Get feeless proposal period start timestamp
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Feeless proposal period start timestamp in milliseconds (u64)
   */
  static feelessProposalPeriodStartMs(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      quotaInfo: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'feeless_proposal_period_start_ms'
      ),
      arguments: [config.quotaInfo],
    });
  }

  /**
   * Get sponsor amount (M TWAP sponsorships per period)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Sponsor amount (u64)
   */
  static sponsorAmount(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      quotaInfo: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'sponsor_amount'
      ),
      arguments: [config.quotaInfo],
    });
  }

  /**
   * Get sponsorships used in current period
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Sponsorships used (u64)
   */
  static sponsorUsed(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      quotaInfo: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'sponsor_used'
      ),
      arguments: [config.quotaInfo],
    });
  }

  /**
   * Get sponsor period start timestamp
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Sponsor period start timestamp in milliseconds (u64)
   */
  static sponsorPeriodStartMs(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      quotaInfo: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'proposal_quota_registry',
        'sponsor_period_start_ms'
      ),
      arguments: [config.quotaInfo],
    });
  }
}
