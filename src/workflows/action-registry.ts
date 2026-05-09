/**
 * Action Registry - Maps action types to their execution handlers
 *
 * Uses a declarative pattern for action execution, reducing code duplication.
 *
 * @module workflows/action-registry
 */

import { Transaction, TransactionResult, Inputs } from '@mysten/sui/transactions';
import type { TransactionArgument } from '@mysten/sui/transactions';
import { IntentExecutionConfig, ObjectIdOrRef, isOwnedObjectRef, isTxSharedObjectRef } from './types/index';
import type { IntentExecutorPackages } from './intent-executor';

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
 * Action parameters - all possible fields from any action type
 * Using this permissive type allows handlers to access action-specific fields
 */
export interface ActionParams {
  action: string;
  coinType?: string;
  objectType?: string;
  capType?: string;
  keyType?: string;
  assetType?: string;
  stableType?: string;
  lpType?: string;
  lpTreasuryCapId?: string;
  lpCurrencyId?: string;
  assetCoin?: TransactionArgument;
  stableCoin?: TransactionArgument;
  assetCoinId?: string;
  stableCoinId?: string;
  poolId?: string;
  redeemCoinType?: string;
  capabilityId?: string;
  bidId?: string;
  askId?: string;
  /** PriceBasedMintGrant shared object ID for cancel_oracle_grant */
  grantId?: string;
  /** Currency<CoinType> shared object ID for actions that need it (e.g., update_currency) */
  currencyId?: string;
  /** External object ID for actions that need PTB-provided objects (e.g., lock_treasury_cap) */
  externalArg?: string;
  /** Exact object ID approved by a provide_object action. */
  objectId?: string;
  /** StreamCap object ID for collect_stream */
  streamCapId?: string;
}

/**
 * Context passed to action handlers
 */
export interface ActionContext {
  tx: Transaction;
  executable: TransactionResult;
  intentWitness: TransactionResult;
  config: IntentExecutionConfig;
  packages: IntentExecutorPackages;
  typeContext: {
    configType: string;
    outcomeType: string;
    witnessType: string;
    clockId: string;
  };
}

/**
 * Handler function signature for actions
 */
export type ActionHandler = (ctx: ActionContext, action: ActionParams) => void;

/**
 * Registry of action handlers
 */
const actionHandlers = new Map<string, ActionHandler>();

/**
 * Register an action handler
 */
export function registerAction(actionType: string, handler: ActionHandler): void {
  actionHandlers.set(actionType, handler);
}

/**
 * Execute an action using the registry
 */
export function executeAction(actionType: string, ctx: ActionContext, action: ActionParams): void {
  const handler = actionHandlers.get(actionType);
  if (!handler) {
    throw new Error(`Unknown action type: ${actionType}`);
  }
  handler(ctx, action);
}

/**
 * Check if an action type is registered
 */
export function hasAction(actionType: string): boolean {
  return actionHandlers.has(actionType);
}

// ============================================================================
// ACCOUNT ACTIONS - STREAM
// ============================================================================

registerAction('create_stream', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_init_create_stream`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), tx.object(typeContext.clockId), intentWitness],
  });
});

registerAction('cancel_stream', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_cancel_stream`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), tx.object(typeContext.clockId), intentWitness],
  });
});

