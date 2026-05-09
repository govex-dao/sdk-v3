/**
 * Action Definitions - Single Source of Truth
 *
 * This file defines ALL action types supported by the Futarchy protocol.
 * All staging functions, execution functions, types, and documentation
 * are generated from these definitions.
 *
 * @module core/action-registry/action-definitions
 */

// ============================================================================
// PARAMETER TYPE DEFINITIONS
// ============================================================================

/**
 * Supported parameter types for action definitions
 */
export type ParamType =
  | 'u8'
  | 'u64'
  | 'u128'
  | 'bool'
  | 'string'
  | 'address'
  | 'id'
  | 'vector<u8>'
  | 'vector<string>'
  | 'vector<address>'
  | 'option<u8>'
  | 'option<u64>'
  | 'option<u128>'
  | 'option<bool>'
  | 'option<string>'
  | 'option<vector<u8>>'
  | 'tier_specs'
  | 'conditional_metadata';

/**
 * Parameter definition
 */
export interface ParamDef {
  name: string;
  type: ParamType;
  description: string;
  optional?: boolean;
}

/**
 * Package identifiers
 */
export type PackageId =
  | 'accountActions'
  | 'futarchyActions'
  | 'futarchyGovernanceActions'
  | 'futarchyOracleActions'
  | 'futarchyFactory';

/**
 * Action category for grouping
 */
export type ActionCategory =
  | 'transfer'
  | 'vault'
  | 'currency'
  | 'stream'
  | 'memo'
  | 'config'
  | 'quota'
  | 'liquidity'
  | 'dissolution'
  | 'package_upgrade'
  | 'package_registry'
  | 'oracle'
  | 'launchpad';

/**
 * Complete action definition
 */
export interface ActionDefinition {
  /** Unique action identifier (used as type discriminator) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Action category */
  category: ActionCategory;
  /** Package that owns this action */
  package: PackageId;
  /** Module containing staging function */
  stagingModule: string;
  /** Staging function name */
  stagingFunction: string;
  /** Module containing execution function (if different) */
  executionModule?: string;
  /** Execution function name */
  executionFunction?: string;
  /** Marker type for action validation (full path) */
  markerType: string;
  /** Parameters for staging */
  params: ParamDef[];
  /** Type parameters required (for generic functions) */
  typeParams?: string[];
  /** Description */
  description: string;
  /** Whether this action is supported in launchpad flows */
  launchpadSupported: boolean;
  /** Whether this action is supported in proposal flows */
  proposalSupported: boolean;
}

// ============================================================================
// ACCOUNT ACTIONS - TRANSFER
// ============================================================================

export const TRANSFER_ACTIONS: ActionDefinition[] = [
  {
    id: 'transfer',
    name: 'Transfer Object',
    category: 'transfer',
    package: 'accountActions',
    stagingModule: 'transfer_init_actions',
    stagingFunction: 'add_transfer_object_spec',
    executionModule: 'transfer',
    executionFunction: 'do_init_transfer',
    markerType: 'account_actions::transfer::TransferObject',
    typeParams: ['ObjectType'],
    params: [
      { name: 'recipient', type: 'address', description: 'Recipient address' },
      { name: 'resourceName', type: 'string', description: 'Resource name to take object from executable_resources' },
    ],
    description: 'Transfer an object to a recipient (taken from executable_resources)',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'transfer_to_sender',
    name: 'Transfer to Sender',
    category: 'transfer',
    package: 'accountActions',
    stagingModule: 'transfer_init_actions',
    stagingFunction: 'add_transfer_to_sender_spec',
    executionModule: 'transfer',
    executionFunction: 'do_init_transfer_to_sender',
    markerType: 'account_actions::transfer::TransferToSender',
    typeParams: ['ObjectType'],
    params: [
      { name: 'resourceName', type: 'string', description: 'Resource name to take object from executable_resources' },
    ],
    description: 'Transfer an object to the transaction sender (cranker) (taken from executable_resources)',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'transfer_coin',
    name: 'Transfer Coin',
    category: 'transfer',
    package: 'accountActions',
    stagingModule: 'transfer_init_actions',
    stagingFunction: 'add_transfer_coin_spec',
    executionModule: 'transfer',
    executionFunction: 'do_init_transfer_coin',
    markerType: 'account_actions::transfer::TransferCoin',
    typeParams: ['CoinType'],
    params: [
      { name: 'recipient', type: 'address', description: 'Recipient address' },
      { name: 'resourceName', type: 'string', description: 'Resource name to take coin from' },
    ],
    description: 'Transfer coin to recipient (taken from executable_resources)',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'transfer_coin_to_sender',
    name: 'Transfer Coin to Sender',
    category: 'transfer',
    package: 'accountActions',
    stagingModule: 'transfer_init_actions',
    stagingFunction: 'add_transfer_coin_to_sender_spec',
    executionModule: 'transfer',
    executionFunction: 'do_init_transfer_coin_to_sender',
    markerType: 'account_actions::transfer::TransferCoinToSender',
    typeParams: ['CoinType'],
    params: [
      { name: 'resourceName', type: 'string', description: 'Resource name to take coin from' },
    ],
    description: 'Transfer coin to transaction sender (taken from executable_resources)',
    launchpadSupported: true,
    proposalSupported: true,
  },
];

// ============================================================================
// ACCOUNT ACTIONS - VAULT
// ============================================================================

