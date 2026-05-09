/**
 * Intent Execution Types
 *
 * Configuration types for intent execution.
 *
 * @module workflows/types/intent
 */

import type { WorkflowBaseConfig, ObjectIdOrRef } from './common';


/**
 * Configuration for intent execution
 */
export interface IntentExecutionConfig extends WorkflowBaseConfig {
  /** Type of intent */
  intentType: 'launchpad' | 'proposal';
  /** Account object ID or full ObjectRef */
  accountId: ObjectIdOrRef;
  /** For launchpad: raise ID or full ObjectRef */
  raiseId?: ObjectIdOrRef;
  /** For proposal: proposal ID or full ObjectRef */
  proposalId?: ObjectIdOrRef;
  /** For proposal: spot pool ID or full ObjectRef */
  spotPoolId?: ObjectIdOrRef;
  /** Asset type */
  assetType: string;
  /** Stable type */
  stableType: string;
  /** For proposal: LP type for spot pool */
  lpType?: string;
  /** FeeManager ID - used by actions that touch fee-managed protocol state */
  feeManagerId?: ObjectIdOrRef;
  /** Actions to execute (in order) */
  actions: IntentActionConfig[];
}

/**
 * Intent action configuration with type info for execution
 */
export type IntentActionConfig =
  // Account Protocol - Config Management
  | { action: 'set_authorization_level' }
  | { action: 'add_dep' }
  | { action: 'remove_dep' }
  // Account Protocol - Owned Object Actions (works for any object including Coin<T>)
  | { action: 'withdraw_object'; objectType: string; receiving?: unknown; externalArg?: string }
  // Account Actions - Stream
  | { action: 'create_stream'; coinType: string }
  | { action: 'cancel_stream'; coinType: string }
  | { action: 'collect_stream'; coinType: string; streamCapId?: string; externalArg?: string }
  // Account Actions - Vault
  | { action: 'deposit'; coinType: string }
  | { action: 'deposit_external'; coinType: string; coin?: unknown; externalArg?: string }
  | { action: 'spend'; coinType: string }
  | { action: 'approve_coin_type'; coinType: string }
  | { action: 'remove_approved_coin_type'; coinType: string }
  | { action: 'deposit_from_resources'; coinType: string }
  | { action: 'deposit_object_from_resources'; coinType: string }
  | { action: 'mint_vault_admin_cap' }
  | { action: 'open_vault' }
  | { action: 'close_vault' }
  // Account Actions - Vesting (physical isolation - funds in shared Vesting object)
  | { action: 'create_vesting'; coinType: string }
  | { action: 'cancel_vesting'; coinType: string; vestingId?: string }
  // Account Actions - Currency
  | { action: 'remove_treasury_cap_to_resources'; coinType: string }
  | { action: 'remove_metadata_cap_to_resources'; coinType: string }
  | { action: 'mint'; coinType: string }
  | { action: 'burn'; coinType: string }
  | { action: 'mint_currency_admin_cap'; coinType: string }
  | { action: 'update_currency'; coinType: string; currencyId: string }
  | { action: 'lock_treasury_cap'; coinType: string; externalArg?: string }
  | { action: 'lock_metadata_cap'; coinType: string; externalArg?: string }
  // Account Actions - Transfer (objects via provide_object)
  | { action: 'transfer'; objectType: string }
  | { action: 'transfer_to_sender'; objectType: string }
  // Account Actions - Transfer (coins via provide_coin)
  | { action: 'transfer_coin'; coinType: string }
  | { action: 'transfer_coin_to_sender'; coinType: string }
  // Account Actions - Provide Object (stage external object in executable_resources)
  | { action: 'provide_object'; objectType: string; objectId?: string; externalArg?: string; resourceName?: string }
  // Account Actions - Access Control (lock/unlock for permanent storage/retrieval)
  | { action: 'lock_access'; capType: string; cap?: unknown; externalArg?: string; expectedId?: string; resourceName?: string }
  | { action: 'unlock_access'; capType: string }
  // Account Actions - Memo
  | { action: 'memo' }
  // Futarchy Config Actions
  | { action: 'terminate_dao' }
  | { action: 'update_dao_name' }
  | { action: 'update_trading_params' }
  | { action: 'update_dao_metadata' }
  | { action: 'update_twap_config' }
  | { action: 'update_governance' }
  | { action: 'update_metadata_table' }
  | { action: 'update_conditional_metadata' }
  | { action: 'update_sponsorship_config' }
  | { action: 'sync_twap_observation_from_proposal' }
  // Futarchy Quota Actions
  | { action: 'set_quotas' }
  // Launchpad Internal Init Action (auto-staged on success)
  | { action: 'deposit_raise_funds'; assetType: string; stableType: string }
  // Futarchy Liquidity Actions
  | { action: 'create_pool_with_mint'; assetType: string; stableType: string; lpType: string; lpTreasuryCapId: string; lpCurrencyId: string; mintCapResourceName: string }
  | { action: 'create_pool_from_coins'; assetType: string; stableType: string; lpType: string; lpTreasuryCapId: string; lpCurrencyId: string; assetCoin?: unknown; stableCoin?: unknown; assetCoinId?: string; stableCoinId?: string }
  | { action: 'add_liquidity'; assetType: string; stableType: string }
  | { action: 'remove_liquidity_to_resources'; assetType: string; stableType: string; lpType: string }
  | { action: 'swap'; assetType: string; stableType: string }
  | { action: 'update_pool_fee'; assetType: string; stableType: string; lpType: string }
  | { action: 'create_protective_bid'; assetType: string; stableType: string }
  | { action: 'cancel_protective_bid'; assetType: string; stableType: string; bidId?: string; externalArg?: string }
  | { action: 'create_protective_ask'; assetType: string; stableType: string }
  | { action: 'cancel_protective_ask'; assetType: string; stableType: string; askId?: string; externalArg?: string }
  // Futarchy Dissolution Actions
  | { action: 'create_dissolution_capability'; assetType: string }
  | { action: 'create_dissolution_capability_unshared'; assetType: string }
  | { action: 'create_redemption_pool'; redeemCoinType: string; resourceNames?: string[]; capabilityId?: string; externalArg?: string }
  | { action: 'add_to_redemption_pool'; redeemCoinType: string; resourceName: string; poolId?: string; externalArg?: string }
  | { action: 'share_dissolution_capability' }
  // Governance - Package Upgrade Actions
  | {
      action: 'upgrade_package';
      upgrade: { packageId: string; modules: string[]; dependencies: string[] };
    }
  | { action: 'commit_upgrade' }
  | { action: 'restrict_upgrade' }
  | { action: 'lock_upgrade_cap'; externalArg?: string; resourceName?: string }
  | { action: 'unlock_upgrade_cap'; resourceName?: string }
  // Governance - Package Registry Actions
  | { action: 'add_package' }
  | { action: 'update_package_metadata' }
  // Oracle Actions
  | { action: 'create_oracle_grant'; assetType: string; stableType: string }
  | { action: 'cancel_oracle_grant'; assetType: string; stableType: string; grantId: string };
