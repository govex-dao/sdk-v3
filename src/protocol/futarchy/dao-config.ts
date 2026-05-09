/**
 * DAO Configuration Module
 *
 * Provides centralized configuration structs and validation for futarchy DAOs.
 * Manages trading parameters, TWAP config, governance settings, metadata,
 * conditional coin config, and sponsorship configuration.
 *
 * FEATURES:
 * - Trading parameters (liquidity, periods, fees)
 * - TWAP configuration (threshold-based market resolution)
 * - Governance config (outcomes, actions, fees)
 * - Metadata config (name, icon, description)
 * - Conditional coin config (token naming)
 * - Sponsorship config (team-sponsored proposals)
 *
 * NOTE: Quota system is managed per-user via ProposalQuotaRegistry in FutarchyConfig,
 * not via DaoConfig. See proposal_quota_registry.move for quota implementation.
 *
 * @module dao-config
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Maximum allowed duration for trading and review periods (30 days in ms).
 * Enforced on-chain in dao_config.move via constants::max_trading_duration_ms().
 */
export const MAX_TRADING_DURATION_MS = 2_592_000_000n;

/**
 * DAO Configuration Static Functions
 *
 * Manages comprehensive DAO configuration including trading, governance,
 * metadata, and sponsorship settings.
 */
export class DaoConfig {
  // ========================================
  // Constructor Functions
  // ========================================

