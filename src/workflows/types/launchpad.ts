/**
 * Launchpad Workflow Types
 *
 * Configuration types for launchpad (token raise) workflows.
 *
 * @module workflows/types/launchpad
 */

import type { WorkflowBaseConfig, ObjectIdOrRef } from './common';
import type { ActionConfig } from './actions';

/**
 * Configuration for creating a new raise
 */
export interface CreateRaiseConfig extends WorkflowBaseConfig {
  /** Creator address (used during DAO account setup) */
  creator: string;
  /** Asset token type (e.g., "0x123::coin::COIN") */
  assetType: string;
  /** Stable token type (e.g., "0x2::sui::SUI") */
  stableType: string;
  /** Treasury cap object ID */
  treasuryCap: string;
  /** MetadataCap<AssetType> object ID - required for updating Currency metadata */
  metadataCap: string;
  /** Asset Currency<T> object ID from sui::coin_registry */
  assetCurrency: string;
  /**
   * Set true only for legacy asset coins that factory governance has allowlisted.
   * Default false requires a fresh unregulated registry coin.
   */
  useAllowedLegacyAsset?: boolean;
  /** Stable Currency<T> object ID from sui::coin_registry */
  stableCurrency: string;

  /** DAO name for the DAOCreated event (e.g. token symbol) */
  daoName: string;
  /** Number of tokens for sale */
  tokensForSale: bigint;
  /** Minimum raise amount (in stable) */
  minRaiseAmount: bigint;
  /** Maximum raise amount (in stable) */
  maxRaiseAmount: bigint;
  /**
   * Allows admin-triggered early completion (`end_raise_early`) once minimum raise is met.
   * Note: on-chain still auto-closes the sale immediately when `maxRaiseAmount` is reached.
   */
  allowEarlyCompletion: boolean;

  /** Start delay in milliseconds */
  startDelayMs?: number;
  /** Duration of the raise in milliseconds (e.g., 345_600_000 for 4 days) */
  durationMs: number;
  /** Description of the raise */
  description: string;
  /** Optional affiliate ID */
  affiliateId?: string;
  /** Optional metadata keys */
  metadataKeys?: string[];
  /** Optional metadata values */
  metadataValues?: string[];
  /**
   * Percentage of TOTAL raised funds for AMM liquidity (in basis points, e.g., 2000 = 20%)
   * Default: 2000 (20% of TOTAL raised funds)
   */
  ammPercentOfRaiseBps?: bigint;
  /**
   * Percentage of excess funds for NAV bid wall (in basis points, e.g., 8000 = 80%)
   * excess = final_raise_amount - min_raise_amount
   *
   * Note: this only controls how much stable is allocated to the DAO vault `bid_wall_funds`.
   * Creating an on-chain protective bid wall is optional and requires staging a
   * `create_protective_bid` init action. That action now uses a `VaultAdminCap`
   * minted from `bid_wall_funds`, so you must stage a prior
   * `mint_vault_admin_cap` action before the bid creation action.
   * Default: 8000 (80% of excess goes to bid wall)
   */
  bidWallPercentOfExcessBps?: bigint;
  /** Launchpad fee amount (in SUI MIST) */
  launchpadFee: bigint;
  /** Optional reserved allocations — wallet gets a guaranteed fixed-price allocation */
  reservations?: Array<{ wallet: string; amount: bigint }>;
  /** Optional exact-allocation bonding curve channel */
  bondingCurve?: {
    tokenBudget: bigint;
    startPrice: bigint;
    endPrice: bigint;
  };
  /** Optional escrowed continuous-clearing auction channel */
  continuousClearingAuction?: {
    tokenBudget: bigint;
    maxPrice: bigint;
    floorPrice: bigint;
  };
}

/**
 * Configuration for staging success/failure actions
 */
export interface StageActionsConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Actions to stage */
  actions: ActionConfig[];
  /** Whether these are success or failure actions */
  outcome: 'success' | 'failure';
}

/**
 * Configuration for a public FCFS contribution.
 */
export interface ContributeConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Stable amount to contribute */
  amount: bigint;
  /** Protocol fee amount (bid fee in SUI) */
  protocolFee: bigint;
  /** Fee manager object ID */
  feeManagerId: ObjectIdOrRef;
  /** Stable coin object IDs to use for payment */
  stableCoins: string[];
}

/**
 * Configuration for routing a payment through a reserved allocation first,
 * then contributing any excess to the public FCFS raise in the same PTB.
 */
export interface ContributeWithReservationConfig extends ContributeConfig {
  /** Portion of amount to route through accept_reservation */
  reservationAmount: bigint;
}

/**
 * Configuration for buying from the bonding curve channel.
 */
export interface BondingCurveBuyConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Maximum stable amount to spend; unused excess is refunded on-chain */
  maxStableAmount: bigint;
  /** Protocol fee amount (bid fee in SUI) */
  protocolFee: bigint;
  /** Fee manager object ID */
  feeManagerId: ObjectIdOrRef;
  /** Stable coin object IDs to use for payment */
  stableCoins: string[];
  /** Exact number of raise-token units to buy */
  tokenAmount: bigint;
}

/**
 * Configuration for submitting a stable-denominated CCA bid.
 */
export interface CCABidConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Stable amount to escrow as auction demand */
  stableAmount: bigint;
  /** Protocol fee amount (bid fee in SUI) */
  protocolFee: bigint;
  /** Fee manager object ID */
  feeManagerId: ObjectIdOrRef;
  /** Stable coin object IDs to use for payment */
  stableCoins: string[];
  /** Maximum price the bidder is willing to pay */
  maxPrice: bigint;
}

/**
 * Configuration for checkpointing the CCA clearing price.
 */
export interface CCACheckpointConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Every active bid price, sorted high to low */
  priceTicksDesc: bigint[];
}

/**
 * Configuration for finalizing the CCA after the raise deadline.
 */
export interface CCAFinalizeConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Every active bid price, sorted high to low */
  priceTicksDesc: bigint[];
}

/**
 * Configuration for settling a finalized CCA bid.
 */
export interface CCASettleBidConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Optional bidder to settle; omit to settle the sender's bid */
  bidder?: string;
}

/**
 * Configuration for canceling the sender's out-of-range CCA bid.
 */
export interface CCACancelBidConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
}

/**
 * Configuration for completing a raise.
 *
 * This performs:
 * 1. settle_raise
 * 2. create_completion_intents
 *
 * After this transaction, use IntentExecutor to execute
 * the init actions on the shared Account.
 */
export interface CompleteRaiseConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Pre-linked DAO Account object ID or full ObjectRef */
  accountId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
}

/**
 * Configuration for accepting a reservation
 */
export interface AcceptReservationConfig extends WorkflowBaseConfig {
  /** Raise object ID or full ObjectRef */
  raiseId: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** Stable amount to pay (must be >= reserved amount) */
  stableAmount: bigint;
  /** Protocol fee amount (bid fee in SUI) */
  protocolFee: bigint;
  /** Fee manager object ID */
  feeManagerId: ObjectIdOrRef;
  /** Stable coin object IDs to use for payment */
  stableCoins: string[];
}
