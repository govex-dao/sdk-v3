/**
 * Account Action Configs
 *
 * Stream, Vault, Currency, Transfer, Package Upgrade, and Memo actions.
 *
 * @module workflows/types/actions/account
 */

// ============================================================================
// ACCOUNT ACTIONS - STREAM
// ============================================================================

/**
 * Stream creation action configuration
 */
export interface CreateStreamActionConfig {
  type: 'create_stream';
  /** Coin type for the stream (required for type-safe staging) */
  coinType?: string;
  /** Vault to withdraw from */
  vaultName: string;
  /** Beneficiary address */
  beneficiary: string;
  /** Amount per iteration (in base units) */
  amountPerIteration: bigint;
  /** Start timestamp (ms). If null/undefined, uses clock time at execution. */
  startTime?: number | bigint | null;
  /** Total number of iterations */
  iterationsTotal: bigint;
  /** Period between iterations (ms) */
  iterationPeriodMs: bigint;
  /** Optional claim window (ms) - use-or-lose */
  claimWindowMs?: bigint;
  /** Optional stream expiry timestamp/duration in ms, encoded as Move Option<u64> */
  expiryMs?: bigint;
  /** Optional recipient allowlist. Empty means unrestricted beneficiary claims. */
  whitelistedRecipients?: string[];
  // Note: All streams are always cancellable by DAO governance
}

/**
 * Cancel stream action configuration
 */
export interface CancelStreamActionConfig {
  type: 'cancel_stream';
  /** Coin type for the stream (required for type-safe staging) */
  coinType?: string;
  /** Vault name where stream was created */
  vaultName: string;
  /** Stream object ID to cancel */
  streamId: string;
  /**
   * Compatibility field retained by on-chain payload parser.
   * Cancel no longer emits refund coins.
   */
  resourceName?: string;
}

/**
 * Collect vested tokens from a stream into executable_resources
 */
export interface CollectStreamActionConfig {
  type: 'collect_stream';
  /** Coin type for the stream (required for type-safe staging) */
  coinType?: string;
  /** Vault name where stream was created */
  vaultName: string;
  /** Stream ID to collect from */
  streamId: string;
  /** Name to store collected coin under in executable_resources */
  resourceName: string;
  /** Amount to collect; 0 means collect all currently available */
  amount: bigint;
  /** Resource name used to temporarily stage the StreamCap in executable_resources */
  capResourceName?: string;
  /** Exact StreamCap object ID approved for the preceding ProvideObject step */
  streamCapId?: string;
  /** Alias for streamCapId used by generic execution tooling */
  externalArg?: string;
}

// ============================================================================
// ACCOUNT ACTIONS - VAULT
// ============================================================================

/**
 * Deposit to vault action configuration
 * The coin is taken from executable_resources using the given resourceName
 */
export interface DepositActionConfig {
  type: 'deposit';
  /** Coin type being deposited (required for type-safe staging) */
  coinType?: string;
  /** Vault name */
  vaultName: string;
  /** Amount to deposit */
  amount: bigint;
  /** Resource name to take the coin from executable_resources */
  resourceName: string;
}

/**
 * Spend from vault action configuration
 * The coin is placed in executable_resources under the given resourceName
 * for consumption by subsequent actions (e.g., TransferObject, Deposit)
 */
export interface SpendActionConfig {
  type: 'spend';
  /** Coin type being spent (required for type-safe staging) */
  coinType?: string;
  /** Vault name */
  vaultName: string;
  /** Amount to spend */
  amount: bigint;
  /** Whether to spend entire balance */
  spendAll: boolean;
  /** Resource name to store the coin in executable_resources */
  resourceName: string;
}

/**
 * Approve a coin type for future deposits into a vault.
 */
export interface ApproveCoinTypeActionConfig {
  type: 'approve_coin_type';
  /** Coin type to allow for deposits */
  coinType?: string;
  /** Vault name */
  vaultName: string;
}

/**
 * Remove a coin type from a vault's future-deposit allowlist.
 */
export interface RemoveApprovedCoinTypeActionConfig {
  type: 'remove_approved_coin_type';
  /** Coin type to stop allowing for deposits */
  coinType?: string;
  /** Vault name */
  vaultName: string;
}

/**
 * Deposit coins from executable_resources into a vault
 *
 * SECURITY: This is safe because:
 * - Coins come from executable_resources (from prior governance-approved actions)
 * - Amount deposited = exactly what prior action produced (deterministic)
 *
 * Use case: Deposit LP tokens, swap outputs, or other dynamic-amount coins
 * that are produced by a previous action in the proposal.
 */
