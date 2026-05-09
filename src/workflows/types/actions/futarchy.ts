/**
 * Futarchy Action Configs
 *
 * Config, Quota, Liquidity, and Dissolution actions.
 *
 * @module workflows/types/actions/futarchy
 */

// ============================================================================
// FUTARCHY ACTIONS - CONFIG
// ============================================================================

/**
 * Terminate DAO permanently
 */
export interface TerminateDaoActionConfig {
  type: 'terminate_dao';
  /** Reason for termination */
  reason: string;
  /** Delay before dissolution unlocks (ms) */
  dissolutionUnlockDelayMs: bigint;
}

/**
 * Update DAO name
 */
export interface UpdateDaoNameActionConfig {
  type: 'update_dao_name';
  /** New name */
  newName: string;
}

/**
 * Update trading params action configuration
 * NOTE: assetDecimals and stableDecimals removed - decimals are immutable in Sui coins
 * Read from sui::coin_registry::Currency<T> instead
 */
export interface UpdateTradingParamsActionConfig {
  type: 'update_trading_params';
  /** Minimum asset amount for proposals */
  minAssetAmount?: bigint;
  /** Minimum stable amount for proposals */
  minStableAmount?: bigint;
  /** Review period in ms */
  reviewPeriodMs?: bigint;
  /** Trading period in ms */
  tradingPeriodMs?: bigint;
  /** AMM total fee in basis points */
  ammTotalFeeBps?: number;
  /** Conditional liquidity ratio percent */
  conditionalLiquidityRatioPercent?: number;
}

/**
 * Update DAO metadata
 */
export interface UpdateDaoMetadataActionConfig {
  type: 'update_dao_metadata';
  /** DAO name (ASCII) */
  daoName?: string;
  /** Icon URL */
  iconUrl?: string;
  /** Description */
  description?: string;
}

/**
 * Update TWAP config action configuration
 */
export interface UpdateTwapConfigActionConfig {
  type: 'update_twap_config';
  /** Start delay for TWAP accumulation */
  startDelay?: bigint;
  /** TWAP cap in parts-per-million per window */
  capPpm?: bigint;
  /** Initial observation value */
  initialObservation?: bigint;
  /** TWAP threshold for winning (numerator with base 100,000) */
  threshold?: bigint;
  /** Sponsored threshold - how much lower sponsored outcomes can be (base 100,000, max 10000 = 10%) */
  sponsoredThreshold?: bigint;
}

/**
 * Update governance settings
 */
export interface UpdateGovernanceActionConfig {
  type: 'update_governance';
  /** Maximum outcomes per proposal */
  maxOutcomes?: bigint;
  /** Maximum actions per outcome */
  maxActionsPerOutcome?: bigint;
  /** Required bond amount */
  requiredBondAmount?: bigint;
  /** Maximum intents per outcome */
  maxIntentsPerOutcome?: bigint;
  /** Proposal intent expiry (ms) */
  proposalIntentExpiryMs?: bigint;
  /** Optimistic challenge fee */
  optimisticChallengeFee?: bigint;
  /** Optimistic challenge period (ms) */
  optimisticChallengePeriodMs?: bigint;
  /** Proposal creation fee (u64, no SDK-side cap) */
  proposalCreationFee?: bigint;
  /** Proposal fee per outcome */
  proposalFeePerOutcome?: bigint;
  /** If true, fees paid in AssetType; if false, fees paid in StableType */
  feeInAssetToken?: boolean;
  /** Accept new proposals */
  acceptNewProposals?: boolean;
  /** Enable premarket reservation lock */
  enablePremarketReservationLock?: boolean;
  /** Show proposal details */
  showProposalDetails?: boolean;
}

/**
 * Update metadata table
 */
export interface UpdateMetadataTableActionConfig {
  type: 'update_metadata_table';
  /** Keys to add/update */
  keys: string[];
  /** Values for keys */
  values: string[];
  /** Keys to remove */
  keysToRemove: string[];
}

/**
 * Update conditional metadata configuration
 */
export interface UpdateConditionalMetadataActionConfig {
  type: 'update_conditional_metadata';
  /** Use outcome index in metadata */
  useOutcomeIndex?: boolean;
  /** Conditional metadata settings (null to clear) */
  conditionalMetadata?: {
    prefix: string;
    suffix: string;
  } | null;
}

/**
 * Update sponsorship configuration
 */
export interface UpdateSponsorshipConfigActionConfig {
  type: 'update_sponsorship_config';
  /** Enable sponsorship */
  enabled?: boolean;
}

/**
 * Sync TWAP initial observation from winning proposal TWAP
 * Used when a proposal passes to update the TWAP base to reflect market-discovered price
 */
export interface SyncTwapObservationFromProposalActionConfig {
  type: 'sync_twap_observation_from_proposal';
  // No parameters - reads winning TWAP from proposal at execution time
}

// ============================================================================
// FUTARCHY ACTIONS - QUOTA
// ============================================================================

