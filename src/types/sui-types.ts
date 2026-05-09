/**
 * Sui Object Type Definitions
 *
 * Provides type-safe access to Sui object content and fields.
 * These types help avoid `any` casts when working with on-chain data.
 *
 * @module types/sui-types
 */

import type {
  SuiObjectResponse,
  SuiObjectData,
  SuiMoveObject,
} from "@mysten/sui/client";
import type { TransactionResult } from "@mysten/sui/transactions";

// ============================================================================
// SUI OBJECT FIELD TYPES
// ============================================================================

/**
 * Generic Move object fields accessor
 */
export interface MoveObjectFields {
  [key: string]: unknown;
}

export interface MoveVecSetField<T = unknown> {
  fields?: {
    contents?: T[];
  };
  contents?: T[];
}

/**
 * Type guard to check if object data has move object content
 */
export function isMoveObject(
  data: SuiObjectData | undefined,
): data is SuiObjectData & { content: SuiMoveObject } {
  return !!data?.content && data.content.dataType === "moveObject";
}

/**
 * Extract fields from a Sui object response safely
 */
export function extractFields<T extends MoveObjectFields = MoveObjectFields>(
  obj: SuiObjectResponse,
): T | null {
  if (!obj.data || !isMoveObject(obj.data)) {
    return null;
  }
  return obj.data.content.fields as T;
}

export function extractVecSetContents<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const field = value as MoveVecSetField<T>;
  if (Array.isArray(field.contents)) {
    return field.contents;
  }
  if (Array.isArray(field.fields?.contents)) {
    return field.fields.contents;
  }

  return [];
}

export function extractTypeNameString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const fields = "fields" in value && value.fields && typeof value.fields === "object"
    ? value.fields as Record<string, unknown>
    : value as Record<string, unknown>;

  const name = fields.name;
  if (typeof name === "string") {
    return name;
  }

  return null;
}

/**
 * Extract fields or throw if not available
 */
export function extractFieldsOrThrow<
  T extends MoveObjectFields = MoveObjectFields,
>(obj: SuiObjectResponse, errorMessage?: string): T {
  const fields = extractFields<T>(obj);
  if (!fields) {
    throw new Error(errorMessage || "Could not extract fields from object");
  }
  return fields;
}

// ============================================================================
// COMMON SUI OBJECT FIELD TYPES
// ============================================================================

/**
 * DAO/Account object fields
 */
export interface DAOFields extends MoveObjectFields {
  id: { id: string };
  name: string;
  metadata?: {
    fields?: {
      name?: string;
      description?: string;
      icon_url?: string;
      [key: string]: unknown;
    };
  };
  members?: { fields: { contents: unknown[] } };
  config?: {
    fields: {
      spot_pool_id?: string;
      trading_period_ms?: string;
      review_period_ms?: string;
      proposals_enabled?: boolean;
      [key: string]: unknown;
    };
  };
  object_tracker?: {
    fields: {
      deposits_enabled?: boolean;
      current_count?: string;
      max_objects?: string;
      [key: string]: unknown;
    };
  };
}

/**
 * Raise state constants
 *
 * State transitions:
 * FUNDING -> SUCCESSFUL (if min met) or FAILED (if min not met / force-failed)
 * SUCCESSFUL -> COMPLETION_PENDING (if init actions exist) -> SUCCESSFUL (after execution)
 * COMPLETION_PENDING -> FAILED (if rollback after timeout)
 */
export enum RaiseState {
  FUNDING = 0,
  SUCCESSFUL = 1,
  FAILED = 2,
  COMPLETION_PENDING = 3,
}

/**
 * Raise/Launchpad object fields
 */
export interface RaiseFields extends MoveObjectFields {
  id: { id: string };
  account_id: string;
  state: number;
  creator?: string;
  tokens_for_sale?: string;
  min_raise_amount?: string;
  max_raise_amount?: string;
  /**
   * On-chain vault balance. For active raises this represents the live total.
   * For failed raises, the vault shrinks as contributors claim refunds -- use
   * the Move total_raised() view function or the indexer's final_raise_amount
   * for the correct historical total. For settled successful raises, use
   * final_raise_amount from the RaiseSuccessful event.
   */
  stable_coin_vault?: { fields: { value: string } };
  completion_started_ms?: string | null;
  failure_cleanup_done?: boolean;
  /** Sum of reserved amounts not yet accepted */
  total_pending_reserved?: string;
  /** Total reserved amount at creation time (immutable after lock) */
  total_reserved_at_creation?: string;
  /** Number of reservations */
  reservation_count?: string;
}