export const VAULT_ACTIONS: ActionDefinition[] = [
  {
    id: 'deposit',
    name: 'Deposit',
    category: 'vault',
    package: 'accountActions',
    stagingModule: 'vault_init_actions',
    stagingFunction: 'add_deposit_spec',
    executionModule: 'vault',
    executionFunction: 'do_init_deposit',
    markerType: 'account_actions::vault::VaultDeposit',
    typeParams: ['CoinType'],
    params: [
      { name: 'vaultName', type: 'string', description: 'Name of the vault' },
      { name: 'amount', type: 'u64', description: 'Amount to deposit' },
      { name: 'resourceName', type: 'string', description: 'Resource name to take coin from executable_resources' },
    ],
    description: 'Deposit coins into a vault (taken from executable_resources)',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'spend',
    name: 'Spend',
    category: 'vault',
    package: 'accountActions',
    stagingModule: 'vault_init_actions',
    stagingFunction: 'add_spend_spec',
    executionModule: 'vault',
    executionFunction: 'do_spend',
    markerType: 'account_actions::vault::VaultSpend',
    typeParams: ['CoinType'],
    params: [
      { name: 'vaultName', type: 'string', description: 'Name of the vault' },
      { name: 'amount', type: 'u64', description: 'Amount to spend' },
      { name: 'spendAll', type: 'bool', description: 'Whether to spend entire balance' },
      { name: 'resourceName', type: 'string', description: 'Resource name to store coin in executable_resources' },
    ],
    description: 'Spend/withdraw coins from a vault (stored in executable_resources for subsequent actions)',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'approve_coin_type',
    name: 'Approve Coin Type',
    category: 'vault',
    package: 'accountActions',
    stagingModule: 'vault_init_actions',
    stagingFunction: 'add_approve_coin_type_spec',
    executionModule: 'vault',
    executionFunction: 'do_approve_coin_type',
    markerType: 'account_actions::vault::VaultApproveCoinType',
    typeParams: ['CoinType'],
    params: [{ name: 'vaultName', type: 'string', description: 'Name of the vault to allow deposits into' }],
    description: 'Approve a coin type for future deposits into a vault.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'remove_approved_coin_type',
    name: 'Remove Coin Type Approval',
    category: 'vault',
    package: 'accountActions',
    stagingModule: 'vault_init_actions',
    stagingFunction: 'add_remove_approved_coin_type_spec',
    executionModule: 'vault',
    executionFunction: 'do_remove_approved_coin_type',
    markerType: 'account_actions::vault::VaultRemoveApprovedCoinType',
    typeParams: ['CoinType'],
    params: [{ name: 'vaultName', type: 'string', description: 'Name of the vault to remove the deposit approval from' }],
    description: 'Remove a coin type approval for future deposits into a vault.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'cancel_stream',
    name: 'Cancel Stream',
    category: 'vault',
    package: 'accountActions',
    stagingModule: 'vault_init_actions',
    stagingFunction: 'add_cancel_stream_spec',
    executionModule: 'vault',
    executionFunction: 'do_cancel_stream',
    markerType: 'account_actions::vault::CancelStream',
    typeParams: ['CoinType'],
    params: [
      { name: 'vaultName', type: 'string', description: 'Name of the vault' },
      { name: 'streamId', type: 'id', description: 'ID of the stream to cancel' },
    ],
    description: 'Cancel a stream (metadata-only; funds remain in vault)',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'deposit_external',
    name: 'Deposit External',
    category: 'vault',
    package: 'accountActions',
    stagingModule: 'vault_init_actions',
    stagingFunction: 'add_deposit_external_spec',
    executionModule: 'vault',
    executionFunction: 'do_deposit_external',
    markerType: 'account_actions::vault::VaultDepositExternal',
    typeParams: ['CoinType'],
    params: [
      { name: 'vaultName', type: 'string', description: 'Name of the vault' },
      { name: 'expectedAmount', type: 'u64', description: 'Expected amount (validated at execution)' },
    ],
    description: 'Deposit external coins from PTB (amount validated at execution to match staged amount)',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'deposit_from_resources',
    name: 'Deposit From Resources',
    category: 'vault',
    package: 'accountActions',
    stagingModule: 'vault_init_actions',
    stagingFunction: 'add_deposit_from_resources_spec',
    executionModule: 'vault',
    executionFunction: 'do_init_deposit_from_resources',
    markerType: 'account_actions::vault::VaultDepositFromResources',
    typeParams: ['CoinType'],
    params: [
      { name: 'vaultName', type: 'string', description: 'Target vault name' },
      { name: 'resourceName', type: 'string', description: 'Name in executable_resources to take coin from' },
    ],
    description: 'Deposit coins from executable_resources into specified vault. Amount = exactly what prior action produced (deterministic).',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'deposit_object_from_resources',
    name: 'Deposit Object From Resources',
    category: 'vault',
    package: 'accountActions',
    stagingModule: 'vault_init_actions',
    stagingFunction: 'add_deposit_object_from_resources_spec',
    executionModule: 'vault',
    executionFunction: 'do_init_deposit_object_from_resources',
    markerType: 'account_actions::vault::VaultDepositObjectFromResources',
    typeParams: ['CoinType'],
    params: [
      { name: 'vaultName', type: 'string', description: 'Target vault name' },
      { name: 'resourceName', type: 'string', description: 'Name in executable_resources to take Coin<T> object from' },
    ],
    description: 'Deposit a Coin<T> object from executable_resources into the specified vault. Use this after object-path actions such as WithdrawObject<Coin<T>>.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'mint_vault_admin_cap',
    name: 'Mint Vault Admin Cap',
    category: 'vault',
    package: 'accountActions',
    stagingModule: 'vault_init_actions',
    stagingFunction: 'add_mint_vault_admin_cap_spec',
    executionModule: 'vault',
    executionFunction: 'do_mint_vault_admin_cap',
    markerType: 'account_actions::vault::MintVaultAdminCap',
    params: [
      { name: 'vaultName', type: 'string', description: 'Vault name the cap authorizes withdrawals from' },
      { name: 'resourceName', type: 'string', description: 'Resource name to store the cap in executable_resources' },
    ],
    description: 'Mint a VaultAdminCap into executable_resources for a later action such as create_protective_bid.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'open_vault',
    name: 'Open Vault',
    category: 'vault',
    package: 'accountActions',
    stagingModule: 'vault_init_actions',
    stagingFunction: 'add_open_vault_spec',
    executionModule: 'vault',
    executionFunction: 'do_init_open',
    markerType: 'account_actions::vault::VaultOpen',
    params: [{ name: 'vaultName', type: 'string', description: 'Name of the vault to create' }],
    description: 'Create a new named vault on the account.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'close_vault',
    name: 'Close Vault',
    category: 'vault',
    package: 'accountActions',
    stagingModule: 'vault_init_actions',
    stagingFunction: 'add_close_vault_spec',
    executionModule: 'vault',
    executionFunction: 'do_init_close',
    markerType: 'account_actions::vault::VaultClose',
    params: [{ name: 'vaultName', type: 'string', description: 'Name of the vault to close' }],
    description: 'Close an empty vault that has no balances or active streams.',
    launchpadSupported: true,
    proposalSupported: true,
  },
];

// ============================================================================
// ACCOUNT ACTIONS - CURRENCY
// ============================================================================

export const CURRENCY_ACTIONS: ActionDefinition[] = [
  {
    id: 'mint',
    name: 'Mint',
    category: 'currency',
    package: 'accountActions',
    stagingModule: 'currency_init_actions',
    stagingFunction: 'add_mint_spec',
    executionModule: 'currency',
    executionFunction: 'do_init_mint',
    markerType: 'account_actions::currency::CurrencyMint',
    typeParams: ['CoinType'],
    params: [
      { name: 'amount', type: 'u64', description: 'Amount to mint' },
      { name: 'resourceName', type: 'string', description: 'Resource name to store minted coin in executable_resources' },
    ],
    description: 'Mint new tokens (coin returned to PTB)',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'burn',
    name: 'Burn',
    category: 'currency',
    package: 'accountActions',
    stagingModule: 'currency_init_actions',
    stagingFunction: 'add_burn_spec',
    executionModule: 'currency',
    executionFunction: 'do_init_burn',
    markerType: 'account_actions::currency::CurrencyBurn',
    typeParams: ['CoinType'],
    params: [
      { name: 'amount', type: 'u64', description: 'Amount to burn' },
      { name: 'resourceName', type: 'string', description: 'Resource name to take coin from executable_resources' },
    ],
    description: 'Burn tokens (coin passed at execution time)',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'mint_currency_admin_cap',
    name: 'Mint Currency Admin Cap',
    category: 'currency',
    package: 'accountActions',
    stagingModule: 'currency_init_actions',
    stagingFunction: 'add_mint_currency_admin_cap_spec',
    executionModule: 'currency',
    executionFunction: 'do_mint_currency_admin_cap',
    markerType: 'account_actions::currency::MintCurrencyAdminCap',
    typeParams: ['CoinType'],
    params: [
      { name: 'resourceName', type: 'string', description: 'Resource name to store the CurrencyMintAdminCap in executable_resources' },
    ],
    description: 'Mint a one-shot CurrencyMintAdminCap into executable_resources for delegated minting actions.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'remove_treasury_cap_to_resources',
    name: 'Remove Treasury Cap To Resources',
    category: 'currency',
    package: 'accountActions',
    stagingModule: 'currency_init_actions',
    stagingFunction: 'add_remove_treasury_cap_to_resources_spec',
    executionModule: 'currency',
    executionFunction: 'do_init_remove_treasury_cap_to_resources',
    markerType: 'account_actions::currency::RemoveTreasuryCapToResources',
    typeParams: ['CoinType'],
    params: [
      { name: 'expectedCapId', type: 'id', description: 'Expected TreasuryCap object ID' },
      { name: 'resourceName', type: 'string', description: 'Resource name to store the TreasuryCap in executable_resources' },
    ],
    description: 'Remove TreasuryCap into executable_resources for a later approved action.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'remove_metadata_cap_to_resources',
    name: 'Remove Metadata Cap To Resources',
    category: 'currency',
    package: 'accountActions',
    stagingModule: 'currency_init_actions',
    stagingFunction: 'add_remove_metadata_cap_to_resources_spec',
    executionModule: 'currency',
    executionFunction: 'do_init_remove_metadata_cap_to_resources',
    markerType: 'account_actions::currency::RemoveMetadataCapToResources',
    typeParams: ['CoinType'],
    params: [
      { name: 'expectedCapId', type: 'id', description: 'Expected MetadataCap object ID' },
      { name: 'resourceName', type: 'string', description: 'Resource name to store the MetadataCap in executable_resources' },
    ],
    description: 'Remove MetadataCap into executable_resources for a later approved action.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'update_currency',
    name: 'Update Currency',
    category: 'currency',
    package: 'accountActions',
    stagingModule: 'currency_init_actions',
    stagingFunction: 'add_update_spec',
    executionModule: 'currency',
    executionFunction: 'do_update',
    markerType: 'account_actions::currency::CurrencyUpdate',
    typeParams: ['CoinType'],
    params: [
      { name: 'symbol', type: 'option<vector<u8>>', description: 'New symbol (ASCII)', optional: true },
      { name: 'name', type: 'option<vector<u8>>', description: 'New name (UTF-8)', optional: true },
      {
        name: 'description',
        type: 'option<vector<u8>>',
        description: 'New description (UTF-8)',
        optional: true,
      },
      { name: 'iconUrl', type: 'option<vector<u8>>', description: 'New icon URL (ASCII)', optional: true },
    ],
    description: 'Update coin metadata',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'lock_treasury_cap',
    name: 'Lock Treasury Cap',
    category: 'currency',
    package: 'accountActions',
    stagingModule: 'currency_init_actions',
    stagingFunction: 'add_lock_treasury_cap_spec',
    executionModule: 'currency',
    executionFunction: 'do_init_lock_treasury_cap',
    markerType: 'account_actions::currency::LockTreasuryCap',
    typeParams: ['CoinType'],
    params: [
      { name: 'maxSupply', type: 'option<u64>', description: 'Maximum supply (optional)', optional: true },
      { name: 'canMint', type: 'bool', description: 'Allow minting from TreasuryCap' },
      { name: 'canBurn', type: 'bool', description: 'Allow burning via TreasuryCap' },
      { name: 'canUpdateName', type: 'bool', description: 'Allow updating currency name' },
      { name: 'canUpdateDescription', type: 'bool', description: 'Allow updating currency description' },
      { name: 'canUpdateIcon', type: 'bool', description: 'Allow updating currency icon URL' },
      { name: 'resourceName', type: 'string', description: 'Resource name used to stage the TreasuryCap' },
    ],
    description: 'Stage a TreasuryCap from PTB into executable_resources, then lock it in the account',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'lock_metadata_cap',
    name: 'Lock Metadata Cap',
    category: 'currency',
    package: 'accountActions',
    stagingModule: 'currency_init_actions',
    stagingFunction: 'add_lock_metadata_cap_spec',
    executionModule: 'currency',
    executionFunction: 'do_init_lock_metadata_cap',
    markerType: 'account_actions::currency::LockMetadataCap',
    typeParams: ['CoinType'],
    params: [
      { name: 'canUpdateName', type: 'bool', description: 'Allow updating currency name' },
      { name: 'canUpdateDescription', type: 'bool', description: 'Allow updating currency description' },
      { name: 'canUpdateIcon', type: 'bool', description: 'Allow updating currency icon URL' },
      { name: 'resourceName', type: 'string', description: 'Resource name used to stage the MetadataCap' },
    ],
    description: 'Stage a MetadataCap from PTB into executable_resources, then lock it in the account',
    launchpadSupported: false,
    proposalSupported: true,
  },
];