export interface DepositFromResourcesActionConfig {
  type: 'deposit_from_resources';
  /** Coin type being deposited (required for type-safe staging) */
  coinType?: string;
  /** Target vault name */
  vaultName: string;
  /** Resource name to take the coin from executable_resources */
  resourceName: string;
}

/**
 * Deposit a Coin<T> object from executable_resources into a vault
 *
 * This variant reads from the object namespace instead of the coin namespace.
 * Use it after actions that stage `Coin<T>` via `provide_object`, such as
 * `withdraw_object<Coin<T>>`.
 */
export interface DepositObjectFromResourcesActionConfig {
  type: 'deposit_object_from_resources';
  /** Coin type being deposited (required for type-safe staging) */
  coinType?: string;
  /** Target vault name */
  vaultName: string;
  /** Resource name to take the Coin<T> object from executable_resources */
  resourceName: string;
}

/**
 * Mint a VaultAdminCap into executable_resources for a later action.
 */
export interface MintVaultAdminCapActionConfig {
  type: 'mint_vault_admin_cap';
  /** Vault that the cap authorizes withdrawals from */
  vaultName: string;
  /** Resource name to store the cap under in executable_resources */
  resourceName: string;
}

/**
 * Create a new named vault on the account.
 */
export interface OpenVaultActionConfig {
  type: 'open_vault';
  /** Vault name to create */
  vaultName: string;
}

/**
 * Close an empty named vault on the account.
 */
export interface CloseVaultActionConfig {
  type: 'close_vault';
  /** Vault name to close */
  vaultName: string;
}

// ============================================================================
// ACCOUNT ACTIONS - CURRENCY
// ============================================================================

/**
 * Remove a TreasuryCap from account storage into executable_resources.
 * Add a following transfer/lock action to consume the resource.
 */
export interface RemoveTreasuryCapToResourcesActionConfig {
  type: 'remove_treasury_cap_to_resources';
  /** Coin type of the treasury cap (required for type-safe staging) */
  coinType?: string;
  /** Exact TreasuryCap object ID expected in account storage */
  expectedCapId: string;
  /** Resource name used to store the cap in executable_resources */
  resourceName: string;
}

/**
 * Remove a MetadataCap from account storage into executable_resources.
 * Add a following transfer/lock action to consume the resource.
 */
export interface RemoveMetadataCapToResourcesActionConfig {
  type: 'remove_metadata_cap_to_resources';
  /** Coin type of the metadata cap (required for type-safe staging) */
  coinType?: string;
  /** Exact MetadataCap object ID expected in account storage */
  expectedCapId: string;
  /** Resource name used to store the cap in executable_resources */
  resourceName: string;
}

/**
 * Mint tokens action configuration
 * Mints tokens and stores them in executable_resources for subsequent actions.
 * For example: mint → create_vesting (vesting takes from executable_resources)
 */
export interface MintActionConfig {
  type: 'mint';
  /** Coin type to mint (required for type-safe staging) */
  coinType?: string;
  /** Amount to mint */
  amount: bigint;
  /** Resource name to store the minted coin in executable_resources */
  resourceName: string;
}

/**
 * Burn tokens action configuration
 * Burns tokens taken from executable_resources
 */
export interface BurnActionConfig {
  type: 'burn';
  /** Coin type to burn (required for type-safe staging) */
  coinType?: string;
  /** Amount to burn */
  amount: bigint;
  /** Resource name to take the coin from executable_resources */
  resourceName: string;
}

/**
 * Mint a CurrencyMintAdminCap into executable_resources.
 */
export interface MintCurrencyAdminCapActionConfig {
  type: 'mint_currency_admin_cap';
  /** Coin type the delegated mint cap is for */
  coinType?: string;
  /** Resource name to store the cap in executable_resources */
  resourceName: string;
}

/**
 * Update currency metadata
 */
export interface UpdateCurrencyActionConfig {
  type: 'update_currency';
  /** Coin type to update (required for type-safe staging) */
  coinType?: string;
  /** New symbol (ASCII) */
  symbol?: string;
  /** New name (UTF-8) */
  name?: string;
  /** New description (UTF-8) */
  description?: string;
  /** New icon URL (ASCII) */
  iconUrl?: string;
}

/**
 * Lock treasury cap action configuration
 * PTB provides the TreasuryCap as external argument
 */