registerAction('collect_stream', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  const streamCapId = action.streamCapId ?? action.externalArg;
  if (!streamCapId) {
    throw new Error('collect_stream requires streamCapId or externalArg (StreamCap object ID)');
  }
  tx.moveCall({
    target: `${packages.accountProtocolPackageId}::owned::do_provide_object`,
    typeArguments: [typeContext.outcomeType, `${packages.accountActionsPackageId}::vault::StreamCap`, typeContext.witnessType],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(packages.packageRegistryId),
      intentWitness,
      tx.object(streamCapId),
    ],
  });
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_collect_stream`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(packages.packageRegistryId),
      tx.object(typeContext.clockId),
      intentWitness,
    ],
  });
});

// ============================================================================
// ACCOUNT ACTIONS - VAULT
// ============================================================================

registerAction('deposit', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_init_deposit`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('spend', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_spend`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('approve_coin_type', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_approve_coin_type`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('remove_approved_coin_type', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_remove_approved_coin_type`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('deposit_from_resources', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_init_deposit_from_resources`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('deposit_object_from_resources', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_init_deposit_object_from_resources`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('mint_vault_admin_cap', (ctx) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::vault::do_mint_vault_admin_cap`,
    typeArguments: [typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

// ============================================================================
// ACCOUNT ACTIONS - CURRENCY
// ============================================================================

registerAction('mint', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::currency::do_init_mint`,
    typeArguments: [typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('burn', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::currency::do_init_burn`,
    typeArguments: [typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('mint_currency_admin_cap', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::currency::do_mint_currency_admin_cap`,
    typeArguments: [typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('update_currency', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  if (!action.currencyId) {
    throw new Error('update_currency requires currencyId (Currency<CoinType> shared object ID)');
  }
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::currency::do_update`,
    typeArguments: [typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), tx.object(action.currencyId), intentWitness],
  });
});

registerAction('remove_treasury_cap_to_resources', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::currency::do_init_remove_treasury_cap_to_resources`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('remove_metadata_cap_to_resources', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::currency::do_init_remove_metadata_cap_to_resources`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('lock_treasury_cap', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  if (!action.externalArg) {
    throw new Error('lock_treasury_cap requires externalArg (treasury cap object ID)');
  }
  tx.moveCall({
    target: `${packages.accountProtocolPackageId}::owned::do_provide_object`,
    typeArguments: [typeContext.outcomeType, `0x2::coin::TreasuryCap<${action.coinType!}>`, typeContext.witnessType],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(packages.packageRegistryId),
      intentWitness,
      tx.object(action.externalArg),
    ],
  });
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::currency::do_init_lock_treasury_cap`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('lock_metadata_cap', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  if (!action.externalArg) {
    throw new Error('lock_metadata_cap requires externalArg (metadata cap object ID)');
  }
  tx.moveCall({
    target: `${packages.accountProtocolPackageId}::owned::do_provide_object`,
    typeArguments: [typeContext.outcomeType, `0x2::coin_registry::MetadataCap<${action.coinType!}>`, typeContext.witnessType],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(packages.packageRegistryId),
      intentWitness,
      tx.object(action.externalArg),
    ],
  });
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::currency::do_init_lock_metadata_cap`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

// NOTE: 'return_metadata' action removed - CoinMetadata no longer stored in Account
// Use sui::coin_registry::Currency<T> for metadata access instead

// ============================================================================
// ACCOUNT ACTIONS - TRANSFER
// ============================================================================

registerAction('transfer', (ctx, action) => {
  const { tx, executable, intentWitness, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${ctx.packages.accountActionsPackageId}::transfer::do_init_transfer`,
    typeArguments: [typeContext.outcomeType, action.objectType!, typeContext.witnessType],
    arguments: [executable, tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('transfer_to_sender', (ctx, action) => {
  const { tx, executable, intentWitness, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${ctx.packages.accountActionsPackageId}::transfer::do_init_transfer_to_sender`,
    typeArguments: [typeContext.outcomeType, action.objectType!, typeContext.witnessType],
    arguments: [executable, tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('transfer_coin', (ctx, action) => {
  const { tx, executable, intentWitness, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${ctx.packages.accountActionsPackageId}::transfer::do_init_transfer_coin`,
    typeArguments: [typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('transfer_coin_to_sender', (ctx, action) => {
  const { tx, executable, intentWitness, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${ctx.packages.accountActionsPackageId}::transfer::do_init_transfer_coin_to_sender`,
    typeArguments: [typeContext.outcomeType, action.coinType!, typeContext.witnessType],
    arguments: [executable, tx.object(packages.packageRegistryId), intentWitness],
  });
});

// ============================================================================
// ACCOUNT ACTIONS - ACCESS CONTROL
// ============================================================================

registerAction('provide_object', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  const objectId = action.objectId ?? action.externalArg;
  if (!objectId) {
    throw new Error('provide_object requires objectId or externalArg');
  }
  tx.moveCall({
    target: `${packages.accountProtocolPackageId}::owned::do_provide_object`,
    typeArguments: [typeContext.outcomeType, action.objectType!, typeContext.witnessType],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(packages.packageRegistryId),
      intentWitness,
      tx.object(objectId),
    ],
  });
});

registerAction('lock_access', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::access_control::do_lock`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.capType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('unlock_access', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::access_control::do_unlock_to_resources`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, action.capType!, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

// ============================================================================
// ACCOUNT ACTIONS - MEMO
// ============================================================================

registerAction('memo', (ctx) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.accountActionsPackageId}::memo::do_emit_memo`,
    typeArguments: [typeContext.configType, typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness, tx.object(typeContext.clockId)],
  });
});

// ============================================================================
// FUTARCHY CONFIG ACTIONS
// ============================================================================

const configActionNames = [
  'terminate_dao',
  'update_dao_name',
  'update_trading_params',
  'update_dao_metadata',
  'update_twap_config',
  'update_governance',
  'update_metadata_table',
  'update_conditional_metadata',
  'update_sponsorship_config',
] as const;

const configActionTargets: Record<typeof configActionNames[number], string> = {
  'terminate_dao': 'do_terminate_dao',
  'update_dao_name': 'do_update_name',
  'update_trading_params': 'do_update_trading_params',
  'update_dao_metadata': 'do_update_metadata',
  'update_twap_config': 'do_update_twap_config',
  'update_governance': 'do_update_governance',
  'update_metadata_table': 'do_update_metadata_table',
  'update_conditional_metadata': 'do_update_conditional_metadata',
  'update_sponsorship_config': 'do_update_sponsorship_config',
};

for (const actionName of configActionNames) {
  registerAction(actionName, (ctx) => {
    const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
    const typeArguments = actionName === 'terminate_dao'
      ? [config.assetType, typeContext.outcomeType, typeContext.witnessType]
      : [typeContext.outcomeType, typeContext.witnessType];
    tx.moveCall({
      target: `${packages.futarchyActionsPackageId}::config_actions::${configActionTargets[actionName]}`,
      typeArguments,
      arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness, tx.object(typeContext.clockId)],
    });
  });
}

registerAction('sync_twap_observation_from_proposal', (ctx) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  if (!config.proposalId) {
    throw new Error('proposalId is required for sync_twap_observation_from_proposal action');
  }

  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::config_actions::do_sync_twap_observation_from_proposal`,
    typeArguments: [config.assetType, config.stableType, typeContext.witnessType],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(packages.packageRegistryId),
      txObject(tx, config.proposalId),
      intentWitness,
      tx.object(typeContext.clockId),
    ],
  });
});

