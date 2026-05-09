/**
 * Oracle Actions Operations
 *
 * Price-based grants that unlock tokens when price conditions are met.
 * Grants have multiple tiers, each with its own price threshold and recipients.
 *
 * @module oracle-actions
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import { BaseTransactionBuilder, TransactionUtils } from './transaction';
import { bcs } from '@mysten/sui/bcs';
import { extractFields, OracleGrantFields } from '../types';

export interface TierSpec {
  /** Price threshold for this tier (u128) */
  priceThreshold: bigint;
  /** True if trigger when price >= threshold, false if price <= threshold */
  isAbove: boolean;
  /** Recipients and their mint amounts */
  recipients: RecipientMint[];
  /** Description of this tier */
  tierDescription: string;
}

export interface RecipientMint {
  /** Address to receive tokens */
  recipient: string;
  /** Amount to mint for this recipient */
  amount: bigint | number;
}

// NOTE: CreateGrantConfig removed with createGrant() -- use governance (do_create_oracle_grant) instead.

export interface ClaimGrantConfig {
  /** DAO account ID */
  accountId: string;
  /** Asset token type */
  assetType: string;
  /** Stable token type */
  stableType: string;
  /** LP type for the spot pool used in price checks */
  lpType: string;
  /** Grant object ID */
  grantId: string;
  /** Tier index to claim */
  tierIndex: number;
  /** Recipient address for minted tokens */
  recipient: string;
  /** Spot pool ID for price checking */
  spotPoolId: string;
  /** Clock object (defaults to 0x6) */
  clock?: string;
}

/**
 * Oracle Actions for price-based grants
 *
 * NOTE: createGrant() and cancelGrant() were removed because the underlying Move
 * functions are package-private / test-only. Grants are created and cancelled
 * through governance (do_create_oracle_grant / do_cancel_grant).
 *
 * @example Claim a grant tier
 * ```typescript
 * const tx = sdk.oracleActions.claimGrantWithFulfill({
 *   accountId: daoId,
 *   assetType,
 *   stableType,
 *   lpType,
 *   grantId,
 *   tierIndex: 0,
 *   spotPoolId,
 * });
 * ```
 */
export class OracleActionsOperations {
  private client: SuiClient;
  private oracleActionsPackageId: string;
  private packageRegistryId: string;

  constructor(
    client: SuiClient,
    oracleActionsPackageId: string,
    _accountProtocolPackageId: string,
    packageRegistryId: string,
    _futarchyCorePackageId: string
  ) {
    this.client = client;
    this.oracleActionsPackageId = oracleActionsPackageId;
    this.packageRegistryId = packageRegistryId;
  }

  // NOTE: createGrant() removed -- oracle_actions::create_grant is public(package),
  // cannot be called from external PTBs. Use governance (do_create_oracle_grant) instead.

