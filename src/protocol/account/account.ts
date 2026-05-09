/**
 * Account Protocol - Core Account Module
 *
 * This module provides the core functionality for managing multisig Account objects.
 * It handles account creation, intent management, authentication, and dynamic field operations.
 *
 * The flow is:
 *   1. An intent is created by stacking actions into it.
 *   2. When the intent is resolved (threshold reached, quorum reached, etc), it can be executed.
 *   3. The module that created the intent must destroy all of the actions and the Executable after execution.
 *
 * Portions of this module are derived from the account.tech Move Framework project
 * and remain licensed under the Apache License, Version 2.0.
 *
 * @module account
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Account Protocol - Core Account Module
 *
 * Static utilities for managing account objects, intents, and authentication.
 *
 * @example Create and manage an account
 * ```typescript
 * const tx = new Transaction();
 *
 * // Create a new account
 * const account = Account.new(tx, {
 *   accountProtocolPackageId,
 *   configType,
 *   configWitnessType,
 * }, config, deps, configWitness);
 *
 * // Share the account
 * Account.shareAccount(tx, { accountProtocolPackageId }, account);
 *
 * // Create an auth object
 * const auth = Account.newAuth(tx, {
 *   accountProtocolPackageId,
 *   configType,
 *   configWitnessType,
 * }, account, registry, versionWitness, configWitness);
 *
 * // Create and manage intents
 * const intent = Account.createIntent(tx, {
 *   accountProtocolPackageId,
 *   outcomeType,
 *   intentWitnessType,
 * }, account, registry, params, outcome, versionWitness, intentWitness);
 *
 * Account.insertIntent(tx, {
 *   accountProtocolPackageId,
 *   configType,
 *   outcomeType,
 *   configWitnessType,
 *   intentWitnessType,
 * }, account, registry, intent, configWitness, intentWitness);
 *
 * // Execute an intent
 * const [outcome, executable] = Account.createExecutable(tx, {
 *   accountProtocolPackageId,
 *   configType,
 *   outcomeType,
 *   configWitnessType,
 * }, account, registry, key, clock, versionWitness, configWitness);
 *
 * // Confirm execution
 * Account.confirmExecution(tx, {
 *   accountProtocolPackageId,
 *   outcomeType,
 * }, account, executable);
 *
 * // Manage dynamic fields
 * Account.addManagedData(tx, {
 *   accountProtocolPackageId,
 *   keyType,
 *   dataType,
 * }, account, registry, key, data, versionWitness);
 *
 * Account.addManagedAsset(tx, {
 *   accountProtocolPackageId,
 *   keyType,
 *   assetType,
 * }, account, registry, key, asset, versionWitness);
 * ```
 */
export class Account {
  // ============================================================================
  // EXECUTION (1)
  // ============================================================================

