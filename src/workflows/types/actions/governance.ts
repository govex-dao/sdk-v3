/**
 * Governance Action Configs
 *
 * Package registry and package-upgrade actions.
 *
 * @module workflows/types/actions/governance
 */

// ============================================================================
// GOVERNANCE ACTIONS - PACKAGE REGISTRY
// ============================================================================

/**
 * Add package to registry
 */
export interface AddPackageActionConfig {
  type: 'add_package';
  /** Package name */
  name: string;
  /** Package address */
  addr: string;
  /** Package version */
  version: bigint;
  /** Action types as strings */
  actionTypes: string[];
  /** Category */
  category: string;
  /** Description */
  description: string;
}

/**
 * Update package metadata
 */
export interface UpdatePackageMetadataActionConfig {
  type: 'update_package_metadata';
  /** Package name */
  name: string;
  /** New action types */
  newActionTypes: string[];
  /** New category */
  newCategory: string;
  /** New description */
  newDescription: string;
}

// ============================================================================
// GOVERNANCE ACTIONS - PACKAGE UPGRADE
// ============================================================================

/**
 * Runtime artifacts required to execute a staged package upgrade.
 */
export interface PackageUpgradeExecutionConfig {
  /** Existing on-chain package object ID being upgraded */
  packageId: string;
  /** Base64-encoded compiled Move modules */
  modules: string[];
  /** Dependency package IDs for the upgrade */
  dependencies: string[];
}

/**
 * Authorize a package upgrade and produce the UpgradeTicket for `tx.upgrade(...)`.
 */
export interface UpgradePackageActionConfig {
  type: 'upgrade_package';
  /** Locked package name */
  name: string;
  /** Digest committed at staging time */
  digest: number[] | Uint8Array;
  /** Exact locked UpgradeCap object ID approved by governance */
  expectedCapId: string;
  /** Runtime artifacts used by `tx.upgrade(...)` during execution */
  upgrade?: PackageUpgradeExecutionConfig;
}

/**
 * Commit a previously authorized package upgrade.
 */
export interface CommitUpgradeActionConfig {
  type: 'commit_upgrade';
  /** Locked package name */
  name: string;
  /** Exact locked UpgradeCap object ID approved by governance */
  expectedCapId: string;
}

/**
 * Tighten the upgrade policy for a locked UpgradeCap.
 */
export interface RestrictUpgradeActionConfig {
  type: 'restrict_upgrade';
  /** Locked package name */
  name: string;
  /** New, stricter policy value */
  policy: number;
  /** Exact locked UpgradeCap object ID approved by governance */
  expectedCapId: string;
}

/**
 * Lock an UpgradeCap into the account via governance.
 * The cap is first staged into executable_resources, then consumed by the lock action.
 */
export interface LockUpgradeCapActionConfig {
  type: 'lock_upgrade_cap';
  /** Package name for the locked cap */
  name: string;
  /** Minimum delay before upgrades can execute */
  delayMs: bigint;
  /** Resource name used to stage the UpgradeCap before locking */
  resourceName?: string;
  /** Exact UpgradeCap object ID approved by governance */
  expectedCapId: string;
  /** UpgradeCap object ID passed into the execution PTB for the preceding ProvideObject step */
  externalArg?: string;
}

/**
 * Unlock a previously locked UpgradeCap into executable_resources for a follow-up action.
 */
export interface UnlockUpgradeCapActionConfig {
  type: 'unlock_upgrade_cap';
  /** Package name for the locked cap */
  name: string;
  /** Resource name used to store the unlocked UpgradeCap */
  resourceName?: string;
  /** Exact locked UpgradeCap object ID approved by governance */
  expectedCapId: string;
}

// ============================================================================