// ============================================================================
// ACCOUNT ACTIONS - STREAM
// ============================================================================

export const STREAM_ACTIONS: ActionDefinition[] = [
  {
    id: 'collect_stream',
    name: 'Collect Stream',
    category: 'stream',
    package: 'accountActions',
    stagingModule: 'stream_init_actions',
    stagingFunction: 'add_collect_stream_spec',
    executionModule: 'vault',
    executionFunction: 'do_collect_stream',
    markerType: 'account_actions::vault::CollectStream',
    typeParams: ['CoinType'],
    params: [
      { name: 'vaultName', type: 'string', description: 'Source vault name' },
      { name: 'streamId', type: 'id', description: 'Stream ID to collect from' },
      { name: 'resourceName', type: 'string', description: 'Resource name to store collected coin' },
      { name: 'amount', type: 'u64', description: 'Amount to collect (0 = collect all available)' },
      { name: 'capResourceName', type: 'string', description: 'Resource name used to stage the StreamCap' },
    ],
    description: 'Stage a StreamCap from PTB, then collect vested stream tokens into executable_resources',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'create_stream',
    name: 'Create Stream',
    category: 'stream',
    package: 'accountActions',
    stagingModule: 'stream_init_actions',
    stagingFunction: 'add_create_stream_spec',
    executionModule: 'vault',
    executionFunction: 'do_init_create_stream',
    markerType: 'account_actions::vault::CreateStream',
    typeParams: ['CoinType'],
    params: [
      { name: 'vaultName', type: 'string', description: 'Source vault name' },
      { name: 'beneficiary', type: 'address', description: 'Beneficiary address' },
      { name: 'amountPerIteration', type: 'u64', description: 'Amount per iteration' },
      { name: 'startTime', type: 'option<u64>', description: 'Start timestamp (ms). None = use clock time at execution.', optional: true },
      { name: 'iterationsTotal', type: 'u64', description: 'Total number of iterations' },
      { name: 'iterationPeriodMs', type: 'u64', description: 'Period between iterations (ms)' },
      { name: 'claimWindowMs', type: 'option<u64>', description: 'Claim window duration (ms)', optional: true },
      { name: 'expiryMs', type: 'option<u64>', description: 'Optional stream expiry (ms)', optional: true },
      { name: 'whitelistedRecipients', type: 'vector<address>', description: 'Allowed recipients. Empty means unrestricted.', optional: true },
      // Note: Vault streams are always DAO-controlled (cancellable, non-transferable)
    ],
    description: 'Create a vesting stream (DAO-controlled: cancellable, non-transferable)',
    launchpadSupported: true,
    proposalSupported: true,
  },
];

// ============================================================================
// ACCOUNT ACTIONS - VESTING (Physical Isolation)
// ============================================================================

export const VESTING_ACTIONS: ActionDefinition[] = [
  {
    id: 'create_vesting',
    name: 'Create Vesting',
    category: 'stream',
    package: 'accountActions',
    stagingModule: 'vesting_init_actions',
    stagingFunction: 'add_create_vesting_spec',
    executionModule: 'vesting',
    executionFunction: 'do_create_vesting',
    markerType: 'account_actions::vesting::CreateVesting',
    typeParams: ['CoinType'],
    params: [
      { name: 'beneficiary', type: 'address', description: 'Beneficiary address' },
      { name: 'amountPerIteration', type: 'u64', description: 'Amount per iteration' },
      { name: 'startTime', type: 'option<u64>', description: 'Start timestamp (ms). None = use clock time at execution.', optional: true },
      { name: 'iterationsTotal', type: 'u64', description: 'Total iterations' },
      { name: 'iterationPeriodMs', type: 'u64', description: 'Period between iterations (ms)' },
      { name: 'isCancellable', type: 'bool', description: 'Whether the vesting can be cancelled' },
      { name: 'resourceName', type: 'string', description: 'Resource name to take coin from executable_resources' },
    ],
    description:
      'Create standalone vesting with TRUE fund isolation (funds in shared object). Claim windows are not supported for vestings.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'cancel_vesting',
    name: 'Cancel Vesting',
    category: 'stream',
    package: 'accountActions',
    stagingModule: 'vesting_init_actions',
    stagingFunction: 'add_cancel_vesting_spec',
    executionModule: 'vesting',
    executionFunction: 'do_cancel_vesting',
    markerType: 'account_actions::vesting::CancelVesting',
    typeParams: ['CoinType'],
    params: [
      { name: 'vestingId', type: 'address', description: 'Vesting object ID (as address for BCS)' },
      { name: 'resourceName', type: 'string', description: 'Resource name to store refund coin in executable_resources' },
    ],
    description: 'Cancel a cancellable vesting, refund provided to executable_resources',
    launchpadSupported: false,
    proposalSupported: true,
  },
];

// ============================================================================
// ACCOUNT ACTIONS - OWNED OBJECT
// ============================================================================

export const OWNED_ACTIONS: ActionDefinition[] = [
  {
    id: 'withdraw_object',
    name: 'Withdraw Object',
    category: 'transfer',
    package: 'accountActions',
    stagingModule: 'owned_init_actions',
    stagingFunction: 'add_withdraw_object_spec',
    executionModule: 'owned',
    executionFunction: 'do_withdraw_object',
    markerType: 'account_protocol::owned::OwnedWithdrawObject',
    typeParams: ['ObjectType'],
    params: [
      { name: 'objectId', type: 'id', description: 'Object ID to withdraw' },
      { name: 'resourceName', type: 'string', description: 'Resource name in executable_resources' },
    ],
    description: 'Withdraw owned object (provides to executable_resources). Works for any object including Coin<T>.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'provide_object',
    name: 'Provide Object',
    category: 'transfer',
    package: 'accountActions',
    stagingModule: 'owned_init_actions',
    stagingFunction: 'add_provide_object_spec',
    executionModule: 'owned',
    executionFunction: 'do_provide_object',
    markerType: 'account_protocol::owned::ProvideObjectToResources',
    typeParams: ['ObjectType'],
    params: [
      { name: 'objectId', type: 'id', description: 'Approved object ID to provide' },
      { name: 'resourceName', type: 'string', description: 'Resource name to store the object under in executable_resources' },
    ],
    description: 'Provide an approved external object into executable_resources for a subsequent action (e.g., lock_access).',
    launchpadSupported: true,
    proposalSupported: true,
  },
];

