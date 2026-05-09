/**
 * Intent Executor - Executes staged actions via PTB pattern
 *
 * Implements the 3-layer action execution pattern:
 * 1. begin_execution → creates Executable hot potato
 * 2. N × do_init_* calls → execute each action in order
 * 3. finalize_execution → confirms all actions executed
 *
 * This hides all the complexity of witnesses, type arguments, and PTB construction.
 *
 * @module workflows/intent-executor
 */

import { Transaction, Inputs } from '@mysten/sui/transactions';
import type { TransactionArgument } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import {
  IntentExecutionConfig,
  IntentActionConfig,
  WorkflowTransaction,
  ObjectIdOrRef,
  isOwnedObjectRef,
  isTxSharedObjectRef,
} from './types';

/**
 * Helper to convert ObjectIdOrRef to transaction object argument.
 * Uses Inputs.ObjectRef for owned objects and sharedObjectRef for shared objects.
 */
function txObject(tx: Transaction, input: ObjectIdOrRef) {
  if (isTxSharedObjectRef(input)) {
    const sharedVersion =
      typeof input.initialSharedVersion === 'string'
        ? input.initialSharedVersion
        : String(input.initialSharedVersion);
    return tx.object(
      Inputs.SharedObjectRef({
        objectId: input.objectId,
        initialSharedVersion: sharedVersion,
        mutable: input.mutable,
      })
    );
  }
  if (isOwnedObjectRef(input)) {
    return tx.object(
      Inputs.ObjectRef({
        objectId: input.objectId,
        version: typeof input.version === 'string' ? input.version : String(input.version),
        digest: input.digest,
      })
    );
  }
  return tx.object(input);
}

/**
 * Helper to get the object ID from an ObjectIdOrRef
 */
function getObjectId(input: ObjectIdOrRef): string {
  if (isOwnedObjectRef(input) || isTxSharedObjectRef(input)) {
    return input.objectId;
  }
  return input;
}

interface IntentExecutionState {
  unsharedDissolutionCapability?: TransactionArgument;
  unsharedDissolutionCapabilityTicket?: TransactionArgument;
  upgradeReceipts: TransactionArgument[];
}

/**
 * Package IDs required for intent execution
 */
export interface IntentExecutorPackages {
  accountActionsPackageId: string;
  accountProtocolPackageId: string;
  futarchyCorePackageId: string;
  futarchyActionsPackageId: string;
  futarchyFactoryPackageId: string;
  futarchyGovernancePackageId: string;
  futarchyGovernanceActionsPackageId: string;
  futarchyOracleActionsPackageId: string;
  /** Required for FeeManager interactions (e.g. quota and launchpad flows) */
  futarchyMarketsCorePackageId: string;
  packageRegistryId: string;
  /** ProposalMutationRegistry shared object ID - required for proposal execution */
  mutationRegistryId: string;
  /** SpotPoolMutationRegistry shared object ID - required for proposal execution */
  spotPoolMutationRegistryId: string;
  /** MarketStateMutationRegistry shared object ID - required for market state mutations */
  marketStateMutationRegistryId: string;
  /** EscrowMutationRegistry shared object ID - required for escrow mutations */
  escrowMutationRegistryId: string;
}

// NOTE: MetadataKeyTypes removed - CoinMetadata is no longer stored in Account
// Use sui::coin_registry::Currency<T> for metadata access instead

/**
 * Intent Executor - Builds PTBs for executing staged actions
 *
 * Supports all 60+ action types from the Futarchy protocol.
 *
 * @example
 * ```typescript
 * const executor = new IntentExecutor(client, packages);
 *
 * // Execute launchpad init actions
 * const tx = executor.execute({
 *   intentType: 'launchpad',
 *   accountId: '0x...',
 *   raiseId: '0x...',
 *   assetType: '0x123::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   actions: [
 *     { action: 'create_stream', coinType: stableType },
 *     { action: 'mint_currency_admin_cap', coinType: assetType },
 *     { action: 'approve_coin_type', coinType: lpType },
 *     { action: 'create_pool_with_mint', assetType, stableType, lpType, mintCapResourceName: 'asset_mint_cap', lpTreasuryCapId, lpCurrencyId },
 *   ],
 * });
 *
 * // NOTE: return_metadata action was removed - CoinMetadata no longer stored in Account
 * // Use sui::coin_registry::Currency<T> for metadata access instead
 * ```
 */
