/**
 * PCW TWAP Oracle Operations
 *
 * Price-Cumulative-Weighted Time-Weighted Average Price oracle.
 * Advanced TWAP implementation with checkpointing and movement limits.
 *
 * Scoped to spot/oracle-action style flows.
 * Conditional proposal trading strategies should use futarchy_twap_oracle signals.
 *
 * @module pcw-twap-oracle
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

type OracleArg = ReturnType<Transaction['moveCall']> | ReturnType<Transaction['object']>;

/**
 * PCW TWAP Oracle Static Functions
 *
 * Manage advanced TWAP oracle with checkpointing.
 * For spot/oracle-action flows only; do not use for conditional proposal strategy routing.
 *
 * @example Create new PCW oracle
 * ```typescript
 * const oracle = PCWTwapOracle.newDefault(tx, {
 *   marketsPackageId,
 *   initialPrice: 1_000_000_000n, // $1
 *   clock: '0x6',
 * });
 * ```
 */
export class PCWTwapOracle {
  // ============================================================================
  // Creation
  // ============================================================================

  /**
   * Create new PCW TWAP oracle with default parameters
   *
   * Uses standard configuration:
   * - 7 day window size
   * - 10% max movement per update
   *
   * @param tx - Transaction
   * @param config - Oracle configuration
   * @returns PCW_TWAP_Oracle object
   *
   * @example
   * ```typescript
   * const oracle = PCWTwapOracle.newDefault(tx, {
   *   marketsPackageId,
   *   initialPrice: 1_000_000_000n, // $1
   *   clock: '0x6',
   * });
   * ```
   */
  static newDefault(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      initialPrice: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'PCW_TWAP_oracle',
        'new_default'
      ),
      arguments: [tx.pure.u128(config.initialPrice), tx.object(config.clock || '0x6')],
    });
  }

  /**
   * Create new PCW TWAP oracle with custom parameters
   *
   * @param tx - Transaction
   * @param config - Oracle configuration
   * @returns PCW_TWAP_Oracle object
   *
   * @example
   * ```typescript
   * const oracle = PCWTwapOracle.new(tx, {
   *   marketsPackageId,
   *   initialPrice: 1_000_000_000n, // $1
   *   windowSizeMs: 7 * 24 * 60 * 60 * 1000n, // 7 days
   *   maxMovementPpm: 100_000n, // 10%
   *   clock: '0x6',
   * });
   * ```
   */
  static new(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      initialPrice: bigint;
      windowSizeMs: bigint;
      maxMovementPpm: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsPackageId, 'PCW_TWAP_oracle', 'new'),
      arguments: [
        tx.pure.u128(config.initialPrice),
        tx.pure.u64(config.windowSizeMs),
        tx.pure.u64(config.maxMovementPpm),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // ============================================================================
  // Update Functions
  // ============================================================================

  /**
   * Update oracle with new price observation
   *
   * Records new price and updates cumulative values.
   * Automatically commits checkpoint if needed.
   *
   * @param tx - Transaction
   * @param config - Update configuration
   */
  static update(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      oracle: OracleArg;
      newPrice: bigint;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsPackageId, 'PCW_TWAP_oracle', 'update'),
      arguments: [config.oracle, tx.pure.u128(config.newPrice), tx.object(config.clock || '0x6')],
    });
  }

  /**
   * Try to commit checkpoint
   *
   * Commits checkpoint if conditions are met.
   * Returns true if checkpoint was committed.
   *
   * @returns True if checkpoint committed
   */
  static tryCommitCheckpoint(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      oracle: OracleArg;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'PCW_TWAP_oracle',
        'try_commit_checkpoint'
      ),
      arguments: [config.oracle, tx.object(config.clock || '0x6')],
    });
  }

  // ============================================================================
  // TWAP Query Functions
  // ============================================================================

  /**
   * Get current TWAP
   *
   * Returns the last finalized window's capped TWAP.
   * This is O(1) - just returns a stored value.
   *
   * @param tx - Transaction
   * @param config - Query configuration
   * @returns TWAP value as u128
   *
   * @example
   * ```typescript
   * const twap = PCWTwapOracle.getTwap(tx, {
   *   marketsPackageId,
   *   oracle,
   * });
   * ```
   */
  static getTwap(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      oracle: OracleArg;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'PCW_TWAP_oracle',
        'get_twap'
      ),
      arguments: [config.oracle],
    });
  }

  /**
   * Get window TWAP
   *
   * Calculate TWAP for specific time window.
   *
   * @returns TWAP for window
   */
  static getWindowTwap(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      oracle: OracleArg;
      windowMs: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'PCW_TWAP_oracle',
        'get_window_twap'
      ),
      arguments: [config.oracle, tx.pure.u64(config.windowMs), tx.object(config.clock || '0x6')],
    });
  }

  /**
   * Get 90-day TWAP
   *
   * Calculate TWAP over 90-day period.
   *
   * @returns 90-day TWAP
   */
  static getNinetyDayTwap(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      oracle: OracleArg;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'PCW_TWAP_oracle',
        'get_ninety_day_twap'
      ),
      arguments: [config.oracle, tx.object(config.clock || '0x6')],
    });
  }

  /**
   * Check if oracle is ready
   *
   * Returns true if oracle has sufficient data for TWAP.
   *
   * @returns True if TWAP can be calculated
   */
  static isReady(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      oracle: OracleArg;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.marketsPackageId, 'PCW_TWAP_oracle', 'is_ready'),
      arguments: [config.oracle, tx.object(config.clock || '0x6')],
    });
  }

  // ============================================================================
  // Configuration Queries
  // ============================================================================

  /**
   * Get window size in milliseconds
   *
   * @returns Window size for TWAP calculation
   */
  static windowSizeMs(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'PCW_TWAP_oracle',
        'window_size_ms'
      ),
      arguments: [oracle],
    });
  }

  /**
   * Get maximum movement in parts per million
   *
   * @returns Max price movement allowed per update (ppm)
   */
  static maxMovementPpm(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'PCW_TWAP_oracle',
        'max_movement_ppm'
      ),
      arguments: [oracle],
    });
  }

  // ============================================================================
  // State Queries
  // ============================================================================

  /**
   * Get last recorded price
   *
   * @returns Most recent price observation
   */
  static lastPrice(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'PCW_TWAP_oracle', 'last_price'),
      arguments: [oracle],
    });
  }

  /**
   * Get last update timestamp
   *
   * @returns Timestamp of most recent update (milliseconds)
   */
  static lastUpdate(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'PCW_TWAP_oracle', 'last_update'),
      arguments: [oracle],
    });
  }

  /**
   * Get initialization timestamp
   *
   * @returns Timestamp when oracle was created (milliseconds)
   */
  static initializedAt(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'PCW_TWAP_oracle',
        'initialized_at'
      ),
      arguments: [oracle],
    });
  }

  /**
   * Get cumulative total
   *
   * @returns Total cumulative price for TWAP calculation
   */
  static cumulativeTotal(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'PCW_TWAP_oracle',
        'cumulative_total'
      ),
      arguments: [oracle],
    });
  }

  /**
   * Compute cumulative capped-price × time at target timestamp.
   *
   * Simulates what catch_up_to + finalize_window would do without mutating state,
   * including triangle corrections for any pending unfinalised windows.
   *
   * @returns Cumulative price at timestamp
   */
  static cumulativeAt(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      oracle: OracleArg;
      timestamp: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'PCW_TWAP_oracle',
        'cumulative_at'
      ),
      arguments: [config.oracle, tx.pure.u64(config.timestamp)],
    });
  }

  /**
   * Get checkpoint at or before timestamp
   *
   * Finds most recent checkpoint at or before given time.
   *
   * @returns Checkpoint data
   */
  static checkpointAtOrBefore(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      oracle: OracleArg;
      timestamp: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'PCW_TWAP_oracle',
        'checkpoint_at_or_before'
      ),
      arguments: [config.oracle, tx.pure.u64(config.timestamp)],
    });
  }

}