// ============================================================================
// FUTARCHY QUOTA ACTIONS
// ============================================================================

registerAction('set_quotas', (ctx) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::quota_actions::do_set_quotas`,
    typeArguments: [typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness, tx.object(typeContext.clockId)],
  });
});

// ============================================================================
// FUTARCHY LIQUIDITY ACTIONS
// ============================================================================

registerAction('create_pool_with_mint', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::liquidity_init_actions::do_init_create_pool_with_mint`,
    typeArguments: [
      typeContext.configType,
      typeContext.outcomeType,
      action.assetType!,
      action.stableType!,
      action.lpType!,
      typeContext.witnessType,
    ],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(packages.packageRegistryId),
      tx.object(action.lpTreasuryCapId!),
      tx.object(action.lpCurrencyId!),
      tx.object(typeContext.clockId),
      intentWitness,
    ],
  });
});

registerAction('create_pool_from_coins', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  const assetCoin = action.assetCoin ?? (action.assetCoinId ? tx.object(action.assetCoinId) : undefined);
  const stableCoin = action.stableCoin ?? (action.stableCoinId ? tx.object(action.stableCoinId) : undefined);
  if (!assetCoin) throw new Error('create_pool_from_coins requires assetCoin or assetCoinId');
  if (!stableCoin) throw new Error('create_pool_from_coins requires stableCoin or stableCoinId');

  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::liquidity_init_actions::do_init_create_pool_from_coins`,
    typeArguments: [
      typeContext.configType,
      typeContext.outcomeType,
      action.assetType!,
      action.stableType!,
      action.lpType!,
      typeContext.witnessType,
    ],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(packages.packageRegistryId),
      assetCoin,
      stableCoin,
      tx.object(action.lpTreasuryCapId!),
      tx.object(action.lpCurrencyId!),
      tx.object(typeContext.clockId),
      intentWitness,
    ],
  });
});

registerAction('update_pool_fee', (ctx, action) => {
  const { tx, executable, config, packages, typeContext } = ctx;
  if (!config.spotPoolId) {
    throw new Error('spotPoolId is required for update_pool_fee action');
  }
  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::liquidity_actions::do_update_pool_fee`,
    typeArguments: [
      action.assetType!,
      action.stableType!,
      action.lpType!,
      typeContext.outcomeType,
    ],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(packages.packageRegistryId),
      tx.object(packages.spotPoolMutationRegistryId), // spot_pool_mutation_registry
      txObject(tx, config.spotPoolId),
    ],
  });
});

// ============================================================================
// FUTARCHY PROTECTIVE BID ACTIONS
// ============================================================================

