/**
 * Oracle Action Configs
 *
 * Oracle grant actions.
 *
 * @module workflows/types/actions/oracle
 */

import type { TierSpec } from '../common';

// ORACLE ACTIONS
// ============================================================================

// TierSpec and RecipientMint are exported from services/oracle-actions

/**
 * Create oracle grant with price-based unlocks
 */
export interface CreateOracleGrantActionConfig {
  type: 'create_oracle_grant';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging) */
  stableType?: string;
  /** Resource name to take CurrencyMintAdminCap from during grant creation */
  mintCapResourceName: string;
  /** Tier specifications */
  tierSpecs: TierSpec[];
  /** Use relative pricing */
  useRelativePricing: boolean;
  /** Launchpad multiplier */
  launchpadMultiplier: bigint;
  /** Earliest execution offset (ms) */
  earliestExecutionOffsetMs: bigint;
  /** Grant expiry in years. Use 0 for no expiry. On-chain max: 10_000_000 years. */
  expiryYears: bigint;
  /** Whether grant is cancelable */
  cancelable: boolean;
  /** Description */
  description: string;
  /** TWAP window in milliseconds (7-90 days). Default: 30 days */
  twapWindowMs?: bigint;
}

/**
 * Cancel oracle grant
 */
export interface CancelOracleGrantActionConfig {
  type: 'cancel_oracle_grant';
  /** Asset coin type (required for type-safe staging) */
  assetType?: string;
  /** Stable coin type (required for type-safe staging) */
  stableType?: string;
  /** Grant ID to cancel */
  grantId: string;
}

// ============================================================================
