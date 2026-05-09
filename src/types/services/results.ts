/**
 * Transaction Result Types
 *
 * Types for transaction execution results and responses.
 *
 * @module types/services/results
 */

import type { SuiTransactionBlockResponse } from '@mysten/sui/client';

/**
 * Result of a DAO creation transaction
 */
export interface DAOCreationResult {
  /** Transaction digest */
  digest: string;
  /** Created DAO account ID */
  daoId: string;
  /** Package registry ID */
  packageRegistryId: string;
  /** Full transaction response */
  response: SuiTransactionBlockResponse;
}

/**
 * Result of a proposal creation transaction
 */
export interface ProposalCreationResult {
  /** Transaction digest */
  digest: string;
  /** Created proposal ID */
  proposalId: string;
  /** Escrow ID for the proposal */
  escrowId: string;
  /** Full transaction response */
  response: SuiTransactionBlockResponse;
}

/**
 * Result of a launchpad/raise creation
 */
export interface RaiseCreationResult {
  /** Transaction digest */
  digest: string;
  /** Created raise ID */
  raiseId: string;
  /** DAO account ID */
  daoId: string;
  /** Full transaction response */
  response: SuiTransactionBlockResponse;
}

/**
 * Result of an intent execution
 */
export interface IntentExecutionResult {
  /** Transaction digest */
  digest: string;
  /** Whether execution succeeded */
  success: boolean;
  /** Number of actions executed */
  actionsExecuted: number;
  /** Full transaction response */
  response: SuiTransactionBlockResponse;
}

/**
 * Generic transaction result with extracted data
 */
export interface TransactionResult<T = unknown> {
  /** Transaction digest */
  digest: string;
  /** Whether transaction succeeded */
  success: boolean;
  /** Extracted data from transaction */
  data?: T;
  /** Error message if failed */
  error?: string;
  /** Full transaction response */
  response: SuiTransactionBlockResponse;
}