export interface LockTreasuryCapActionConfig {
  type: 'lock_treasury_cap';
  /** Coin type of the treasury cap (required for type-safe staging) */
  coinType?: string;
  /** Maximum supply (optional) */
  maxSupply?: bigint;
  /** Whether minting is allowed after lock */
  canMint: boolean;
  /** Whether burning is allowed after lock */
  canBurn: boolean;
  /** Whether name updates are allowed after lock */
  canUpdateName: boolean;
  /** Whether description updates are allowed after lock */
  canUpdateDescription: boolean;
  /** Whether icon updates are allowed after lock */
  canUpdateIcon: boolean;
  /** Resource name used to stage the TreasuryCap in executable_resources before locking */
  resourceName?: string;
  /** Exact treasury cap object ID approved for the preceding ProvideObject step */
  externalArg?: string;
}

/**
 * Lock metadata cap action configuration
 * PTB provides the MetadataCap as external argument
 */
export interface LockMetadataCapActionConfig {
  type: 'lock_metadata_cap';
  /** Coin type of the metadata cap (required for type-safe staging) */
  coinType?: string;
  /** Whether name updates remain allowed after locking */
  canUpdateName: boolean;
  /** Whether description updates remain allowed after locking */
  canUpdateDescription: boolean;
  /** Whether icon updates remain allowed after locking */
  canUpdateIcon: boolean;
  /** Resource name used to stage the MetadataCap in executable_resources before locking */
  resourceName?: string;
  /** Exact metadata cap object ID approved for the preceding ProvideObject step */
  externalArg?: string;
}

// ============================================================================
// ACCOUNT ACTIONS - TRANSFER
// ============================================================================

/**
 * Transfer object action configuration (for objects via provide_object)
 * The object is taken from executable_resources using the given resourceName
 * Key format: "name::object::Type"
 */
export interface TransferActionConfig {
  type: 'transfer';
  /** Object type being transferred (required for type-safe staging) */
  objectType: string;
  /** Recipient address */
  recipient: string;
  /** Resource name to take the object from executable_resources */
  resourceName: string;
}

/**
 * Transfer object to transaction sender (for objects via provide_object)
 * The object is taken from executable_resources using the given resourceName
 * Key format: "name::object::Type"
 */
export interface TransferToSenderActionConfig {
  type: 'transfer_to_sender';
  /** Object type being transferred (required for type-safe staging) */
  objectType: string;
  /** Resource name to take the object from executable_resources */
  resourceName: string;
}

/**
 * Transfer coin action configuration (for coins via provide_coin)
 * The coin is taken from executable_resources using the given resourceName
 * Key format: "name::coin::CoinType"
 *
 * Use this instead of TransferActionConfig when the coin was placed via provide_coin
 * (e.g., from VaultSpend, CurrencyMint)
 */
export interface TransferCoinActionConfig {
  type: 'transfer_coin';
  /** Coin type being transferred (required for type-safe staging) */
  coinType?: string;
  /** Recipient address */
  recipient: string;
  /** Resource name to take the coin from executable_resources */
  resourceName: string;
}

/**
 * Transfer coin to transaction sender (for coins via provide_coin)
 * The coin is taken from executable_resources using the given resourceName
 * Key format: "name::coin::CoinType"
 *
 * Use this for crank fees when the coin was placed via provide_coin
 */
export interface TransferCoinToSenderActionConfig {
  type: 'transfer_coin_to_sender';
  /** Coin type being transferred (required for type-safe staging) */
  coinType?: string;
  /** Resource name to take the coin from executable_resources */
  resourceName: string;
}

// ============================================================================
// ACCOUNT ACTIONS - MEMO
// ============================================================================

/**
 * Emit memo action configuration
 */
export interface MemoActionConfig {
  type: 'memo';
  /** Memo message */
  message: string;
}

// ============================================================================
// ACCOUNT ACTIONS - DEPOSIT EXTERNAL
// ============================================================================

/**
 * Deposit external coins from PTB into vault
 * SECURITY: Amount MUST match expected_amount (validated at execution)
 */
export interface DepositExternalActionConfig {
  type: 'deposit_external';
  /** Coin type being deposited (required for type-safe staging) */
  coinType: string;
  /** Target vault name */
  vaultName: string;
  /** Expected amount (validated at execution) */
  expectedAmount: bigint;
  /** External coin from PTB (set at execution time) */
  coin?: unknown;
}