  /**
   * Claim tokens from a grant tier (Step 1 of 2)
   *
   * This creates a ClaimRequest that must be fulfilled in the same transaction.
   * The two-step process validates price conditions before minting.
   *
   * @param config - Claim configuration
   * @returns Transaction for claiming grant
   *
   * @example
   * ```typescript
   * const tx = sdk.oracleActions.claimGrantWithFulfill({
   *   accountId: daoId,
   *   assetType,
   *   stableType,
   *   lpType,
   *   grantId,
   *   tierIndex: 0, // First tier
   *   spotPoolId,
   * });
   * ```
   */
  claimGrantWithFulfill(config: ClaimGrantConfig): Transaction {
    const builder = new BaseTransactionBuilder(this.client);
    const tx = builder.getTransaction();

    // Step 1: Create claim request
    const claimRequest = tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'claim_grant'
      ),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        tx.object(config.accountId), // account
        tx.object(this.packageRegistryId), // registry
        tx.object(config.grantId), // grant
        tx.pure.u64(config.tierIndex), // tier_index
        tx.pure.address(config.recipient), // recipient
        tx.object(config.spotPoolId), // spot_pool (PCW-backed geometric TWAP source)
        tx.object(config.clock || '0x6'), // clock
      ],
    });

    // Step 2: Fulfill claim (mint tokens)
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        this.oracleActionsPackageId,
        'oracle_actions',
        'fulfill_claim_grant_from_account'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        claimRequest, // request
        tx.object(config.grantId), // grant
        tx.object(config.accountId), // account
        tx.object(this.packageRegistryId), // registry
        tx.object(config.clock || '0x6'), // clock
      ],
    });

    return tx;
  }

  // Grant cancellation is handled through governance via do_cancel_grant.

  /**
   * View: Get total amount claimable in grant
   */
  async getTotalAmount(
    grantId: string,
    _assetType: string,
    _stableType: string
  ): Promise<bigint> {
    const grant = await this.client.getObject({
      id: grantId,
      options: { showContent: true },
    });

    const fields = extractFields<OracleGrantFields>(grant);
    if (!fields) {
      throw new Error('Grant not found');
    }

    return BigInt(fields.total_amount || 0);
  }

  /**
   * View: Check if grant is cancelled
   */
  async isCanceled(
    grantId: string,
    _assetType: string,
    _stableType: string
  ): Promise<boolean> {
    const grant = await this.client.getObject({
      id: grantId,
      options: { showContent: true },
    });

    const fields = extractFields<OracleGrantFields>(grant);
    if (!fields) {
      throw new Error('Grant not found');
    }

    return fields.canceled === true || fields.is_canceled === true;
  }

  /**
   * View: Get grant description
   */
  async getDescription(
    grantId: string,
    _assetType: string,
    _stableType: string
  ): Promise<string> {
    const grant = await this.client.getObject({
      id: grantId,
      options: { showContent: true },
    });

    const fields = extractFields<OracleGrantFields>(grant);
    if (!fields) {
      throw new Error('Grant not found');
    }

    return fields.description || '';
  }

  /**
   * View: Get number of tiers in grant
   */
  async getTierCount(
    grantId: string,
    _assetType: string,
    _stableType: string
  ): Promise<number> {
    const grant = await this.client.getObject({
      id: grantId,
      options: { showContent: true },
    });

    const fields = extractFields<OracleGrantFields>(grant);
    if (!fields) {
      throw new Error('Grant not found');
    }

    const tiers = fields.tiers || [];
    return tiers.length;
  }

  /**
   * Helper: Calculate absolute price from launchpad price and multiplier
   *
   * @param launchpadPrice - Initial launchpad price (u128)
   * @param multiplier - Multiplier (e.g., 2 for 2x)
   * @returns Absolute price threshold
   *
   * @example
   * ```typescript
   * // If launched at $0.10, 10x = $1.00
   * const threshold = OracleActionsOperations.calculateAbsoluteThreshold(
   *   100_000_000_000n, // $0.10 (1e12 scale)
   *   10 // 10x
   * ); // Returns 1_000_000_000_000n ($1.00)
   * ```
   */
  static calculateAbsoluteThreshold(
    launchpadPrice: bigint,
    multiplier: number
  ): bigint {
    return launchpadPrice * BigInt(multiplier);
  }

  /**
   * View: Get all grant IDs for a DAO
   *
   * @param accountId - DAO account ID
   * @returns Promise with array of grant IDs
   */
  async getAllGrantIds(accountId: string): Promise<string[]> {
    const tx = new Transaction();

    const result = await this.client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: (() => {
        tx.moveCall({
          target: TransactionUtils.buildTarget(
            this.oracleActionsPackageId,
            'oracle_actions',
            'get_all_grant_ids'
          ),
          arguments: [
            tx.object(accountId),
            tx.object(this.packageRegistryId),
          ],
        });
        return tx;
      })(),
    });

    if (result.results && result.results[0]?.returnValues) {
      // Parse vector<ID> from BCS bytes using @mysten/sui bcs
      try {
        const [returnValue] = result.results[0].returnValues;
        if (returnValue && returnValue[0]) {
          const bytes = new Uint8Array(returnValue[0]);
          return decodeVectorIdBytes(bytes);
        }
      } catch {
        // Deserialization failed, return empty array
      }
    }

    return [];
  }
}

function decodeVectorIdBytes(bytes: Uint8Array): string[] {
  try {
    const parsed = bcs.vector(bcs.Address).parse(bytes);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => normalizeHexId(v));
    }
  } catch {
    // Fallback to manual parser below.
  }

  const [length, startOffset] = decodeUleb128(bytes, 0);
  const ids: string[] = [];
  let offset = startOffset;

  for (let i = 0; i < length; i++) {
    if (offset + 32 > bytes.length) break;
    ids.push(normalizeHexId(bytes.slice(offset, offset + 32)));
    offset += 32;
  }

  return ids;
}

