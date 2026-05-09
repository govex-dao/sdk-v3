/**
 * Vault Service - DAO vault operations
 *
 * Handles vault deposits, withdrawals, streams, and balance queries.
 *
 * @module services/dao/vault
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import { extractFields, StreamFields } from '../../types';
import { calculateStreamAvailableWithTracking } from '../../utils/stream';
import type { Packages, SharedObjects } from '../../types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

export interface DepositConfig {
  daoId: string;
  vaultName: string;
  coinId: string;
  coinType: string;
}

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
  totalAmount: bigint;
}

export interface VaultBalance {
  coinType: string;
  amount: bigint;
}

export interface VaultInfo {
  name: string;
  balances: VaultBalance[];
}

/**
 * VaultService - Vault operations for DAOs
 *
 * @example
 * ```typescript
 * // Deposit to vault
 * const tx = sdk.dao.vault.depositApproved({
 *   daoId: "0x123...",
 *   vaultName: "treasury",
 *   coinId: "0xabc...",
 *   coinType: "0x2::sui::SUI",
 * });
 *
 * // Get vault balance
 * const balance = await sdk.dao.vault.getBalance(daoId, "treasury", coinType);
 * ```
 */
export class VaultService {
  private client: SuiClient;
  private packages: Packages;
  private sharedObjects: SharedObjects;
  private configType: string;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
    this.sharedObjects = params.sharedObjects;
    this.configType = `${params.packages.futarchyCore}::futarchy_config::FutarchyConfig`;
  }

  // ============================================================================
  // DEPOSITS
  // ============================================================================

  /**
   * Deposit coins to vault (permissionless for approved coin types)
   */
  depositApproved(config: DepositConfig): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packages.accountActions}::vault::deposit_approved`,
      typeArguments: [this.configType, config.coinType],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
        tx.pure.string(config.vaultName),
        tx.object(config.coinId),
      ],
    });

    return tx;
  }

  /**
   * Deposit SUI to vault
   */
  depositSui(config: { daoId: string; vaultName: string; amount: bigint }): Transaction {
    const tx = new Transaction();

    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.amount)]);

    tx.moveCall({
      target: `${this.packages.accountActions}::vault::deposit_approved`,
      typeArguments: [this.configType, '0x2::sui::SUI'],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
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
  claimStream(_config: {
    daoId: string;
    vaultName: string;
    streamId: string;
    amount: bigint;
    coinType: string;
    clockId?: string;
  }): Transaction {
    throw new Error(
      'claimStream is no longer supported for vault streams. ' +
      'Use intent execution with CollectStream + StreamCap.'
    );
  }

  /**
   * @deprecated
   * Vault streams are DAO-controlled and non-transferable.
   */
  transferStream(_config: {
    daoId: string;
    vaultName: string;
    streamId: string;
    newBeneficiary: string;
    coinType: string;
  }): Transaction {
    throw new Error('transferStream is not supported for vault streams.');
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get vault balance for a specific coin type
   */
  async getBalance(daoId: string, vaultName: string, coinType: string): Promise<bigint> {
    // Use devInspect to call the on-chain coin_type_value view function.
    // Previous dynamic-field approach broke because Vault is keyed by
    // VaultKey(String), not bare String, and the Vault struct field is
    // `bag`, not `balances`.
    try {
      const tx = new Transaction();
      const vault = tx.moveCall({
        target: `${this.packages.accountActions}::vault::borrow_vault`,
        typeArguments: [],
        arguments: [
          tx.object(daoId),
          tx.object(this.sharedObjects.packageRegistry.id),
          tx.pure.string(vaultName),
        ],
      });
      tx.moveCall({
        target: `${this.packages.accountActions}::vault::coin_type_value`,
        typeArguments: [coinType],
        arguments: [vault],
      });

      const result = await this.client.devInspectTransactionBlock({
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
        transactionBlock: tx,
      });

      if (!result.results?.[1]?.returnValues?.[0]) {
        return 0n;
      }

      return BigInt(bcs.u64().parse(new Uint8Array(result.results[1].returnValues[0][0])));
    } catch {
      return 0n;
    }
  }

  /**
   * Get stream info
   */
  async getStream(streamId: string): Promise<StreamInfo | null> {
    try {
      const obj = await this.client.getObject({
        id: streamId,
        options: { showContent: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        return null;
      }

      const fields = extractFields<StreamFields>(obj);
      if (!fields) return null;

      return {
        id: streamId,
        beneficiary: fields.beneficiary,
        amountPerIteration: BigInt(fields.amount_per_iteration),
        claimedAmount: BigInt(fields.claimed_amount || fields.iterations_claimed || 0),
        firstUnclaimedIteration: fields.first_unclaimed_iteration !== undefined ? BigInt(fields.first_unclaimed_iteration) : undefined,
        partialClaimedInIteration: fields.partial_claimed_in_iteration !== undefined ? BigInt(fields.partial_claimed_in_iteration) : undefined,
        startTime: Number(fields.start_time),
        claimWindowMs: fields.claim_window_ms ? Number(fields.claim_window_ms) : undefined,
        iterationsTotal: Number(fields.iterations_total),
        iterationPeriodMs: Number(fields.iteration_period_ms || fields.period_ms),
        totalAmount: BigInt(fields.amount_per_iteration) * BigInt(fields.iterations_total),
      };
    } catch {
      return null;
    }
  }

  /**
   * Get claimable amount for a stream
   */
  async getClaimableAmount(streamId: string): Promise<bigint> {
    const stream = await this.getStream(streamId);
    if (!stream) return 0n;

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
   * List streams for a beneficiary
   */
  async listStreamsForBeneficiary(beneficiary: string): Promise<StreamInfo[]> {
    const streamIds: string[] = [];
    let cursor: string | null | undefined = null;

    do {
      const result = await this.client.getOwnedObjects({
        owner: beneficiary,
        filter: {
          StructType: `${this.packages.accountActions}::vault::Stream`,
        },
        options: { showType: true },
        cursor: cursor || undefined,
        limit: 50,
      });

      for (const obj of result.data) {
        if (obj.data?.objectId) {
          streamIds.push(obj.data.objectId);
        }
      }

      cursor = result.hasNextPage ? result.nextCursor : null;
    } while (cursor);

    if (streamIds.length === 0) {
      return [];
    }

    const streams = await Promise.all(streamIds.map((streamId) => this.getStream(streamId)));
    return streams.filter((stream): stream is StreamInfo => stream !== null);
  }

  /**
   * Get total balance of a coin type across ALL vaults (on-chain view function)
   *
   * Useful for NAV calculations that need to aggregate treasury holdings.
   * Uses devInspect to call on-chain view function for accuracy and efficiency.
   *
   * @param daoId - DAO account object ID
   * @param coinType - Coin type to get total balance for
   * @returns Total balance across all vaults
   */
  async getTotalBalance(daoId: string, coinType: string): Promise<bigint> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.packages.accountActions}::vault::get_total_balance`,
      typeArguments: [this.configType, coinType],
      arguments: [
        tx.object(daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
      ],
    });

    const result = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    if (!result.results?.[0]?.returnValues?.[0]) {
      return 0n;
    }

    return BigInt(bcs.u64().parse(new Uint8Array(result.results[0].returnValues[0][0])));
  }

  /**
   * Get the number of vaults for a DAO (on-chain view function)
   *
   * Uses devInspect for a single RPC call instead of fetching all vaults.
   */
  async getVaultCount(daoId: string): Promise<number> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.packages.accountActions}::vault::vault_count`,
      typeArguments: [],
      arguments: [
        tx.object(daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
      ],
    });

    const result = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    if (!result.results?.[0]?.returnValues?.[0]) {
      return 0;
    }

    return Number(bcs.u64().parse(new Uint8Array(result.results[0].returnValues[0][0])));
  }

  /**
   * Get the list of vault names for a DAO (on-chain view function)
   *
   * Uses devInspect for a single RPC call instead of fetching all vaults.
   */
  async getVaultNames(daoId: string): Promise<string[]> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.packages.accountActions}::vault::vault_names`,
      typeArguments: [],
      arguments: [
        tx.object(daoId),
        tx.object(this.sharedObjects.packageRegistry.id),
      ],
    });

    const result = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    if (!result.results?.[0]?.returnValues?.[0]) {
      return [];
    }

    // Parse vector<String> - BCS format: length prefix + concatenated strings
    const bytes = new Uint8Array(result.results[0].returnValues[0][0]);
    const vectorOfString = bcs.vector(bcs.string());
    return vectorOfString.parse(bytes);
  }

  /**
   * Get the maximum number of vaults allowed per account
   */
  getMaxVaults(): number {
    return 10; // MAX_VAULTS constant from Move
  }

  /**
   * List all vaults and their balances for a DAO
   *
   * @param daoId - DAO account object ID
   * @returns Array of vault info with all coin balances
   */
  async listVaults(daoId: string): Promise<VaultInfo[]> {
    const vaults: VaultInfo[] = [];

    try {
      // Get all dynamic fields on the DAO account
      const fields = await this.client.getDynamicFields({ parentId: daoId });

      for (const field of fields.data) {
        // Check if this is a vault (keyed by VaultKey which wraps a String)
        // The type will be something like "0x...::vault::VaultKey"
        if (!field.name.type.includes('::vault::VaultKey')) {
          continue;
        }

        // Get the vault name from the key
        const vaultName = (field.name.value as { name: string }).name;

        // Get the vault object
        const vaultObj = await this.client.getDynamicFieldObject({
          parentId: daoId,
          name: field.name,
        });

        if (!vaultObj.data?.content || vaultObj.data.content.dataType !== 'moveObject') {
          continue;
        }

        const vaultFields = extractFields<any>(vaultObj);
        if (!vaultFields) continue;

        // The DynamicField wrapper has { id, name, value } where value is the
        // Vault struct. The Vault struct has a `bag` field (Bag) for balances.
        const vaultValue = vaultFields.value;
        const balancesBagId = vaultValue?.fields?.bag?.fields?.id?.id;
        if (!balancesBagId) {
          vaults.push({ name: vaultName, balances: [] });
          continue;
        }

        // Get all balances in the bag
        const balanceFields = await this.client.getDynamicFields({ parentId: balancesBagId });
        const balances: VaultBalance[] = [];

        for (const balanceField of balanceFields.data) {
          // The key is a TypeName containing the coin type
          const coinType = balanceField.name.value as string;

          // Get the balance value
          const balanceObj = await this.client.getDynamicFieldObject({
            parentId: balancesBagId,
            name: balanceField.name,
          });

          if (balanceObj.data?.content && balanceObj.data.content.dataType === 'moveObject') {
            const fields = balanceObj.data.content.fields as { value?: string };
            const amount = BigInt(fields.value || '0');
            if (amount > 0n) {
              balances.push({ coinType, amount });
            }
          }
        }

        vaults.push({ name: vaultName, balances });
      }
    } catch (error) {
      console.error('Error listing vaults:', error);
    }

    return vaults;
  }
}
