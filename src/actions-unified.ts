/**
 * Unified Actions Namespace
 *
 * Provides a clean, organized namespace for all action builders.
 * This replaces direct imports of individual action modules.
 *
 * @example
 * ```typescript
 * // Instead of:
 * import { StreamInitActions } from './lib/actions/stream-actions';
 * StreamInitActions.addCreateStreamSpec(tx, builder, ...);
 *
 * // Use:
 * sdk.actions.stream.addCreateStream(tx, builder, ...);
 * ```
 *
 * @module actions-unified
 */

import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';

/**
 * Package IDs required for action builders
 */
export interface ActionsPackages {
  accountActionsPackageId: string;
  futarchyActionsPackageId: string;
  futarchyOracleActionsPackageId: string;
  futarchyGovernanceActionsPackageId: string;
  futarchyCorePackageId: string;
}

/**
 * Stream action builder
 */
export class StreamActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add a create stream action spec to the builder
   */
  addCreateStream(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    coinType: string,
    config: {
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
      // Note: Vault streams are always DAO-controlled (cancellable, non-transferable)
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::stream_init_actions::add_create_stream_spec`,
      typeArguments: [coinType],
      arguments: [
        builder,
        tx.pure.string(config.vaultName),
        tx.pure(bcs.Address.serialize(config.beneficiary).toBytes()),
        tx.pure.u64(config.amountPerIteration),
        tx.pure.option('u64', config.startTime != null ? Number(config.startTime) : null),
        tx.pure.u64(config.iterationsTotal),
        tx.pure.u64(config.iterationPeriodMs),
        tx.pure.option('u64', config.claimWindowMs != null ? Number(config.claimWindowMs) : null),
        tx.pure.option('u64', config.expiryMs != null ? Number(config.expiryMs) : null),
        tx.pure.vector('address', config.whitelistedRecipients ?? []),
      ],
    });
  }
}

/**
 * Currency action builder
 */
export class CurrencyActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add a mint action spec
   * Mints coins and stores them in executable_resources under resourceName
   * for consumption by subsequent actions (e.g., CreateVesting, TransferCoin)
   */
  addMint(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    coinType: string,
    amount: bigint,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::currency_init_actions::add_mint_spec`,
      typeArguments: [coinType],
      arguments: [builder, tx.pure.u64(amount), tx.pure.string(resourceName)],
    });
  }

  /**
   * Add a burn action spec
   * Burns coins from executable_resources with the given resourceName
   */
  addBurn(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    coinType: string,
    amount: bigint,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::currency_init_actions::add_burn_spec`,
      typeArguments: [coinType],
      arguments: [builder, tx.pure.u64(amount), tx.pure.string(resourceName)],
    });
  }

  /**
   * Add a mint CurrencyMintAdminCap action spec
   */
  addMintCurrencyAdminCap(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    coinType: string,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::currency_init_actions::add_mint_currency_admin_cap_spec`,
      typeArguments: [coinType],
      arguments: [builder, tx.pure.string(resourceName)],
    });
  }

  /**
   * Add a remove-treasury-cap-to-resources action spec.
   */
  addRemoveTreasuryCapToResources(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    coinType: string,
    expectedCapId: string,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::currency_init_actions::add_remove_treasury_cap_to_resources_spec`,
      typeArguments: [coinType],
      arguments: [builder, tx.pure.id(expectedCapId), tx.pure.string(resourceName)],
    });
  }

  /**
   * Add a remove-metadata-cap-to-resources action spec.
   */
  addRemoveMetadataCapToResources(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    coinType: string,
    expectedCapId: string,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::currency_init_actions::add_remove_metadata_cap_to_resources_spec`,
      typeArguments: [coinType],
      arguments: [builder, tx.pure.id(expectedCapId), tx.pure.string(resourceName)],
    });
  }
}

/**
 * Liquidity action builder
 */