/**
 * Set quotas for addresses
 *
 * Two independent quota types:
 * 1. Feeless proposal quota - N free proposals per period (no proposal creation fee)
 * 2. Sponsor quota - M TWAP sponsorships per period (can sponsor any proposal before trading)
 *
 * Pass both amounts as 0 to remove quotas entirely.
 */
export interface SetQuotasActionConfig {
  type: 'set_quotas';
  /** User addresses to set quotas for */
  users: string[];
  /** Shared period duration in milliseconds (e.g., 30 days = 2_592_000_000) */
  periodMs: bigint;
  /** Number of free proposals per period (0 = no feeless quota) */
  feelessProposalAmount: bigint;
  /** Number of TWAP sponsorships per period (0 = no sponsor quota) */
  sponsorAmount: bigint;
}

// ============================================================================
// FUTARCHY ACTIONS - LIQUIDITY
// ============================================================================

/**
 * Pool creation with mint action configuration
 *
 * Stable coins are taken from executable_resources (placed by prior VaultSpend action).
 */
export interface CreatePoolWithMintActionConfig {
  type: 'create_pool_with_mint';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging) */
  stableType?: string;
  /** Resource name to take stable coins from (put there by prior VaultSpend action) */
  stableResourceName: string;
  /** Resource name to take CurrencyMintAdminCap from (put there by prior MintCurrencyAdminCap action). */
  mintCapResourceName: string;
  /** Amount of asset tokens to mint (undefined = auto-calculate from launchpad_initial_price) */
  assetAmount?: bigint;
  /** Fee in basis points (e.g., 150 = 1.5%) */
  feeBps: number;
  /** Launch fee duration in milliseconds (0 = no launch fee period) */
  launchFeeDurationMs?: bigint;
  /** LP coin type (e.g., "0x123::lp_coin::LP_COIN") */
  lpType: string;
  /** LP TreasuryCap object ID */
  lpTreasuryCapId: string;
  /** LP Currency<LPType> object ID (shared from coin_registry::finalize) */
  lpCurrencyId: string;
}

/**
 * Pool creation from externally supplied asset and stable coins.
 *
 * Used by atomic migrations where the final AMM amounts are produced earlier
 * in the same PTB. Staged minimums are checked against the actual coin values.
 * Matches create_pool_with_mint staging behavior by auto-staging LP vault approval first.
 */
export interface CreatePoolFromCoinsActionConfig {
  type: 'create_pool_from_coins';
  /** Asset coin type (required for type-safe staging/execution) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging/execution) */
  stableType?: string;
  /** Address authorized to execute this dynamic external-coin action */
  executor: string;
  /** Minimum asset amount accepted by execution */
  minAssetAmount: bigint;
  /** Minimum stable amount accepted by execution */
  minStableAmount: bigint;
  /** Fee in basis points (e.g., 150 = 1.5%) */
  feeBps: number;
  /** Launch fee duration in milliseconds (0 = no launch fee period) */
  launchFeeDurationMs?: bigint;
  /** LP coin type (e.g., "0x123::lp_coin::LP_COIN") */
  lpType: string;
  /** LP TreasuryCap object ID */
  lpTreasuryCapId: string;
  /** LP Currency<LPType> object ID (shared from coin_registry::finalize) */
  lpCurrencyId: string;
  /** Runtime asset coin TransactionArgument for execution */
  assetCoin?: unknown;
  /** Runtime stable coin TransactionArgument for execution */
  stableCoin?: unknown;
  /** Asset coin object ID fallback for execution */
  assetCoinId?: string;
  /** Stable coin object ID fallback for execution */
  stableCoinId?: string;
}

/**
 * Add liquidity to pool
 */
export interface AddLiquidityActionConfig {
  type: 'add_liquidity';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging) */
  stableType?: string;
  /** LP coin type (required for type-safe staging) */
  lpType?: string;
  /** Asset vault name */
  assetVaultName: string;
  /** Stable vault name */
  stableVaultName: string;
  /** Asset amount */
  assetAmount: bigint;
  /** Stable amount */
  stableAmount: bigint;
  /** Minimum LP tokens */
  minLpTokens: bigint;
}

/**
 * Remove liquidity from pool to executable_resources
 * Outputs asset/stable coins for chaining to subsequent actions
 */
export interface RemoveLiquidityToResourcesActionConfig {
  type: 'remove_liquidity_to_resources';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging) */
  stableType?: string;
  /** LP coin type (required for type-safe staging) */
  lpType: string;
  /** Spot pool object ID */
  poolId: string;
  /** LP token amount */
  lpAmount: bigint;
  /** Minimum asset out */
  minAssetOut: bigint;
  /** Minimum stable out */
  minStableOut: bigint;
  /** Resource name for LP coin input (from prior VaultSpend) */
  lpResourceName: string;
  /** Resource name for asset coin output */
  assetOutputName: string;
  /** Resource name for stable coin output */
  stableOutputName: string;
  /** If true, use dissolution-only remove-liquidity path (requires DAO terminated) */
  forDissolution: boolean;
}

/**
 * Swap in pool
 */