// ============================================================================
// ACCOUNT ACTIONS - MEMO
// ============================================================================

export const MEMO_ACTIONS: ActionDefinition[] = [
  {
    id: 'memo',
    name: 'Emit Memo',
    category: 'memo',
    package: 'accountActions',
    stagingModule: 'memo_init_actions',
    stagingFunction: 'add_emit_memo_spec',
    executionModule: 'memo',
    executionFunction: 'do_emit_memo',
    markerType: 'account_actions::memo::Memo',
    params: [{ name: 'message', type: 'string', description: 'Memo message' }],
    description: 'Emit a memo event (for logging purposes)',
    launchpadSupported: true,
    proposalSupported: true,
  },
];

// ============================================================================
// ACCOUNT ACTIONS - ACCESS CONTROL
//
// Caps are stored as managed assets inside the Account. unlock_access stages the
// cap in executable_resources so a following transfer or other action can consume it.
// ============================================================================

export const ACCESS_CONTROL_ACTIONS: ActionDefinition[] = [
  {
    id: 'lock_access',
    name: 'Lock Access',
    category: 'transfer',
    package: 'accountActions',
    stagingModule: 'access_control_init_actions',
    stagingFunction: 'add_lock_spec',
    executionModule: 'access_control',
    executionFunction: 'do_lock',
    markerType: 'account_actions::access_control::AccessControlLock',
    typeParams: ['CapType'],
    params: [
      { name: 'expectedId', type: 'id', description: 'Expected object ID of the cap being locked' },
      { name: 'resourceName', type: 'string', description: 'Resource name to take the cap from executable_resources' },
    ],
    description: 'Lock a specific capability object into account (generic)',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'unlock_access',
    name: 'Unlock Access',
    category: 'transfer',
    package: 'accountActions',
    stagingModule: 'access_control_init_actions',
    stagingFunction: 'add_unlock_to_resources_spec',
    executionModule: 'access_control',
    executionFunction: 'do_unlock_to_resources',
    markerType: 'account_actions::access_control::AccessControlUnlockToResources',
    typeParams: ['CapType'],
    params: [
      { name: 'expectedId', type: 'id', description: 'Expected object ID of the cap being unlocked' },
      { name: 'resourceName', type: 'string', description: 'Resource name to store the unlocked cap under' },
    ],
    description: 'Unlock a capability from account and place it in executable_resources for a following action',
    launchpadSupported: false,
    proposalSupported: true,
  },
];

// ============================================================================
// ACCOUNT ACTIONS - CONFIG (per-account dependencies)
// ============================================================================

export const ACCOUNT_CONFIG_ACTIONS: ActionDefinition[] = [
  {
    id: 'set_authorization_level',
    name: 'Set Authorization Level',
    category: 'config',
    package: 'accountActions',
    stagingModule: 'config_init_actions',
    stagingFunction: 'add_set_authorization_level_spec',
    executionModule: 'config',
    executionFunction: 'do_set_authorization_level',
    markerType: 'account_protocol::config::ConfigSetAuthorizationLevel',
    params: [
      {
        name: 'level',
        type: 'u8',
        description: 'Authorization level (0=GLOBAL_ONLY, 1=WHITELIST, 2=PERMISSIVE)',
      },
    ],
    description: 'Set authorization level for action package validation',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'add_dep',
    name: 'Add Dependency',
    category: 'config',
    package: 'accountActions',
    stagingModule: 'config_init_actions',
    stagingFunction: 'add_add_dep_spec',
    executionModule: 'config',
    executionFunction: 'do_add_dep',
    markerType: 'account_protocol::config::ConfigAddDep',
    params: [
      { name: 'addr', type: 'address', description: 'Package address' },
      { name: 'name', type: 'string', description: 'Package name' },
      { name: 'version', type: 'u64', description: 'Package version' },
    ],
    description:
      'Add a package to the per-account whitelist. Name must be unique across all deps (enforced on-chain). Packages are treated as immutable — upgrading an approved package will NOT grant the new version access.',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'remove_dep',
    name: 'Remove Dependency',
    category: 'config',
    package: 'accountActions',
    stagingModule: 'config_init_actions',
    stagingFunction: 'add_remove_dep_spec',
    executionModule: 'config',
    executionFunction: 'do_remove_dep',
    markerType: 'account_protocol::config::ConfigRemoveDep',
    params: [{ name: 'addr', type: 'address', description: 'Package address to remove' }],
    description: 'Remove a package from the per-account whitelist',
    launchpadSupported: false,
    proposalSupported: true,
  },
];

// ============================================================================
// FUTARCHY ACTIONS - CONFIG
// ============================================================================

