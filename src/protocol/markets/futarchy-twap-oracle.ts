/**
 * Futarchy TWAP Oracle Operations
 *
 * Wrapper for `futarchy_markets_primitives::futarchy_twap_oracle`.
 * This is the TWAP source for conditional proposal trading strategy logic.
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

type OracleArg = ReturnType<Transaction['moveCall']> | ReturnType<Transaction['object']>;

export class FutarchyTwapOracle {
  /**
   * Create a new conditional-market TWAP oracle.
   *
   * On-chain signature:
   * `new_oracle(twap_initialization_price, twap_start_delay, twap_cap_ppm, ctx)`
   */
  static newOracle(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      initialPrice: bigint;
      twapStartDelay: bigint;
      twapCapPpm: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    const capPpm = config.twapCapPpm;

    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'futarchy_twap_oracle',
        'new_oracle'
      ),
      arguments: [
        tx.pure.u128(config.initialPrice),
        tx.pure.u64(config.twapStartDelay),
        tx.pure.u64(capPpm),
      ],
    });
  }

  /**
   * Write a TWAP observation.
   *
   * On-chain signature:
   * `write_observation(&mut oracle, timestamp, price, clock)`
   */
  static writeObservation(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      oracle: OracleArg;
      timestamp: bigint;
      price: bigint;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'futarchy_twap_oracle',
        'write_observation'
      ),
      arguments: [
        config.oracle,
        tx.pure.u64(config.timestamp),
        tx.pure.u128(config.price),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Read current TWAP. Requires fresh observation semantics on-chain.
   */
  static getTwap(
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
        'futarchy_twap_oracle',
        'get_twap'
      ),
      arguments: [config.oracle, tx.object(config.clock || '0x6')],
    });
  }

  /**
   * Package-only on-chain, exposed here for package-internal flows.
   */
  static setOracleStartTime(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      oracle: OracleArg;
      startTime: bigint;
    }
  ): void {
    void tx;
    void config;
    throw new Error(
      'futarchy_twap_oracle::set_oracle_start_time is package-visible and cannot be called directly via SDK. ' +
      'Use conditional_amm::set_oracle_start_time through ConditionalAmm operations.'
    );
  }

  static lastPrice(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'futarchy_twap_oracle', 'last_price'),
      arguments: [oracle],
    });
  }

  static lastTimestamp(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'futarchy_twap_oracle',
        'last_timestamp'
      ),
      arguments: [oracle],
    });
  }

  static config(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'futarchy_twap_oracle', 'config'),
      arguments: [oracle],
    });
  }

  static marketStartTime(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'futarchy_twap_oracle',
        'market_start_time'
      ),
      arguments: [oracle],
    });
  }

  static twapInitializationPrice(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'futarchy_twap_oracle',
        'twap_initialization_price'
      ),
      arguments: [oracle],
    });
  }

  static totalCumulativePrice(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'futarchy_twap_oracle',
        'total_cumulative_price'
      ),
      arguments: [oracle],
    });
  }

  static id(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'futarchy_twap_oracle', 'id'),
      arguments: [oracle],
    });
  }

  static oracleId(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(marketsPackageId, 'futarchy_twap_oracle', 'oracle_id'),
      arguments: [oracle],
    });
  }

  static getFullState(
    tx: Transaction,
    marketsPackageId: string,
    oracle: OracleArg
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        marketsPackageId,
        'futarchy_twap_oracle',
        'get_full_state'
      ),
      arguments: [oracle],
    });
  }
}