/**
 * Proposal state constants
 *
 * State transitions:
 * PREMARKET -> REVIEW -> TRADING -> AWAITING_EXECUTION -> FINALIZED
 *                                 \-> FINALIZED (if REJECT wins immediately)
 */
export enum ProposalState {
  PREMARKET = 0, // Proposal exists, outcomes can be added/mutated
  REVIEW = 1, // Market initialized and locked for review
  TRADING = 2, // Market is live and trading
  AWAITING_EXECUTION = 3, // TWAP measured, 30-min execution window active
  FINALIZED = 4, // Market has resolved (execution succeeded or timeout)
}

/**
 * Proposal object fields
 */
export interface ProposalFields extends MoveObjectFields {
  id: { id: string };
  title: string;
  state: number;
  market_state?: unknown;
  dao_id?: string;
  winning_outcome?: number;
}

/**
 * Pool object fields
 */
export interface PoolFields extends MoveObjectFields {
  fee_bps?: number;
  lp_supply?: string;
  reserve_asset?: string;
  reserve_stable?: string;
  asset_reserve?: string;
  stable_reserve?: string;
}

/**
 * Factory object fields
 */
export interface FactoryFields extends MoveObjectFields {
  dao_count?: number | string;
  paused?: boolean;
  allowed_legacy_asset_types?: string[] | MoveVecSetField;
  allowed_stable_types?: string[] | MoveVecSetField;
  launchpad_bid_fee?: string;
}

/**
 * FeeManager object fields
 */
export interface FeeManagerFields extends MoveObjectFields {
  dao_creation_fee?: string;
  proposal_creation_fee?: string;
  launchpad_creation_fee?: string;
  sui_balance?: string;
  // Pending global proposal fee update (6-month delay for increases)
  pending_proposal_fee?: { vec: string[] } | null;
  pending_proposal_fee_effective_ts?: { vec: string[] } | null;
  // Proposal fee baseline
  proposal_fee_baseline?: string;
  proposal_baseline_reset_ts?: string;
}

/**
 * Stream object fields
 */
export interface StreamFields extends MoveObjectFields {
  id: { id: string };
  coin_type?: string;
  beneficiary?: string;
  amount_per_iteration: string;
  iterations_total: string;
  // Legacy field from older deployments (iteration-based claimed counter).
  iterations_claimed?: string;
  claimed_amount?: string;
  // Tracking-based claim window state (current deployments).
  first_unclaimed_iteration?: string;
  partial_claimed_in_iteration?: string;
  start_time: string;
  // Legacy field name for iteration period.
  period_ms?: string;
  iteration_period_ms?: string;
  claim_window_ms?: string;
}

/**
 * Oracle Grant object fields
 */
export interface OracleGrantFields extends MoveObjectFields {
  dao_id?: string;
  total_amount?: string;
  claimed_amount?: string;
  canceled?: boolean;
  is_canceled?: boolean;
  description?: string;
  tier_count?: number | string;
  tiers?: unknown[];
}

/**
 * Escrow object fields
 */
export interface EscrowFields extends MoveObjectFields {
  balance?: string;
  proposal_id?: string;
}

/**
 * Market status struct (matches on-chain MarketStatus)
 */
export interface MarketStatus {
  trading_started: boolean;
  trading_ended: boolean;
  in_execution_window: boolean; // New: true during 30-min execution window
  finalized: boolean;
}

/**
 * Market State object fields
 */
export interface MarketStateFields extends MoveObjectFields {
  status?: MarketStatus;
  trading_start?: string | number;
  trading_end?: unknown; // Option<u64>
  finalization_time?: unknown; // Option<u64>
  execution_deadline?: unknown; // Option<u64>
  frozen_twaps?: unknown; // Option<vector<u128>>
  market_winner?: unknown; // Option<u64>
}

/**
 * Coin object fields
 */
export interface CoinFields extends MoveObjectFields {
  balance?: string;
  id?: { id: string };
}

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Generic Sui event data
 */
export interface SuiEventData<T = unknown> {
  id: { txDigest: string; eventSeq: string };
  packageId: string;
  transactionModule: string;
  sender: string;
  type: string;
  parsedJson: T;
  timestampMs?: string;
}

/**
 * Futarchy conditional oracle price observation event.
 * Source: futarchy_markets_primitives::futarchy_twap_oracle::PriceEvent
 */
export interface FutarchyPriceEvent {
  oracle_id: string;
  timestamp: string;
  last_price: string;
  total_cumulative_price: string;
}