export const CONFIG_ACTIONS: ActionDefinition[] = [
  {
    id: 'terminate_dao',
    name: 'Terminate DAO',
    category: 'config',
    package: 'futarchyActions',
    stagingModule: 'futarchy_config_init_actions',
    stagingFunction: 'add_terminate_dao_spec',
    executionModule: 'config_actions',
    executionFunction: 'do_terminate_dao',
    markerType: 'futarchy_actions::config_actions::TerminateDao',
    params: [
      { name: 'reason', type: 'string', description: 'Termination reason' },
      { name: 'dissolutionUnlockDelayMs', type: 'u64', description: 'Delay before dissolution unlocks' },
    ],
    description: 'Permanently terminate the DAO',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'update_dao_name',
    name: 'Update DAO Name',
    category: 'config',
    package: 'futarchyActions',
    stagingModule: 'futarchy_config_init_actions',
    stagingFunction: 'add_update_name_spec',
    executionModule: 'config_actions',
    executionFunction: 'do_update_name',
    markerType: 'futarchy_actions::config_actions::UpdateName',
    params: [{ name: 'newName', type: 'string', description: 'New DAO name' }],
    description: 'Update the DAO name',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'update_trading_params',
    name: 'Update Trading Params',
    category: 'config',
    package: 'futarchyActions',
    stagingModule: 'futarchy_config_init_actions',
    stagingFunction: 'add_update_trading_params_spec',
    executionModule: 'config_actions',
    executionFunction: 'do_update_trading_params',
    markerType: 'futarchy_actions::config_actions::TradingParamsUpdate',
    // NOTE: assetDecimals and stableDecimals removed - decimals are immutable in Sui coins
    // Read from sui::coin_registry::Currency<T> instead
    params: [
      { name: 'minAssetAmount', type: 'option<u64>', description: 'Minimum asset amount', optional: true },
      { name: 'minStableAmount', type: 'option<u64>', description: 'Minimum stable amount', optional: true },
      { name: 'reviewPeriodMs', type: 'option<u64>', description: 'Review period (ms)', optional: true },
      { name: 'tradingPeriodMs', type: 'option<u64>', description: 'Trading period (ms)', optional: true },
      { name: 'ammTotalFeeBps', type: 'option<u64>', description: 'AMM fee in basis points', optional: true },
      { name: 'conditionalLiquidityRatioPercent', type: 'option<u64>', description: 'Conditional liquidity ratio percent', optional: true },
    ],
    description: 'Update trading parameters',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'update_dao_metadata',
    name: 'Update DAO Metadata',
    category: 'config',
    package: 'futarchyActions',
    stagingModule: 'futarchy_config_init_actions',
    stagingFunction: 'add_update_metadata_spec',
    executionModule: 'config_actions',
    executionFunction: 'do_update_metadata',
    markerType: 'futarchy_actions::config_actions::MetadataUpdate',
    params: [
      { name: 'daoName', type: 'option<string>', description: 'DAO name (ASCII)', optional: true },
      { name: 'iconUrl', type: 'option<string>', description: 'Icon URL', optional: true },
      { name: 'description', type: 'option<string>', description: 'Description', optional: true },
    ],
    description: 'Update DAO metadata',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'update_twap_config',
    name: 'Update TWAP Config',
    category: 'config',
    package: 'futarchyActions',
    stagingModule: 'futarchy_config_init_actions',
    stagingFunction: 'add_update_twap_config_spec',
    executionModule: 'config_actions',
    executionFunction: 'do_update_twap_config',
    markerType: 'futarchy_actions::config_actions::TwapConfigUpdate',
    params: [
      { name: 'startDelay', type: 'option<u64>', description: 'TWAP start delay', optional: true },
      { name: 'capPpm', type: 'option<u64>', description: 'TWAP cap in parts-per-million per window', optional: true },
      { name: 'initialObservation', type: 'option<u128>', description: 'Initial observation', optional: true },
      { name: 'threshold', type: 'option<u128>', description: 'TWAP threshold (base 100,000)', optional: true },
      { name: 'sponsoredThreshold', type: 'option<u128>', description: 'Sponsored threshold - how much lower sponsored outcomes can be (base 100,000, max 10000 = 10%)', optional: true },
    ],
    description: 'Update TWAP configuration',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'update_governance',
    name: 'Update Governance',
    category: 'config',
    package: 'futarchyActions',
    stagingModule: 'futarchy_config_init_actions',
    stagingFunction: 'add_update_governance_spec',
    executionModule: 'config_actions',
    executionFunction: 'do_update_governance',
    markerType: 'futarchy_actions::config_actions::GovernanceUpdate',
    params: [
      { name: 'maxOutcomes', type: 'option<u64>', description: 'Maximum outcomes', optional: true },
      { name: 'maxActionsPerOutcome', type: 'option<u64>', description: 'Max actions per outcome', optional: true },
      { name: 'proposalIntentExpiryMs', type: 'option<u64>', description: 'Proposal intent expiry', optional: true },
      { name: 'proposalCreationFee', type: 'option<u64>', description: 'Proposal creation fee (full u64 range)', optional: true },
      { name: 'proposalFeePerOutcome', type: 'option<u64>', description: 'Fee per outcome', optional: true },
      {
        name: 'feeInAssetToken',
        type: 'option<bool>',
        description: 'If true, fees paid in AssetType; if false, fees paid in StableType',
        optional: true,
      },
    ],
    description: 'Update governance settings',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'update_metadata_table',
    name: 'Update Metadata Table',
    category: 'config',
    package: 'futarchyActions',
    stagingModule: 'futarchy_config_init_actions',
    stagingFunction: 'add_update_metadata_table_spec',
    executionModule: 'config_actions',
    executionFunction: 'do_update_metadata_table',
    markerType: 'futarchy_actions::config_actions::MetadataTableUpdate',
    params: [
      { name: 'keys', type: 'vector<string>', description: 'Keys to add/update' },
      { name: 'values', type: 'vector<string>', description: 'Values for the keys' },
      { name: 'keysToRemove', type: 'vector<string>', description: 'Keys to remove' },
    ],
    description: 'Update metadata key-value table',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'update_conditional_metadata',
    name: 'Update Conditional Metadata',
    category: 'config',
    package: 'futarchyActions',
    stagingModule: 'futarchy_config_init_actions',
    stagingFunction: 'add_update_conditional_metadata_spec',
    executionModule: 'config_actions',
    executionFunction: 'do_update_conditional_metadata',
    markerType: 'futarchy_actions::config_actions::UpdateConditionalMetadata',
    params: [
      { name: 'useOutcomeIndex', type: 'option<bool>', description: 'Use outcome index', optional: true },
      {
        name: 'conditionalMetadata',
        type: 'conditional_metadata',
        description: 'Conditional metadata config',
        optional: true,
      },
    ],
    description: 'Update conditional metadata configuration',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'update_sponsorship_config',
    name: 'Update Sponsorship Config',
    category: 'config',
    package: 'futarchyActions',
    stagingModule: 'futarchy_config_init_actions',
    stagingFunction: 'add_update_sponsorship_config_spec',
    executionModule: 'config_actions',
    executionFunction: 'do_update_sponsorship_config',
    markerType: 'futarchy_actions::config_actions::SponsorshipConfigUpdate',
    params: [
      { name: 'enabled', type: 'option<bool>', description: 'Sponsorship enabled', optional: true },
    ],
    description: 'Update sponsorship configuration',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'sync_twap_observation_from_proposal',
    name: 'Sync TWAP Observation (Proposal)',
    category: 'config',
    package: 'futarchyActions',
    stagingModule: 'futarchy_config_init_actions',
    stagingFunction: 'add_sync_twap_observation_from_proposal_spec',
    executionModule: 'config_actions',
    executionFunction: 'do_sync_twap_observation_from_proposal',
    markerType: 'futarchy_actions::config_actions::SyncTwapObservationFromProposal',
    params: [],
    typeParams: ['AssetType', 'StableType'],
    description: 'Sync TWAP initial observation from winning proposal TWAP',
    launchpadSupported: false,
    proposalSupported: true,
  },
];

// ============================================================================
// FUTARCHY ACTIONS - QUOTA
// ============================================================================

export const QUOTA_ACTIONS: ActionDefinition[] = [
  {
    id: 'set_quotas',
    name: 'Set Quotas',
    category: 'quota',
    package: 'futarchyActions',
    stagingModule: 'quota_init_actions',
    stagingFunction: 'add_set_quotas_spec',
    executionModule: 'quota_actions',
    executionFunction: 'do_set_quotas',
    markerType: 'futarchy_actions::quota_actions::SetQuotas',
    params: [
      { name: 'users', type: 'vector<address>', description: 'User addresses' },
      { name: 'periodMs', type: 'u64', description: 'Shared period duration in milliseconds' },
      { name: 'feelessProposalAmount', type: 'u64', description: 'Free proposals per period (0 = no feeless quota)' },
      { name: 'sponsorAmount', type: 'u64', description: 'TWAP sponsorships per period (0 = no sponsor quota)' },
    ],
    description: 'Set proposal quotas for users (feeless proposals and/or TWAP sponsorships)',
    launchpadSupported: true,
    proposalSupported: true,
  },
];

// ============================================================================
// FUTARCHY ACTIONS - LIQUIDITY
// ============================================================================