export class LiquidityActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add a create pool with mint action spec
   */
  addCreatePoolWithMint(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    config: {
      stableResourceName: string;
      mintCapResourceName: string;
      assetAmount?: bigint | null;
      feeBps: number;
      launchFeeDurationMs?: bigint;
      lpTreasuryCapId: string;
      lpCurrencyId: string;
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.futarchyActionsPackageId}::liquidity_init_actions::add_create_pool_with_mint_spec`,
      arguments: [
        builder,
        tx.pure.string(config.stableResourceName),
        tx.pure.string(config.mintCapResourceName),
        tx.pure.option('u64', config.assetAmount != null ? Number(config.assetAmount) : null),
        tx.pure.u64(config.feeBps),
        tx.pure.u64(config.launchFeeDurationMs ?? 0n),
        tx.pure.id(config.lpTreasuryCapId),
        tx.pure.id(config.lpCurrencyId),
      ],
    });
  }

  /**
   * Add a create pool from externally supplied coins action spec.
   */
  addCreatePoolFromCoins(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    config: {
      assetType: string;
      stableType: string;
      executor: string;
      minAssetAmount: bigint;
      minStableAmount: bigint;
      feeBps: number;
      launchFeeDurationMs?: bigint;
      lpType: string;
      lpTreasuryCapId: string;
      lpCurrencyId: string;
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.futarchyActionsPackageId}::liquidity_init_actions::add_create_pool_from_coins_spec`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        builder,
        tx.pure.address(config.executor),
        tx.pure.u64(config.minAssetAmount),
        tx.pure.u64(config.minStableAmount),
        tx.pure.u64(config.feeBps),
        tx.pure.u64(config.launchFeeDurationMs ?? 0n),
        tx.pure.id(config.lpTreasuryCapId),
        tx.pure.id(config.lpCurrencyId),
      ],
    });
  }
}

/**
 * Vault action builder
 */
