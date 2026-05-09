/**
 * Protective Ask Operations
 *
 * SDK module for interacting with the protective ask system.
 * Allows buyers to mint DAO tokens from a governance-created fixed-price ask wall.
 *
 * Release options:
 * - close(): Permissionless after release_duration_ms (if configured)
 * - cancel(): Via governance proposal (DAO can cancel anytime)
 *
 * @module protocol/futarchy/protective-ask
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Protective Ask Static Functions
 */
export class ProtectiveAsk {
  /**
   * Create a fixed-price protective ask.
   */
  static create(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      raiseTokenType: string;
      stableCoinType: string;
      accountId: string;
      poolId: string;
      pricePerToken: bigint;
      maxMintAmount: bigint;
      releaseDurationMs?: bigint;
      spotPoolMutationAuth: ReturnType<Transaction['object']>;
      clockId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_ask',
        'create'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [
        tx.pure.id(config.accountId),
        tx.pure.id(config.poolId),
        tx.pure.u64(config.pricePerToken),
        tx.pure.u64(config.maxMintAmount),
        tx.pure.u64(config.releaseDurationMs ?? 0n),
        config.spotPoolMutationAuth,
        tx.object(config.clockId),
      ],
    });
  }

  /**
   * Buy freshly minted DAO tokens from an active protective ask.
   */
  static buyFromAsk(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      configType: string;
      raiseTokenType: string;
      stableCoinType: string;
      lpType: string;
      askId: string;
      accountId: string;
      registryId: string;
      poolId: string;
      stablePayment: ReturnType<Transaction['object']>;
      assetAmount: bigint;
      clockId: string;
    }
  ) {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_ask',
        'buy_from_ask'
      ),
      typeArguments: [
        config.configType,
        config.raiseTokenType,
        config.stableCoinType,
        config.lpType,
      ],
      arguments: [
        tx.object(config.askId),
        tx.object(config.accountId),
        tx.object(config.registryId),
        tx.object(config.poolId),
        config.stablePayment,
        tx.pure.u64(config.assetAmount),
        tx.object(config.clockId),
      ],
    });
  }

  /**
   * Close an ask wall permissionlessly after its release deadline.
   */
  static close(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      raiseTokenType: string;
      stableCoinType: string;
      askId: string;
      accountId: string;
      registryId: string;
      clockId: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_ask',
        'close'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [
        tx.object(config.askId),
        tx.object(config.accountId),
        tx.object(config.registryId),
        tx.object(config.clockId),
      ],
    });
  }

  /**
   * Cancel an ask wall via governance-controlled mutation auth.
   */
  static cancel(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      raiseTokenType: string;
      stableCoinType: string;
      askId: string;
      accountId: string;
      registryId: string;
      spotPoolMutationAuth: ReturnType<Transaction['object']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_ask',
        'cancel'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [
        tx.object(config.askId),
        tx.object(config.accountId),
        tx.object(config.registryId),
        config.spotPoolMutationAuth,
      ],
    });
  }

  /**
   * Quote stable required to buy a given asset amount from the ask wall.
   */
  static quoteBuy(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      raiseTokenType: string;
      stableCoinType: string;
      ask: ReturnType<Transaction['moveCall']>;
      assetAmount: bigint;
      clockId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_ask',
        'quote_buy'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [
        config.ask,
        tx.pure.u64(config.assetAmount),
        tx.object(config.clockId),
      ],
    });
  }

  static remainingMintAmount(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      raiseTokenType: string;
      stableCoinType: string;
      ask: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_ask',
        'remaining_mint_amount'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [config.ask],
    });
  }

  static mintedAmount(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      raiseTokenType: string;
      stableCoinType: string;
      ask: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_ask',
        'minted_amount'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [config.ask],
    });
  }

  static stableCollectedAmount(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      raiseTokenType: string;
      stableCoinType: string;
      ask: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_ask',
        'stable_collected_amount'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [config.ask],
    });
  }

  static maxMintAmount(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      raiseTokenType: string;
      stableCoinType: string;
      ask: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_ask',
        'max_mint_amount'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [config.ask],
    });
  }

  static remainingStable(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      raiseTokenType: string;
      stableCoinType: string;
      ask: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_ask',
        'remaining_stable'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [config.ask],
    });
  }

  static pricePerToken(
    tx: Transaction,
    config: {
      marketsPackageId: string;
      raiseTokenType: string;
      stableCoinType: string;
      ask: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.marketsPackageId,
        'protective_ask',
        'price_per_token'
      ),
      typeArguments: [config.raiseTokenType, config.stableCoinType],
      arguments: [config.ask],
    });
  }
}
