/**
 * Transaction Composer - Fluent API for building complex PTBs
 *
 * Provides a composable, chainable interface for building transactions
 * that involve multiple actions, staging, and execution.
 *
 * @module ptb/transaction-composer
 */

import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { ActionConfig } from '../workflows/types';

/**
 * Package IDs required for transaction composition
 */
export interface TransactionComposerPackages {
  accountActionsPackageId: string;
  futarchyActionsPackageId: string;
  futarchyFactoryPackageId: string;
  futarchyMarketsCorePackageId: string;
  /** Required for proposal action staging with ProposalMutationAuth */
  futarchyGovernancePackageId: string;
}

/**
 * Shared object references for staging
 */
export interface TransactionComposerSharedObjects {
  packageRegistryId: string;
  /** ProposalMutationRegistry shared object ID - required for proposal action staging */
  mutationRegistryId: string;
  mutationRegistrySharedVersion: number;
}

/**
 * Transaction Composer - Fluent builder for PTBs
 *
 * @example
 * ```typescript
 * const composer = new TransactionComposer(packages, sharedObjects);
 *
 * // Build a transaction with multiple actions
 * const tx = composer
 *   .new()
 *   .addStream({
 *     vaultName: 'treasury',
 *     beneficiary: '0xABC',
 *     amountPerIteration: 50_000_000n,
 *     startTime: Date.now() + 300_000, // or null to use execution time
 *     iterationsTotal: 12n,
 *     iterationPeriodMs: 2_592_000_000n,
 *   })
 *   .addPoolWithMint({
 *     stableResourceName: 'amm_liquidity',
 *     mintCapResourceName: 'asset_mint_cap',
 *     assetAmount: 1_000_000_000n,
 *     feeBps: 150,
 *     lpType,
 *     lpTreasuryCapId,
 *     lpCurrencyId,
 *   })
 *   .stageToLaunchpad(unsharedRaiseId, assetType, stableType, 'success')
 *   .build();
 * ```
 */
export class TransactionComposer {
  private packages: TransactionComposerPackages;
  private sharedObjects: TransactionComposerSharedObjects;

  constructor(
    packages: TransactionComposerPackages,
    sharedObjects: TransactionComposerSharedObjects
  ) {
    this.packages = packages;
    this.sharedObjects = sharedObjects;
  }

  /**
   * Create a new composable transaction builder
   */
  new(): TransactionBuilder {
    return new TransactionBuilder(this.packages, this.sharedObjects);
  }
}

/**
 * Chainable transaction builder
 */
export class TransactionBuilder {
  private tx: Transaction;
  private builder: ReturnType<Transaction['moveCall']> | null = null;
  private actions: ActionConfig[] = [];
  private packages: TransactionComposerPackages;
  private sharedObjects: TransactionComposerSharedObjects;

  constructor(
    packages: TransactionComposerPackages,
    sharedObjects: TransactionComposerSharedObjects
  ) {
    this.tx = new Transaction();
    this.packages = packages;
    this.sharedObjects = sharedObjects;
  }

  /**
   * Get the underlying Transaction (for advanced use)
   */
  getTransaction(): Transaction {
    return this.tx;
  }

  /**
   * Add a create stream action
   * Note: All vault streams are DAO-controlled (always cancellable, non-transferable).
   * For transferable vestings with beneficiary control, use the standalone vesting module.
   */
  addStream(config: {
    vaultName: string;
    beneficiary: string;
    amountPerIteration: bigint;
    /** Start timestamp (ms). If null/undefined, uses clock time at execution. */
    startTime?: number | bigint | null;
    iterationsTotal: bigint;
    iterationPeriodMs: bigint;
    claimWindowMs?: bigint;
    expiryMs?: bigint;
    whitelistedRecipients?: string[];
    /** Fully qualified coin type for the stream (e.g. '0x2::sui::SUI') */
    coinType: string;
  }): this {
    this.actions.push({
      type: 'create_stream',
      ...config,
    });
    return this;
  }

