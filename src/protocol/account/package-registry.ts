/**
 * Package Registry Module SDK Wrapper
 *
 * This module provides TypeScript wrappers for the account_protocol::package_registry Move module.
 * The package registry is a unified system for managing package whitelisting and action type ownership.
 *
 * Core Concepts:
 * - PackageRegistry: Central registry for approved packages and their action types
 * - PackageMetadata: Active address/version, action types, category, and description for each package
 *
 * Key Features:
 * - Atomic package registration with action types
 * - Action type to package mapping
 *
 * @module account-protocol/package-registry
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

/**
 * Package Registry Operations
 *
 * Static class providing type-safe wrappers for account_protocol::package_registry functions.
 * All functions use the accountProtocolPackageId and 'package_registry' module name.
 *
 * @example
 * ```typescript
 * import { PackageRegistry } from '@govex/sdk';
 *
 * const tx = new Transaction();
 *
 * // Check if package exists
 * const hasPackage = PackageRegistry.hasPackage(tx, accountProtocolPackageId, registry, 'my_package');
 *
 * // Get package metadata
 * const metadata = PackageRegistry.getPackageMetadata(tx, accountProtocolPackageId, registry, 'my_package');
 *
 * ```
 */
export class PackageRegistry {
  // ============================================================================
  // PACKAGE MANAGEMENT (5)
  // ============================================================================

