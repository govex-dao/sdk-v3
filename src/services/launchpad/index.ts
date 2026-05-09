/**
 * Launchpad Service - Token launch operations
 *
 * Wraps the LaunchpadWorkflow to provide a clean service API.
 *
 * @module services/launchpad
 */

import { SuiClient, SuiEvent } from '@mysten/sui/client';
import type { Packages, SharedObjects, RaiseFields, RaiseCreatedEvent } from '../../types';
import { isMoveObject, RaiseState } from '../../types';
import { LaunchpadWorkflow, LaunchpadWorkflowPackages, LaunchpadWorkflowSharedObjects } from '../../workflows/launchpad-workflow';
import type {
  CreateRaiseConfig,
  ContributeConfig,
  ContributeWithReservationConfig,
  BondingCurveBuyConfig,
  CCABidConfig,
  CCACheckpointConfig,
  CCAFinalizeConfig,
  CCASettleBidConfig,
  CCACancelBidConfig,
  CompleteRaiseConfig,
  AcceptReservationConfig,
  ActionConfig,
  WorkflowTransaction,
  ObjectIdOrRef,
} from '../../workflows/types';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

/**
 * LaunchpadService - Token launch operations
 */
export class LaunchpadService {
  private client: SuiClient;
  private packages: Packages;
  private workflow: LaunchpadWorkflow;

  /** Unlimited max raise constant (u64::MAX) */
  static readonly UNLIMITED_CAP = 18446744073709551615n;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;

    // Build workflow packages
    const workflowPackages: LaunchpadWorkflowPackages = {
      accountProtocolPackageId: params.packages.accountProtocol,
      accountActionsPackageId: params.packages.accountActions,
      futarchyCorePackageId: params.packages.futarchyCore,
      futarchyFactoryPackageId: params.packages.futarchyFactory,
      futarchyActionsPackageId: params.packages.futarchyActions,
      futarchyGovernancePackageId: params.packages.futarchyGovernance,
      futarchyGovernanceActionsPackageId: params.packages.futarchyGovernanceActions,
      futarchyOracleActionsPackageId: params.packages.futarchyOracleActions,
      futarchyMarketsCorePackageId: params.packages.futarchyMarketsCore,
      packageRegistryId: params.sharedObjects.packageRegistry.id,
      mutationRegistryId: params.sharedObjects.mutationRegistry.id,
      spotPoolMutationRegistryId: params.sharedObjects.spotPoolMutationRegistry.id,
      marketStateMutationRegistryId: params.sharedObjects.marketStateMutationRegistry.id,
      escrowMutationRegistryId: params.sharedObjects.escrowMutationRegistry.id,
      oneShotUtilsPackageId: params.packages.oneShotUtils,
    };

    const workflowSharedObjects: LaunchpadWorkflowSharedObjects = {
      factoryId: params.sharedObjects.factory.id,
      factorySharedVersion: params.sharedObjects.factory.version,
      packageRegistryId: params.sharedObjects.packageRegistry.id,
      packageRegistrySharedVersion: params.sharedObjects.packageRegistry.version,
      feeManagerId: params.sharedObjects.feeManager.id,
      feeManagerSharedVersion: params.sharedObjects.feeManager.version,
    };