  /**
   * Add a create pool with mint action
   * Stable coins are taken from executable_resources (put there by prior VaultSpend action)
   */
  addPoolWithMint(config: {
    stableResourceName: string;
    mintCapResourceName: string;
    assetAmount: bigint;
    feeBps: number;
    lpType: string;
    lpTreasuryCapId: string;
    lpCurrencyId: string;
  }): this {
    this.actions.push({
      type: 'create_pool_with_mint',
      ...config,
    });
    return this;
  }

  /**
   * Add a create pool from externally supplied coins action.
   * The execution PTB must later pass the asset/stable coin objects.
   */
  addPoolFromCoins(config: {
    executor: string;
    minAssetAmount: bigint;
    minStableAmount: bigint;
    feeBps: number;
    launchFeeDurationMs?: bigint;
    lpType: string;
    lpTreasuryCapId: string;
    lpCurrencyId: string;
    assetType?: string;
    stableType?: string;
  }): this {
    this.actions.push({
      type: 'create_pool_from_coins',
      ...config,
    });
    return this;
  }

  /**
   * Add a remove treasury cap to executable_resources action.
   */
  addRemoveTreasuryCapToResources(coinType: string, expectedCapId: string, resourceName: string): this {
    this.actions.push({
      type: 'remove_treasury_cap_to_resources',
      coinType,
      expectedCapId,
      resourceName,
    });
    return this;
  }

  /**
   * Add a remove metadata cap to executable_resources action.
   */
  addRemoveMetadataCapToResources(coinType: string, expectedCapId: string, resourceName: string): this {
    this.actions.push({
      type: 'remove_metadata_cap_to_resources',
      coinType,
      expectedCapId,
      resourceName,
    });
    return this;
  }

  /**
   * Add an update trading params action
   * NOTE: assetDecimals and stableDecimals removed - decimals are immutable in Sui coins
   * Read from sui::coin_registry::Currency<T> instead
   */
  addUpdateTradingParams(config: {
    minAssetAmount?: bigint;
    minStableAmount?: bigint;
    reviewPeriodMs?: bigint;
    tradingPeriodMs?: bigint;
    ammTotalFeeBps?: number;
    conditionalLiquidityRatioPercent?: number;
  }): this {
    this.actions.push({
      type: 'update_trading_params',
      ...config,
    });
    return this;
  }

  /**
   * Add an update TWAP config action
   */
  addUpdateTwapConfig(config: {
    startDelay?: bigint;
    capPpm?: bigint;
    initialObservation?: bigint;
    threshold?: bigint;
    sponsoredThreshold?: bigint;
  }): this {
    this.actions.push({
      type: 'update_twap_config',
      ...config,
    });
    return this;
  }

  /**
   * Add a sync TWAP observation from proposal action
   */
  addSyncTwapObservationFromProposal(): this {
    this.actions.push({
      type: 'sync_twap_observation_from_proposal',
    });
    return this;
  }

  /**
   * Add a mint action
   * The minted coin is stored in executable_resources under resourceName
   * @param amount - Amount to mint
   * @param resourceName - Name to store the minted coin in executable_resources
   */
  addMint(amount: bigint, resourceName: string, coinType: string): this {
    this.actions.push({
      type: 'mint',
      amount,
      resourceName,
      coinType,
    });
    return this;
  }

  /**
   * Add a burn action
   * The coin to burn is taken from executable_resources under resourceName
   * @param amount - Amount to burn
   * @param resourceName - Name of the coin to burn from executable_resources
   */
  addBurn(amount: bigint, resourceName: string, coinType: string): this {
    this.actions.push({
      type: 'burn',
      amount,
      resourceName,
      coinType,
    });
    return this;
  }

  /**
   * Add a mint CurrencyMintAdminCap action.
   */
  addMintCurrencyAdminCap(resourceName: string, coinType: string): this {
    this.actions.push({
      type: 'mint_currency_admin_cap',
      resourceName,
      coinType,
    });
    return this;
  }