export class VaultActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add a deposit action spec
   * @param resourceName - The name of the resource to take from executable_resources
   */
  addDeposit(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    coinType: string,
    vaultName: string,
    amount: bigint,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::vault_init_actions::add_deposit_spec`,
      typeArguments: [coinType],
      arguments: [builder, tx.pure.string(vaultName), tx.pure.u64(amount), tx.pure.string(resourceName)],
    });
  }

  /**
   * Add a spend action spec
   * @param resourceName - The name to store the coin in executable_resources
   */
  addSpend(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    coinType: string,
    vaultName: string,
    amount: bigint,
    spendAll: boolean,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::vault_init_actions::add_spend_spec`,
      typeArguments: [coinType],
      arguments: [
        builder,
        tx.pure.string(vaultName),
        tx.pure.u64(amount),
        tx.pure.bool(spendAll),
        tx.pure.string(resourceName),
      ],
    });
  }

  /**
   * Add an approve coin type action spec
   */
  addApproveCoinType(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    coinType: string,
    vaultName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::vault_init_actions::add_approve_coin_type_spec`,
      typeArguments: [coinType],
      arguments: [builder, tx.pure.string(vaultName)],
    });
  }

  /**
   * Add a remove coin type approval action spec
   */
  addRemoveApprovedCoinType(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    coinType: string,
    vaultName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::vault_init_actions::add_remove_approved_coin_type_spec`,
      typeArguments: [coinType],
      arguments: [builder, tx.pure.string(vaultName)],
    });
  }

  /**
   * Add a transfer object action spec
   * @param resourceName - The name of the resource to take from executable_resources
   */
  addTransfer(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    recipient: string,
    resourceName: string,
    objectType: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::transfer_init_actions::add_transfer_object_spec`,
      typeArguments: [objectType],
      arguments: [builder, tx.pure.address(recipient), tx.pure.string(resourceName)],
    });
  }

  /**
   * Add a deposit from resources action spec
   *
   * Deposits coins from executable_resources into specified vault.
   * Amount = exactly what prior action produced (deterministic).
   *
   * @param coinType - The coin type being deposited
   * @param vaultName - The target vault name
   * @param resourceName - The name of the coin resource in executable_resources
   */
  addDepositFromResources(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    coinType: string,
    vaultName: string,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::vault_init_actions::add_deposit_from_resources_spec`,
      typeArguments: [coinType],
      arguments: [builder, tx.pure.string(vaultName), tx.pure.string(resourceName)],
    });
  }

  /**
   * Add a deposit object from resources action spec
   *
   * Deposits a Coin<T> object from executable_resources into the specified vault.
   * Use this after object-path actions such as withdraw_object<Coin<T>>.
   *
   * @param coinType - The coin type being deposited
   * @param vaultName - The target vault name
   * @param resourceName - The name of the Coin<T> object resource in executable_resources
   */
  addDepositObjectFromResources(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    coinType: string,
    vaultName: string,
    resourceName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::vault_init_actions::add_deposit_object_from_resources_spec`,
      typeArguments: [coinType],
      arguments: [builder, tx.pure.string(vaultName), tx.pure.string(resourceName)],
    });
  }

  /**
   * Add an open vault action spec
   */
  addOpenVault(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    vaultName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::vault_init_actions::add_open_vault_spec`,
      arguments: [builder, tx.pure.string(vaultName)],
    });
  }

  /**
   * Add a close vault action spec
   */
  addCloseVault(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    vaultName: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::vault_init_actions::add_close_vault_spec`,
      arguments: [builder, tx.pure.string(vaultName)],
    });
  }

}

/**
 * Config action builder
 */
export class ConfigActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add an update trading params action spec
   * NOTE: assetDecimals and stableDecimals removed - decimals are immutable in Sui coins
   * Read from sui::coin_registry::Currency<T> instead
   */
  addUpdateTradingParams(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    config: {
      minAssetAmount?: bigint;
      minStableAmount?: bigint;
      reviewPeriodMs?: bigint;
      tradingPeriodMs?: bigint;
      ammTotalFeeBps?: number;
      conditionalLiquidityRatioPercent?: number;
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.futarchyActionsPackageId}::futarchy_config_init_actions::add_update_trading_params_spec`,
      arguments: [
        builder,
        tx.pure.option('u64', config.minAssetAmount != null ? config.minAssetAmount : null),
        tx.pure.option('u64', config.minStableAmount != null ? config.minStableAmount : null),
        tx.pure.option('u64', config.reviewPeriodMs != null ? config.reviewPeriodMs : null),
        tx.pure.option('u64', config.tradingPeriodMs != null ? config.tradingPeriodMs : null),
        tx.pure.option('u64', config.ammTotalFeeBps ?? null),
        tx.pure.option('u64', config.conditionalLiquidityRatioPercent ?? null),
      ],
    });
  }

  /**
   * Add an update TWAP config action spec
   */
  addUpdateTwapConfig(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    config: {
      startDelay?: bigint;
      capPpm?: bigint;
      initialObservation?: bigint;
      threshold?: bigint;
      sponsoredThreshold?: bigint;
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.futarchyActionsPackageId}::futarchy_config_init_actions::add_update_twap_config_spec`,
      arguments: [
        builder,
        tx.pure.option('u64', config.startDelay != null ? config.startDelay : null),
        tx.pure.option('u64', config.capPpm != null ? config.capPpm : null),
        tx.pure.option('u128', config.initialObservation ?? null),
        tx.pure.option('u128', config.threshold ?? null),
        tx.pure.option('u128', config.sponsoredThreshold ?? null),
      ],
    });
  }

  /**
   * Add a sync TWAP observation from proposal action spec
   */
  addSyncTwapObservationFromProposal(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: `${this.packages.futarchyActionsPackageId}::futarchy_config_init_actions::add_sync_twap_observation_from_proposal_spec`,
      arguments: [builder],
    });
  }
}

/**
 * Transfer action builder
 */
export class TransferActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add a transfer object action spec
   * @param resourceName - The name of the resource to take from executable_resources
   */
  addTransfer(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    recipient: string,
    resourceName: string,
    objectType: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::transfer_init_actions::add_transfer_object_spec`,
      typeArguments: [objectType],
      arguments: [builder, tx.pure.address(recipient), tx.pure.string(resourceName)],
    });
  }

  /**
   * Add a transfer to sender action spec
   * Transfers object to whoever executes the intent (cranker)
   * @param resourceName - The name of the resource to take from executable_resources
   */
  addTransferToSender(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    resourceName: string,
    objectType: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::transfer_init_actions::add_transfer_to_sender_spec`,
      typeArguments: [objectType],
      arguments: [builder, tx.pure.string(resourceName)],
    });
  }
}

/**
 * Memo action builder
 */
export class MemoActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add a memo action spec
   */
  addMemo(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    message: string
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::memo_init_actions::add_emit_memo_spec`,
      arguments: [builder, tx.pure.string(message)],
    });
  }
}

/**
 * Package upgrade action builder
 */
export class PackageUpgradeActions {
  constructor(private packages: ActionsPackages) {}