export const LIQUIDITY_ACTIONS: ActionDefinition[] = [
  {
    id: 'create_pool_with_mint',
    name: 'Create Pool With Mint',
    category: 'liquidity',
    package: 'futarchyActions',
    stagingModule: 'liquidity_actions',
    stagingFunction: 'add_create_pool_with_mint_spec',
    executionModule: 'liquidity_init_actions',
    executionFunction: 'do_init_create_pool_with_mint',
    markerType: 'futarchy_actions::liquidity_init_actions::CreatePoolWithMint',
    params: [
      { name: 'stableResourceName', type: 'string', description: 'Resource name to take stable from (put there by prior VaultSpend)' },
      { name: 'mintCapResourceName', type: 'string', description: 'Resource name to take CurrencyMintAdminCap from (put there by prior MintCurrencyAdminCap)' },
      { name: 'assetAmount', type: 'option<u64>', description: 'Asset amount to mint (None = auto-calculate from launchpad_initial_price)', optional: true },
      { name: 'feeBps', type: 'u64', description: 'AMM fee in basis points' },
      { name: 'launchFeeDurationMs', type: 'u64', description: 'Launch fee duration in ms (0 = no launch fee period)' },
      { name: 'lpTreasuryCapId', type: 'id', description: 'LP TreasuryCap object ID' },
      { name: 'lpCurrencyId', type: 'id', description: 'LP Currency<LPType> object ID (shared from coin_registry::finalize)' },
    ],
    typeParams: ['AssetType', 'StableType', 'LPType'],
    description: 'Create AMM pool with minted asset and stable from executable_resources.',
    launchpadSupported: true,
    proposalSupported: false,
  },
  {
    id: 'create_pool_from_coins',
    name: 'Create Pool From Coins',
    category: 'liquidity',
    package: 'futarchyActions',
    stagingModule: 'liquidity_init_actions',
    stagingFunction: 'add_create_pool_from_coins_spec',
    executionModule: 'liquidity_init_actions',
    executionFunction: 'do_init_create_pool_from_coins',
    markerType: 'futarchy_actions::liquidity_init_actions::CreatePoolFromCoins',
    params: [
      { name: 'executor', type: 'address', description: 'Only this sender may execute the dynamic external-coin action' },
      { name: 'minAssetAmount', type: 'u64', description: 'Minimum asset amount accepted from the execution coin' },
      { name: 'minStableAmount', type: 'u64', description: 'Minimum stable amount accepted from the execution coin' },
      { name: 'feeBps', type: 'u64', description: 'AMM fee in basis points' },
      { name: 'launchFeeDurationMs', type: 'u64', description: 'Launch fee duration in ms (0 = no launch fee period)' },
      { name: 'lpTreasuryCapId', type: 'id', description: 'LP TreasuryCap object ID' },
      { name: 'lpCurrencyId', type: 'id', description: 'LP Currency<LPType> object ID (shared from coin_registry::finalize)' },
    ],
    typeParams: ['AssetType', 'StableType', 'LPType'],
    description: 'Create AMM pool from asset/stable coins supplied at execution and seed the initial TWAP price. Staging also adds LP vault approval first, matching create_pool_with_mint.',
    launchpadSupported: false,
    proposalSupported: false,
  },
  {
    id: 'add_liquidity',
    name: 'Add Liquidity',
    category: 'liquidity',
    package: 'futarchyActions',
    stagingModule: 'liquidity_actions',
    stagingFunction: 'add_add_liquidity_spec',
    executionModule: 'liquidity_actions',
    executionFunction: 'do_add_liquidity',
    markerType: 'futarchy_actions::liquidity_actions::AddLiquidity',
    params: [
      { name: 'poolId', type: 'id', description: 'Pool ID' },
      { name: 'assetAmount', type: 'u64', description: 'Asset amount' },
      { name: 'stableAmount', type: 'u64', description: 'Stable amount' },
      { name: 'minLpOut', type: 'u64', description: 'Minimum LP tokens to receive' },
      { name: 'assetResourceName', type: 'string', description: 'Resource name for asset coin in executable_resources' },
      { name: 'stableResourceName', type: 'string', description: 'Resource name for stable coin in executable_resources' },
    ],
    typeParams: ['AssetType', 'StableType', 'LPType'],
    description: 'Add liquidity to pool from executable_resources',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'remove_liquidity_to_resources',
    name: 'Remove Liquidity to Resources',
    category: 'liquidity',
    package: 'futarchyActions',
    stagingModule: 'liquidity_init_actions',
    stagingFunction: 'add_remove_liquidity_to_resources_spec',
    executionModule: 'liquidity_actions',
    executionFunction: 'do_remove_liquidity_to_resources',
    markerType: 'futarchy_actions::liquidity_actions::RemoveLiquidityToResources',
    params: [
      { name: 'poolId', type: 'id', description: 'Pool ID' },
      { name: 'lpAmount', type: 'u64', description: 'LP token amount to burn' },
      { name: 'minAssetOut', type: 'u64', description: 'Minimum asset tokens to receive' },
      { name: 'minStableOut', type: 'u64', description: 'Minimum stable tokens to receive' },
      { name: 'lpResourceName', type: 'string', description: 'Resource name for LP coin input' },
      { name: 'assetOutputName', type: 'string', description: 'Resource name for asset coin output' },
      { name: 'stableOutputName', type: 'string', description: 'Resource name for stable coin output' },
      { name: 'forDissolution', type: 'bool', description: 'Use dissolution-only remove-liquidity path (requires DAO terminated)' },
    ],
    typeParams: ['AssetType', 'StableType', 'LPType'],
    description: 'Remove liquidity and output coins to executable_resources for chaining',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'swap',
    name: 'Swap',
    category: 'liquidity',
    package: 'futarchyActions',
    stagingModule: 'liquidity_actions',
    stagingFunction: 'add_swap_spec',
    executionModule: 'liquidity_actions',
    executionFunction: 'do_swap',
    markerType: 'futarchy_actions::liquidity_actions::Swap',
    params: [
      { name: 'poolId', type: 'id', description: 'Pool ID' },
      { name: 'swapAsset', type: 'bool', description: 'Swap direction (true = swap asset for stable, false = swap stable for asset)' },
      { name: 'amountIn', type: 'u64', description: 'Input amount' },
      { name: 'minAmountOut', type: 'u64', description: 'Minimum output amount' },
      { name: 'inputResourceName', type: 'string', description: 'Resource name for input coin in executable_resources' },
    ],
    typeParams: ['AssetType', 'StableType', 'LPType'],
    description: 'Swap tokens in pool using executable_resources',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'update_pool_fee',
    name: 'Update Pool Fee',
    category: 'liquidity',
    package: 'futarchyActions',
    stagingModule: 'liquidity_actions',
    stagingFunction: 'add_update_pool_fee_spec',
    executionModule: 'liquidity_actions',
    executionFunction: 'do_update_pool_fee',
    markerType: 'futarchy_actions::liquidity_actions::UpdatePoolFee',
    params: [
      { name: 'poolId', type: 'id', description: 'Pool ID' },
      { name: 'newFeeBps', type: 'u64', description: 'New fee in basis points' },
    ],
    typeParams: ['AssetType', 'StableType', 'LPType'],
    description: 'Update spot pool LP fee',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'create_protective_bid',
    name: 'Create Protective Bid',
    category: 'liquidity',
    package: 'futarchyActions',
    stagingModule: 'protective_bid_init_actions',
    stagingFunction: 'add_create_protective_bid_spec',
    executionModule: 'protective_bid_init_actions',
    executionFunction: 'do_create_protective_bid',
    markerType: 'futarchy_actions::protective_bid_init_actions::CreateProtectiveBid',
    params: [
      { name: 'vaultCapResourceName', type: 'string', description: 'Resource name to take VaultAdminCap from (put there by prior mint_vault_admin_cap)' },
      { name: 'reservedAmount', type: 'u64', description: 'Soft spending limit for the bid wall' },
      { name: 'navDiscountBps', type: 'u64', description: 'Discount from NAV in basis points (0 = at NAV)' },
      { name: 'baseFeeBps', type: 'u64', description: 'Base fee in basis points (final fee after surge ends, max 2000 = 20%)' },
      { name: 'surgeFeeBps', type: 'u64', description: 'Starting fee in basis points (0 = no surge, use base_fee_bps)' },
      { name: 'surgeDurationMs', type: 'u64', description: 'Duration of surge period in milliseconds (0 = no surge)' },
      { name: 'daoAmmAssetPrincipal', type: 'u64', description: 'DAO AMM principal asset amount for NAV calculation (0 = use pool initial reserves)' },
      { name: 'daoAmmStablePrincipal', type: 'u64', description: 'DAO AMM principal stable amount for NAV calculation (0 = use pool initial reserves)' },
      { name: 'releaseDurationMs', type: 'u64', description: 'Duration before permissionless close is allowed in ms (0 = no permissionless close)' },
    ],
    typeParams: ['AssetType', 'StableType'],
    description: 'Create a vault-backed protective bid wall with a soft reserved budget. Pool ID is read from FutarchyConfig.spot_pool_id at execution.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'cancel_protective_bid',
    name: 'Cancel Protective Bid',
    category: 'liquidity',
    package: 'futarchyActions',
    stagingModule: 'protective_bid_actions',
    stagingFunction: 'add_cancel_protective_bid_spec',
    executionModule: 'protective_bid_actions',
    executionFunction: 'do_cancel_protective_bid',
    markerType: 'futarchy_actions::protective_bid_actions::CancelProtectiveBid',
    params: [{ name: 'bidId', type: 'id', description: 'ID of the protective bid to cancel' }],
    typeParams: ['AssetType', 'StableType'],
    description: 'Cancel a protective bid. Funds remain in the vault and the bid cap is destroyed.',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'create_protective_ask',
    name: 'Create Protective Ask',
    category: 'liquidity',
    package: 'futarchyActions',
    stagingModule: 'protective_ask_init_actions',
    stagingFunction: 'add_create_protective_ask_spec',
    executionModule: 'protective_ask_init_actions',
    executionFunction: 'do_create_protective_ask',
    markerType: 'futarchy_actions::protective_ask_init_actions::CreateProtectiveAsk',
    params: [
      { name: 'mintCapResourceName', type: 'string', description: 'Resource name to take CurrencyMintAdminCap from' },
      { name: 'pricePerToken', type: 'u64', description: 'Fixed price per token, scaled by price_precision_scale() (1e12)' },
      { name: 'maxMintAmount', type: 'u64', description: 'Maximum asset amount mintable through the ask wall' },
      { name: 'releaseDurationMs', type: 'u64', description: 'Duration before permissionless close is allowed in ms (0 = no permissionless close)' },
    ],
    typeParams: ['AssetType', 'StableType'],
    description: 'Create a fixed-price protective ask wall. Pool ID is read from FutarchyConfig.spot_pool_id at execution.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'cancel_protective_ask',
    name: 'Cancel Protective Ask',
    category: 'liquidity',
    package: 'futarchyActions',
    stagingModule: 'protective_ask_actions',
    stagingFunction: 'add_cancel_protective_ask_spec',
    executionModule: 'protective_ask_actions',
    executionFunction: 'do_cancel_protective_ask',
    markerType: 'futarchy_actions::protective_ask_actions::CancelProtectiveAsk',
    params: [
      { name: 'askId', type: 'id', description: 'ID of the protective ask to cancel' },
    ],
    typeParams: ['AssetType', 'StableType'],
    description: 'Cancel a protective ask. Ask proceeds are already deposited to treasury on each buy.',
    launchpadSupported: false,
    proposalSupported: true,
  },
];