  /**
   * Add a deposit action
   * @param resourceName - The name of the resource to take from executable_resources
   */
  addDeposit(vaultName: string, amount: bigint, resourceName: string, coinType: string): this {
    this.actions.push({
      type: 'deposit',
      vaultName,
      amount,
      resourceName,
      coinType,
    });
    return this;
  }

  /**
   * Add a spend action
   * @param resourceName - The name to store the coin in executable_resources
   */
  addSpend(vaultName: string, amount: bigint, spendAll: boolean, resourceName: string, coinType: string): this {
    this.actions.push({
      type: 'spend',
      vaultName,
      amount,
      spendAll,
      resourceName,
      coinType,
    });
    return this;
  }

  /**
   * Add an approve coin type action
   */
  addApproveCoinType(vaultName: string, coinType: string): this {
    this.actions.push({
      type: 'approve_coin_type',
      vaultName,
      coinType,
    });
    return this;
  }

  /**
   * Add a remove coin type approval action
   */
  addRemoveApprovedCoinType(vaultName: string, coinType: string): this {
    this.actions.push({
      type: 'remove_approved_coin_type',
      vaultName,
      coinType,
    });
    return this;
  }

  /**
   * Add an open vault action
   */
  addOpenVault(vaultName: string): this {
    this.actions.push({
      type: 'open_vault',
      vaultName,
    });
    return this;
  }

  /**
   * Add a close vault action
   */
  addCloseVault(vaultName: string): this {
    this.actions.push({
      type: 'close_vault',
      vaultName,
    });
    return this;
  }

  /**
   * Add a transfer action
   * @param resourceName - The name of the resource to take from executable_resources
   */
  addTransfer(recipient: string, resourceName: string, objectType: string): this {
    this.actions.push({
      type: 'transfer',
      objectType,
      recipient,
      resourceName,
    });
    return this;
  }

  /**
   * Add a transfer to sender action
   * @param resourceName - The name of the resource to take from executable_resources
   */
  addTransferToSender(resourceName: string, objectType: string): this {
    this.actions.push({
      type: 'transfer_to_sender',
      objectType,
      resourceName,
    });
    return this;
  }

  /**
   * Add a transfer coin action (for coins via provide_coin)
   * Use this when the coin was placed via provide_coin (e.g., from VaultSpend)
   * @param recipient - The address to transfer the coin to
   * @param resourceName - The name of the coin resource in executable_resources
   */
  addTransferCoin(recipient: string, resourceName: string, coinType: string): this {
    this.actions.push({
      type: 'transfer_coin',
      recipient,
      resourceName,
      coinType,
    });
    return this;
  }

  /**
   * Add a transfer coin to sender action (for coins via provide_coin)
   * Use this for crank fees when the coin was placed via provide_coin
   * @param resourceName - The name of the coin resource in executable_resources
   */
  addTransferCoinToSender(resourceName: string, coinType: string): this {
    this.actions.push({
      type: 'transfer_coin_to_sender',
      resourceName,
      coinType,
    });
    return this;
  }

  /**
   * Add a memo action
   */
  addMemo(message: string): this {
    this.actions.push({
      type: 'memo',
      message,
    });
    return this;
  }

  /**
   * Add an authorize package upgrade action
   */
  addUpgradePackage(config: {
    name: string;
    digest: number[] | Uint8Array;
    expectedCapId: string;
  }): this {
    this.actions.push({
      type: 'upgrade_package',
      ...config,
    });
    return this;
  }

  /**
   * Add a commit package upgrade action
   */
  addCommitUpgrade(name: string, expectedCapId: string): this {
    this.actions.push({
      type: 'commit_upgrade',
      name,
      expectedCapId,
    });
    return this;
  }

  /**
   * Add a restrict package upgrade policy action
   */
  addRestrictUpgrade(name: string, policy: number, expectedCapId: string): this {
    this.actions.push({
      type: 'restrict_upgrade',
      name,
      policy,
      expectedCapId,
    });
    return this;
  }