  /**
   * Add a new package to the registry with its action types
   * This is an atomic operation - package and action type metadata are added together
   * Requires PackageAdminCap for authorization
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @param cap - The PackageAdminCap
   * @param config - Configuration object
   * @param config.name - Package name
   * @param config.addr - Package address
   * @param config.version - Package version number
   * @param config.actionTypes - Array of action type strings this package provides
   * @param config.category - Package category (e.g., "core", "governance", "defi")
   * @param config.description - Package description
   * @returns Updated PackageAdminCap (must be threaded to subsequent calls)
   */
  static addPackage(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>,
    cap: ReturnType<Transaction['moveCall']>,
    config: {
      name: string;
      addr: string;
      version: number;
      actionTypes: string[];
      category: string;
      description: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'add_package_with_cap'),
      arguments: [
        registry,
        cap,
        tx.pure.string(config.name),
        tx.pure.address(config.addr),
        tx.pure.u64(config.version),
        tx.pure.vector('string', config.actionTypes),
        tx.pure.string(config.category),
        tx.pure.string(config.description),
      ],
    });
  }

  /**
   * Update package metadata (category, description, action types)
   * Requires PackageAdminCap for authorization
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @param cap - The PackageAdminCap
   * @param config - Configuration object
   * @param config.name - Package name
   * @param config.newActionTypes - New array of action type strings
   * @param config.newCategory - New category
   * @param config.newDescription - New description
   * @returns Updated PackageAdminCap (must be threaded to subsequent calls)
   */
  static updatePackageMetadata(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>,
    cap: ReturnType<Transaction['moveCall']>,
    config: {
      name: string;
      newActionTypes: string[];
      newCategory: string;
      newDescription: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'update_package_metadata_with_cap'),
      arguments: [
        registry,
        cap,
        tx.pure.string(config.name),
        tx.pure.vector('string', config.newActionTypes),
        tx.pure.string(config.newCategory),
        tx.pure.string(config.newDescription),
      ],
    });
  }

  // ============================================================================
  // QUERY FUNCTIONS (9)
  // ============================================================================

  /**
   * Check if a package exists
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @param name - Package name to check
   * @returns Boolean indicating if package exists
   */
  static hasPackage(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>,
    name: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'has_package'),
      arguments: [registry, tx.pure.string(name)],
    });
  }

  /**
   * Check if an action type has a registered package
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @param actionType - Action type string to check
   * @returns Boolean indicating if action type is registered
   */
  static hasActionType(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>,
    actionType: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'has_action_type'),
      arguments: [registry, tx.pure.string(actionType)],
    });
  }

  /**
   * Get which package provides an action type
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @param actionType - Action type string
   * @returns The package name that provides this action type
   */
  static getPackageForAction(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>,
    actionType: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'get_package_for_action'),
      arguments: [registry, tx.pure.string(actionType)],
    });
  }

  /**
   * Get package metadata
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @param name - Package name
   * @returns Reference to the PackageMetadata
   */
  static getPackageMetadata(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>,
    name: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'get_package_metadata'),
      arguments: [registry, tx.pure.string(name)],
    });
  }

  /**
   * Get latest version for a package
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @param name - Package name
   * @returns Tuple of (address, version)
   */
  static getLatestVersion(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>,
    name: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'get_latest_version'),
      arguments: [registry, tx.pure.string(name)],
    });
  }

  /**
   * Check if a specific (name, addr, version) triple is valid
   * Mirrors on-chain package validity checks.
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @param config - Configuration object
   * @param config.name - Package name
   * @param config.addr - Package address
   * @param config.version - Version number
   * @returns Boolean indicating if the package version is valid
   */
  static isValidPackage(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>,
    config: {
      name: string;
      addr: string;
      version: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'is_valid_package'),
      arguments: [
        registry,
        tx.pure.string(config.name),
        tx.pure.address(config.addr),
        tx.pure.u64(config.version),
      ],
    });
  }

  /**
   * Check if a package address exists in the registry
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @param addr - Package address to check
   * @returns Boolean indicating if address exists
   */
  static containsPackageAddr(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>,
    addr: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'contains_package_addr'),
      arguments: [registry, tx.pure.address(addr)],
    });
  }

  /**
   * Get package name from address
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @param addr - Package address
   * @returns The package name
   */
  static getPackageName(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>,
    addr: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'get_package_name'),
      arguments: [registry, tx.pure.address(addr)],
    });
  }

  /**
   * Get all action types for a package
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @param name - Package name
   * @returns Reference to vector of action type strings
   */
  static getActionTypes(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>,
    name: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'get_action_types'),
      arguments: [registry, tx.pure.string(name)],
    });
  }

  /**
   * Get package category
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @param name - Package name
   * @returns Reference to the category string
   */
  static getCategory(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>,
    name: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'get_category'),
      arguments: [registry, tx.pure.string(name)],
    });
  }

  /**
   * Get package category by package address
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @param addr - Package address
   * @returns The category string
   */
  static getCategoryByAddr(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>,
    addr: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'get_category_by_addr'),
      arguments: [registry, tx.pure.address(addr)],
    });
  }

  /**
   * Get package description
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @param name - Package name
   * @returns Reference to the description string
   */
  static getDescription(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>,
    name: string
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'get_description'),
      arguments: [registry, tx.pure.string(name)],
    });
  }

  // ============================================================================
  // REGISTRY ACCESS (2)
  // ============================================================================

  /**
   * Get registry ID for dynamic field access (decoders)
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param registry - The PackageRegistry object
   * @returns Reference to the UID
   */
  static registryId(
    tx: Transaction,
    accountProtocolPackageId: string,
    registry: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'registry_id'),
      arguments: [registry],
    });
  }

  // NOTE: registry_id_mut is now public(package) and cannot be called externally
  // Decoder registration must be done through the package_registry module itself

  // ============================================================================
  // PACKAGE METADATA ACCESSORS
  // ============================================================================

  /**
   * Get action types from metadata
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param metadata - The PackageMetadata object
   * @returns Reference to vector of action type strings
   */
  static metadataActionTypes(
    tx: Transaction,
    accountProtocolPackageId: string,
    metadata: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'metadata_action_types'),
      arguments: [metadata],
    });
  }

  /**
   * Get category from metadata
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param metadata - The PackageMetadata object
   * @returns Reference to the category string
   */
  static metadataCategory(
    tx: Transaction,
    accountProtocolPackageId: string,
    metadata: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'metadata_category'),
      arguments: [metadata],
    });
  }

  /**
   * Get description from metadata
   * @param tx - Transaction instance
   * @param accountProtocolPackageId - The account protocol package ID
   * @param metadata - The PackageMetadata object
   * @returns Reference to the description string
   */
  static metadataDescription(
    tx: Transaction,
    accountProtocolPackageId: string,
    metadata: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'metadata_description'),
      arguments: [metadata],
    });
  }

  /**
   * Get package address from metadata
   */
  static metadataAddr(
    tx: Transaction,
    accountProtocolPackageId: string,
    metadata: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'metadata_addr'),
      arguments: [metadata],
    });
  }

  /**
   * Get package version from metadata
   */
  static metadataVersion(
    tx: Transaction,
    accountProtocolPackageId: string,
    metadata: ReturnType<Transaction['moveCall']>
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(accountProtocolPackageId, 'package_registry', 'metadata_version'),
      arguments: [metadata],
    });
  }

}
