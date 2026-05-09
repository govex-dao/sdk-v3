/**
 * Futarchy Configuration Module
 *
 * Pure configuration struct for Futarchy governance systems.
 * This is the configuration object used with Account.
 * All dynamic state and object references are stored as dynamic fields on the Account.
 *
 * FEATURES:
 * - Pure configuration struct (no object references)
 * - DAO state management (operational state, proposals)
 * - Launchpad integration (immutable initial price)
 * - FutarchyOutcome tracking (intent execution metadata)
 *
 * @module futarchy-config
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Futarchy Configuration Static Functions
 *
 * Manages Futarchy DAO configuration including DAO state,
 * verification, and outcome tracking.
 */
export class FutarchyConfig {
  // ========================================
  // Constants
  // ========================================

  /**
   * Get the TWAP scale factor (1e12)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns TWAP scale (u128)
   *
   * @example
   * ```typescript
   * const scale = FutarchyConfig.twapScale(tx, {
   *   futarchyCorePackageId,
   * });
   * ```
   */
  static twapScale(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'twap_scale'
      ),
      arguments: [],
    });
  }

  /**
   * Get the protocol maximum sponsored-threshold magnitude.
   *
   * Thresholds are always non-negative magnitudes.
   * Max value: 10_000 (10% in base 100,000 scale).
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Protocol max threshold (u128)
   */
  static protocolMaxThreshold(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'protocol_max_threshold'
      ),
      arguments: [],
    });
  }

  /**
   * Get ACTIVE state constant (0)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Active state constant (u8)
   */
  static stateActive(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'state_active'
      ),
      arguments: [],
    });
  }

  /**
   * Get TERMINATED state constant (1)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Terminated state constant (u8)
   */
  static stateTerminated(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'state_terminated'
      ),
      arguments: [],
    });
  }

  // ========================================
  // Constructor Functions
  // ========================================

  /**
   * Creates a new pure FutarchyConfig
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns FutarchyConfig object
   *
   * @example
   * ```typescript
   * const futarchyConfig = FutarchyConfig.new(tx, {
   *   futarchyCorePackageId,
   *   assetType: '0x2::sui::SUI',
   *   stableType: '0x123::usdc::USDC',
   *   daoConfig,
   *   launchpadInitialPrice: null, // optional
   * });
   * ```
   */
  static new(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      assetType: string;
      stableType: string;
      daoConfig: ReturnType<Transaction['moveCall']>;
      launchpadInitialPrice?: bigint | null;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'new'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        config.daoConfig,
        tx.pure.option('u128', config.launchpadInitialPrice ?? null),
      ],
    });
  }

  /**
   * Creates a new DaoState for dynamic storage
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns DaoState object
   */
  static newDaoState(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'new_dao_state'
      ),
      arguments: [],
    });
  }

  /**
   * Create a DaoStateKey (for use in modules that can't directly instantiate it)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns DaoStateKey object
   */
  static newDaoStateKey(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'new_dao_state_key'
      ),
      arguments: [],
    });
  }

  // ========================================
  // Getters for FutarchyConfig
  // ========================================

  /**
   * Get asset type
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Asset type (String)
   */
  static assetType(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'asset_type'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  /**
   * Get stable type
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Stable type (String)
   */
  static stableType(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'stable_type'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  /**
   * Get DAO config
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns DaoConfig reference
   */
  static daoConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'dao_config'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  // ========================================
  // Getters for DaoState
  // ========================================

  /**
   * Get operational state
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Operational state (u8)
   */
  static operationalState(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoState: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'operational_state'
      ),
      arguments: [config.daoState],
    });
  }

  /**
   * Check if DAO is operational (can create/accept proposals)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Boolean indicating if DAO is operational
   */
  static isOperational(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoState: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'is_operational'
      ),
      arguments: [config.daoState],
    });
  }

  /**
   * Check if DAO is terminated (no new proposals allowed)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Boolean indicating if DAO is terminated
   */
  static isTerminated(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoState: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'is_terminated'
      ),
      arguments: [config.daoState],
    });
  }

  /**
   * Assert DAO is not terminated (use before operations that require active state)
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static assertNotTerminated(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoState: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'assert_not_terminated'
      ),
      arguments: [config.daoState],
    });
  }

  /**
   * Get dissolution unlock time (terminated_at + delay)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Dissolution unlock time (Option<u64>)
   */
  static dissolutionUnlockTime(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoState: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'dissolution_unlock_time'
      ),
      arguments: [config.daoState],
    });
  }

  /**
   * Get termination timestamp
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Terminated at timestamp (Option<u64>)
   */
  static terminatedAt(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoState: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'terminated_at'
      ),
      arguments: [config.daoState],
    });
  }

  /**
   * Get total asset supply captured at DAO termination.
   */
  static dissolutionTotalAssetSupply(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoState: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'dissolution_total_asset_supply'
      ),
      arguments: [config.daoState],
    });
  }

  /**
   * Check if dissolution capability has been created
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Boolean indicating if dissolution capability was created
   */
  static dissolutionCapabilityCreated(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoState: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'dissolution_capability_created'
      ),
      arguments: [config.daoState],
    });
  }

  /**
   * Check if the DAO redemption pool has been created.
   */
  static redemptionPoolCreated(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoState: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'redemption_pool_created'
      ),
      arguments: [config.daoState],
    });
  }

  // DaoState and FutarchyConfig mutations are governance-only and now flow
  // through action staging / execution helpers, not direct public mutators.

  // ========================================
  // Delegated Getters from dao_config
  // ========================================

  /**
   * Get review period in milliseconds (delegated from dao_config)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Review period in milliseconds (u64)
   */
  static reviewPeriodMs(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'review_period_ms'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  /**
   * Get trading period in milliseconds (delegated from dao_config)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Trading period in milliseconds (u64)
   */
  static tradingPeriodMs(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'trading_period_ms'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  /**
   * Get minimum asset amount (delegated from dao_config)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Minimum asset amount (u64)
   */
  static minAssetAmount(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'min_asset_amount'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  /**
   * Get minimum stable amount (delegated from dao_config)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Minimum stable amount (u64)
   */
  static minStableAmount(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'min_stable_amount'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  /**
   * Get AMM TWAP start delay (delegated from dao_config)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns TWAP start delay in milliseconds (u64)
   */
  static ammTwapStartDelay(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'amm_twap_start_delay'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  /**
   * Get AMM TWAP initial observation (delegated from dao_config)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Initial observation (Option<u128>): None = derive from AMM reserves, Some = explicit value
   */
  static ammTwapInitialObservation(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'amm_twap_initial_observation'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  /**
   * Get AMM TWAP cap in PPM (delegated from dao_config)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Cap in parts-per-million (u64)
   */
  static ammTwapCapPpm(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'amm_twap_cap_ppm'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  /**
   * Get TWAP threshold (delegated from dao_config)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns TWAP threshold (u128)
   */
  static twapThreshold(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'twap_threshold'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  /**
   * Get sponsored threshold (how much lower sponsored outcomes can be)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Sponsored threshold (u128, base 100,000 - e.g., 10000 = 10%)
   */
  static sponsoredThreshold(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'sponsored_threshold'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  /**
   * Get conditional AMM fee in basis points (delegated from dao_config)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Conditional AMM fee in basis points (u64)
   */
  static conditionalAmmFeeBps(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'conditional_amm_fee_bps'
      ),
      arguments: [config.futarchyConfig],
    });
  }


  /**
   * Get max outcomes (delegated from dao_config)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Max outcomes (u64)
   */
  static maxOutcomes(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'max_outcomes'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  /**
   * Get max actions per outcome (delegated from dao_config)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Max actions per outcome (u64)
   */
  static maxActionsPerOutcome(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'max_actions_per_outcome'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  /**
   * Get conditional liquidity ratio percent (delegated from dao_config)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Conditional liquidity ratio percent (u64)
   */
  static conditionalLiquidityRatioPercent(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'conditional_liquidity_ratio_percent'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  // ========================================
  // FutarchyOutcome Functions
  // ========================================

  /**
   * Creates a new FutarchyOutcome for intent creation (before proposal exists)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns FutarchyOutcome object
   *
   * @example
   * ```typescript
   * const outcome = FutarchyConfig.newFutarchyOutcome(tx, {
   *   futarchyCorePackageId,
   *   intentKey: 'my-intent-key',
   *   minExecutionTime: 1234567890n,
   * });
   * ```
   */
  static newFutarchyOutcome(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      intentKey: string;
      minExecutionTime: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'new_futarchy_outcome'
      ),
      arguments: [
        tx.pure.string(config.intentKey),
        tx.pure.u64(config.minExecutionTime),
      ],
    });
  }

  /**
   * Public constructor for FutarchyOutcome with all fields
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns FutarchyOutcome object
   */
  static newFutarchyOutcomeFull(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      intentKey: string;
      proposalId: string | null;
      marketId: string | null;
      approved: boolean;
      minExecutionTime: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'new_futarchy_outcome_full'
      ),
      arguments: [
        tx.pure.string(config.intentKey),
        config.proposalId ? tx.pure.option('id', config.proposalId) : tx.pure.option('id', null),
        config.marketId ? tx.pure.option('id', config.marketId) : tx.pure.option('id', null),
        tx.pure.bool(config.approved),
        tx.pure.u64(config.minExecutionTime),
      ],
    });
  }

  /**
   * Updates proposal and market IDs after proposal creation
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static setOutcomeProposalAndMarket(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      outcome: ReturnType<Transaction['moveCall']>;
      proposalId: string;
      marketId: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'set_outcome_proposal_and_market'
      ),
      arguments: [
        config.outcome,
        tx.pure.id(config.proposalId),
        tx.pure.id(config.marketId),
      ],
    });
  }

  /**
   * Marks outcome as approved after proposal passes
   *
   * @param tx - Transaction
   * @param config - Configuration
   */
  static setOutcomeApproved(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      outcome: ReturnType<Transaction['moveCall']>;
      approved: boolean;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'set_outcome_approved'
      ),
      arguments: [config.outcome, tx.pure.bool(config.approved)],
    });
  }


  /**
   * Gets the minimum execution time
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Minimum execution time (u64)
   */
  static outcomeMinExecutionTime(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      outcome: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'outcome_min_execution_time'
      ),
      arguments: [config.outcome],
    });
  }

  // Governance-only FutarchyConfig writes are staged via futarchy action builders.

  // ========================================
  // Account Creation Functions
  // ========================================

  /**
   * Creates a new account with PackageRegistry validation for use with the Futarchy config
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @param config.authorizationLevel - Optional deps auth level (0=GLOBAL_ONLY, 1=WHITELIST, 2=PERMISSIVE)
   * @param config.callerWitness - Version witness from an authorized account-creator package
   * @returns Account object
   */
  static newWithPackageRegistry(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      registry: ReturnType<Transaction['moveCall']>;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
      authorizationLevel?: number;
      callerWitness: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'new_with_package_registry'
      ),
      arguments: [
        config.registry,
        config.futarchyConfig,
        tx.pure.u8(config.authorizationLevel ?? 0),
        config.callerWitness,
      ],
    });
  }

  // ========================================
  // Launchpad Initial Price Functions
  // ========================================

  /**
   * Get the launchpad initial price
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Launchpad initial price (Option<u128>)
   */
  static getLaunchpadInitialPrice(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'get_launchpad_initial_price'
      ),
      arguments: [config.futarchyConfig],
    });
  }

  // ========================================
  // Spot Pool ID Functions
  // ========================================

  /**
   * Get the spot pool ID
   *
   * Returns the spot pool ID stored in FutarchyConfig.
   * Used by actions to validate the correct pool is passed at execution time.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Spot pool ID (Option<ID>)
   */
  static getSpotPoolId(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      futarchyConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'futarchy_config',
        'get_spot_pool_id'
      ),
      arguments: [config.futarchyConfig],
    });
  }
}