function decodeUleb128(bytes: Uint8Array, start: number): [number, number] {
  let value = 0;
  let shift = 0;
  let offset = start;

  while (offset < bytes.length) {
    const byte = bytes[offset];
    value |= (byte & 0x7f) << shift;
    offset += 1;
    if ((byte & 0x80) === 0) {
      return [value, offset];
    }
    shift += 7;
    if (shift > 35) break;
  }

  return [0, start];
}

function normalizeHexId(value: unknown): string {
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array)) {
    const record = value as Record<string, unknown>;
    const nested =
      record.id ??
      record.objectId ??
      record.object_id ??
      record.bytes ??
      (record.fields && typeof record.fields === 'object'
        ? ((record.fields as Record<string, unknown>).id ??
          (record.fields as Record<string, unknown>).bytes)
        : undefined);
    if (nested !== undefined) return normalizeHexId(nested);
  }
  if (typeof value === 'string') {
    return value.startsWith('0x') ? value : `0x${value}`;
  }
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  if (Array.isArray(value)) {
    const arr = Uint8Array.from(value as number[]);
    return `0x${Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return String(value);
}

// NOTE: OracleActionMarkers removed -- create_oracle_grant_marker and cancel_grant_marker
// do not exist in the Move contract. The marker types (CreateOracleGrant<A,S> and
// CancelGrant<A,S>) are plain structs with `has drop` and no public constructors.

/**
 * Oracle Action Constructors
 *
 * Static utilities for creating action structs for PTB execution.
 *
 * @example Create oracle grant action
 * ```typescript
 * const action = OracleActionConstructors.newCreateOracleGrant(tx, {
 *   oracleActionsPackageId,
 *   assetType,
 *   stableType,
 *   tiers: [tierSpec1, tierSpec2],
 *   useRelativePricing: false,
 *   launchpadMultiplier: 0n,
 *   earliestExecutionOffsetMs: 30 * 24 * 60 * 60 * 1000n,
 *   expiryYears: 4n, // 0 = no expiry; on-chain max is 10_000_000 years
 *   cancelable: true,
 *   description: "Team vesting grant",
 *   // Optional: TWAP window used for price checks (default: 30 days)
 *   twapWindowMs: 2_592_000_000n,
 * });
 * ```
 */
export class OracleActionConstructors {
  /**
   * Create new RecipientMint struct
   */
  static newRecipientMint(
    tx: Transaction,
    oracleActionsPackageId: string,
    recipient: string,
    amount: bigint
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        oracleActionsPackageId,
        'oracle_actions',
        'new_recipient_mint'
      ),
      arguments: [
        tx.pure(bcs.Address.serialize(recipient).toBytes()),
        tx.pure.u64(amount),
      ],
    });
  }

  /**
   * Create new TierSpec struct
   */
  static newTierSpec(
    tx: Transaction,
    oracleActionsPackageId: string,
    priceThreshold: bigint,
    isAbove: boolean,
    recipients: ReturnType<Transaction['moveCall']>[],
    tierDescription: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        oracleActionsPackageId,
        'oracle_actions',
        'new_tier_spec'
      ),
      arguments: [
        tx.pure.u128(priceThreshold),
        tx.pure.bool(isAbove),
        tx.makeMoveVec({ elements: recipients }),
        tx.pure.string(tierDescription),
      ],
    });
  }

  /**
   * Create CreateOracleGrant action for PTB
   */
  static newCreateOracleGrant(
    tx: Transaction,
    config: {
      oracleActionsPackageId: string;
      assetType: string;
      stableType: string;
      tiers: ReturnType<Transaction['moveCall']>[];
      useRelativePricing: boolean;
      launchpadMultiplier?: bigint | number;
      earliestExecutionOffsetMs: bigint;
      /** Grant expiry in years. Use 0 for no expiry. On-chain max: 10_000_000 years. */
      expiryYears: bigint;
      cancelable: boolean;
      description: string;
      /** TWAP window in milliseconds (default: 30 days) */
      twapWindowMs?: bigint;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.oracleActionsPackageId,
        'oracle_actions',
        'new_create_oracle_grant'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.makeMoveVec({ elements: config.tiers }),
        tx.pure.bool(config.useRelativePricing),
        tx.pure.u64(config.launchpadMultiplier ?? 0),
        tx.pure.u64(config.earliestExecutionOffsetMs),
        tx.pure.u64(config.expiryYears),
        tx.pure.bool(config.cancelable),
        tx.pure.string(config.description),
        tx.pure.u64(config.twapWindowMs ?? 2_592_000_000n),
      ],
    });
  }

  /**
   * Create CancelGrant action for PTB
   */
  static newCancelGrant(
    tx: Transaction,
    oracleActionsPackageId: string,
    grantId: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        oracleActionsPackageId,
        'oracle_actions',
        'new_cancel_grant'
      ),
      arguments: [tx.pure.id(grantId)],
    });
  }
}

/**
 * Oracle Action Executors
 *
 * Static utilities for executing oracle actions in PTB (for governance).
 *
 * @example Execute create oracle grant via governance
 * ```typescript
 * const tx = new Transaction();
 *
 * // Get executable from governance
 * const [executable, intentKey] = GovernanceIntents.executeProposalIntent(tx, {...});
   * const intentWitness = ...;
 *
 * // Execute create grant
 * OracleActionExecutors.doCreateOracleGrant(tx, {
 *   oracleActionsPackageId,
 *   daoId,
 *   registryId,
 *   assetType,
 *   stableType,
 *   outcomeType,
 *   intentWitnessType,
 *   clock: '0x6',
   * }, executable, intentWitness);
 * ```
 */
export class OracleActionExecutors {
  static doCreateOracleGrant(
    tx: Transaction,
    config: {
      oracleActionsPackageId: string;
      daoId: string;
      registryId: string;
      assetType: string;
      stableType: string;
      outcomeType: string;
      intentWitnessType: string;
      clock?: string;
    },
    executable: ReturnType<Transaction['moveCall']>,
    intentWitness: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.oracleActionsPackageId,
        'oracle_actions',
        'do_create_oracle_grant'
      ),
      typeArguments: [
        config.assetType,
        config.stableType,
        config.outcomeType,
        config.intentWitnessType,
      ],
      arguments: [
        executable,
        tx.object(config.daoId),
        tx.object(config.registryId),
        intentWitness,
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  static doCancelGrant(
    tx: Transaction,
    config: {
      oracleActionsPackageId: string;
      daoId: string;
      /** PackageRegistry object ID */
      registryId: string;
      grantId: string;
      assetType: string;
      stableType: string;
      outcomeType: string;
      intentWitnessType: string;
      clock?: string;
    },
    executable: ReturnType<Transaction['moveCall']>,
    intentWitness: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.oracleActionsPackageId,
        'oracle_actions',
        'do_cancel_grant'
      ),
      typeArguments: [
        config.assetType,
        config.stableType,
        config.outcomeType,
        config.intentWitnessType,
      ],
      // Move: do_cancel_grant(executable, account, registry, _witness, grant, clock, ctx)
      arguments: [
        executable,
        tx.object(config.daoId),
        tx.object(config.registryId),
        intentWitness,
        tx.object(config.grantId),
        tx.object(config.clock || '0x6'),
      ],
    });
  }
}

/**
 * Oracle Action Helpers
 *
 * Static utilities for price calculations and helpers.
 *
 * @example Calculate absolute threshold from relative
 * ```typescript
 * const absoluteThreshold = OracleActionHelpers.relativeToAbsoluteThreshold(
 *   tx,
 *   oracleActionsPackageId,
 *   launchpadPrice,
 *   multiplier
 * );
 * ```
 */
export class OracleActionHelpers {
  /**
   * Convert relative price (multiplier) to absolute threshold
   */
  static relativeToAbsoluteThreshold(
    tx: Transaction,
    oracleActionsPackageId: string,
    launchpadPrice: bigint,
    multiplier: bigint
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        oracleActionsPackageId,
        'oracle_actions',
        'relative_to_absolute_threshold'
      ),
      arguments: [tx.pure.u128(launchpadPrice), tx.pure.u64(multiplier)],
    });
  }

  /**
   * Create absolute price condition
   */
  static absolutePriceCondition(
    tx: Transaction,
    oracleActionsPackageId: string,
    priceThreshold: bigint,
    isAbove: boolean
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        oracleActionsPackageId,
        'oracle_actions',
        'absolute_price_condition'
      ),
      arguments: [tx.pure.u128(priceThreshold), tx.pure.bool(isAbove)],
    });
  }
}