registerAction('create_protective_bid', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  // Pool ID is read from FutarchyConfig.spot_pool_id at execution (not staged)
  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::protective_bid_init_actions::do_create_protective_bid`,
    typeArguments: [
      action.assetType!,
      action.stableType!,
      typeContext.outcomeType,
      typeContext.witnessType,
    ],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(packages.packageRegistryId),
      tx.object(typeContext.clockId),
      intentWitness,
    ],
  });
});

registerAction('cancel_protective_bid', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  // Bid ID is staged in the action spec
  const bidId = action.bidId ?? action.externalArg;
  if (!bidId) {
    throw new Error('cancel_protective_bid requires bidId in action');
  }
  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::protective_bid_actions::do_cancel_protective_bid`,
    typeArguments: [
      action.assetType!,
      action.stableType!,
      typeContext.outcomeType,
      typeContext.witnessType,
    ],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(packages.packageRegistryId),
      tx.object(packages.spotPoolMutationRegistryId),
      tx.object(bidId),
      intentWitness,
    ],
  });
});

registerAction('create_protective_ask', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  // Pool ID is read from FutarchyConfig.spot_pool_id at execution (not staged)
  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::protective_ask_init_actions::do_create_protective_ask`,
    typeArguments: [
      action.assetType!,
      action.stableType!,
      typeContext.outcomeType,
      typeContext.witnessType,
    ],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(packages.packageRegistryId),
      tx.object(packages.spotPoolMutationRegistryId),
      tx.object(typeContext.clockId),
      intentWitness,
    ],
  });
});

registerAction('cancel_protective_ask', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  const askId = action.askId ?? action.externalArg;
  if (!askId) {
    throw new Error('cancel_protective_ask requires askId in action');
  }
  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::protective_ask_actions::do_cancel_protective_ask`,
    typeArguments: [
      action.assetType!,
      action.stableType!,
      typeContext.outcomeType,
      typeContext.witnessType,
    ],
    arguments: [
      executable,
      txObject(tx, config.accountId),
      tx.object(packages.packageRegistryId),
      tx.object(packages.spotPoolMutationRegistryId),
      tx.object(askId),
      intentWitness,
    ],
  });
});

// ============================================================================
// FUTARCHY DISSOLUTION ACTIONS
// ============================================================================

registerAction('create_dissolution_capability', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::dissolution_actions::do_create_dissolution_capability`,
    typeArguments: [action.assetType!, typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness],
  });
});

registerAction('create_redemption_pool', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  const capabilityId = action.capabilityId ?? action.externalArg;
  if (!capabilityId) {
    throw new Error('create_redemption_pool requires capabilityId (or externalArg) in action');
  }
  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::dissolution_actions::do_create_redemption_pool`,
    typeArguments: [action.redeemCoinType!, typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), tx.object(capabilityId), intentWitness],
  });
});

registerAction('add_to_redemption_pool', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  const poolId = action.poolId ?? action.externalArg;
  if (!poolId) {
    throw new Error('add_to_redemption_pool requires poolId (or externalArg) in action');
  }
  tx.moveCall({
    target: `${packages.futarchyActionsPackageId}::dissolution_actions::do_add_to_redemption_pool`,
    typeArguments: [action.redeemCoinType!, typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), tx.object(poolId), intentWitness],
  });
});

// ============================================================================
// GOVERNANCE ACTIONS - PACKAGE REGISTRY
// ============================================================================

registerAction('add_package', (ctx) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyGovernanceActionsPackageId}::package_registry_actions::do_add_package`,
    typeArguments: [typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), intentWitness, tx.object(packages.packageRegistryId)],
  });
});

registerAction('update_package_metadata', (ctx) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyGovernanceActionsPackageId}::package_registry_actions::do_update_package_metadata`,
    typeArguments: [typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), intentWitness, tx.object(packages.packageRegistryId)],
  });
});

// ============================================================================
// ORACLE ACTIONS
// ============================================================================

registerAction('create_oracle_grant', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  tx.moveCall({
    target: `${packages.futarchyOracleActionsPackageId}::oracle_actions::do_create_oracle_grant`,
    typeArguments: [action.assetType!, action.stableType!, typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness, tx.object(typeContext.clockId)],
  });
});

registerAction('cancel_oracle_grant', (ctx, action) => {
  const { tx, executable, intentWitness, config, packages, typeContext } = ctx;
  if (!action.grantId) {
    throw new Error('cancel_oracle_grant requires grantId in action');
  }
  tx.moveCall({
    target: `${packages.futarchyOracleActionsPackageId}::oracle_actions::do_cancel_grant`,
    typeArguments: [action.assetType!, action.stableType!, typeContext.outcomeType, typeContext.witnessType],
    arguments: [executable, txObject(tx, config.accountId), tx.object(packages.packageRegistryId), intentWitness, tx.object(action.grantId), tx.object(typeContext.clockId)],
  });
});
