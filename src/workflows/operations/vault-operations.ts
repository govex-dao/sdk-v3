/**
 * Vault Operations - High-level vault management
 *
 * Provides simple, user-friendly API for managing DAO vaults.
 * Hides all complexity: package IDs, type arguments, auth patterns, etc.
 *
 * @module vault-operations
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import { BaseTransactionBuilder, TransactionUtils } from '../../services/transaction';
import { extractFields, StreamFields } from '../../types';
import { calculateStreamAvailableWithTracking } from '../../utils/stream';

/**
 * Configuration for VaultOperations
 */
export interface VaultOperationsConfig {
  client: SuiClient;
  accountActionsPackageId: string;
  futarchyCorePackageId: string;
  packageRegistryId: string;
}

/**
 * Stream configuration
 */
export interface CreateStreamConfig {
  daoId: string;
  vaultName: string;
  beneficiary: string;
  totalAmount: bigint;
  startTime: number;
  vestingPeriodMs: number;
  iterations?: number;
  claimWindowMs?: number;
  coinType: string;
  // Note: Vault streams are always DAO-controlled (cancellable, non-transferable).
  // For transferable vestings with beneficiary control, use the standalone vesting module.
}

/**
 * Stream info
 * Note: Vault streams are always DAO-controlled (cancellable, non-transferable).
 * For transferable vestings with beneficiary control, use the standalone vesting module.
 */
export interface StreamInfo {
  id: string;
  beneficiary?: string;
  amountPerIteration: bigint;
  claimedAmount: bigint;
  firstUnclaimedIteration?: bigint;
  partialClaimedInIteration?: bigint;
  startTime: number;
  claimWindowMs?: number;
  iterationsTotal: number;
  iterationPeriodMs: number;
  /** Computed: amountPerIteration * iterationsTotal */
  totalAmount: bigint;
}

/**
 * Vault info
 */
export interface VaultInfo {
  name: string;
  balances: { coinType: string; amount: bigint }[];
  approvedCoinTypes: string[];
}

/**
 * High-level vault operations
 *
 * @example
 * ```typescript
 * // Deposit to vault (permissionless for approved types)
 * const tx = sdk.vault.depositApproved({
 *   daoId: "0x123...",
 *   vaultName: "treasury",
 *   coinId: "0xabc...",
 *   coinType: "0x2::sui::SUI",
 * });
 *
 * // Create vesting stream
 * const tx = sdk.vault.createStream({
 *   daoId: "0x123...",
 *   vaultName: "treasury",
 *   beneficiary: "0xdef...",
 *   totalAmount: 1_000_000n,
 *   startTime: Date.now(),
 *   vestingPeriodMs: 365 * 24 * 60 * 60 * 1000, // 1 year
 *   iterations: 12, // Monthly
 *   coinType: "0x...::token::TOKEN",
 * });
 * ```
 */
export class VaultOperations {
  private client: SuiClient;
  private accountActionsPackageId: string;
  private packageRegistryId: string;
  private configType: string;