export class IntentExecutor {
  private packages: IntentExecutorPackages;

  constructor(_client: SuiClient, packages: IntentExecutorPackages) {
    // Client kept for future use (async operations, object fetching)
    this.packages = packages;
  }

  /**
   * Execute a set of staged actions
   */
  execute(config: IntentExecutionConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    if (config.intentType === 'launchpad') {
      return this.executeLaunchpadIntent(tx, config, clockId);
    } else {
      return this.executeProposalIntent(tx, config, clockId);
    }
  }

  /**
   * Execute launchpad init actions
   */
  private executeLaunchpadIntent(
    tx: Transaction,
    config: IntentExecutionConfig,
    clockId: string
  ): WorkflowTransaction {
    if (!config.raiseId) {
      throw new Error('raiseId is required for launchpad intent execution');
    }

    const {
      futarchyCorePackageId,
      futarchyFactoryPackageId,
      packageRegistryId,
    } = this.packages;

    // 1. Begin execution - returns (Executable, DaoInitExecutionTicket) tuple
    const beginResult = tx.moveCall({
      target: `${futarchyFactoryPackageId}::dao_init_executor::begin_success_execution_for_launchpad`,
      arguments: [
        tx.pure.id(getObjectId(config.raiseId!)),
        txObject(tx, config.accountId),
        tx.object(packageRegistryId),
        tx.object(clockId),
      ],
    });
    const executable = beginResult[0];
    const ticket = beginResult[1];

    // Launchpad init actions currently treat IW as an opaque drop type.
    // Use a public call that returns u64 so PTBs do not call package-private witness constructors.
    const intentWitness = tx.moveCall({
      target: `${futarchyFactoryPackageId}::factory_version::get`,
      arguments: [],
    });

    // 2. Execute each action in order
    const execState: IntentExecutionState = {
      upgradeReceipts: [],
    };
    for (const action of config.actions) {
      this.executeAction(tx, executable, intentWitness, config, action, {
        configType: `${futarchyCorePackageId}::futarchy_config::FutarchyConfig`,
        outcomeType: `${futarchyFactoryPackageId}::dao_init_outcome::DaoInitOutcome`,
        witnessType: 'u64',
        clockId,
      }, execState);
    }

    // 3. Finalize via launchpad (updates raise state + calls dao_init_executor::finalize_execution)
    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::finalize_completion_execution`,
      typeArguments: [config.assetType!, config.stableType!],
      arguments: [
        txObject(tx, config.raiseId!),
        txObject(tx, config.accountId),
        tx.object(packageRegistryId),
        executable,
        ticket,
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: `Execute ${config.actions.length} launchpad init action(s)`,
    };
  }

  /**
   * Execute proposal actions
   *
   * NOTE: begin_execution now does the following BEFORE returning the Executable:
   * - Finalizes market state and proposal (sets FINALIZED)
   * - Restores quantum LP to spot pool (clears active_proposal_id)
   *
   * This means actions execute on a "normal" spot pool with no active proposal blocking.
   */
  private executeProposalIntent(
    tx: Transaction,
    config: IntentExecutionConfig,
    clockId: string
  ): WorkflowTransaction {
    if (!config.proposalId || !config.spotPoolId || !config.lpType) {
      throw new Error('proposalId, spotPoolId, and lpType are required for proposal intent execution');
    }

    const {
      futarchyCorePackageId,
      futarchyGovernancePackageId,
      packageRegistryId,
      mutationRegistryId,
      spotPoolMutationRegistryId,
      marketStateMutationRegistryId,
      escrowMutationRegistryId,
    } = this.packages;

    // 1. Begin execution (also finalizes proposal and restores quantum LP)
    // Returns (Executable, ExecutionTicket) — ticket is a hot potato forcing finalize_execution_success
    const [executable, executionTicket] = tx.moveCall({
      target: `${futarchyGovernancePackageId}::ptb_executor::begin_execution`,
      typeArguments: [config.assetType, config.stableType, config.lpType!],
      arguments: [
        txObject(tx, config.accountId),
        tx.object(packageRegistryId),
        tx.object(mutationRegistryId), // mutation_registry
        tx.object(spotPoolMutationRegistryId), // spot_pool_mutation_registry
        tx.object(marketStateMutationRegistryId), // market_state_mutation_registry
        tx.object(escrowMutationRegistryId), // escrow_mutation_registry
        txObject(tx, config.proposalId!),
        txObject(tx, config.spotPoolId!),
        tx.object(clockId),
      ],
    });

    // Proposal action handlers currently treat IW as an opaque drop type.
    // Use a public call that returns u64 so PTBs do not call package-private witness constructors.
    const governanceWitness = tx.moveCall({
      target: `${futarchyCorePackageId}::futarchy_version::get`,
      arguments: [],
    });

    // 2. Execute each action in order (spot pool is now "normal")
    const execState: IntentExecutionState = {
      upgradeReceipts: [],
    };
    for (const action of config.actions) {
      this.executeAction(tx, executable, governanceWitness, config, action, {
        configType: `${futarchyCorePackageId}::futarchy_config::FutarchyConfig`,
        outcomeType: `${futarchyCorePackageId}::futarchy_config::FutarchyOutcome`,
        witnessType: 'u64',
        clockId,
      }, execState);
    }

    // 3. Finalize execution (confirm, emit events, refund proposer fee)
    // Both executable and executionTicket are hot potatoes consumed here
    tx.moveCall({
      target: `${futarchyGovernancePackageId}::ptb_executor::finalize_execution_success`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.accountId),
        tx.object(packageRegistryId),
        tx.object(mutationRegistryId), // mutation_registry
        txObject(tx, config.proposalId!),
        executable,
        executionTicket,
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: `Execute ${config.actions.length} proposal action(s)`,
    };
  }

  /**
   * Execute a single action within the intent
   */
  private executeAction(
    tx: Transaction,
    executable: TransactionArgument,
    intentWitness: TransactionArgument,
    config: IntentExecutionConfig,
    action: IntentActionConfig,
    typeContext: {
      configType: string;
      outcomeType: string;
      witnessType: string;
      clockId: string;
    },
    execState?: IntentExecutionState
  ): void {
    const {
      accountActionsPackageId,
      accountProtocolPackageId,
      futarchyActionsPackageId,
      futarchyFactoryPackageId,
      futarchyGovernanceActionsPackageId,
      futarchyOracleActionsPackageId,
      packageRegistryId,
    } = this.packages;

    const { configType, outcomeType, witnessType, clockId } = typeContext;

    switch (action.action) {
      // =========================================================================
      // ACCOUNT ACTIONS - STREAM
      // =========================================================================
      case 'create_stream':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_init_create_stream`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(clockId),
            intentWitness,
          ],
        });
        break;

      case 'cancel_stream':
        // do_cancel_stream requires: executable, account, registry, clock, witness, ctx
        // vault_name is now read from ActionSpec (not passed as parameter)
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_cancel_stream`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(clockId),
            intentWitness,
          ],
        });
        break;

      case 'collect_stream': {
        const streamCapId = action.streamCapId ?? action.externalArg;
        if (!streamCapId) {
          throw new Error('collect_stream requires streamCapId or externalArg (StreamCap object ID)');
        }
        tx.moveCall({
          target: `${accountProtocolPackageId}::owned::do_provide_object`,
          typeArguments: [outcomeType, `${accountActionsPackageId}::vault::StreamCap`, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(streamCapId),
          ],
        });
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_collect_stream`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(clockId),
            intentWitness,
          ],
        });
        break;
      }

      // =========================================================================
      // ACCOUNT ACTIONS - VAULT
      // =========================================================================
      case 'deposit':
        // do_init_deposit takes coin from executable_resources (deterministic!)
        // No coin parameter - coin comes from previous action via executable_resources
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_init_deposit`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'spend':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_spend`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'approve_coin_type':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_approve_coin_type`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'remove_approved_coin_type':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_remove_approved_coin_type`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'deposit_from_resources':
        // Deposits coin from executable_resources into specified vault
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_init_deposit_from_resources`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'deposit_object_from_resources':
        // Deposits Coin<T> object from executable_resources into specified vault
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_init_deposit_object_from_resources`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'open_vault':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_init_open`,
          typeArguments: [configType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'close_vault':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_init_close`,
          typeArguments: [configType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - CURRENCY
      // =========================================================================
      case 'mint':
        // do_init_mint mints coins and stores them in executable_resources via provide_coin
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_init_mint`,
          typeArguments: [outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'burn':
        // do_init_burn takes coin from executable_resources (deterministic!)
        // No coin parameter - coin comes from previous action via executable_resources
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_init_burn`,
          typeArguments: [outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'mint_currency_admin_cap':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_mint_currency_admin_cap`,
          typeArguments: [outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'update_currency':
        if (!action.currencyId) {
          throw new Error('update_currency requires currencyId (Currency<CoinType> shared object ID)');
        }
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_update`,
          typeArguments: [outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(action.currencyId),
            intentWitness,
          ],
        });
        break;

      case 'remove_treasury_cap_to_resources':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_init_remove_treasury_cap_to_resources`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'remove_metadata_cap_to_resources':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_init_remove_metadata_cap_to_resources`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'lock_treasury_cap':
        if (!action.externalArg) {
          throw new Error('lock_treasury_cap requires externalArg (treasury cap object ID)');
        }
        tx.moveCall({
          target: `${accountProtocolPackageId}::owned::do_provide_object`,
          typeArguments: [outcomeType, `0x2::coin::TreasuryCap<${action.coinType}>`, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(action.externalArg),
          ],
        });
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_init_lock_treasury_cap`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'lock_metadata_cap':
        if (!action.externalArg) {
          throw new Error('lock_metadata_cap requires externalArg (metadata cap object ID)');
        }
        tx.moveCall({
          target: `${accountProtocolPackageId}::owned::do_provide_object`,
          typeArguments: [outcomeType, `0x2::coin_registry::MetadataCap<${action.coinType}>`, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(action.externalArg),
          ],
        });
        tx.moveCall({
          target: `${accountActionsPackageId}::currency::do_init_lock_metadata_cap`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'lock_upgrade_cap':
        // LockUpgradeCap now takes the cap from executable_resources.
        // The execution PTB still has to provide the UpgradeCap first.
        if (!action.externalArg) {
          throw new Error('lock_upgrade_cap requires externalArg (upgrade cap object ID)');
        }
        tx.moveCall({
          target: `${accountProtocolPackageId}::owned::do_provide_object`,
          typeArguments: [outcomeType, '0x2::package::UpgradeCap', witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(action.externalArg),
          ],
        });
        tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade::do_init_lock_upgrade_cap`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'unlock_upgrade_cap':
        // do_init_unlock_upgrade_cap removes a locked UpgradeCap and stages it in executable_resources
        tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade::do_init_unlock_upgrade_cap`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'upgrade_package': {
        if (!execState) {
          throw new Error('upgrade_package execution requires execution state');
        }
        if (!action.upgrade) {
          throw new Error('upgrade_package requires runtime upgrade artifacts');
        }
        const ticket = tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade::do_init_upgrade`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(clockId),
            intentWitness,
          ],
        });
        const receipt = tx.upgrade({
          package: action.upgrade.packageId,
          modules: action.upgrade.modules,
          dependencies: action.upgrade.dependencies,
          ticket,
        });
        execState.upgradeReceipts.push(receipt);
        break;
      }

      case 'commit_upgrade': {
        if (!execState?.upgradeReceipts.length) {
          throw new Error('commit_upgrade requires an earlier upgrade_package action in the same intent');
        }
        const receipt = execState.upgradeReceipts.shift()!;
        tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade::do_init_commit`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            receipt,
            intentWitness,
          ],
        });
        break;
      }

      case 'restrict_upgrade':
        tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade::do_init_restrict`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'mint_vault_admin_cap':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_mint_vault_admin_cap`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      // NOTE: 'return_metadata' action removed - CoinMetadata is no longer stored in Account
      // Use sui::coin_registry::Currency<T> for metadata access instead

      // =========================================================================
      // ACCOUNT ACTIONS - TRANSFER (objects via provide_object)
      // =========================================================================
      case 'transfer':
        // do_init_transfer takes object from executable_resources (deterministic!)
        // No object parameter - object comes from previous action via executable_resources
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer::do_init_transfer`,
          typeArguments: [outcomeType, action.objectType, witnessType],
          arguments: [
            executable,
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'transfer_to_sender':
        // do_init_transfer_to_sender takes object from executable_resources (deterministic!)
        // No object parameter - object comes from previous action via executable_resources
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer::do_init_transfer_to_sender`,
          typeArguments: [outcomeType, action.objectType, witnessType],
          arguments: [
            executable,
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - TRANSFER (coins via provide_coin)
      // =========================================================================
      case 'transfer_coin':
        // do_init_transfer_coin takes coin from executable_resources via take_coin
        // Use this when coin was placed via provide_coin (e.g., VaultSpend, CurrencyMint)
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer::do_init_transfer_coin`,
          typeArguments: [outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'transfer_coin_to_sender':
        // do_init_transfer_coin_to_sender takes coin from executable_resources via take_coin
        // Transfers to whoever executes the intent (cranker) - used for crank fees
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer::do_init_transfer_coin_to_sender`,
          typeArguments: [outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - MEMO
      // =========================================================================
      case 'memo':
        // do_emit_memo signature: (executable, account, registry, intent_witness, clock, ctx)
        tx.moveCall({
          target: `${accountActionsPackageId}::memo::do_emit_memo`,
          typeArguments: [configType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      // =========================================================================
      // FUTARCHY CONFIG ACTIONS
      // =========================================================================
      case 'terminate_dao':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_terminate_dao`,
          typeArguments: [config.assetType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_dao_name':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_name`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_trading_params':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_trading_params`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_dao_metadata':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_metadata`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_twap_config':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_twap_config`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_governance':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_governance`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_metadata_table':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_metadata_table`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_conditional_metadata':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_conditional_metadata`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'update_sponsorship_config':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_update_sponsorship_config`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      // =========================================================================
      // FUTARCHY QUOTA ACTIONS
      // =========================================================================
      case 'set_quotas':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::quota_actions::do_set_quotas`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'deposit_raise_funds':
        if (!config.raiseId) throw new Error('raiseId is required for deposit_raise_funds action');
        tx.moveCall({
          target: `${futarchyFactoryPackageId}::launchpad::do_init_deposit_raise_funds`,
          typeArguments: [action.assetType, action.stableType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            txObject(tx, config.raiseId),
            intentWitness,
          ],
        });
        break;

      // =========================================================================
      // FUTARCHY LIQUIDITY ACTIONS
      // =========================================================================
      case 'create_pool_with_mint':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::liquidity_init_actions::do_init_create_pool_with_mint`,
          typeArguments: [
            configType,
            outcomeType,
            action.assetType,
            action.stableType,
            action.lpType,
            witnessType,
          ],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(action.lpTreasuryCapId),
            tx.object(action.lpCurrencyId),
            tx.object(clockId),
            intentWitness,
          ],
        });
        break;

      case 'create_pool_from_coins': {
        const assetCoin = action.assetCoin ?? (action.assetCoinId ? tx.object(action.assetCoinId) : undefined);
        const stableCoin = action.stableCoin ?? (action.stableCoinId ? tx.object(action.stableCoinId) : undefined);
        if (!assetCoin) throw new Error('create_pool_from_coins requires assetCoin or assetCoinId');
        if (!stableCoin) throw new Error('create_pool_from_coins requires stableCoin or stableCoinId');

        tx.moveCall({
          target: `${futarchyActionsPackageId}::liquidity_init_actions::do_init_create_pool_from_coins`,
          typeArguments: [
            configType,
            outcomeType,
            action.assetType,
            action.stableType,
            action.lpType,
            witnessType,
          ],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            assetCoin as TransactionArgument,
            stableCoin as TransactionArgument,
            tx.object(action.lpTreasuryCapId),
            tx.object(action.lpCurrencyId),
            tx.object(clockId),
            intentWitness,
          ],
        });
        break;
      }

      case 'add_liquidity':
        if (!config.spotPoolId) throw new Error('spotPoolId is required for add_liquidity action');
        if (!config.lpType) throw new Error('lpType is required for add_liquidity action');
        tx.moveCall({
          target: `${futarchyActionsPackageId}::liquidity_actions::do_add_liquidity`,
          typeArguments: [action.assetType, action.stableType, config.lpType, outcomeType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            txObject(tx, config.spotPoolId),
            tx.object(clockId),
          ],
        });
        break;

      case 'swap':
        if (!config.spotPoolId) throw new Error('spotPoolId is required for swap action');
        if (!config.lpType) throw new Error('lpType is required for swap action');
        tx.moveCall({
          target: `${futarchyActionsPackageId}::liquidity_actions::do_swap`,
          typeArguments: [action.assetType, action.stableType, config.lpType, outcomeType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            txObject(tx, config.spotPoolId),
            tx.object(clockId),
          ],
        });
        break;

      case 'update_pool_fee':
        if (!config.spotPoolId) throw new Error('spotPoolId is required for update_pool_fee action');
        tx.moveCall({
          target: `${futarchyActionsPackageId}::liquidity_actions::do_update_pool_fee`,
          typeArguments: [action.assetType, action.stableType, action.lpType, outcomeType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(this.packages.spotPoolMutationRegistryId),
            txObject(tx, config.spotPoolId),
          ],
        });
        break;

      case 'remove_liquidity_to_resources':
        if (!config.spotPoolId) throw new Error('spotPoolId is required for remove_liquidity_to_resources action');
        tx.moveCall({
          target: `${futarchyActionsPackageId}::liquidity_actions::do_remove_liquidity_to_resources`,
          typeArguments: [action.assetType, action.stableType, action.lpType, outcomeType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(this.packages.spotPoolMutationRegistryId),
            txObject(tx, config.spotPoolId),
          ],
        });
        break;

      case 'create_protective_bid':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::protective_bid_init_actions::do_create_protective_bid`,
          typeArguments: [
            action.assetType,
            action.stableType,
            outcomeType,
            witnessType,
          ],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(clockId),
            intentWitness,
          ],
        });
        break;

      case 'cancel_protective_bid':
        {
        const bidId = action.bidId ?? action.externalArg;
        if (!bidId) {
          throw new Error('cancel_protective_bid requires bidId in action');
        }
        tx.moveCall({
          target: `${futarchyActionsPackageId}::protective_bid_actions::do_cancel_protective_bid`,
          typeArguments: [
            action.assetType,
            action.stableType,
            outcomeType,
            witnessType,
          ],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(this.packages.spotPoolMutationRegistryId),
            tx.object(bidId),
            intentWitness,
          ],
        });
        break;
        }

      case 'create_protective_ask':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::protective_ask_init_actions::do_create_protective_ask`,
          typeArguments: [
            action.assetType,
            action.stableType,
            outcomeType,
            witnessType,
          ],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(this.packages.spotPoolMutationRegistryId),
            tx.object(clockId),
            intentWitness,
          ],
        });
        break;

      case 'cancel_protective_ask':
        {
        const askId = action.askId ?? action.externalArg;
        if (!askId) {
          throw new Error('cancel_protective_ask requires askId in action');
        }
        tx.moveCall({
          target: `${futarchyActionsPackageId}::protective_ask_actions::do_cancel_protective_ask`,
          typeArguments: [
            action.assetType,
            action.stableType,
            outcomeType,
            witnessType,
          ],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(this.packages.spotPoolMutationRegistryId),
            tx.object(askId),
            intentWitness,
          ],
        });
        break;
        }

      // =========================================================================
      // FUTARCHY DISSOLUTION ACTIONS
      // =========================================================================
      case 'create_dissolution_capability':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::dissolution_actions::do_create_dissolution_capability`,
          typeArguments: [action.assetType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'create_dissolution_capability_unshared':
        if (!execState) {
          throw new Error('create_dissolution_capability_unshared requires proposal execution state');
        }
        {
        const res = tx.moveCall({
          target: `${futarchyActionsPackageId}::dissolution_actions::do_create_dissolution_capability_unshared`,
          typeArguments: [action.assetType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        execState.unsharedDissolutionCapability = res[0];
        execState.unsharedDissolutionCapabilityTicket = res[1];
        }
        break;

      case 'create_redemption_pool':
        {
        const capabilityId = action.capabilityId ?? action.externalArg;
        if (capabilityId) {
          tx.moveCall({
            target: `${futarchyActionsPackageId}::dissolution_actions::do_create_redemption_pool`,
            typeArguments: [action.redeemCoinType, outcomeType, witnessType],
            arguments: [
              executable,
              txObject(tx, config.accountId),
              tx.object(packageRegistryId),
              tx.object(capabilityId),
              intentWitness,
            ],
          });
        } else if (execState?.unsharedDissolutionCapability && execState.unsharedDissolutionCapabilityTicket) {
          tx.moveCall({
            target: `${futarchyActionsPackageId}::dissolution_actions::do_create_redemption_pool_from_unshared_capability`,
            typeArguments: [action.redeemCoinType, outcomeType, witnessType],
            arguments: [
              executable,
              txObject(tx, config.accountId),
              tx.object(packageRegistryId),
              execState.unsharedDissolutionCapability,
              execState.unsharedDissolutionCapabilityTicket,
              intentWitness,
            ],
          });
        } else {
          throw new Error('create_redemption_pool requires capabilityId/externalArg or prior create_dissolution_capability_unshared');
        }
        break;
        }

      case 'share_dissolution_capability':
        if (!execState?.unsharedDissolutionCapability || !execState.unsharedDissolutionCapabilityTicket) {
          throw new Error('share_dissolution_capability requires prior create_dissolution_capability_unshared');
        }
        tx.moveCall({
          target: `${futarchyActionsPackageId}::dissolution_actions::do_share_dissolution_capability`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            execState.unsharedDissolutionCapability,
            execState.unsharedDissolutionCapabilityTicket,
            intentWitness,
          ],
        });
        execState.unsharedDissolutionCapability = undefined;
        execState.unsharedDissolutionCapabilityTicket = undefined;
        break;

      case 'add_to_redemption_pool':
        {
        const poolId = action.poolId ?? action.externalArg;
        if (!poolId) {
          throw new Error('poolId (or externalArg) is required for add_to_redemption_pool action');
        }
        tx.moveCall({
          target: `${futarchyActionsPackageId}::dissolution_actions::do_add_to_redemption_pool`,
          typeArguments: [action.redeemCoinType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(poolId),
            intentWitness,
          ],
        });
        break;
        }

      // =========================================================================
      // FUTARCHY CONFIG ACTIONS - TWAP SYNC
      // =========================================================================
      case 'sync_twap_observation_from_proposal':
        if (!config.proposalId) throw new Error('proposalId is required for sync_twap_observation_from_proposal action');
        tx.moveCall({
          target: `${futarchyActionsPackageId}::config_actions::do_sync_twap_observation_from_proposal`,
          typeArguments: [config.assetType, config.stableType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            txObject(tx, config.proposalId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - DEPOSIT EXTERNAL
      // =========================================================================
      case 'deposit_external':
        // NOTE: This action takes an external coin from PTB - requires special handling
        {
        const depositCoin = action.coin ?? (action.externalArg ? tx.object(action.externalArg) : undefined);
        if (!depositCoin) {
          throw new Error('deposit_external requires coin or externalArg (coin object ID)');
        }
        tx.moveCall({
          target: `${accountActionsPackageId}::vault::do_deposit_external`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            depositCoin as ReturnType<Transaction['moveCall']> | ReturnType<Transaction['object']>,
            intentWitness,
          ],
        });
        break;
        }

      // =========================================================================
      // ACCOUNT ACTIONS - ACCESS CONTROL (LOCK/UNLOCK)
      // =========================================================================
      case 'provide_object':
        {
        // Provide an external object into executable_resources for a subsequent action
        const objectId = action.objectId ?? action.externalArg;
        const provideArg = objectId ? tx.object(objectId) : undefined;
        if (!provideArg) {
          throw new Error('provide_object requires objectId or externalArg');
        }
        tx.moveCall({
          target: `${accountProtocolPackageId}::owned::do_provide_object`,
          typeArguments: [outcomeType, action.objectType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            provideArg,
          ],
        });
        break;
        }

      case 'lock_access':
        // do_lock takes the cap from executable_resources (staged by prior provide_object action)
        tx.moveCall({
          target: `${accountActionsPackageId}::access_control::do_lock`,
          typeArguments: [configType, outcomeType, action.capType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'unlock_access': {
        tx.moveCall({
          target: `${accountActionsPackageId}::access_control::do_unlock_to_resources`,
          typeArguments: [configType, outcomeType, action.capType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;
      }

      // =========================================================================
      // ACCOUNT ACTIONS - OWNED OBJECT WITHDRAWAL
      // =========================================================================
      case 'withdraw_object':
        // NOTE: This action requires a Receiving<T> object - requires special handling
        {
        const receivingArg = action.receiving ?? (action.externalArg ? tx.object(action.externalArg) : undefined);
        if (!receivingArg) {
          throw new Error('withdraw_object requires receiving or externalArg (object ID)');
        }
        tx.moveCall({
          target: `${accountProtocolPackageId}::owned::do_withdraw_object`,
          typeArguments: [outcomeType, action.objectType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            receivingArg as ReturnType<Transaction['moveCall']> | ReturnType<Transaction['object']>,
            intentWitness,
          ],
        });
        break;
        }

      // =========================================================================
      // ACCOUNT ACTIONS - VESTING
      // =========================================================================
      case 'create_vesting':
        tx.moveCall({
          target: `${accountActionsPackageId}::vesting::do_create_vesting`,
          typeArguments: [configType, outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(clockId),
            intentWitness,
          ],
        });
        break;

      case 'cancel_vesting':
        if (!action.vestingId) throw new Error('vestingId is required for cancel_vesting action');
        tx.moveCall({
          target: `${accountActionsPackageId}::vesting::do_cancel_vesting`,
          typeArguments: [outcomeType, action.coinType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            tx.object(action.vestingId), // Vesting object by value (destroyed)
            tx.object(clockId),
            intentWitness,
          ],
        });
        break;

      // =========================================================================
      // ACCOUNT ACTIONS - CONFIG (AUTHORIZATION, DEPS)
      // =========================================================================
      case 'set_authorization_level':
        tx.moveCall({
          target: `${this.packages.accountProtocolPackageId}::config::do_set_authorization_level`,
          typeArguments: [configType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'add_dep':
        tx.moveCall({
          target: `${this.packages.accountProtocolPackageId}::config::do_add_dep`,
          typeArguments: [configType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      case 'remove_dep':
        tx.moveCall({
          target: `${this.packages.accountProtocolPackageId}::config::do_remove_dep`,
          typeArguments: [configType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
          ],
        });
        break;

      // =========================================================================
      // GOVERNANCE ACTIONS - PACKAGE REGISTRY
      // =========================================================================
      case 'add_package':
        tx.moveCall({
          target: `${futarchyGovernanceActionsPackageId}::package_registry_actions::do_add_package`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            intentWitness,
            tx.object(packageRegistryId),
          ],
        });
        break;

      case 'update_package_metadata':
        tx.moveCall({
          target: `${futarchyGovernanceActionsPackageId}::package_registry_actions::do_update_package_metadata`,
          typeArguments: [outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            intentWitness,
            tx.object(packageRegistryId),
          ],
        });
        break;

      // =========================================================================
      // ORACLE ACTIONS
      // =========================================================================
      case 'create_oracle_grant':
        tx.moveCall({
          target: `${futarchyOracleActionsPackageId}::oracle_actions::do_create_oracle_grant`,
          typeArguments: [action.assetType, action.stableType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(clockId),
          ],
        });
        break;

      case 'cancel_oracle_grant':
        if (!action.grantId) throw new Error('grantId is required for cancel_oracle_grant action');
        tx.moveCall({
          target: `${futarchyOracleActionsPackageId}::oracle_actions::do_cancel_grant`,
          typeArguments: [action.assetType, action.stableType, outcomeType, witnessType],
          arguments: [
            executable,
            txObject(tx, config.accountId),
            tx.object(packageRegistryId),
            intentWitness,
            tx.object(action.grantId),
            tx.object(clockId),
          ],
        });
        break;

      default:
        throw new Error(`Unknown action type: ${(action as { action: string }).action}`);
    }
  }
}
