/**
 * Common Workflow Types
 *
 * Base types shared across all workflows.
 *
 * @module workflows/types/common
 */

import { Transaction } from '@mysten/sui/transactions';

// ============================================================================
// ORACLE TYPES - re-exported from services for convenience
// ============================================================================

export type { RecipientMint, TierSpec } from '../../services/oracle-actions';

// ============================================================================
// BASE TYPES
// ============================================================================

/**
 * Base configuration shared by all workflows
 */
export interface WorkflowBaseConfig {
  /** The clock object ID (defaults to 0x6) */
  clockId?: string;
  /** Sender address (used when workflow actions must transfer to transaction sender) */
  senderAddress?: string;
}

/**
 * Result of a workflow transaction build
 */
export interface WorkflowTransaction {
  /** The built transaction */
  transaction: Transaction;
  /** Description of what the transaction does */
  description: string;
}

// ============================================================================
// OBJECT REFERENCE TYPES
// ============================================================================

/**
 * Full object reference with version and digest for OWNED objects.
 * Use this when you have the complete object data from a previous transaction
 * to avoid RPC lookups (important for localnet where indexing may lag).
 */
export interface OwnedObjectRef {
  objectId: string;
  version: string | number;
  digest: string;
}

/**
 * Full object reference for SHARED objects (used in transaction building).
 * Shared objects require initialSharedVersion instead of version/digest.
 * Named TxSharedObjectRef to avoid conflict with SharedObjectRef in types/services/packages.ts.
 */
export interface TxSharedObjectRef {
  objectId: string;
  initialSharedVersion: string | number;
  mutable: boolean;
}

/**
 * Object input that can be a string ID, OwnedObjectRef, or TxSharedObjectRef.
 * - String ID: SDK will query RPC to resolve version/digest
 * - OwnedObjectRef: Uses provided data directly for owned objects (no RPC lookup)
 * - TxSharedObjectRef: Uses provided data directly for shared objects (no RPC lookup)
 */
export type ObjectIdOrRef = string | OwnedObjectRef | TxSharedObjectRef;

/**
 * Type guard to check if an ObjectIdOrRef is a full OwnedObjectRef
 */
export function isOwnedObjectRef(input: ObjectIdOrRef): input is OwnedObjectRef {
  return typeof input === 'object' && 'objectId' in input && 'digest' in input && !('initialSharedVersion' in input);
}

/**
 * Type guard to check if an ObjectIdOrRef is a TxSharedObjectRef
 */
export function isTxSharedObjectRef(input: ObjectIdOrRef): input is TxSharedObjectRef {
  return typeof input === 'object' && 'objectId' in input && 'initialSharedVersion' in input;
}