/**
 * DAO Created event
 * Emitted when a DAO is created via factory or launchpad
 */
export interface DAOCreatedEvent {
  account_id: string;
  dao_name: string;
  asset_type: string;
  stable_type: string;
  asset_decimals: number;
  stable_decimals: number;
  asset_currency_id: string;
  stable_currency_id: string;
  creator: string;
  affiliate_id: string;
  timestamp: string;
}

/**
 * Raise Created event
 * Emitted when a launchpad raise is created
 */
export interface RaiseCreatedEvent {
  raise_id: string;
  creator: string;
  affiliate_id: string;
  raise_token_type: string;
  stable_coin_type: string;
  raise_token_decimals: number;
  stable_coin_decimals: number;
  asset_currency_id: string;
  stable_currency_id: string;
  min_raise_amount: string;
  max_raise_amount: string;
  tokens_for_sale: string;
  start_time_ms: string;
  deadline_ms: string;
  duration_ms: string;
  description: string;
  metadata_keys: string[];
  metadata_values: string[];
}

/**
 * Canonical staged action event payload shared by factory, launchpad, and proposals.
 * action_data entries are BCS-serialized ActionSpec payload bytes.
 */
export interface ActionsStagedEvent {
  action_types: string[];
  action_versions: number[];
  action_data: Array<number[] | string>;
}

/**
 * Emitted when DAO init actions are staged during factory DAO creation.
 */
export interface DaoInitActionsStagedEvent extends ActionsStagedEvent {
  dao_id: string;
}

/**
 * Emitted when launchpad success or failure actions are staged.
 * kind = 0 for success, 1 for failure.
 */
export interface LaunchpadActionsStagedEvent extends ActionsStagedEvent {
  raise_id: string;
  kind: number;
}

/**
 * Emitted when a proposal outcome's execution actions are staged.
 */
export interface ProposalActionsStagedEvent extends ActionsStagedEvent {
  proposal_id: string;
  outcome_index: string;
}

/**
 * Raise Successful event
 * Emitted when a raise completes successfully (all init actions executed)
 */
export interface RaiseSuccessfulEvent {
  raise_id: string;
  account_id: string;
  pool_id: string | null;
  total_raised: string;
}

/**
 * Raise Failed event
 */
export interface RaiseFailedEvent {
  raise_id: string;
  total_raised: string;
  timestamp: string;
}

/**
 * Raise Completion Timed Out event
 * Emitted when a raise in COMPLETION_PENDING state is rolled back after timeout
 */
export interface RaiseCompletionTimedOutEvent {
  raise_id: string;
  completion_started_at: string;
  timeout_at: string;
  timestamp: string;
}

/**
 * Reservation Added event
 * Emitted when a reservation is added to an unshared raise
 */
export interface ReservationAddedEvent {
  raise_id: string;
  wallet: string;
  amount: string;
}

/**
 * Reservation Accepted event
 * Emitted when a reserved wallet accepts their allocation
 */
export interface ReservationAcceptedEvent {
  raise_id: string;
  wallet: string;
  amount: string;
}

/**
 * Proposal Created event
 */
export interface ProposalCreatedEvent {
  proposal_id: string;
  dao_id: string;
  proposer: string;
  title: string;
}

/**
 * Oracle Grant Created event
 */
export interface OracleGrantCreatedEvent {
  grant_id: string;
  total_amount: string;
  tier_count: string;
  timestamp: string;
}

/**
 * Execution Window Started event (new for execution-required finalization)
 */
export interface ExecutionWindowStartedEvent {
  proposal_id: string;
  dao_id: string;
  market_winner: string;
  execution_deadline: string;
  timestamp: string;
}

/**
 * Proposal Execution Succeeded event (new for execution-required finalization)
 */
export interface ProposalExecutionSucceededEvent {
  proposal_id: string;
  dao_id: string;
  winning_outcome: string;
  intent_key: string;
  timestamp: string;
}

/**
 * Proposal Market Finalized event
 */
export interface ProposalMarketFinalizedEvent {
  proposal_id: string;
  dao_id: string;
  winning_outcome: string;
  approved: boolean;
  timestamp: string;
}

/**
 * Execution Timed Out event (new for execution-required finalization)
 */
export interface ExecutionTimedOutEvent {
  proposal_id: string;
  dao_id: string;
  original_market_winner: string;
  timestamp: string;
}

// ============================================================================
// MULTISIG EVENT TYPES
// ============================================================================