  /**
   * Add a lock UpgradeCap action
   */
  addLockUpgradeCap(config: {
    name: string;
    delayMs: bigint;
    expectedCapId: string;
    resourceName?: string;
  }): this {
    this.actions.push({
      type: 'lock_upgrade_cap',
      ...config,
    });
    return this;
  }

  /**
   * Add an unlock UpgradeCap action
   */
  addUnlockUpgradeCap(config: {
    name: string;
    expectedCapId: string;
    resourceName?: string;
  }): this {
    this.actions.push({
      type: 'unlock_upgrade_cap',
      ...config,
    });
    return this;
  }

  /**
   * Stage actions to an unshared launchpad raise (success or failure)
   */
  stageToLaunchpad(
    unsharedRaiseId: string,
    assetType: string,
    stableType: string,
    outcome: 'success' | 'failure',
    clockId?: string
  ): this {
    const clock = clockId || '0x6';
    const unsharedRaise = this.tx.object(unsharedRaiseId);

    this.builder = this.tx.moveCall({
      target:
        outcome === 'success'
          ? `${this.packages.futarchyFactoryPackageId}::launchpad::new_success_builder`
          : `${this.packages.futarchyFactoryPackageId}::launchpad::new_failure_builder`,
      typeArguments: [assetType, stableType],
      arguments: [unsharedRaise],
    });

    // Add all actions to builder
    for (const action of this.actions) {
      this.addActionToBuilder(action, { assetType, stableType });
    }

    // Stage intent
    const stageTarget =
      outcome === 'success'
        ? `${this.packages.futarchyFactoryPackageId}::launchpad::stage_success_intent`
        : `${this.packages.futarchyFactoryPackageId}::launchpad::stage_failure_intent`;

    this.tx.moveCall({
      target: stageTarget,
      typeArguments: [assetType, stableType],
      arguments: [
        unsharedRaise,
        this.tx.object(this.sharedObjects.packageRegistryId),
        this.builder!,
        this.tx.object(clock),
      ],
    });

    this.builder = null;
    return this;
  }