// ============================================================================
// ACCOUNT ACTIONS - ACCESS CONTROL (LOCK/UNLOCK)
// ============================================================================

/**
 * Provide an external object into executable_resources for a subsequent action.
 * Must be staged before lock_access to supply the cap.
 */
export interface ProvideObjectActionConfig {
  type: 'provide_object';
  /** Full object type */
  objectType: string;
  /** Exact object ID approved for this provider action */
  objectId?: string;
  /** Alias for objectId used by generic execution tooling */
  externalArg?: string;
  /** Resource name to store the object under */
  resourceName: string;
}

/**
 * Lock a capability into the account
 * The cap is stored using CapKey<Cap> and can later be used by action functions
 * that borrow/return it internally within a single do_* call.
 */
export interface LockAccessActionConfig {
  type: 'lock_access';
  /** Full cap type (e.g., "0x...::module::CapType") */
  capType: string;
  /** Expected cap object ID baked into the staged action payload */
  expectedId?: string;
  /** External cap object ID used at execution time */
  externalArg?: string;
  /** Cap object (set at execution time) */
  cap?: unknown;
  /** Resource name for the lock action spec (defaults to empty string) */
  resourceName?: string;
}

/**
 * Unlock a capability from the account and place in executable_resources
 * (for chaining with Transfer/other actions).
 */
export interface UnlockAccessActionConfig {
  type: 'unlock_access';
  /** Full cap type (e.g., "0x...::module::CapType") */
  capType: string;
  /** Exact cap object ID expected in account storage */
  expectedId: string;
  /** Resource name where the unlocked cap will be staged in executable_resources */
  resourceName: string;
}

// ============================================================================
// ACCOUNT ACTIONS - OWNED OBJECT WITHDRAWAL
// ============================================================================

/**
 * Withdraw an owned object from account address (TTO pattern)
 * Object is stored in executable_resources for subsequent actions
 */
export interface WithdrawObjectActionConfig {
  type: 'withdraw_object';
  /** Object type (e.g., "0x...::module::ObjectType") */
  objectType: string;
  /** Object ID to withdraw */
  objectId: string;
  /** Resource name to store object in executable_resources */
  resourceName: string;
  /** Receiving<T> object (set at execution time) */
  receiving?: unknown;
}

// ============================================================================
// ACCOUNT ACTIONS - VESTING
// ============================================================================

/**
 * Create a standalone vesting with TRUE fund isolation
 * Funds are placed in a shared Vesting object, not the vault
 */
export interface CreateVestingActionConfig {
  type: 'create_vesting';
  /** Coin type for the vesting (required for type-safe staging) */
  coinType: string;
  /** Resource name to take coin from executable_resources (from prior VaultSpend) */
  resourceName: string;
  /** Beneficiary address */
  beneficiary: string;
  /** Start timestamp (ms). If null/undefined, uses clock time at execution. */
  startTime?: number | bigint | null;
  /** Total number of iterations */
  iterationsTotal: bigint;
  /** Period between iterations (ms) */
  iterationPeriodMs: bigint;
  /** Amount per iteration */
  amountPerIteration: bigint;
  /** Whether vesting is cancellable by DAO */
  isCancellable: boolean;
}

/**
 * Cancel a cancellable vesting
 * Returns unvested funds to executable_resources for subsequent deposit
 */
export interface CancelVestingActionConfig {
  type: 'cancel_vesting';
  /** Coin type for the vesting (required for type-safe staging) */
  coinType: string;
  /** Vesting object ID */
  vestingId: string;
  /** Resource name to store returned funds in executable_resources */
  resourceName: string;
}

// ============================================================================
// ACCOUNT ACTIONS - CONFIG
// ============================================================================

/**
 * Set authorization level for action package validation
 * Level 0 = GLOBAL_ONLY: Only global registry packages allowed
 * Level 1 = WHITELIST: Global registry OR per-account whitelist
 * Level 2 = PERMISSIVE: Any package allowed (no checks)
 */
export interface SetAuthorizationLevelActionConfig {
  type: 'set_authorization_level';
  /** New authorization level (0, 1, or 2) */
  level: number;
}

/**
 * Add a package to per-account deps table
 */
export interface AddDepActionConfig {
  type: 'add_dep';
  /** Package address */
  addr: string;
  /** Package name */
  name: string;
  /** Package version */
  version: bigint;
}

/**
 * Remove a package from per-account deps table
 */
export interface RemoveDepActionConfig {
  type: 'remove_dep';
  /** Package name to remove */
  name: string;
}