/**
 * Multisig Account Created event
 */
export interface MultisigAccountCreatedEvent {
  account_addr: string;
  creator: string;
}

/**
 * Multisig Config Changed event
 */
export interface MultisigConfigChangedEvent {
  account_addr: string;
  group_names: string[];
  group_member_counts: string[];
  all_member_addresses: string[];
  all_member_weights: string[];
  time_band_counts: string[];
  all_time_band_afters: string[];
  all_time_band_weights: string[];
  approve_path_req_counts: string[];
  all_approve_group_indices: string[];
  all_approve_thresholds: string[];
  cancel_path_req_counts: string[];
  all_cancel_group_indices: string[];
  all_cancel_thresholds: string[];
  propose_groups: string[];
  execute_groups: string[];
  cancel_groups: string[];
  intent_expiry_ms: string;
  config_nonce: string;
}

/**
 * Multisig Intent Created event
 */
export interface MultisigIntentCreatedEvent {
  account_addr: string;
  key: string;
  description: string;
  creator: string;
}

/**
 * Multisig Intent Executed event
 */
export interface MultisigIntentExecutedEvent {
  account_addr: string;
  key: string;
  executor: string;
}

/**
 * Multisig Intent Cancelled event
 */
export interface MultisigIntentCancelledEvent {
  account_addr: string;
  key: string;
  canceller: string;
  reason: number;
}

/**
 * Extract parsedJson with type safety
 */
export function extractEventData<T>(event: { parsedJson?: unknown }): T | null {
  return (event.parsedJson as T) ?? null;
}

/**
 * Extract futarchy conditional oracle PriceEvent payload when event type matches.
 */
export function extractFutarchyPriceEvent(event: {
  type?: string;
  parsedJson?: unknown;
}): FutarchyPriceEvent | null {
  if (!event.type || !event.type.includes("futarchy_twap_oracle::PriceEvent")) {
    return null;
  }

  const parsed = event.parsedJson as Partial<FutarchyPriceEvent> | undefined;
  if (
    !parsed ||
    parsed.oracle_id === undefined ||
    parsed.timestamp === undefined ||
    parsed.last_price === undefined ||
    parsed.total_cumulative_price === undefined
  ) {
    return null;
  }

  return {
    oracle_id: String(parsed.oracle_id),
    timestamp: String(parsed.timestamp),
    last_price: String(parsed.last_price),
    total_cumulative_price: String(parsed.total_cumulative_price),
  };
}

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

/**
 * Transaction argument types that can be passed to move calls
 */
export type TransactionArgument =
  import("@mysten/sui/transactions").TransactionArgument;

/**
 * Shared object reference for transaction inputs
 */
export interface SharedObjectInput {
  objectId: string;
  initialSharedVersion: number;
  mutable?: boolean;
}

/**
 * Object reference for transaction inputs
 */
export interface ObjectInput {
  objectId: string;
  version?: string;
  digest?: string;
}

// ============================================================================
// TRANSACTION RESULT HELPERS
// ============================================================================

/**
 * Type for transaction results that return tuples
 * Use with destructuring: const [first, second] = result as TransactionResultTuple
 */
export type TransactionResultTuple = readonly [
  TransactionArgument,
  TransactionArgument,
  ...TransactionArgument[],
];

/**
 * Get first element from a transaction result (for single returns or tuple[0])
 */
export function txResultFirst(result: TransactionResult): TransactionArgument {
  return (result as unknown as TransactionArgument[])[0] ?? result;
}

/**
 * Get second element from a transaction result tuple
 */
export function txResultSecond(result: TransactionResult): TransactionArgument {
  return (result as unknown as TransactionArgument[])[1];
}

/**
 * Get element at index from transaction result
 */
export function txResultAt(
  result: TransactionResult,
  index: number,
): TransactionArgument {
  return (result as unknown as TransactionArgument[])[index];
}

// ============================================================================
// TYPE UTILS
// ============================================================================

/**
 * Get the type property from an unknown action (for error messages)
 */
export function getUnknownType(action: unknown): string {
  if (action && typeof action === "object" && "type" in action) {
    return String((action as { type: unknown }).type);
  }
  return "unknown";
}

// ============================================================================
// DEPLOYMENT TYPES
// ============================================================================

/**
 * Shared object from deployment
 */
export interface DeployedSharedObject {
  name: string;
  objectId: string;
  initialSharedVersion: number;
}

/**
 * Admin cap from deployment
 */
export interface DeployedAdminCap {
  name: string;
  objectId: string;
}