  /**
   * Stage actions to a proposal outcome
   *
   * SECURITY: Action packages are validated against the whitelist at staging time.
   *
   * @param proposalId - Proposal object ID
   * @param assetType - Asset coin type
   * @param stableType - Stable coin type
   * @param outcomeIndex - Outcome index (0 = Reject, 1+ = Accept)
   * @param daoAccountId - DAO account ID for whitelist validation
   * @param registryId - Package registry ID for whitelist validation
   */
  stageToProposal(
    proposalId: string,
    assetType: string,
    stableType: string,
    outcomeIndex: number,
    daoAccountId: string,
    registryId: string,
  ): this {
    // source_type 2 = proposal (see account_protocol::constants::source_proposal)
    this.ensureBuilder(2, proposalId, outcomeIndex);

    // Add all actions to builder
    for (const action of this.actions) {
      this.addActionToBuilder(action, { assetType, stableType });
    }

    // Convert builder to vector
    const specs = this.tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::action_spec_builder::into_vector`,
      arguments: [this.builder!],
    });

    // Set intent spec for outcome (with whitelist validation)
    // Uses wrapper in proposal_lifecycle that creates ProposalMutationAuth internally
    this.tx.moveCall({
      target: `${this.packages.futarchyGovernancePackageId}::proposal_lifecycle::set_intent_spec_for_outcome`,
      typeArguments: [assetType, stableType],
      arguments: [
        this.tx.sharedObjectRef({
          objectId: this.sharedObjects.mutationRegistryId,
          initialSharedVersion: String(this.sharedObjects.mutationRegistrySharedVersion),
          mutable: false,
        }),
        this.tx.object(proposalId),
        this.tx.pure.u64(outcomeIndex),
        specs,
        this.tx.object(daoAccountId),    // account for whitelist check
        this.tx.object(registryId),       // PackageRegistry
      ],
    });

    // Reset builder for potential reuse
    this.builder = null;

    return this;
  }

  /**
   * Build the transaction
   */
  build(): Transaction {
    return this.tx;
  }

  /**
   * Get the accumulated actions (for inspection)
   */
  getActions(): ActionConfig[] {
    return [...this.actions];
  }

  /**
   * Clear all actions
   */
  clear(): this {
    this.actions = [];
    this.builder = null;
    this.tx = new Transaction();
    return this;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Ensure the action spec builder exists, creating one if needed.
   * @param sourceType - Source type constant (0=launchpad_success, 1=launchpad_failure, 2=proposal)
   * @param sourceId - Source object ID (proposal ID, raise ID, etc.)
   * @param outcomeIndex - Outcome index within the source
   */
  private ensureBuilder(sourceType: number, sourceId: string, outcomeIndex: number | bigint): void {
    if (!this.builder) {
      this.builder = this.tx.moveCall({
        target: `${this.packages.accountActionsPackageId}::action_spec_builder::new`,
        arguments: [
          this.tx.pure.u8(sourceType),
          this.tx.pure.id(sourceId),
          this.tx.pure.u64(outcomeIndex),
        ],
      });
    }
  }

  private addActionToBuilder(
    action: ActionConfig,
    stageTypes?: { assetType: string; stableType: string }
  ): void {
    const { accountActionsPackageId, futarchyActionsPackageId } =
      this.packages;

    switch (action.type) {
      case 'create_stream':
        if (!action.coinType) throw new Error('coinType is required for create_stream action');
        this.tx.moveCall({
          target: `${accountActionsPackageId}::stream_init_actions::add_create_stream_spec`,
          typeArguments: [action.coinType],
          arguments: [
            this.builder!,
            this.tx.pure.string(action.vaultName),
            this.tx.pure(bcs.Address.serialize(action.beneficiary).toBytes()),
            this.tx.pure.u64(action.amountPerIteration),
            this.tx.pure.option('u64', action.startTime != null ? Number(action.startTime) : null),
            this.tx.pure.u64(action.iterationsTotal),
            this.tx.pure.u64(action.iterationPeriodMs),
            this.tx.pure.option('u64', action.claimWindowMs != null ? Number(action.claimWindowMs) : null),
            this.tx.pure.option('u64', action.expiryMs != null ? Number(action.expiryMs) : null),
            this.tx.pure.vector('address', action.whitelistedRecipients ?? []),
          ],
        });
        break;

      case 'create_pool_with_mint':
        // Create pool spec
        this.tx.moveCall({
          target: `${futarchyActionsPackageId}::liquidity_init_actions::add_create_pool_with_mint_spec`,
          typeArguments: [
            action.assetType ?? stageTypes?.assetType ?? (() => { throw new Error('assetType is required for create_pool_with_mint action'); })(),
            action.stableType ?? stageTypes?.stableType ?? (() => { throw new Error('stableType is required for create_pool_with_mint action'); })(),
            action.lpType,
          ],
          arguments: [
            this.builder!,
            this.tx.pure.string(action.stableResourceName),
            this.tx.pure.string(action.mintCapResourceName),
            this.tx.pure.option('u64', action.assetAmount !== undefined ? action.assetAmount : null),
            this.tx.pure.u64(action.feeBps),
            this.tx.pure.u64(action.launchFeeDurationMs ?? 0n),
            this.tx.pure.id(action.lpTreasuryCapId),
            this.tx.pure.id(action.lpCurrencyId),
          ],
        });
        break;

      case 'create_pool_from_coins':
        this.tx.moveCall({
          target: `${futarchyActionsPackageId}::liquidity_init_actions::add_create_pool_from_coins_spec`,
          typeArguments: [
            action.assetType ?? stageTypes?.assetType ?? (() => { throw new Error('assetType is required for create_pool_from_coins action'); })(),
            action.stableType ?? stageTypes?.stableType ?? (() => { throw new Error('stableType is required for create_pool_from_coins action'); })(),
            action.lpType,
          ],
          arguments: [
            this.builder!,
            this.tx.pure.address(action.executor),
            this.tx.pure.u64(action.minAssetAmount),
            this.tx.pure.u64(action.minStableAmount),
            this.tx.pure.u64(action.feeBps),
            this.tx.pure.u64(action.launchFeeDurationMs ?? 0n),
            this.tx.pure.id(action.lpTreasuryCapId),
            this.tx.pure.id(action.lpCurrencyId),
          ],
        });
        break;

      case 'remove_treasury_cap_to_resources':
        if (!action.coinType) throw new Error('coinType is required for remove_treasury_cap_to_resources action');
        this.tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_remove_treasury_cap_to_resources_spec`,
          typeArguments: [action.coinType],
          arguments: [this.builder!, this.tx.pure.id(action.expectedCapId), this.tx.pure.string(action.resourceName)],
        });
        break;

      case 'remove_metadata_cap_to_resources':
        if (!action.coinType) throw new Error('coinType is required for remove_metadata_cap_to_resources action');
        this.tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_remove_metadata_cap_to_resources_spec`,
          typeArguments: [action.coinType],
          arguments: [this.builder!, this.tx.pure.id(action.expectedCapId), this.tx.pure.string(action.resourceName)],
        });
        break;

      case 'update_trading_params':
        this.tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_trading_params_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.option('u64', action.minAssetAmount != null ? action.minAssetAmount : null),
            this.tx.pure.option('u64', action.minStableAmount != null ? action.minStableAmount : null),
            this.tx.pure.option('u64', action.reviewPeriodMs != null ? action.reviewPeriodMs : null),
            this.tx.pure.option('u64', action.tradingPeriodMs != null ? action.tradingPeriodMs : null),
            this.tx.pure.option('u64', action.ammTotalFeeBps ?? null),
            this.tx.pure.option('u64', action.conditionalLiquidityRatioPercent ?? null),
          ],
        });
        break;

      case 'update_twap_config':
        this.tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_twap_config_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.option('u64', action.startDelay != null ? action.startDelay : null),
            this.tx.pure.option('u64', action.capPpm != null ? action.capPpm : null),
            this.tx.pure.option('u128', action.initialObservation ?? null),
            this.tx.pure.option('u128', action.threshold ?? null),
            this.tx.pure.option('u128', action.sponsoredThreshold ?? null),
          ],
        });
        break;

      case 'sync_twap_observation_from_proposal':
        this.tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_sync_twap_observation_from_proposal_spec`,
          arguments: [this.builder!],
        });
        break;

      case 'mint':
        if (!action.coinType) throw new Error('coinType is required for mint action');
        this.tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_mint_spec`,
          typeArguments: [action.coinType],
          arguments: [
            this.builder!,
            this.tx.pure.u64(action.amount),
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'burn':
        if (!action.coinType) throw new Error('coinType is required for burn action');
        this.tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_burn_spec`,
          typeArguments: [action.coinType],
          arguments: [
            this.builder!,
            this.tx.pure.u64(action.amount),
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'mint_currency_admin_cap':
        if (!action.coinType) throw new Error('coinType is required for mint_currency_admin_cap action');
        this.tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_mint_currency_admin_cap_spec`,
          typeArguments: [action.coinType],
          arguments: [this.builder!, this.tx.pure.string(action.resourceName)],
        });
        break;

      case 'deposit':
        if (!action.coinType) throw new Error('coinType is required for deposit action');
        this.tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_deposit_spec`,
          typeArguments: [action.coinType],
          arguments: [
            this.builder!,
            this.tx.pure.string(action.vaultName),
            this.tx.pure.u64(action.amount),
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'deposit_from_resources':
        if (!action.coinType) throw new Error('coinType is required for deposit_from_resources action');
        this.tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_deposit_from_resources_spec`,
          typeArguments: [action.coinType],
          arguments: [
            this.builder!,
            this.tx.pure.string(action.vaultName),
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'deposit_object_from_resources':
        if (!action.coinType) throw new Error('coinType is required for deposit_object_from_resources action');
        this.tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_deposit_object_from_resources_spec`,
          typeArguments: [action.coinType],
          arguments: [
            this.builder!,
            this.tx.pure.string(action.vaultName),
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'spend':
        if (!action.coinType) throw new Error('coinType is required for spend action');
        this.tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_spend_spec`,
          typeArguments: [action.coinType],
          arguments: [
            this.builder!,
            this.tx.pure.string(action.vaultName),
            this.tx.pure.u64(action.amount),
            this.tx.pure.bool(action.spendAll),
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'approve_coin_type':
        if (!action.coinType) throw new Error('coinType is required for approve_coin_type action');
        this.tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_approve_coin_type_spec`,
          typeArguments: [action.coinType],
          arguments: [this.builder!, this.tx.pure.string(action.vaultName)],
        });
        break;

      case 'remove_approved_coin_type':
        if (!action.coinType) throw new Error('coinType is required for remove_approved_coin_type action');
        this.tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_remove_approved_coin_type_spec`,
          typeArguments: [action.coinType],
          arguments: [this.builder!, this.tx.pure.string(action.vaultName)],
        });
        break;

      case 'open_vault':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_open_vault_spec`,
          arguments: [this.builder!, this.tx.pure.string(action.vaultName)],
        });
        break;

      case 'close_vault':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_close_vault_spec`,
          arguments: [this.builder!, this.tx.pure.string(action.vaultName)],
        });
        break;

      case 'transfer':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_object_spec`,
          typeArguments: [action.objectType],
          arguments: [
            this.builder!,
            this.tx.pure.address(action.recipient),
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'transfer_to_sender':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_to_sender_spec`,
          typeArguments: [action.objectType],
          arguments: [
            this.builder!,
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'transfer_coin':
        // Use this when the coin was placed via provide_coin (e.g., from VaultSpend)
        if (!action.coinType) throw new Error('coinType is required for transfer_coin action');
        this.tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_coin_spec`,
          typeArguments: [action.coinType],
          arguments: [
            this.builder!,
            this.tx.pure.address(action.recipient),
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'transfer_coin_to_sender':
        // Use this for crank fees when the coin was placed via provide_coin
        if (!action.coinType) throw new Error('coinType is required for transfer_coin_to_sender action');
        this.tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_coin_to_sender_spec`,
          typeArguments: [action.coinType],
          arguments: [
            this.builder!,
            this.tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'memo':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::memo_init_actions::add_emit_memo_spec`,
          arguments: [this.builder!, this.tx.pure.string(action.message)],
        });
        break;

      case 'upgrade_package':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade_init_actions::add_upgrade_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.string(action.name),
            this.tx.pure.vector('u8', Array.from(action.digest)),
            this.tx.pure.id(action.expectedCapId),
          ],
        });
        break;

      case 'commit_upgrade':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade_init_actions::add_commit_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.string(action.name),
            this.tx.pure.id(action.expectedCapId),
          ],
        });
        break;

      case 'restrict_upgrade':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade_init_actions::add_restrict_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.string(action.name),
            this.tx.pure.u8(action.policy),
            this.tx.pure.id(action.expectedCapId),
          ],
        });
        break;

      case 'lock_upgrade_cap':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::owned_init_actions::add_provide_object_spec`,
          typeArguments: ['0x2::package::UpgradeCap'],
          arguments: [
            this.builder!,
            this.tx.pure.id(action.expectedCapId),
            this.tx.pure.string(action.resourceName ?? 'upgrade_cap'),
          ],
        });
        this.tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade_init_actions::add_lock_upgrade_cap_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.string(action.name),
            this.tx.pure.u64(action.delayMs),
            this.tx.pure.string(action.resourceName ?? 'upgrade_cap'),
            this.tx.pure.id(action.expectedCapId),
          ],
        });
        break;

      case 'unlock_upgrade_cap':
        this.tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade_init_actions::add_unlock_upgrade_cap_spec`,
          arguments: [
            this.builder!,
            this.tx.pure.string(action.name),
            this.tx.pure.string(action.resourceName ?? 'upgrade_cap'),
            this.tx.pure.id(action.expectedCapId),
          ],
        });
        break;

      default:
        throw new Error(`Unknown action type: ${(action as { type?: string }).type}`);
    }
  }
}