// ============================================================================
// FUTARCHY ACTIONS - DISSOLUTION
// ============================================================================

export const DISSOLUTION_ACTIONS: ActionDefinition[] = [
  {
    id: 'create_dissolution_capability',
    name: 'Create Dissolution Capability',
    category: 'dissolution',
    package: 'futarchyActions',
    stagingModule: 'dissolution_init_actions',
    stagingFunction: 'add_create_dissolution_capability_spec',
    executionModule: 'dissolution_actions',
    executionFunction: 'do_create_dissolution_capability',
    markerType: 'futarchy_actions::dissolution_actions::CreateDissolutionCapability',
    params: [],
    typeParams: ['AssetType'],
    description: 'Create a dissolution capability for DAO termination',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'create_dissolution_capability_unshared',
    name: 'Create Dissolution Capability (Unshared)',
    category: 'dissolution',
    package: 'futarchyActions',
    stagingModule: 'dissolution_init_actions',
    stagingFunction: 'add_create_dissolution_capability_unshared_spec',
    executionModule: 'dissolution_actions',
    executionFunction: 'do_create_dissolution_capability_unshared',
    markerType: 'futarchy_actions::dissolution_actions::CreateDissolutionCapabilityUnshared',
    params: [],
    typeParams: ['AssetType'],
    description:
      'Create a dissolution capability but keep it owned for the remainder of the action batch (useful for single-PTB termination + liquidation)',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'share_dissolution_capability',
    name: 'Share Dissolution Capability',
    category: 'dissolution',
    package: 'futarchyActions',
    stagingModule: 'dissolution_init_actions',
    stagingFunction: 'add_share_dissolution_capability_spec',
    executionModule: 'dissolution_actions',
    executionFunction: 'do_share_dissolution_capability',
    markerType: 'futarchy_actions::dissolution_actions::ShareDissolutionCapability',
    params: [],
    typeParams: [],
    description: 'Share an owned DissolutionCapability (typically the final step of a single-PTB dissolution flow)',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'create_redemption_pool',
    name: 'Create Redemption Pool',
    category: 'dissolution',
    package: 'futarchyActions',
    stagingModule: 'dissolution_init_actions',
    stagingFunction: 'add_create_redemption_pool_spec',
    executionModule: 'dissolution_actions',
    executionFunction: 'do_create_redemption_pool',
    markerType: 'futarchy_actions::dissolution_actions::CreateRedemptionPool',
    params: [
      {
        name: 'capabilityId',
        type: 'id',
        description: 'DissolutionCapability object ID to bind this staged pool creation to',
        optional: true,
      },
      {
        name: 'resourceNames',
        type: 'vector<string>',
        description: 'Resource names in executable_resources to merge into the pool (from prior VaultSpend / RemoveLiquidity)',
      },
    ],
    typeParams: ['RedeemCoinType'],
    description: 'Create a redemption pool from coins in executable resources (requires prior VaultSpend / RemoveLiquidity)',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'add_to_redemption_pool',
    name: 'Add to Redemption Pool',
    category: 'dissolution',
    package: 'futarchyActions',
    stagingModule: 'dissolution_init_actions',
    stagingFunction: 'add_add_to_redemption_pool_spec',
    executionModule: 'dissolution_actions',
    executionFunction: 'do_add_to_redemption_pool',
    markerType: 'futarchy_actions::dissolution_actions::AddToRedemptionPool',
    params: [
      { name: 'resourceName', type: 'string', description: 'Name of resource in executable_resources' },
      { name: 'poolId', type: 'id', description: 'Object ID of the redemption pool' },
    ],
    typeParams: ['RedeemCoinType'],
    description: 'Add coins to an existing redemption pool',
    launchpadSupported: false,
    proposalSupported: true,
  },
];

// ============================================================================
// GOVERNANCE ACTIONS - PACKAGE REGISTRY
// ============================================================================

export const PACKAGE_REGISTRY_ACTIONS: ActionDefinition[] = [
  {
    id: 'add_package',
    name: 'Add Package',
    category: 'package_registry',
    package: 'futarchyGovernanceActions',
    stagingModule: 'package_registry_init_actions',
    stagingFunction: 'add_add_package_spec',
    executionModule: 'package_registry_actions',
    executionFunction: 'do_add_package',
    markerType: 'futarchy_governance_actions::package_registry_actions::AddPackage',
    params: [
      { name: 'name', type: 'string', description: 'Package name' },
      { name: 'addr', type: 'address', description: 'Package address' },
      { name: 'version', type: 'u64', description: 'Package version' },
      { name: 'actionTypes', type: 'vector<string>', description: 'Supported action types' },
      { name: 'category', type: 'string', description: 'Package category' },
      { name: 'description', type: 'string', description: 'Package description' },
    ],
    description: 'Add a package to the registry',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'update_package_metadata',
    name: 'Update Package Metadata',
    category: 'package_registry',
    package: 'futarchyGovernanceActions',
    stagingModule: 'package_registry_init_actions',
    stagingFunction: 'add_update_package_metadata_spec',
    executionModule: 'package_registry_actions',
    executionFunction: 'do_update_package_metadata',
    markerType: 'futarchy_governance_actions::package_registry_actions::UpdatePackageMetadata',
    params: [
      { name: 'name', type: 'string', description: 'Package name' },
      { name: 'newActionTypes', type: 'vector<string>', description: 'New action types' },
      { name: 'newCategory', type: 'string', description: 'New category' },
      { name: 'newDescription', type: 'string', description: 'New description' },
    ],
    description: 'Update package metadata',
    launchpadSupported: false,
    proposalSupported: true,
  },
];

// ============================================================================
// ORACLE ACTIONS
// ============================================================================

export const ORACLE_ACTIONS: ActionDefinition[] = [
  {
    id: 'create_oracle_grant',
    name: 'Create Oracle Grant',
    category: 'oracle',
    package: 'futarchyOracleActions',
    stagingModule: 'oracle_init_actions',
    stagingFunction: 'add_create_oracle_grant_spec',
    executionModule: 'oracle_actions',
    executionFunction: 'do_create_oracle_grant',
    markerType: 'futarchy_oracle::oracle_actions::CreateOracleGrant',
    params: [
      { name: 'mintCapResourceName', type: 'string', description: 'Resource name to take CurrencyMintAdminCap from' },
      { name: 'tierSpecs', type: 'tier_specs', description: 'Price tier specifications' },
      { name: 'useRelativePricing', type: 'bool', description: 'Use relative pricing' },
      { name: 'launchpadMultiplier', type: 'u64', description: 'Launchpad price multiplier' },
      { name: 'earliestExecutionOffsetMs', type: 'u64', description: 'Earliest execution offset (ms)' },
      { name: 'expiryYears', type: 'u64', description: 'Grant expiry in years (0 = no expiry, max 10_000_000)' },
      { name: 'cancelable', type: 'bool', description: 'Whether grant is cancelable' },
      { name: 'description', type: 'string', description: 'Grant description' },
      { name: 'twapWindowMs', type: 'u64', description: 'TWAP window (ms) for price checks (7-90 days)' },
    ],
    typeParams: ['AssetType', 'StableType'],
    description: 'Create a price-based oracle grant',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'cancel_oracle_grant',
    name: 'Cancel Oracle Grant',
    category: 'oracle',
    package: 'futarchyOracleActions',
    stagingModule: 'oracle_init_actions',
    stagingFunction: 'add_cancel_grant_spec',
    executionModule: 'oracle_actions',
    executionFunction: 'do_cancel_grant',
    markerType: 'futarchy_oracle::oracle_actions::CancelGrant',
    params: [{ name: 'grantId', type: 'id', description: 'Grant ID to cancel' }],
    typeParams: ['AssetType', 'StableType'],
    description: 'Cancel an oracle grant',
    launchpadSupported: false,
    proposalSupported: true,
  },
];

// ============================================================================
// LAUNCHPAD ACTIONS
// ============================================================================

export const LAUNCHPAD_ONLY_ACTIONS: ActionDefinition[] = [
  {
    id: 'deposit_raise_funds',
    name: 'Deposit Raise Funds',
    category: 'launchpad',
    package: 'futarchyFactory',
    stagingModule: 'launchpad',
    stagingFunction: 'add_deposit_raise_funds_spec',
    executionModule: 'launchpad',
    executionFunction: 'do_init_deposit_raise_funds',
    markerType: 'futarchy_factory::launchpad::DepositRaiseFunds',
    params: [],
    typeParams: ['RaiseToken', 'StableCoin'],
    description: 'Deposit raised stable coins from Raise into DAO vaults (treasury, amm, bid wall)',
    launchpadSupported: true,
    proposalSupported: false,
  },
];