    this.workflow = new LaunchpadWorkflow(params.client, workflowPackages, workflowSharedObjects);
  }

  // ============================================================================
  // RAISE LIFECYCLE
  // ============================================================================

  /**
   * Create a new token raise with staged actions (atomic)
   *
   * Safety note:
   * - Prefer the standard launchpad flow.
   * - If you use custom action sets, validate on localnet/testnet first and
   *   coordinate with the protocol dev team before production rollout.
   *
   * @param config - Raise configuration
   * @param successActions - Actions to execute on raise success (optional)
   * @param failureActions - Actions to execute on raise failure (optional)
   */
  createRaise(
    config: CreateRaiseConfig,
    successActions: ActionConfig[] = [],
    failureActions: ActionConfig[] = []
  ): WorkflowTransaction {
    return this.workflow.createRaise(config, successActions, failureActions);
  }

  /**
   * Contribute stable coins to a public FCFS raise.
   */
  contribute(config: ContributeConfig): WorkflowTransaction {
    return this.workflow.contribute(config);
  }

  /**
   * Accept a reservation first, then route any excess amount to public FCFS contribution.
   */
  contributeWithReservation(config: ContributeWithReservationConfig): WorkflowTransaction {
    return this.workflow.contributeWithReservation(config);
  }

  /**
   * Buy tokens from a configured bonding curve.
   */
  buyFromBondingCurve(config: BondingCurveBuyConfig): WorkflowTransaction {
    return this.workflow.buyFromBondingCurve(config);
  }

  /**
   * Submit an escrowed CCA bid.
   */
  submitCCABid(config: CCABidConfig): WorkflowTransaction {
    return this.workflow.submitCCABid(config);
  }

  /**
   * Checkpoint the CCA clearing price.
   */
  checkpointCCA(config: CCACheckpointConfig): WorkflowTransaction {
    return this.workflow.checkpointCCA(config);
  }

  /**
   * Finalize CCA after the raise deadline.
   */
  finalizeCCA(config: CCAFinalizeConfig): WorkflowTransaction {
    return this.workflow.finalizeCCA(config);
  }

  /**
   * Settle a finalized CCA bid.
   */
  settleCCABid(config: CCASettleBidConfig): WorkflowTransaction {
    return this.workflow.settleCCABid(config);
  }

  /**
   * Cancel an unsettled CCA bid after the raise is no longer active.
   */
  cancelCCABid(config: CCACancelBidConfig): WorkflowTransaction {
    return this.workflow.cancelCCABid(config);
  }

  /**
   * Accept a reserved allocation on a raise
   */
  acceptReservation(config: AcceptReservationConfig): WorkflowTransaction {
    return this.workflow.acceptReservation(config);
  }

  /**
   * Complete a raise by settling and creating completion intents.
   * Execute staged actions afterwards with IntentExecutor.
   */
  completeRaise(config: CompleteRaiseConfig): WorkflowTransaction {
    return this.workflow.completeRaise(config);
  }

  /**
   * Claim tokens from a successful raise
   */
  claimTokens(
    raiseId: ObjectIdOrRef,
    assetType: string,
    stableType: string,
  ): WorkflowTransaction {
    return this.workflow.claimTokens(raiseId, assetType, stableType);
  }

  /**
   * Claim refund from a failed raise
   */
  claimRefund(
    raiseId: ObjectIdOrRef,
    assetType: string,
    stableType: string,
  ): WorkflowTransaction {
    return this.workflow.claimRefund(raiseId, assetType, stableType);
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get raise info by ID
   */
  async getRaise(raiseId: string): Promise<RaiseFields> {
    const obj = await this.client.getObject({
      id: raiseId,
      options: { showContent: true },
    });

    if (!obj.data || !isMoveObject(obj.data)) {
      throw new Error(`Could not fetch raise: ${raiseId}`);
    }

    return obj.data.content.fields as RaiseFields;
  }

  /**
   * Get all raises from events
   */
  async getAll(): Promise<RaiseCreatedEvent[]> {
    const events = await this.client.queryEvents({
      query: {
        MoveEventType: `${this.packages.futarchyFactory}::launchpad::RaiseCreated`,
      },
      limit: 50,
    });

    return events.data.map((e: SuiEvent) => e.parsedJson as RaiseCreatedEvent);
  }

  /**
   * Get raises by creator
   */
  async getByCreator(creator: string): Promise<RaiseCreatedEvent[]> {
    const all = await this.getAll();
    return all.filter((r) => r.creator === creator);
  }

  /**
   * Check if a raise is settled (terminal state: SUCCESSFUL or FAILED)
   */
  async isSettled(raiseId: string): Promise<boolean> {
    const raise = await this.getRaise(raiseId);
    return raise.state === RaiseState.SUCCESSFUL || raise.state === RaiseState.FAILED;
  }

  /**
   * Get raise state
   */
  async getState(raiseId: string): Promise<RaiseState> {
    const raise = await this.getRaise(raiseId);
    return raise.state as RaiseState;
  }

  /**
   * Get total raised amount from vault balance.
   *
   * NOTE: For failed raises, this returns the current vault balance which
   * shrinks as contributors claim refunds. For the correct historical total
   * on failed raises, use the Move total_raised() view function or the
   * indexer API's final_raise_amount field.
   */
  async getTotalRaised(raiseId: string): Promise<bigint> {
    const raise = await this.getRaise(raiseId);
    return BigInt(raise.stable_coin_vault?.fields?.value || 0);
  }

  // ============================================================================
  // RECOVERY
  // ============================================================================

  /**
   * Roll back a raise stuck in COMPLETION_PENDING after timeout.
   * Permissionless — anyone can call after 24h.
   */
  rollbackCompletionAfterTimeout(
    raiseId: ObjectIdOrRef,
    accountId: ObjectIdOrRef,
    assetType: string,
    stableType: string,
    clockId?: string
  ): WorkflowTransaction {
    return this.workflow.rollbackCompletionAfterTimeout(raiseId, accountId, assetType, stableType, clockId);
  }

  /**
   * Reconcile a completion-pending raise to STATE_SUCCESSFUL once the
   * Account has been finalized.
   */
  reconcileCompletionState(
    raiseId: ObjectIdOrRef,
    accountId: ObjectIdOrRef,
    assetType: string,
    stableType: string,
  ): WorkflowTransaction {
    return this.workflow.reconcileCompletionState(raiseId, accountId, assetType, stableType);
  }

  /**
   * Burn unsold tokens from a failed raise.
   */
  burnUnsoldTokens(
    raiseId: ObjectIdOrRef,
    assetType: string,
    stableType: string,
    treasuryCapId: ObjectIdOrRef,
  ): WorkflowTransaction {
    return this.workflow.burnUnsoldTokens(raiseId, assetType, stableType, treasuryCapId);
  }
}
