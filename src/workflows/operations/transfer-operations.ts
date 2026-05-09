/**
 * Transfer Operations - High-level transfer management
 *
 * Provides simple API for transferring objects and coins from DAO.
 *
 * @module transfer-operations
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';

/**
 * Configuration for TransferOperations
 */
export interface TransferOperationsConfig {
  client: SuiClient;
  accountActionsPackageId: string;
  futarchyCorePackageId: string;
  packageRegistryId: string;
}

/**
 * High-level transfer operations
 *
 * Note: The Move transfer module (account_actions::transfer) only exposes
 * action-execution functions (do_init_transfer, do_init_transfer_to_sender, etc.)
 * that work through the executable/intent system. There are no direct
 * transfer_to_address or share_object functions available for ad-hoc calls.
 *
 * These helpers intentionally throw. Use TransactionComposer/ProposalWorkflow to
 * stage transfer actions inside a governance proposal instead.
 *
 * @example
 * ```typescript
 * const tx = composer
 *   .new()
 *   .addTransfer("0xdef...", "escrowed_object", "0x2::coin::Coin<0x2::sui::SUI>")
 *   .stageToProposal(proposalId, assetType, stableType, 1, daoAccountId, registryId)
 *   .build();
 * ```
 */
export class TransferOperations {
  constructor(_config: TransferOperationsConfig) {
    // Fields intentionally not stored — all methods currently throw because
    // the underlying Move module only has action-execution functions that
    // work through the governance proposal/intent system.
  }

  /**
   * Transfer object from DAO to recipient
   *
   * Note: account_actions::transfer does not expose a direct transfer_to_address function.
   * Transfers must go through the governance proposal system using staged init actions.
   * This function cannot be used for ad-hoc transfers.
   *
   * @param _config - Transfer configuration
   * @returns Never - always throws
   */
  async transferObject(_config: {
    daoId: string;
    objectId: string;
    recipient: string;
  }): Promise<Transaction> {
    // account_actions::transfer only has do_init_transfer (action execution) functions.
    // There is no transfer_to_address function for direct calls.
    // Transfers must go through the governance proposal/intent system.
    throw new Error(
      'account_actions::transfer::transfer_to_address does not exist in Move. ' +
      'DAO object transfers must go through the governance proposal system using do_init_transfer. ' +
      'Build a proposal with a TransferObject action spec instead.',
    );
  }

  /**
   * Share an object (make it shared instead of owned)
   *
   * Note: account_actions::transfer does not expose a direct share_object function.
   * Object sharing must go through the governance proposal system via staged actions.
   * This function cannot be used for ad-hoc sharing.
   *
   * @param _config - Share configuration
   * @returns Never - always throws
   */
  async shareObject(_config: {
    daoId: string;
    objectId: string;
  }): Promise<Transaction> {
    // account_actions::transfer only has action-execution functions (do_init_*).
    // There is no share_object function for direct calls.
    throw new Error(
      'account_actions::transfer::share_object does not exist in Move. ' +
      'Object sharing must go through the governance proposal system.',
    );
  }
}
