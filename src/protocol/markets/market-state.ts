/**
 * Market State Operations
 *
 * Tracks lifecycle and status of conditional markets:
 * - PreTrading: Market created, not yet active
 * - Trading: Active trading period
 * - TradingEnded: Trading closed, awaiting finalization
 * - Finalized: Winner determined, payouts available
 *
 * Manages AMM pool references for all outcomes.
 *
 * @module market-state
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Market State Static Functions
 *
 * Manage conditional market lifecycle and pool access.
 *
 * @example Check if trading is active
 * ```typescript
 * const isActive = MarketState.isTradingActive(tx, marketsPackageId, marketStateId);
 * ```
 */
export class MarketState {
  // ============================================================================
  // Creation & Lifecycle
  // ============================================================================

  /**
   * Create new market state
   *
   * Initializes market in PreTrading status.
   *
   * @param tx - Transaction
   * @param config - Market creation configuration
   * @returns MarketState object
   *
   * @example
   * ```typescript
   * const marketState = MarketState.new(tx, {
   *   marketsPackageId,
   *   marketId: proposalId,
   *   daoId: "0xdao...",
   *   outcomeCount: 2,
   *   outcomeMessages: ["PASS", "REJECT"],
   *   clock: '0x6',
   * });
   * ```
   */
  static new(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      marketId: string;
      daoId: string;
      outcomeCount: number;
      outcomeMessages: string[];
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsPackageId, 'market_state', 'new'),
      arguments: [
        tx.pure.id(config.marketId),
        tx.pure.id(config.daoId),
        tx.pure.u64(config.outcomeCount),
        tx.pure.vector('string', config.outcomeMessages),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Start trading period
   *
   * Transitions market from PreTrading to Trading status.
   * Requires MarketStateMutationAuth for authorization.
   *
   * @param tx - Transaction
   * @param config - Start trading configuration
   */
  static startTrading(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      marketState: ReturnType<Transaction['moveCall']>;
      durationMs: bigint;
      /** Deterministic start time (e.g. review_end = base_timestamp + review_period_ms) */
      plannedStartTime: bigint;
      clock?: string;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'market_state',
        'start_trading'
      ),
      // Move: start_trading(state, duration_ms, planned_start_time, clock, _auth)
      arguments: [
        config.marketState,
        tx.pure.u64(config.durationMs),
        tx.pure.u64(config.plannedStartTime),
        tx.object(config.clock || '0x6'),
        config.auth,
      ],
    });
  }

  // ============================================================================
  // AMM Pool Management
  // ============================================================================

  /**
   * Set AMM pool references
   *
   * Stores pool IDs for all outcomes in market state.
   * Called during pool creation.
   * Requires MarketStateMutationAuth for authorization.
   *
   * @param tx - Transaction
   * @param config - Pool configuration
   */
  static setAmmPools(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      marketState: ReturnType<Transaction['moveCall']>;
      pools: ReturnType<Transaction['moveCall']>;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'market_state',
        'set_amm_pools'
      ),
      arguments: [config.marketState, config.pools, config.auth],
    });
  }

  /**
   * Check if AMM pools are set
   *
   * @returns True if pools have been initialized
   */
  static hasAmmPools(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'market_state', 'has_amm_pools'),
      arguments: [marketState],
    });
  }

  /**
   * Borrow AMM pools (read-only)
   *
   * @returns Vector of pool IDs
   */
  static borrowAmmPools(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'market_state', 'borrow_amm_pools'),
      arguments: [marketState],
    });
  }

  /**
   * Get pool ID for specific outcome
   *
   * @param tx - Transaction
   * @param config - Query configuration
   * @returns Pool ID
   */
  static getPoolByOutcome(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      marketState: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'market_state',
        'get_pool_by_outcome'
      ),
      arguments: [config.marketState, tx.pure.u64(config.outcomeIdx)],
    });
  }

  /**
   * Get mutable pool ID for specific outcome
   *
   * Requires EscrowMutationAuth for authorization.
   *
   * @returns Mutable pool ID
   */
  static getPoolMutByOutcome(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      marketState: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'market_state',
        'get_pool_mut_by_outcome'
      ),
      arguments: [config.marketState, tx.pure.u64(config.outcomeIdx), config.auth],
    });
  }

  // ============================================================================
  // Validation & Assertions
  // ============================================================================

  /**
   * Assert trading is active
   *
   * Panics if market is not in Trading status.
   */
  static assertTradingActive(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'assert_trading_active'
      ),
      arguments: [marketState],
    });
  }

  /**
   * Assert market is in trading or pre-trading
   *
   * Panics if market has ended trading.
   */
  static assertInTradingOrPreTrading(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'assert_in_trading_or_pre_trading'
      ),
      arguments: [marketState],
    });
  }

  /**
   * Assert market is finalized
   *
   * Panics if market is not finalized.
   */
  static assertMarketFinalized(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'assert_market_finalized'
      ),
      arguments: [marketState],
    });
  }

  /**
   * Assert market is NOT finalized
   *
   * Panics if market is finalized.
   */
  static assertNotFinalized(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'assert_not_finalized'
      ),
      arguments: [marketState],
    });
  }

  /**
   * Validate outcome index is within bounds
   *
   * Panics if outcome index >= outcome count.
   */
  static validateOutcome(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      marketState: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'market_state',
        'validate_outcome'
      ),
      arguments: [config.marketState, tx.pure.u64(config.outcomeIdx)],
    });
  }

  // ============================================================================
  // Query Functions
  // ============================================================================

  /**
   * Get market ID
   */
  static marketId(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'market_state', 'market_id'),
      arguments: [marketState],
    });
  }

  /**
   * Get outcome count
   */
  static outcomeCount(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'market_state', 'outcome_count'),
      arguments: [marketState],
    });
  }

  /**
   * Check if trading is active
   *
   * @returns True if market is in Trading status
   */
  static isTradingActive(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'is_trading_active'
      ),
      arguments: [marketState],
    });
  }

  /**
   * Check if market is finalized
   *
   * @returns True if winner has been determined
   */
  static isFinalized(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'market_state', 'is_finalized'),
      arguments: [marketState],
    });
  }

  /**
   * Get DAO ID
   */
  static daoId(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'market_state', 'dao_id'),
      arguments: [marketState],
    });
  }

  /**
   * Get winning outcome index
   *
   * Only valid after finalization.
   *
   * @returns Winning outcome index
   */
  static getWinningOutcome(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'get_winning_outcome'
      ),
      arguments: [marketState],
    });
  }

  /**
   * Get outcome message/description for a specific outcome
   *
   * @returns Outcome message string
   */
  static getOutcomeMessage(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      marketState: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'market_state',
        'get_outcome_message'
      ),
      arguments: [config.marketState, tx.pure.u64(config.outcomeIdx)],
    });
  }

  /**
   * Get market creation timestamp
   *
   * @returns Creation time in milliseconds
   */
  static getCreationTime(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'get_creation_time'
      ),
      arguments: [marketState],
    });
  }

  /**
   * Get trading end timestamp
   *
   * @returns End time in milliseconds (if set)
   */
  static getTradingEndTime(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'get_trading_end_time'
      ),
      arguments: [marketState],
    });
  }

  /**
   * Get trading start timestamp
   *
   * @returns Start time in milliseconds (if set)
   */
  static getTradingStart(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'get_trading_start'
      ),
      arguments: [marketState],
    });
  }

  /**
   * Get finalization timestamp
   *
   * @returns Finalization time in milliseconds (if finalized)
   */
  static getFinalizationTime(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'get_finalization_time'
      ),
      arguments: [marketState],
    });
  }

  // ============================================================================
  // Execution Window Functions (Added for execution-required finalization)
  // ============================================================================

  /**
   * Assert swaps are allowed on conditional AMMs
   *
   * Swaps are allowed during:
   * 1. Normal trading (trading_started && !trading_ended && before scheduled trading_end)
   * 2. Execution window (in_execution_window && !finalized && before execution deadline)
   *
   * This is different from assertTradingActive because TWAP measurement
   * ends when trading ends, but conditional swaps should continue during
   * the 30-minute execution window.
   */
  static assertSwapsAllowed(tx: Transaction, marketsPackageId: string, marketState: ReturnType<Transaction['moveCall']>): void;
  static assertSwapsAllowed(
    tx: Transaction,
    config: { marketsPackageId: string; marketState: ReturnType<Transaction['moveCall']>; clock?: string }
  ): void;
  static assertSwapsAllowed(tx: Transaction, arg1: any, arg2?: any): void {
    const marketsPackageId = typeof arg1 === 'string' ? arg1 : arg1.marketsPackageId;
    const marketState = typeof arg1 === 'string' ? arg2 : arg1.marketState;
    const clock = typeof arg1 === 'string' ? '0x6' : (arg1.clock || '0x6');
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'assert_swaps_allowed'
      ),
      arguments: [marketState, tx.object(clock)],
    });
  }

  /**
   * Assert execution can proceed
   *
   * Validates:
   * - Market is in execution window
   * - Execution deadline has not passed
   */
  static assertCanExecute(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      marketState: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'market_state',
        'assert_can_execute'
      ),
      arguments: [config.marketState, tx.object(config.clock || '0x6')],
    });
  }

  /**
   * Start the execution window after TWAP measurement ends
   *
   * This captures the TWAP snapshot and determines the "market winner".
   * Trading continues during the execution window (conditional AMMs remain active).
   * Requires MarketStateMutationAuth for authorization.
   */
  static startExecutionWindow(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      marketState: ReturnType<Transaction['moveCall']>;
      executionWindowMs: number;
      frozenTwaps: ReturnType<Transaction['moveCall']>;
      marketWinner: number;
      clock?: string;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'market_state',
        'start_execution_window'
      ),
      arguments: [
        config.marketState,
        tx.pure.u64(config.executionWindowMs),
        config.frozenTwaps,
        tx.pure.u64(config.marketWinner),
        tx.object(config.clock || '0x6'),
        config.auth,
      ],
    });
  }

  /**
   * Finalize immediately with REJECT (fast path when TWAP shows REJECT wins)
   *
   * No execution window needed since there are no actions to execute.
   * Requires MarketStateMutationAuth for authorization.
   */
  static finalizeImmediatelyWithReject(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      marketState: ReturnType<Transaction['moveCall']>;
      frozenTwaps: ReturnType<Transaction['moveCall']>;
      clock?: string;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'market_state',
        'finalize_immediately_with_reject'
      ),
      arguments: [
        config.marketState,
        config.frozenTwaps,
        tx.object(config.clock || '0x6'),
        config.auth,
      ],
    });
  }

  /**
   * Finalize from execution success
   *
   * Called when execution succeeds within the execution window.
   * The market winner becomes the actual winner.
   * Requires MarketStateMutationAuth for authorization.
   */
  static finalizeFromExecutionSuccess(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      marketState: ReturnType<Transaction['moveCall']>;
      clock?: string;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'market_state',
        'finalize_from_execution_success'
      ),
      arguments: [config.marketState, tx.object(config.clock || '0x6'), config.auth],
    });
  }

  /**
   * Finalize from timeout
   *
   * Called by anyone when execution window expires without successful execution.
   * REJECT wins regardless of what TWAP said.
   * Requires MarketStateMutationAuth for authorization.
   */
  static finalizeFromTimeout(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      marketState: ReturnType<Transaction['moveCall']>;
      clock?: string;
      auth: ReturnType<Transaction['moveCall']>;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'market_state',
        'finalize_from_timeout'
      ),
      arguments: [config.marketState, tx.object(config.clock || '0x6'), config.auth],
    });
  }

  /**
   * Check if market is in execution window
   */
  static isInExecutionWindow(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'is_in_execution_window'
      ),
      arguments: [marketState],
    });
  }

  /**
   * Get the market winner (what TWAP said should win)
   *
   * Only valid after execution window starts.
   * The actual winner depends on whether execution succeeds.
   */
  static getMarketWinner(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'get_market_winner'
      ),
      arguments: [marketState],
    });
  }

  /**
   * Get the execution deadline timestamp
   *
   * Only valid after execution window starts.
   */
  static getExecutionDeadline(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'get_execution_deadline'
      ),
      arguments: [marketState],
    });
  }

  /**
   * Get the frozen TWAP values captured when execution window started
   */
  static getFrozenTwaps(
    tx: Transaction,
    marketsPackageId: string,
    marketState: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'market_state',
        'get_frozen_twaps'
      ),
      arguments: [marketState],
    });
  }
}