// ============================================================================
// ACCOUNT ACTIONS - PACKAGE UPGRADE
// ============================================================================

export const PACKAGE_UPGRADE_ACTIONS: ActionDefinition[] = [
  {
    id: 'upgrade_package',
    name: 'Upgrade Package',
    category: 'package_upgrade',
    package: 'accountActions',
    stagingModule: 'package_upgrade_init_actions',
    stagingFunction: 'add_upgrade_spec',
    executionModule: 'package_upgrade',
    executionFunction: 'do_init_upgrade',
    markerType: 'account_actions::package_upgrade::PackageUpgrade',
    params: [
      { name: 'name', type: 'string', description: 'Locked package name to upgrade' },
      { name: 'digest', type: 'vector<u8>', description: 'Committed upgrade digest' },
      { name: 'expectedCapId', type: 'id', description: 'Expected locked UpgradeCap object ID' },
    ],
    description: 'Authorize a package upgrade and return the UpgradeTicket for tx.upgrade.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'commit_upgrade',
    name: 'Commit Upgrade',
    category: 'package_upgrade',
    package: 'accountActions',
    stagingModule: 'package_upgrade_init_actions',
    stagingFunction: 'add_commit_spec',
    executionModule: 'package_upgrade',
    executionFunction: 'do_init_commit',
    markerType: 'account_actions::package_upgrade::PackageCommit',
    params: [
      { name: 'name', type: 'string', description: 'Locked package name to commit' },
      { name: 'expectedCapId', type: 'id', description: 'Expected locked UpgradeCap object ID' },
    ],
    description: 'Commit a previously authorized package upgrade using the UpgradeReceipt.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'restrict_upgrade',
    name: 'Restrict Upgrade Policy',
    category: 'package_upgrade',
    package: 'accountActions',
    stagingModule: 'package_upgrade_init_actions',
    stagingFunction: 'add_restrict_spec',
    executionModule: 'package_upgrade',
    executionFunction: 'do_init_restrict',
    markerType: 'account_actions::package_upgrade::PackageRestrict',
    params: [
      { name: 'name', type: 'string', description: 'Locked package name to restrict' },
      { name: 'policy', type: 'u8', description: 'New, more restrictive upgrade policy' },
      { name: 'expectedCapId', type: 'id', description: 'Expected locked UpgradeCap object ID' },
    ],
    description: 'Tighten the package upgrade policy or make the package immutable.',
    launchpadSupported: true,
    proposalSupported: true,
  },
  {
    id: 'lock_upgrade_cap',
    name: 'Lock UpgradeCap',
    category: 'package_upgrade',
    package: 'accountActions',
    stagingModule: 'package_upgrade_init_actions',
    stagingFunction: 'add_lock_upgrade_cap_spec',
    executionModule: 'package_upgrade',
    executionFunction: 'do_init_lock_upgrade_cap',
    markerType: 'account_actions::package_upgrade::LockUpgradeCap',
    params: [
      { name: 'name', type: 'string', description: 'Package name for the locked cap' },
      { name: 'delayMs', type: 'u64', description: 'Minimum upgrade delay in milliseconds' },
      { name: 'resourceName', type: 'string', description: 'Resource name used to stage the UpgradeCap before locking', optional: true },
      { name: 'expectedCapId', type: 'id', description: 'Expected UpgradeCap object ID (validated at execution)' },
    ],
    description: 'Lock an UpgradeCap in account via governance after staging it in executable_resources',
    launchpadSupported: false,
    proposalSupported: true,
  },
  {
    id: 'unlock_upgrade_cap',
    name: 'Unlock UpgradeCap',
    category: 'package_upgrade',
    package: 'accountActions',
    stagingModule: 'package_upgrade_init_actions',
    stagingFunction: 'add_unlock_upgrade_cap_spec',
    executionModule: 'package_upgrade',
    executionFunction: 'do_init_unlock_upgrade_cap',
    markerType: 'account_actions::package_upgrade::UnlockUpgradeCap',
    params: [
      { name: 'name', type: 'string', description: 'Package name of the locked cap to unlock' },
      { name: 'resourceName', type: 'string', description: 'Resource name used to store the unlocked UpgradeCap', optional: true },
      { name: 'expectedCapId', type: 'id', description: 'Expected locked UpgradeCap object ID' },
    ],
    description: 'Unlock a locked UpgradeCap into executable_resources for a follow-up action',
    launchpadSupported: false,
    proposalSupported: true,
  },
];

// ============================================================================
// COMBINED REGISTRY
// ============================================================================

/**
 * All action definitions combined
 */
export const ALL_ACTIONS: ActionDefinition[] = [
  ...TRANSFER_ACTIONS,
  ...VAULT_ACTIONS,
  ...CURRENCY_ACTIONS,
  ...STREAM_ACTIONS,
  ...VESTING_ACTIONS,
  ...OWNED_ACTIONS,
  ...MEMO_ACTIONS,
  ...ACCESS_CONTROL_ACTIONS,
  ...ACCOUNT_CONFIG_ACTIONS,
  ...CONFIG_ACTIONS,
  ...QUOTA_ACTIONS,
  ...LIQUIDITY_ACTIONS,
  ...DISSOLUTION_ACTIONS,
  ...PACKAGE_UPGRADE_ACTIONS,
  ...PACKAGE_REGISTRY_ACTIONS,
  ...ORACLE_ACTIONS,
  ...LAUNCHPAD_ONLY_ACTIONS,
];

/**
 * Action definitions indexed by ID for fast lookup
 */
export const ACTION_BY_ID: Record<string, ActionDefinition> = ALL_ACTIONS.reduce(
  (acc, action) => {
    acc[action.id] = action;
    return acc;
  },
  {} as Record<string, ActionDefinition>
);

/**
 * Actions grouped by category
 */
export const ACTIONS_BY_CATEGORY: Record<ActionCategory, ActionDefinition[]> = ALL_ACTIONS.reduce(
  (acc, action) => {
    if (!acc[action.category]) {
      acc[action.category] = [];
    }
    acc[action.category].push(action);
    return acc;
  },
  {} as Record<ActionCategory, ActionDefinition[]>
);

/**
 * Actions grouped by package
 */
export const ACTIONS_BY_PACKAGE: Record<PackageId, ActionDefinition[]> = ALL_ACTIONS.reduce(
  (acc, action) => {
    if (!acc[action.package]) {
      acc[action.package] = [];
    }
    acc[action.package].push(action);
    return acc;
  },
  {} as Record<PackageId, ActionDefinition[]>
);

/**
 * Launchpad-supported actions
 */
export const LAUNCHPAD_ACTIONS = ALL_ACTIONS.filter((a) => a.launchpadSupported);

/**
 * Proposal-supported actions
 */
export const PROPOSAL_ACTIONS = ALL_ACTIONS.filter((a) => a.proposalSupported);

/**
 * Map from markerType (module::TypeName) to action definition
 * Used for looking up actions from event data where fullType contains the marker
 */
export const ACTION_BY_MARKER_TYPE: Record<string, ActionDefinition> = ALL_ACTIONS.reduce(
  (acc, action) => {
    // markerType format: "package::module::TypeName" e.g., "account_actions::vault::CreateStream"
    // Extract "module::TypeName" for matching against fullType from events
    const parts = action.markerType.split('::');
    if (parts.length >= 2) {
      // Store by "module::TypeName"
      const moduleAndType = parts.slice(-2).join('::');
      acc[moduleAndType] = action;
    }
    return acc;
  },
  {} as Record<string, ActionDefinition>
);

/**
 * Get action definition by fullType from event data
 * fullType format: "0xpackage::module::TypeName<TypeArgs>"
 */
export function getActionByFullType(fullType: string): ActionDefinition | undefined {
  // Strip generic params first (they may contain ::)
  // e.g., "0x123::vault::CreateStream<0xabc::coin::COIN>" -> "0x123::vault::CreateStream"
  let cleanType = fullType;
  const genericStart = fullType.indexOf('<');
  if (genericStart > 0) {
    cleanType = fullType.substring(0, genericStart);
  }

  // Extract module::TypeName from fullType
  const parts = cleanType.split('::');
  if (parts.length < 3) return undefined;

  // Get module and type
  const module = parts[parts.length - 2];
  const typeName = parts[parts.length - 1];

  return ACTION_BY_MARKER_TYPE[`${module}::${typeName}`];
}