export interface SwapActionConfig {
  type: 'swap';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging) */
  stableType?: string;
  /** LP coin type (required for type-safe staging) */
  lpType?: string;
  /** Amount in */
  amountIn: bigint;
  /** Minimum amount out */
  minAmountOut: bigint;
  /** Swap direction */
  direction: 'asset_to_stable' | 'stable_to_asset';
  /** Input vault name */
  inputVaultName: string;
  /** Output vault name */
  outputVaultName: string;
}

// ============================================================================
// FUTARCHY ACTIONS - PROTECTIVE BID
// ============================================================================

/**
 * Create a vault-backed protective bid wall.
 *
 * A prior `mint_vault_admin_cap` action should place a `VaultAdminCap` into
 * executable_resources. The bid uses that cap to withdraw from the chosen vault
 * while `reservedAmount` tracks the bid's remaining soft spending limit.
 */
export interface CreateProtectiveBidActionConfig {
  type: 'create_protective_bid';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging) */
  stableType?: string;
  /** Base fee in basis points (final fee after surge ends, max 2000 = 20%) */
  baseFeeBps: number;
  /** Starting fee in basis points (0 = no surge, use baseFeeBps) */
  surgeFeeBps: number;
  /** Duration of surge period in milliseconds (0 = no surge) */
  surgeDurationMs: bigint;
  /** Resource name to take VaultAdminCap from (put there by prior mint_vault_admin_cap action) */
  vaultCapResourceName: string;
  /** Soft spending limit for the bid wall */
  reservedAmount: bigint;
  /** Discount from NAV in basis points (0 = at NAV) */
  navDiscountBps?: bigint;
  /**
   * Optional NAV principal overrides (0 = use pool initial reserves).
   * Used for LIVE NAV calculations in the protective bid module.
   */
  daoAmmAssetPrincipal?: bigint;
  daoAmmStablePrincipal?: bigint;
  /** Duration before permissionless close is allowed in ms (0 = no permissionless close, governance cancel only) */
  releaseDurationMs?: bigint;
}

/**
 * Cancel protective bid wall
 *
 * Cancels the bid, destroys its VaultAdminCap, and leaves funds in the vault.
 */
export interface CancelProtectiveBidActionConfig {
  type: 'cancel_protective_bid';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging) */
  stableType?: string;
  /** ID of the protective bid to cancel */
  bidId: string;
}

/**
 * Create a fixed-price protective ask wall.
 */
export interface CreateProtectiveAskActionConfig {
  type: 'create_protective_ask';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging) */
  stableType?: string;
  /** Resource name to take CurrencyMintAdminCap from (put there by prior MintCurrencyAdminCap action). */
  mintCapResourceName: string;
  /** Fixed price per token, scaled by `price_precision_scale()` (1e12) */
  pricePerToken: bigint;
  /** Maximum asset amount mintable via this ask wall */
  maxMintAmount: bigint;
  /** Duration before permissionless close is allowed in ms (0 = no permissionless close, governance cancel only) */
  releaseDurationMs?: bigint;
}

/**
 * Cancel protective ask wall
 *
 * Cancels the ask wall.
 * Stable proceeds are already treasury-deposited on each buy.
 */
export interface CancelProtectiveAskActionConfig {
  type: 'cancel_protective_ask';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging) */
  stableType?: string;
  /** ID of the protective ask to cancel */
  askId: string;
}

// ============================================================================
// FUTARCHY ACTIONS - DISSOLUTION
// ============================================================================

/**
 * Create dissolution capability
 */
export interface CreateDissolutionCapabilityActionConfig {
  type: 'create_dissolution_capability';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
}

/**
 * Create dissolution capability but keep it unshared for the remainder of the action batch.
 *
 * Intended for single-PTB termination + liquidation flows where later actions
 * need a mutable reference to the capability before it is shared.
 */
export interface CreateDissolutionCapabilityUnsharedActionConfig {
  type: 'create_dissolution_capability_unshared';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
}

/**
 * Create redemption pool from coins in executable_resources
 * Requires a prior VaultSpend action to put coins in resources
 */
export interface CreateRedemptionPoolActionConfig {
  type: 'create_redemption_pool';
  /** Coin type to redeem (e.g., stable coin) */
  redeemCoinType: string;
  /**
   * Names of resources in executable_resources (from prior VaultSpend / RemoveLiquidity actions).
   * These will be merged into a single RedemptionPool on execution.
   */
  resourceNames: string[];
  /** DissolutionCapability object ID (required for execution) */
  capabilityId?: string;
}

/**
 * Share a newly-created (unshared) dissolution capability.
 */
export interface ShareDissolutionCapabilityActionConfig {
  type: 'share_dissolution_capability';
}

/**
 * Add coins to an existing redemption pool
 */
export interface AddToRedemptionPoolActionConfig {
  type: 'add_to_redemption_pool';
  /** Coin type to add */
  redeemCoinType: string;
  /** Name of the resource in executable_resources */
  resourceName: string;
  /** RedemptionPool object ID */
  poolId: string;
}