  /**
   * Add an upgrade package action spec
   */
  addUpgrade(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    config: {
      name: string;
      digest: number[] | Uint8Array;
      expectedCapId: string;
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::package_upgrade_init_actions::add_upgrade_spec`,
      arguments: [
        builder,
        tx.pure.string(config.name),
        tx.pure.vector('u8', Array.from(config.digest)),
        tx.pure.id(config.expectedCapId),
      ],
    });
  }

  /**
   * Add a commit upgrade action spec
   */
  addCommit(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    config: {
      name: string;
      expectedCapId: string;
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::package_upgrade_init_actions::add_commit_spec`,
      arguments: [
        builder,
        tx.pure.string(config.name),
        tx.pure.id(config.expectedCapId),
      ],
    });
  }

  /**
   * Add a restrict upgrade policy action spec
   */
  addRestrict(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    config: {
      name: string;
      policy: number;
      expectedCapId: string;
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::package_upgrade_init_actions::add_restrict_spec`,
      arguments: [
        builder,
        tx.pure.string(config.name),
        tx.pure.u8(config.policy),
        tx.pure.id(config.expectedCapId),
      ],
    });
  }

  /**
   * Add a lock upgrade cap action spec
   */
  addLockUpgradeCap(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    config: {
      name: string;
      delayMs: bigint | number;
      resourceName: string;
      expectedCapId: string;
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::package_upgrade_init_actions::add_lock_upgrade_cap_spec`,
      arguments: [
        builder,
        tx.pure.string(config.name),
        tx.pure.u64(config.delayMs),
        tx.pure.string(config.resourceName),
        tx.pure.id(config.expectedCapId),
      ],
    });
  }

  /**
   * Add an unlock upgrade cap action spec
   */
  addUnlockUpgradeCap(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    config: {
      name: string;
      resourceName: string;
      expectedCapId: string;
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::package_upgrade_init_actions::add_unlock_upgrade_cap_spec`,
      arguments: [
        builder,
        tx.pure.string(config.name),
        tx.pure.string(config.resourceName),
        tx.pure.id(config.expectedCapId),
      ],
    });
  }

  /**
   * Add upgrade + commit action specs back to back
   */
  addUpgradeAndCommit(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    config: {
      name: string;
      digest: number[] | Uint8Array;
      expectedCapId: string;
    }
  ): void {
    tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::package_upgrade_init_actions::add_upgrade_and_commit_specs`,
      arguments: [
        builder,
        tx.pure.string(config.name),
        tx.pure.vector('u8', Array.from(config.digest)),
        tx.pure.id(config.expectedCapId),
      ],
    });
  }
}

/**
 * Action spec builder utilities
 */
export class ActionSpecBuilderUtils {
  constructor(private packages: ActionsPackages) {}

  /**
   * Create a new action spec builder
   * @param sourceType - Source type constant (0=launchpad_success, 1=launchpad_failure, 2=proposal)
   * @param sourceId - Source object ID (proposal ID, raise ID, etc.)
   * @param outcomeIndex - Outcome index within the source
   */
  newBuilder(
    tx: Transaction,
    sourceType: number,
    sourceId: string,
    outcomeIndex: number | bigint
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::action_spec_builder::new`,
      arguments: [
        tx.pure.u8(sourceType),
        tx.pure.id(sourceId),
        tx.pure.u64(outcomeIndex),
      ],
    });
  }

  /**
   * Convert builder to vector
   */
  intoVector(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: `${this.packages.accountActionsPackageId}::action_spec_builder::into_vector`,
      arguments: [builder],
    });
  }
}

/**
 * Unified Actions Namespace
 *
 * Organizes all action builders under a single, clean interface.
 */
export class UnifiedActions {
  public readonly stream: StreamActions;
  public readonly currency: CurrencyActions;
  public readonly liquidity: LiquidityActions;
  public readonly vault: VaultActions;
  public readonly config: ConfigActions;
  public readonly transfer: TransferActions;
  public readonly memo: MemoActions;
  public readonly packageUpgrade: PackageUpgradeActions;
  public readonly builder: ActionSpecBuilderUtils;

  constructor(packages: ActionsPackages) {
    this.stream = new StreamActions(packages);
    this.currency = new CurrencyActions(packages);
    this.liquidity = new LiquidityActions(packages);
    this.vault = new VaultActions(packages);
    this.config = new ConfigActions(packages);
    this.transfer = new TransferActions(packages);
    this.memo = new MemoActions(packages);
    this.packageUpgrade = new PackageUpgradeActions(packages);
    this.builder = new ActionSpecBuilderUtils(packages);
  }
}