  /**
   * Verifies all actions have been processed and destroys the executable
   * Called to complete the intent execution
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.outcomeType - The outcome type parameter
   * @param account - The account object
   * @param executable - The executable object
   */
  static confirmExecution(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      outcomeType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    executable: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'confirm_execution'),
      typeArguments: [config.outcomeType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        executable,
      ],
    });
  }

  /**
   * Returns the outcome that must be validated and the executable
   * Can only be called from the config module
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.configType - The config type parameter
   * @param config.outcomeType - The outcome type parameter
   * @param config.configWitnessType - The config witness type parameter
   * @param account - The account object
   * @param registry - The package registry object
   * @param key - The intent key
   * @param clock - The clock object
   * @param configWitness - The config witness
   * @returns Tuple of [outcome, executable]
   */
  static createExecutable(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      configType: string;
      outcomeType: string;
      configWitnessType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    registry: string | ReturnType<Transaction['moveCall']>,
    key: string,
    clock: string | ReturnType<Transaction['moveCall']>,
    configWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'create_executable'),
      typeArguments: [config.configType, config.outcomeType, config.configWitnessType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        typeof registry === 'string' ? tx.object(registry) : registry,
        tx.pure.string(key),
        typeof clock === 'string' ? tx.object(clock) : clock,
        configWitness,
      ],
    });
  }

  // ============================================================================
  // INTENT MANAGEMENT (4)
  // ============================================================================

  /**
   * Creates a new intent
   * Can only be called from a dependency of the account
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.outcomeType - The outcome type parameter
   * @param config.intentWitnessType - The intent witness type parameter
   * @param account - The account object
   * @param registry - The package registry object
   * @param params - The intent parameters
   * @param outcome - The outcome/resolution settings
   * @param versionWitness - Proof of the package address that creates the intent
   * @param intentWitness - The intent witness
   * @returns The created intent
   */
  static createIntent(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      outcomeType: string;
      intentWitnessType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    registry: string | ReturnType<Transaction['moveCall']>,
    params: ReturnType<Transaction['moveCall']>,
    outcome: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>,
    intentWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'create_intent'),
      typeArguments: [config.outcomeType, config.intentWitnessType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        typeof registry === 'string' ? tx.object(registry) : registry,
        params,
        outcome,
        versionWitness,
        intentWitness,
      ],
    });
  }

  /**
   * Adds an intent to a shared account.
   * Can only be called by the active config module.
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.configType - The config type parameter
   * @param config.outcomeType - The outcome type parameter
   * @param config.configWitnessType - The config witness type parameter
   * @param config.intentWitnessType - The intent witness type parameter
   * @param account - The account object
   * @param registry - The package registry object
   * @param intent - The intent to add
   * @param configWitness - The config witness
   * @param intentWitness - The intent witness
   */
  static insertIntent(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      configType: string;
      outcomeType: string;
      configWitnessType: string;
      intentWitnessType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    registry: string | ReturnType<Transaction['moveCall']>,
    intent: ReturnType<Transaction['moveCall']>,
    configWitness: ReturnType<Transaction['moveCall']>,
    intentWitness: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'insert_intent'),
      typeArguments: [
        config.configType,
        config.outcomeType,
        config.configWitnessType,
        config.intentWitnessType,
      ],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        typeof registry === 'string' ? tx.object(registry) : registry,
        intent,
        configWitness,
        intentWitness,
      ],
    });
  }

  /**
   * Adds an intent to an unshared account.
   * Requires package witness authorization.
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.outcomeType - The outcome type parameter
   * @param config.intentWitnessType - The intent witness type parameter
   * @param account - The unshared account object
   * @param registry - The package registry object
   * @param intent - The intent to add
   * @param versionWitness - The version witness
   * @param intentWitness - The intent witness
   */
  static insertIntentUnshared(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      outcomeType: string;
      intentWitnessType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    registry: string | ReturnType<Transaction['moveCall']>,
    intent: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>,
    intentWitness: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'insert_intent_unshared'),
      typeArguments: [config.outcomeType, config.intentWitnessType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        typeof registry === 'string' ? tx.object(registry) : registry,
        intent,
        versionWitness,
        intentWitness,
      ],
    });
  }

  /**
   * Destroys an intent if it has no remaining execution.
   * Returns an Expired bag that MUST be consumed via `intents::destroy_expired`.
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.outcomeType - The outcome type parameter
   * @param account - The account object
   * @param key - The intent key
   * @returns The expired intent bag
   */
  static destroyEmptyIntent(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      outcomeType: string;
      configWitnessType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    key: string,
    configWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'destroy_empty_intent'),
      typeArguments: [config.outcomeType, config.configWitnessType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        tx.pure.string(key),
        configWitness,
      ],
    });
  }

  /**
   * Destroys an intent if it has expired.
   * Returns an Expired bag that MUST be consumed via `intents::destroy_expired`.
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.outcomeType - The outcome type parameter
   * @param account - The account object
   * @param key - The intent key
   * @param clock - The clock object
   * @param configWitness - Witness value from the account's config module
   * @returns The expired intent bag
   */
  static deleteExpiredIntent(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      outcomeType: string;
      configWitnessType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    key: string,
    clock: string | ReturnType<Transaction['moveCall']>,
    configWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'delete_expired_intent'),
      typeArguments: [config.outcomeType, config.configWitnessType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        tx.pure.string(key),
        typeof clock === 'string' ? tx.object(clock) : clock,
        configWitness,
      ],
    });
  }

  // ============================================================================
  // AUTHENTICATION (3)
  // ============================================================================

  /**
   * Returns an Auth object that can be used to call gated functions
   * Can only be called from the config module
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.configType - The config type parameter
   * @param config.configWitnessType - The config witness type parameter
   * @param account - The account object
   * @param configWitness - The config witness
   * @returns The auth object
   */
  static newAuth(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      configType: string;
      configWitnessType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    configWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'new_auth'),
      typeArguments: [config.configType, config.configWitnessType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        configWitness,
      ],
    });
  }

  /**
   * Unpacks and verifies the Auth matches the account
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param account - The account object
   * @param auth - The auth object to verify
   */
  static verify(
    tx: Transaction,
    accountProtocolPackageId: string,
    account: string | ReturnType<Transaction['moveCall']>,
    auth: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'account', 'verify'),
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        auth,
      ],
    });
  }

  /**
   * Returns the account address from Auth
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param auth - The auth object
   * @returns The account address
   */
  static authAccountAddr(
    tx: Transaction,
    accountProtocolPackageId: string,
    auth: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'account', 'auth_account_addr'),
      arguments: [auth],
    });
  }

  // ============================================================================
  // MANAGED DATA (5)
  // ============================================================================

  /**
   * Adds a managed data struct to the account
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.keyType - The key type parameter
   * @param config.dataType - The data type parameter
   * @param account - The account object
   * @param registry - The package registry object
   * @param key - The dynamic field key
   * @param data - The data to add
   * @param versionWitness - The version witness
   */
  static addManagedData(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      keyType: string;
      dataType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    registry: string | ReturnType<Transaction['moveCall']>,
    key: ReturnType<Transaction['moveCall']>,
    data: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'add_managed_data_with_package_witness'),
      typeArguments: [config.keyType, config.dataType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        typeof registry === 'string' ? tx.object(registry) : registry,
        key,
        data,
        versionWitness,
      ],
    });
  }

  /**
   * Checks if a managed data struct exists in the account
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.keyType - The key type parameter
   * @param account - The account object
   * @param key - The dynamic field key
   * @returns Boolean indicating if the data exists
   */
  static hasManagedData(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      keyType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    key: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'has_managed_data'),
      typeArguments: [config.keyType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        key,
      ],
    });
  }

  /**
   * Borrows a managed data struct from the account
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.keyType - The key type parameter
   * @param config.dataType - The data type parameter
   * @param account - The account object
   * @param registry - The package registry object
   * @param key - The dynamic field key
   * @param versionWitness - The version witness
   * @returns Reference to the data
   */
  static borrowManagedData(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      keyType: string;
      dataType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    registry: string | ReturnType<Transaction['moveCall']>,
    key: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'borrow_managed_data_with_package_witness'),
      typeArguments: [config.keyType, config.dataType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        typeof registry === 'string' ? tx.object(registry) : registry,
        key,
        versionWitness,
      ],
    });
  }

  /**
   * Borrows a managed data struct mutably from the account
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.keyType - The key type parameter
   * @param config.dataType - The data type parameter
   * @param account - The account object
   * @param registry - The package registry object
   * @param key - The dynamic field key
   * @param versionWitness - The version witness
   * @returns Mutable reference to the data
   */
  static borrowManagedDataMut(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      keyType: string;
      dataType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    registry: string | ReturnType<Transaction['moveCall']>,
    key: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.accountProtocolPackageId,
        'account',
        'borrow_managed_data_mut_with_package_witness'
      ),
      typeArguments: [config.keyType, config.dataType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        typeof registry === 'string' ? tx.object(registry) : registry,
        key,
        versionWitness,
      ],
    });
  }

  /**
   * Removes a managed data struct from the account
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.keyType - The key type parameter
   * @param config.dataType - The data type parameter
   * @param account - The account object
   * @param registry - The package registry object
   * @param key - The dynamic field key
   * @param versionWitness - The version witness
   * @returns The removed data
   */
  static removeManagedData(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      keyType: string;
      dataType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    registry: string | ReturnType<Transaction['moveCall']>,
    key: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'remove_managed_data_with_package_witness'),
      typeArguments: [config.keyType, config.dataType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        typeof registry === 'string' ? tx.object(registry) : registry,
        key,
        versionWitness,
      ],
    });
  }

  // ============================================================================
  // MANAGED ASSETS (5)
  // ============================================================================

  /**
   * Adds a managed object to the account
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.keyType - The key type parameter
   * @param config.assetType - The asset type parameter
   * @param account - The account object
   * @param registry - The package registry object
   * @param key - The dynamic field key
   * @param asset - The asset to add
   * @param versionWitness - The version witness
   */
  static addManagedAsset(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      keyType: string;
      assetType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    registry: string | ReturnType<Transaction['moveCall']>,
    key: ReturnType<Transaction['moveCall']>,
    asset: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'add_managed_asset_with_package_witness'),
      typeArguments: [config.keyType, config.assetType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        typeof registry === 'string' ? tx.object(registry) : registry,
        key,
        asset,
        versionWitness,
      ],
    });
  }

  /**
   * Checks if a managed object exists in the account
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.keyType - The key type parameter
   * @param account - The account object
   * @param key - The dynamic field key
   * @returns Boolean indicating if the asset exists
   */
  static hasManagedAsset(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      keyType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    key: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'has_managed_asset'),
      typeArguments: [config.keyType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        key,
      ],
    });
  }

  /**
   * Borrows a managed object from the account
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.keyType - The key type parameter
   * @param config.assetType - The asset type parameter
   * @param account - The account object
   * @param registry - The package registry object
   * @param key - The dynamic field key
   * @param versionWitness - The version witness
   * @returns Reference to the asset
   */
  static borrowManagedAsset(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      keyType: string;
      assetType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    registry: string | ReturnType<Transaction['moveCall']>,
    key: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'borrow_managed_asset_with_package_witness'),
      typeArguments: [config.keyType, config.assetType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        typeof registry === 'string' ? tx.object(registry) : registry,
        key,
        versionWitness,
      ],
    });
  }

  /**
   * Borrows a managed object mutably from the account
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.keyType - The key type parameter
   * @param config.assetType - The asset type parameter
   * @param account - The account object
   * @param registry - The package registry object
   * @param key - The dynamic field key
   * @param versionWitness - The version witness
   * @returns Mutable reference to the asset
   */
  static borrowManagedAssetMut(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      keyType: string;
      assetType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    registry: string | ReturnType<Transaction['moveCall']>,
    key: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.accountProtocolPackageId,
        'account',
        'borrow_managed_asset_mut_with_package_witness'
      ),
      typeArguments: [config.keyType, config.assetType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        typeof registry === 'string' ? tx.object(registry) : registry,
        key,
        versionWitness,
      ],
    });
  }

  /**
   * Removes a managed object from the account
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.keyType - The key type parameter
   * @param config.assetType - The asset type parameter
   * @param account - The account object
   * @param registry - The package registry object
   * @param key - The dynamic field key
   * @param versionWitness - The version witness
   * @returns The removed asset
   */
  static removeManagedAsset(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      keyType: string;
      assetType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    registry: string | ReturnType<Transaction['moveCall']>,
    key: ReturnType<Transaction['moveCall']>,
    versionWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'remove_managed_asset_with_package_witness'),
      typeArguments: [config.keyType, config.assetType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        typeof registry === 'string' ? tx.object(registry) : registry,
        key,
        versionWitness,
      ],
    });
  }

  // ============================================================================
  // QUERY FUNCTIONS (6)
  // ============================================================================

  /**
   * Returns the address of the account
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param account - The account object
   * @returns The account address
   */
  static addr(
    tx: Transaction,
    accountProtocolPackageId: string,
    account: string | ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'account', 'addr'),
      arguments: [typeof account === 'string' ? tx.object(account) : account],
    });
  }

  /**
   * Returns the metadata of the account
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param account - The account object
   * @returns Reference to the metadata
   */
  static metadata(
    tx: Transaction,
    accountProtocolPackageId: string,
    account: string | ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'account', 'metadata'),
      arguments: [typeof account === 'string' ? tx.object(account) : account],
    });
  }

  /**
   * Returns the dependencies of the account
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param account - The account object
   * @returns Reference to the deps
   */
  static deps(
    tx: Transaction,
    accountProtocolPackageId: string,
    account: string | ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'account', 'deps'),
      arguments: [typeof account === 'string' ? tx.object(account) : account],
    });
  }

  /**
   * Returns the intents of the account
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param account - The account object
   * @returns Reference to the intents
   */
  static intents(
    tx: Transaction,
    accountProtocolPackageId: string,
    account: string | ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'account', 'intents'),
      arguments: [typeof account === 'string' ? tx.object(account) : account],
    });
  }

  /**
   * Returns the config of the account
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.configType - The config type parameter
   * @param account - The account object
   * @returns Reference to the config
   */
  static config(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      configType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'config'),
      typeArguments: [config.configType],
      arguments: [typeof account === 'string' ? tx.object(account) : account],
    });
  }

  /**
   * Returns the type name of the config stored in the account
   * Useful for migration validation and runtime type checking
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param account - The account object
   * @returns The config type name
   */
  static configType(
    tx: Transaction,
    accountProtocolPackageId: string,
    account: string | ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'account', 'config_type'),
      arguments: [typeof account === 'string' ? tx.object(account) : account],
    });
  }

  // ============================================================================
  // LIFECYCLE (3)
  // ============================================================================

  /**
   * Creates a new account with default dependencies
   * Can only be called from the config module
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.configType - The config type parameter
   * @param config.configWitnessType - The config witness type parameter
   * @param configData - The config data
   * @param deps - The dependencies object
   * @param configWitness - The config witness
   * @param metadata - Optional metadata object (defaults to metadata::empty())
   * @returns The created account
   *
   * Note: Account creation is gated by the config_witness parameter. Only the module that
   * defines Config can create instances of CW, ensuring only authorized code can create accounts.
   */
  static new(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      configType: string;
      configWitnessType: string;
    },
    configData: ReturnType<Transaction['moveCall']>,
    deps: ReturnType<Transaction['moveCall']>,
    configWitness: ReturnType<Transaction['moveCall']>,
    metadata?: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    const metadataArg =
      metadata ??
      tx.moveCall({
        target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'metadata', 'empty'),
        arguments: [],
      });

    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'new'),
      typeArguments: [config.configType, config.configWitnessType],
      arguments: [
        configData,
        metadataArg,
        deps,
        configWitness,
      ],
    });
  }

  /**
   * Share an account - can only be called by the account module
   * Used during DAO/account initialization after setup is complete
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.configType - The config type parameter
   * @param account - The account object to share
   */
  static shareAccount(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
    },
    account: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'share_account'),
      typeArguments: [],
      arguments: [account],
    });
  }

  /**
   * Helper function to transfer an object to the account with tracking
   * Excludes Coin types and whitelisted types from restrictions
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.objectType - The object type parameter
   * @param account - The account object
   * @param object - The object to transfer
   */
  static keep(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      objectType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    object: ReturnType<Transaction['moveCall']>
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'keep'),
      typeArguments: [config.objectType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        object,
      ],
    });
  }

  // ============================================================================
  // INTERNAL (1)
  // ============================================================================

  /**
   * Returns a mutable reference to the config of the account
   * Can only be called from the config module
   * @param tx - Transaction instance
   * @param config - Configuration object
   * @param config.accountProtocolPackageId - The account protocol package ID
   * @param config.configType - The config type parameter
   * @param config.configWitnessType - The config witness type parameter
   * @param account - The account object
   * @param configWitness - The config witness
   * @returns Mutable reference to the config
   */
  static configMut(
    tx: Transaction,
    config: {
      accountProtocolPackageId: string;
      configType: string;
      configWitnessType: string;
    },
    account: string | ReturnType<Transaction['moveCall']>,
    configWitness: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.accountProtocolPackageId, 'account', 'config_mut'),
      typeArguments: [config.configType, config.configWitnessType],
      arguments: [
        typeof account === 'string' ? tx.object(account) : account,
        configWitness,
      ],
    });
  }
}