  constructor(config: VaultOperationsConfig) {
    this.client = config.client;
    this.accountActionsPackageId = config.accountActionsPackageId;
    this.packageRegistryId = config.packageRegistryId;
    this.configType = `${config.futarchyCorePackageId}::futarchy_config::FutarchyConfig`;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Extract coin type from a coin object ID
   */
  private async getCoinType(coinId: string): Promise<string> {
    const obj = await this.client.getObject({
      id: coinId,
      options: { showType: true },
    });

    if (!obj.data?.type) {
      throw new Error(`Could not determine type for coin: ${coinId}`);
    }

    // Extract type from "0x2::coin::Coin<TYPE>"
    const match = obj.data.type.match(/0x2::coin::Coin<(.+)>/);
    if (!match) {
      throw new Error(`Invalid coin type format: ${obj.data.type}`);
    }

    return match[1];
  }

  // ============================================================================
  // DEPOSITS
  // ============================================================================

  /**
   * Deposit coins to vault (permissionless for approved coin types)
   *
   * Anyone can deposit approved coin types. This is useful for
   * revenue sharing, donations, etc.
   *
   * @param config - Deposit configuration
   * @returns Transaction to execute
   *
   * @example
   * ```typescript
   * const tx = await sdk.vault.depositApproved({
   *   daoId: "0x123...",
   *   vaultName: "treasury",
   *   coinId: "0xabc...",
   * });
   * ```
   */
  async depositApproved(config: {
    daoId: string;
    vaultName: string;
    coinId: string;
  }): Promise<Transaction> {
    // Auto-fetch coinType from coinId
    const coinType = await this.getCoinType(config.coinId);

    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.accountActionsPackageId,
        'vault',
        'deposit_approved'
      ),
      typeArguments: [this.configType, coinType],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.packageRegistryId),
        tx.pure.string(config.vaultName),
        tx.object(config.coinId),
      ],
    });

    return tx;
  }

  /**
   * Deposit coins from SUI gas (splits and deposits)
   *
   * Convenience method that splits SUI from gas and deposits.
   *
   * @param config - Deposit configuration
   * @returns Transaction to execute
   */
  depositSui(config: {
    daoId: string;
    vaultName: string;
    amount: bigint;
  }): Transaction {
    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    // Split SUI from gas
    const coin = builder.splitSui(config.amount);

    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.accountActionsPackageId,
        'vault',
        'deposit_approved'
      ),
      typeArguments: [this.configType, '0x2::sui::SUI'],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.packageRegistryId),
        tx.pure.string(config.vaultName),
        coin,
      ],
    });

    return tx;
  }

  // ============================================================================
  // STREAMS
  // ============================================================================

  /**
   * @deprecated
   * Vault streams are now collected via governance intent execution
   * (`vault::do_collect_stream`) and require a `StreamCap`.
   */
  async claimStream(_config: {
    streamId: string;
  }): Promise<Transaction> {
    throw new Error(
      'claimStream is no longer supported for vault streams. ' +
      'Use intent execution with CollectStream + StreamCap.'
    );
  }

  /**
   * @deprecated
   * Vault streams are DAO-controlled and non-transferable.
   */
  async transferStream(_config: {
    streamId: string;
    newBeneficiary: string;
  }): Promise<Transaction> {
    throw new Error('transferStream is not supported for vault streams.');
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get vault balance for a specific coin type
   *
   * @param daoId - DAO account ID
   * @param vaultName - Vault name
   * @param coinType - Coin type to check
   * @returns Balance amount
   *
   * @example
   * ```typescript
   * const balance = await sdk.vault.getBalance(
   *   "0x123...",
   *   "treasury",
   *   "0x2::sui::SUI"
   * );
   * ```
   */
  async getBalance(
    daoId: string,
    vaultName: string,
    coinType: string
  ): Promise<bigint> {
    const tx = new Transaction();
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.accountActionsPackageId,
        'vault',
        'balance'
      ),
      typeArguments: [this.configType, coinType],
      arguments: [
        tx.object(daoId),
        tx.object(this.packageRegistryId),
        tx.pure.string(vaultName),
      ],
    });

    const result = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    const raw = result.results?.[0]?.returnValues?.[0]?.[0];
    if (!raw) return 0n;
    return BigInt(bcs.u64().parse(new Uint8Array(raw)));
  }

  /**
   * Get stream information
   *
   * @param streamId - Stream object ID
   * @returns Stream info
   *
   * @example
   * ```typescript
   * const stream = await sdk.vault.getStream("0x123...");
   * console.log(`Claimed: ${stream.claimedAmount}/${stream.totalAmount}`);
   * ```
   */
  async getStream(streamId: string): Promise<StreamInfo> {
    const obj = await this.client.getObject({
      id: streamId,
      options: { showContent: true },
    });

    const fields = extractFields<StreamFields>(obj);
    if (!fields) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    const amountPerIteration = BigInt(fields.amount_per_iteration || 0);
    const iterationsTotal = Number(fields.iterations_total || 0);

    return {
      id: streamId,
      beneficiary: fields.beneficiary || '',
      amountPerIteration,
      claimedAmount: BigInt(fields.claimed_amount || 0),
      firstUnclaimedIteration: fields.first_unclaimed_iteration !== undefined ? BigInt(fields.first_unclaimed_iteration) : undefined,
      partialClaimedInIteration: fields.partial_claimed_in_iteration !== undefined ? BigInt(fields.partial_claimed_in_iteration) : undefined,
      startTime: Number(fields.start_time || 0),
      claimWindowMs: fields.claim_window_ms ? Number(fields.claim_window_ms) : undefined,
      iterationsTotal,
      iterationPeriodMs: Number(fields.iteration_period_ms || fields.period_ms || 0),
      totalAmount: amountPerIteration * BigInt(iterationsTotal),
    };
  }

  /**
   * Get claimable amount from a stream
   *
   * @param streamId - Stream object ID
   * @returns Claimable amount
   */
  async getClaimableAmount(streamId: string): Promise<bigint> {
    const stream = await this.getStream(streamId);
    try {
      return calculateStreamAvailableWithTracking({
        amountPerIteration: stream.amountPerIteration,
        firstUnclaimedIteration: stream.firstUnclaimedIteration ?? 0n,
        partialClaimedInIteration: stream.partialClaimedInIteration ?? 0n,
        startTimeMs: BigInt(stream.startTime),
        iterationsTotal: BigInt(stream.iterationsTotal),
        iterationPeriodMs: BigInt(stream.iterationPeriodMs),
        currentTimeMs: BigInt(Date.now()),
        claimWindowMs: stream.claimWindowMs !== undefined ? BigInt(stream.claimWindowMs) : undefined,
      });
    } catch {
      return 0n;
    }
  }

  /**
   * List all streams for a beneficiary
   *
   * @param beneficiary - Beneficiary address
   * @returns Array of stream IDs
   */
  async listStreamsForBeneficiary(beneficiary: string): Promise<string[]> {
    // Query owned objects of type Stream
    const result = await this.client.getOwnedObjects({
      owner: beneficiary,
      filter: {
        StructType: `${this.accountActionsPackageId}::vault::Stream`,
      },
      options: { showType: true },
    });

    return result.data.map((obj) => obj.data?.objectId || '').filter(Boolean);
  }

}