  /**
   * Create a new trading parameters configuration
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns TradingParams object
   *
   * NOTE: assetDecimals and stableDecimals removed - decimals are immutable in Sui coins
   * Read from sui::coin_registry::Currency<T> instead
   *
   * @example
   * ```typescript
   * const tradingParams = DaoConfig.newTradingParams(tx, {
   *   futarchyCorePackageId,
   *   minAssetAmount: 1_000_000n,
   *   minStableAmount: 1_000_000n,
   *   reviewPeriodMs: 86_400_000n, // 24 hours (max: 2,592,000,000 = 30 days)
   *   tradingPeriodMs: 604_800_000n, // 7 days (max: 2,592,000,000 = 30 days)
   *   conditionalAmmFeeBps: 25n, // 0.25%
   *   conditionalLiquidityRatioPercent: 80n, // 80%
   * });
   * ```
   */
  static newTradingParams(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      minAssetAmount: bigint;
      minStableAmount: bigint;
      reviewPeriodMs: bigint;
      tradingPeriodMs: bigint;
      conditionalAmmFeeBps: bigint;
      conditionalLiquidityRatioPercent: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'new_trading_params'
      ),
      arguments: [
        tx.pure.u64(config.minAssetAmount),
        tx.pure.u64(config.minStableAmount),
        tx.pure.u64(config.reviewPeriodMs),
        tx.pure.u64(config.tradingPeriodMs),
        tx.pure.u64(config.conditionalAmmFeeBps),
        tx.pure.u64(config.conditionalLiquidityRatioPercent),
      ],
    });
  }

  /**
   * Create a new TWAP configuration
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns TwapConfig object
   *
   * @example
   * ```typescript
   * // First proposal (derive price from reserves)
   * const twapConfig = DaoConfig.newTwapConfig(tx, {
   *   futarchyCorePackageId,
   *   startDelay: 300_000n, // 5 minutes
   *   capPpm: 300_000n, // 5 minutes
   *   initialObservation: null, // None = derive from AMM reserves
   *   threshold: 100n, // 0.1% in base 100,000 scale
   * });
   *
   * // Subsequent proposals (use previous winning TWAP)
   * const twapConfig = DaoConfig.newTwapConfig(tx, {
   *   futarchyCorePackageId,
   *   startDelay: 300_000n,
   *   capPpm: 300_000n,
   *   initialObservation: 1_000_000_000_000n, // Previous proposal's winning TWAP
   *   threshold: 100n,
   * });
   * ```
   */
  static newTwapConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      startDelay: bigint;
      capPpm: bigint;
      /** Initial TWAP observation: null = derive from AMM reserves (first proposal), bigint = use explicit value (subsequent proposals) */
      initialObservation: bigint | null;
      threshold: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'new_twap_config'
      ),
      arguments: [
        tx.pure.u64(config.startDelay),
        tx.pure.u64(config.capPpm),
        tx.pure.option('u128', config.initialObservation),
        tx.pure.u128(config.threshold),
      ],
    });
  }

  /**
   * Create a new governance configuration
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns GovernanceConfig object
   *
   * @example
   * ```typescript
   * const govConfig = DaoConfig.newGovernanceConfig(tx, {
   *   futarchyCorePackageId,
   *   maxOutcomes: 5n,
   *   maxActionsPerOutcome: 10n,
   *   proposalCreationFee: 500_000n, // 0.5 tokens
   *   proposalFeePerOutcome: 1_000_000n, // 1.0 tokens
   *   feeInAssetToken: false, // false = StableType, true = AssetType
   *   proposalIntentExpiryMs: 86_400_000n, // 24 hours
   * });
   * ```
   */
  static newGovernanceConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      maxOutcomes: bigint;
      maxActionsPerOutcome: bigint;
      proposalCreationFee: bigint;
      proposalFeePerOutcome: bigint;
      feeInAssetToken: boolean;
      proposalIntentExpiryMs: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'new_governance_config'
      ),
      arguments: [
        tx.pure.u64(config.maxOutcomes),
        tx.pure.u64(config.maxActionsPerOutcome),
        tx.pure.u64(config.proposalCreationFee),
        tx.pure.u64(config.proposalFeePerOutcome),
        tx.pure.bool(config.feeInAssetToken),
        tx.pure.u64(config.proposalIntentExpiryMs),
      ],
    });
  }

  /**
   * Create a new metadata configuration
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns MetadataConfig object
   *
   * @example
   * ```typescript
   * const metadataConfig = DaoConfig.newMetadataConfig(tx, {
   *   futarchyCorePackageId,
   *   daoName: 'MyDAO',
   *   iconUrl: 'https://example.com/icon.png',
   *   description: 'A decentralized autonomous organization',
   * });
   * ```
   */
  static newMetadataConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoName: string;
      iconUrl: string;
      description: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'new_metadata_config'
      ),
      arguments: [
        tx.pure.string(config.daoName),
        tx.pure.string(config.iconUrl),
        tx.pure.string(config.description),
      ],
    });
  }

  /**
   * Create conditional coin config
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns ConditionalCoinConfig object
   *
   * @example
   * ```typescript
   * const conditionalCoinConfig = DaoConfig.newConditionalCoinConfig(tx, {
   *   futarchyCorePackageId,
   *   useOutcomeIndex: true,
   *   conditionalMetadata: optionalMetadata, // or null
   * });
   * ```
   */
  static newConditionalCoinConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      useOutcomeIndex: boolean;
      conditionalMetadata: ReturnType<Transaction['moveCall']> | null;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'new_conditional_coin_config'
      ),
      arguments: [
        tx.pure.bool(config.useOutcomeIndex),
        config.conditionalMetadata || tx.pure.option('address', null),
      ],
    });
  }

  /**
   * Create new conditional metadata
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns ConditionalMetadata object
   *
   * @example
   * ```typescript
   * const conditionalMetadata = DaoConfig.newConditionalMetadata(tx, {
   *   futarchyCorePackageId,
   *   decimals: 6,
   *   coinNamePrefix: 'c_MYDAO_',
   *   coinIconUrl: 'https://example.com/icon.png',
   * });
   * ```
   */
  static newConditionalMetadata(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      decimals: number;
      coinNamePrefix: string;
      coinIconUrl: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'new_conditional_metadata'
      ),
      arguments: [
        tx.pure.u8(config.decimals),
        tx.pure.string(config.coinNamePrefix),
        tx.pure.string(config.coinIconUrl),
      ],
    });
  }

  /**
   * Create a new sponsorship configuration
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns SponsorshipConfig object
   *
   * @example
   * ```typescript
   * const sponsorshipConfig = DaoConfig.newSponsorshipConfig(tx, {
   *   futarchyCorePackageId,
   *   enabled: true,
   * });
   * ```
   */
  static newSponsorshipConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      enabled: boolean;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'new_sponsorship_config'
      ),
      arguments: [
        tx.pure.bool(config.enabled),
      ],
    });
  }

  /**
   * Create a complete DAO configuration
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns DaoConfig object
   *
   * @example
   * ```typescript
   * const daoConfig = DaoConfig.newDaoConfig(tx, {
   *   futarchyCorePackageId,
   *   tradingParams,
   *   twapConfig,
   *   governanceConfig,
   *   metadataConfig,
   *   conditionalCoinConfig,
   *   sponsorshipConfig,
   * });
   * ```
   */
  static newDaoConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      tradingParams: ReturnType<Transaction['moveCall']>;
      twapConfig: ReturnType<Transaction['moveCall']>;
      governanceConfig: ReturnType<Transaction['moveCall']>;
      metadataConfig: ReturnType<Transaction['moveCall']>;
      conditionalCoinConfig: ReturnType<Transaction['moveCall']>;
      sponsorshipConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'new_dao_config'
      ),
      arguments: [
        config.tradingParams,
        config.twapConfig,
        config.governanceConfig,
        config.metadataConfig,
        config.conditionalCoinConfig,
        config.sponsorshipConfig,
      ],
    });
  }

  // ========================================
  // Getter Functions - DaoConfig
  // ========================================

  /**
   * Get trading params from DAO config
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns TradingParams reference
   */
  static tradingParams(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'trading_params'
      ),
      arguments: [config.daoConfig],
    });
  }

  /**
   * Get TWAP config from DAO config
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns TwapConfig reference
   */
  static twapConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'twap_config'
      ),
      arguments: [config.daoConfig],
    });
  }

  /**
   * Get governance config from DAO config
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns GovernanceConfig reference
   */
  static governanceConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'governance_config'
      ),
      arguments: [config.daoConfig],
    });
  }

  /**
   * Get metadata config from DAO config
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns MetadataConfig reference
   */
  static metadataConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'metadata_config'
      ),
      arguments: [config.daoConfig],
    });
  }

  /**
   * Get conditional coin config from DAO config
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns ConditionalCoinConfig reference
   */
  static conditionalCoinConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'conditional_coin_config'
      ),
      arguments: [config.daoConfig],
    });
  }

  /**
   * Get sponsorship config from DAO config
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns SponsorshipConfig reference
   */
  static sponsorshipConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      daoConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'sponsorship_config'
      ),
      arguments: [config.daoConfig],
    });
  }

  // ========================================
  // Getter Functions - TradingParams
  // ========================================

  /**
   * Get minimum asset amount
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Minimum asset amount (u64)
   */
  static minAssetAmount(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      tradingParams: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'min_asset_amount'
      ),
      arguments: [config.tradingParams],
    });
  }

  /**
   * Get minimum stable amount
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Minimum stable amount (u64)
   */
  static minStableAmount(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      tradingParams: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'min_stable_amount'
      ),
      arguments: [config.tradingParams],
    });
  }

  /**
   * Get review period in milliseconds
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Review period in milliseconds (u64)
   */
  static reviewPeriodMs(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      tradingParams: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'review_period_ms'
      ),
      arguments: [config.tradingParams],
    });
  }

  /**
   * Get trading period in milliseconds
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Trading period in milliseconds (u64)
   */
  static tradingPeriodMs(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      tradingParams: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'trading_period_ms'
      ),
      arguments: [config.tradingParams],
    });
  }

  /**
   * Get conditional AMM fee in basis points
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Conditional AMM fee in basis points (u64)
   */
  static conditionalAmmFeeBps(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      tradingParams: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'conditional_amm_fee_bps'
      ),
      arguments: [config.tradingParams],
    });
  }

  /**
   * Get conditional liquidity ratio percent
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Conditional liquidity ratio percent (u64)
   */
  static conditionalLiquidityRatioPercent(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      tradingParams: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'conditional_liquidity_ratio_percent'
      ),
      arguments: [config.tradingParams],
    });
  }

  /**
   * NOTE: assetDecimals() and stableDecimals() removed - decimals are immutable in Sui coins
   * Read from sui::coin_registry::Currency<T> instead using coin_registry::decimals(currency)
   */

  // ========================================
  // Getter Functions - TwapConfig
  // ========================================

  /**
   * Get start delay in milliseconds
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Start delay in milliseconds (u64)
   */
  static startDelay(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      twapConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'start_delay'
      ),
      arguments: [config.twapConfig],
    });
  }

  /**
   * Get step max in milliseconds
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Cap in parts-per-million (u64)
   */
  static capPpm(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      twapConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'cap_ppm'
      ),
      arguments: [config.twapConfig],
    });
  }

  /**
   * Get initial observation value
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Initial observation (Option<u128>): None = derive from AMM reserves, Some = explicit value
   */
  static initialObservation(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      twapConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'initial_observation'
      ),
      arguments: [config.twapConfig],
    });
  }

  /**
   * Get threshold (u128)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Threshold (u128)
   */
  static threshold(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      twapConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'threshold'
      ),
      arguments: [config.twapConfig],
    });
  }

  /**
   * Get sponsored threshold (u128) - how much lower sponsored outcomes can be
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Sponsored threshold (u128, base 100,000 - e.g., 10000 = 10%)
   */
  static sponsoredThreshold(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      twapConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'sponsored_threshold'
      ),
      arguments: [config.twapConfig],
    });
  }

  // ========================================
  // Getter Functions - GovernanceConfig
  // ========================================

  /**
   * Get max outcomes
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Max outcomes (u64)
   */
  static maxOutcomes(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      governanceConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'max_outcomes'
      ),
      arguments: [config.governanceConfig],
    });
  }

  /**
   * Get max actions per outcome
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Max actions per outcome (u64)
   */
  static maxActionsPerOutcome(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      governanceConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'max_actions_per_outcome'
      ),
      arguments: [config.governanceConfig],
    });
  }

  /**
   * Get proposal creation fee
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Proposal creation fee (u64)
   */
  static proposalCreationFee(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      governanceConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'proposal_creation_fee'
      ),
      arguments: [config.governanceConfig],
    });
  }

  /**
   * Get proposal fee per outcome
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Proposal fee per outcome (u64)
   */
  static proposalFeePerOutcome(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      governanceConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'proposal_fee_per_outcome'
      ),
      arguments: [config.governanceConfig],
    });
  }

  /**
   * Get fee in asset token flag
   * If true, proposal fees should be paid in AssetType (DAO token).
   * If false (default), proposal fees should be paid in StableType.
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Fee in asset token (bool)
   */
  static feeInAssetToken(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      governanceConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'fee_in_asset_token'
      ),
      arguments: [config.governanceConfig],
    });
  }

  /**
   * Get proposal intent expiry in milliseconds
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Proposal intent expiry in milliseconds (u64)
   */
  static proposalIntentExpiryMs(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      governanceConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'proposal_intent_expiry_ms'
      ),
      arguments: [config.governanceConfig],
    });
  }

  // ========================================
  // Getter Functions - MetadataConfig
  // ========================================

  /**
   * Get DAO name
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns DAO name (AsciiString)
   */
  static daoName(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      metadataConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'dao_name'
      ),
      arguments: [config.metadataConfig],
    });
  }

  /**
   * Get icon URL
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Icon URL (Url)
   */
  static iconUrl(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      metadataConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'icon_url'
      ),
      arguments: [config.metadataConfig],
    });
  }

  /**
   * Get description
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Description (String)
   */
  static description(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      metadataConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'description'
      ),
      arguments: [config.metadataConfig],
    });
  }

  // ========================================
  // Getter Functions - ConditionalCoinConfig
  // ========================================

  /**
   * Get use outcome index flag
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Use outcome index (bool)
   */
  static useOutcomeIndex(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      conditionalCoinConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'use_outcome_index'
      ),
      arguments: [config.conditionalCoinConfig],
    });
  }

  /**
   * Get conditional metadata
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Conditional metadata (Option<ConditionalMetadata>)
   */
  static conditionalMetadata(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      conditionalCoinConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'conditional_metadata'
      ),
      arguments: [config.conditionalCoinConfig],
    });
  }

  /**
   * Get coin name prefix
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Coin name prefix (Option<AsciiString>)
   */
  static coinNamePrefix(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      conditionalCoinConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'coin_name_prefix'
      ),
      arguments: [config.conditionalCoinConfig],
    });
  }

  // ========================================
  // Getter Functions - ConditionalMetadata
  // ========================================

  /**
   * Get decimals from conditional metadata
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Decimals (u8)
   */
  static conditionalMetadataDecimals(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      conditionalMetadata: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'conditional_metadata_decimals'
      ),
      arguments: [config.conditionalMetadata],
    });
  }

  /**
   * Get coin name prefix from conditional metadata
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Coin name prefix (AsciiString)
   */
  static conditionalMetadataPrefix(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      conditionalMetadata: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'conditional_metadata_prefix'
      ),
      arguments: [config.conditionalMetadata],
    });
  }

  /**
   * Get icon URL from conditional metadata
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Icon URL (Url)
   */
  static conditionalMetadataIcon(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      conditionalMetadata: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'conditional_metadata_icon'
      ),
      arguments: [config.conditionalMetadata],
    });
  }

  /**
   * Get decimals from conditional metadata (alternative name)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Decimals (u8)
   */
  static conditionalDecimals(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      conditionalMetadata: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'conditional_decimals'
      ),
      arguments: [config.conditionalMetadata],
    });
  }

  /**
   * Get coin name prefix from conditional metadata (alternative name)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Coin name prefix (AsciiString)
   */
  static conditionalCoinNamePrefix(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      conditionalMetadata: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'conditional_coin_name_prefix'
      ),
      arguments: [config.conditionalMetadata],
    });
  }

  /**
   * Get icon URL from conditional metadata (alternative name)
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Icon URL (Url)
   */
  static conditionalCoinIconUrl(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      conditionalMetadata: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'conditional_coin_icon_url'
      ),
      arguments: [config.conditionalMetadata],
    });
  }

  /**
   * Derive conditional metadata from Currency<T>
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Tuple of (decimals, name_prefix, icon_url)
   */
  static deriveConditionalMetadataFromCurrency(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      currency: ReturnType<Transaction['moveCall']> | string;
      coinType: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'derive_conditional_metadata_from_currency'
      ),
      typeArguments: [config.coinType],
      arguments: [
        typeof config.currency === 'string' ? tx.object(config.currency) : config.currency,
      ],
    });
  }

  /**
   * Get conditional metadata from config
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Tuple of (decimals, name_prefix, icon_url)
   */
  static getConditionalMetadataFromConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      conditionalCoinConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'get_conditional_metadata_from_config'
      ),
      arguments: [config.conditionalCoinConfig],
    });
  }

  // ========================================
  // Getter Functions - SponsorshipConfig
  // ========================================

  /**
   * Get sponsorship enabled flag
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Sponsorship enabled (bool)
   */
  static sponsorshipEnabled(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
      sponsorshipConfig: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'sponsorship_enabled'
      ),
      arguments: [config.sponsorshipConfig],
    });
  }

  // ========================================
  // Default Configuration Functions
  // ========================================

  /**
   * Get default trading parameters
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Default TradingParams
   */
  static defaultTradingParams(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'default_trading_params'
      ),
      arguments: [],
    });
  }

  /**
   * Get default TWAP configuration
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Default TwapConfig
   */
  static defaultTwapConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'default_twap_config'
      ),
      arguments: [],
    });
  }

  /**
   * Get default governance configuration
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Default GovernanceConfig
   */
  static defaultGovernanceConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'default_governance_config'
      ),
      arguments: [],
    });
  }

  /**
   * Get default conditional coin configuration
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Default ConditionalCoinConfig
   */
  static defaultConditionalCoinConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'default_conditional_coin_config'
      ),
      arguments: [],
    });
  }

  /**
   * Get default sponsorship configuration
   *
   * @param tx - Transaction
   * @param config - Configuration
   * @returns Default SponsorshipConfig
   */
  static defaultSponsorshipConfig(
    tx: Transaction,
    config: {
      futarchyCorePackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.futarchyCorePackageId,
        'dao_config',
        'default_sponsorship_config'
      ),
      arguments: [],
    });
  }

}