/**
 * Authorization levels for action package validation
 */
export enum AuthorizationLevel {
  /** Only packages in the global registry are allowed. Checked at staging time. */
  GLOBAL_ONLY = 0,
  /** Global registry OR per-account whitelist. Checked at execution time only,
   * allowing DAOs to add a new package and execute actions from it in the same proposal. */
  WHITELIST = 1,
  /** Any package is allowed - no checks at staging or execution. */
  PERMISSIVE = 2,
}

/**
 * Helper class for working with Deps (dependencies/authorization) in the protocol
 */
export class Deps {
  /**
   * Create a new Deps struct with default authorization level (GLOBAL_ONLY)
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The package registry object
   * @returns The new Deps object
   */
  static new(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: string | ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'deps', 'new'),
      arguments: [typeof registry === 'string' ? tx.object(registry) : registry],
    });
  }

  /**
   * Create a new Deps struct with a specific authorization level
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The package registry object
   * @param level - The authorization level (0=GLOBAL_ONLY, 1=WHITELIST, 2=PERMISSIVE)
   * @returns The new Deps object
   */
  static newWithLevel(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: string | ReturnType<Transaction['moveCall']>,
    level: AuthorizationLevel
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'deps', 'new_with_level'),
      arguments: [
        typeof registry === 'string' ? tx.object(registry) : registry,
        tx.pure.u8(level),
      ],
    });
  }

  /**
   * Get the authorization level from a Deps struct
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param deps - The deps object
   * @returns The authorization level (u8)
   */
  static authorizationLevel(
    tx: Transaction,
    accountProtocolPackageId: string,
    deps: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'deps', 'authorization_level'),
      arguments: [deps],
    });
  }

  /**
   * Set the authorization level on a Deps struct (package-only in Move, used via governance action)
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param deps - The deps object (mutable)
   * @param level - The new authorization level
   */
  static setAuthorizationLevel(
    tx: Transaction,
    accountProtocolPackageId: string,
    deps: ReturnType<Transaction['moveCall']>,
    level: AuthorizationLevel
  ): void {
    void tx;
    void accountProtocolPackageId;
    void deps;
    void level;
    throw new Error(
      'deps::set_authorization_level is package-visible and cannot be called directly via SDK. ' +
      'Use account actions/governance execution paths that perform this update internally.'
    );
  }

  /**
   * Check if a package is authorized based on the authorization level
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param deps - The deps object
   * @param registry - The package registry object
   * @param accountDeps - The per-account deps table
   * @param packageAddr - The package address to check
   * @returns Boolean indicating if authorized
   */
  static isPackageAuthorized(
    tx: Transaction,
    accountProtocolPackageId: string,
    deps: ReturnType<Transaction['moveCall']>,
    registry: string | ReturnType<Transaction['moveCall']>,
    accountDeps: ReturnType<Transaction['moveCall']>,
    packageAddr: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'deps', 'is_package_authorized'),
      arguments: [
        deps,
        typeof registry === 'string' ? tx.object(registry) : registry,
        accountDeps,
        tx.pure.address(packageAddr),
      ],
    });
  }

  // Authorization level constants
  static readonly AUTH_LEVEL_GLOBAL_ONLY = AuthorizationLevel.GLOBAL_ONLY;
  static readonly AUTH_LEVEL_WHITELIST = AuthorizationLevel.WHITELIST;
  static readonly AUTH_LEVEL_PERMISSIVE = AuthorizationLevel.PERMISSIVE;
}
