/**
 * Auto Executor - High-level functions for automatic intent execution
 *
 * Fetches parsed actions from backend API and builds execution PTBs automatically.
 *
 * @module workflows/auto-executor
 */

import { SuiClient } from '@mysten/sui/client';
import { IntentExecutor, IntentExecutorPackages } from './intent-executor';
import { indexedActionsToExecutionConfigs, IndexedAction } from './action-converter';
import type { WorkflowTransaction, ObjectIdOrRef } from './types';

/**
 * Backend API response for a launchpad (raise)
 */
export interface BackendRaiseResponse {
  id: string;
  dao_id: string;
  asset_type: string;
  stable_type: string;
  state: string;
  success_actions: IndexedAction[];
  failure_actions: IndexedAction[];
  [key: string]: any;
}

/**
 * Backend API response for a proposal
 */
export interface BackendProposalResponse {
  id: string;
  dao_id: string;
  asset_type: string;
  stable_type: string;
  lp_type?: string;
  state: string;
  winning_outcome?: number;
  escrow_id?: string;
  spot_pool_id?: string;
  /** Actions grouped by outcome: { "1": [...], "2": [...] } */
  staged_actions: Record<string, IndexedAction[]>;
  [key: string]: any;
}

/**
 * Backend API response for a DAO
 */
export interface BackendDaoResponse {
  id: string;
  asset_type: string;
  stable_type: string;
  [key: string]: any;
}

/**
 * Configuration for auto-executor
 */
export interface AutoExecutorConfig {
  /** Backend API base URL (e.g., "https://api.govex.io") */
  backendUrl: string;
  /** Package IDs for building PTBs */
  packages: IntentExecutorPackages;
  /** Max retries on 404 (indexer lag). Default: 12 */
  maxRetries?: number;
  /** Delay between retries in ms. Default: 2500 */
  retryDelayMs?: number;
}

/**
 * Auto Executor - Fetches from backend and builds execution PTBs
 *
 * @example
 * ```typescript
 * const autoExecutor = new AutoExecutor(client, {
 *   backendUrl: 'https://api.govex.io',
 *   packages: sdk.packages,
 * });
 *
 * // Execute launchpad init
 * const { transaction } = await autoExecutor.executeLaunchpad(raiseId, {
 *   accountId: '0x...',
 * });
 *
 * // Execute proposal winning outcome
 * const { transaction } = await autoExecutor.executeProposal(proposalId, {
 *   accountId: '0x...',
 * });
 * ```
 */
export class AutoExecutor {
  private config: AutoExecutorConfig;
  private intentExecutor: IntentExecutor;

  constructor(client: SuiClient, config: AutoExecutorConfig) {
    this.config = config;
    this.intentExecutor = new IntentExecutor(client, config.packages);
  }

  /**
   * Execute launchpad init actions automatically
   *
   * Fetches raise data from backend, converts parsed actions, and builds PTB.
   *
   * @param raiseId - The raise object ID
   * @param options - Additional execution options
   * @returns Transaction ready for signing
   */
  async executeLaunchpad(
    raiseId: string,
    options: {
      accountId: ObjectIdOrRef;
      /** Override which actions to execute (default: success_actions) */
      actionType?: 'success' | 'failure';
      clockId?: string;
    }
  ): Promise<WorkflowTransaction & { raise: BackendRaiseResponse }> {
    // 1. Fetch raise data from backend
    const raise = await this.fetchRaise(raiseId);

    // 2. Select actions based on type
    const parsedActions =
      options.actionType === 'failure' ? raise.failure_actions : raise.success_actions;

    if (!parsedActions || parsedActions.length === 0) {
      throw new Error(`No ${options.actionType || 'success'} actions found for raise ${raiseId}`);
    }

    // 3. Convert to execution configs
    const actions = indexedActionsToExecutionConfigs(parsedActions);

    // 4. Build and return PTB
    const result = this.intentExecutor.execute({
      intentType: 'launchpad',
      accountId: options.accountId,
      raiseId,
      assetType: raise.asset_type,
      stableType: raise.stable_type,
      actions,
      clockId: options.clockId,
    });

    return {
      ...result,
      raise,
    };
  }

  /**
   * Execute proposal winning outcome actions automatically
   *
   * Fetches proposal data from backend, gets winning outcome actions, and builds PTB.
   *
   * @param proposalId - The proposal object ID
   * @param options - Additional execution options
   * @returns Transaction ready for signing
   */
  async executeProposal(
    proposalId: string,
    options: {
      accountId: ObjectIdOrRef;
      /** Override which outcome to execute (default: winning_outcome) */
      outcome?: number;
      /** Spot pool ID (fetched from backend if not provided) */
      spotPoolId?: ObjectIdOrRef;
      /** LP type (fetched from backend if not provided) */
      lpType?: string;
      clockId?: string;
    }
  ): Promise<WorkflowTransaction & { proposal: BackendProposalResponse }> {
    // 1. Fetch proposal data from backend
    const proposal = await this.fetchProposal(proposalId);

    // 2. Determine which outcome to execute
    const outcomeToExecute = options.outcome ?? proposal.winning_outcome;
    if (outcomeToExecute === undefined || outcomeToExecute === null) {
      throw new Error(`No winning outcome for proposal ${proposalId}`);
    }
    if (outcomeToExecute === 0) {
      throw new Error(`Cannot execute REJECT outcome (0) for proposal ${proposalId}`);
    }

    // 3. Get actions for the outcome
    const parsedActions = proposal.staged_actions[String(outcomeToExecute)];
    if (!parsedActions || parsedActions.length === 0) {
      throw new Error(`No actions found for outcome ${outcomeToExecute} in proposal ${proposalId}`);
    }

    // 4. Get required IDs
    const spotPoolId = options.spotPoolId || proposal.spot_pool_id;
    const lpType = options.lpType || proposal.lp_type;

    if (!spotPoolId) {
      throw new Error(`spotPoolId not found for proposal ${proposalId}`);
    }
    if (!lpType) {
      throw new Error(`lpType not found for proposal ${proposalId}`);
    }

    // 5. Convert to execution configs
    const actions = indexedActionsToExecutionConfigs(parsedActions);

    // 6. Build and return PTB
    const result = this.intentExecutor.execute({
      intentType: 'proposal',
      accountId: options.accountId,
      proposalId,
      spotPoolId,
      assetType: proposal.asset_type,
      stableType: proposal.stable_type,
      lpType,
      actions,
      clockId: options.clockId,
    });

    return {
      ...result,
      proposal,
    };
  }

  /**
   * Fetch raise data from backend API (retries on 404 for indexer lag)
   */
  private async fetchRaise(raiseId: string): Promise<BackendRaiseResponse> {
    const url = `${this.config.backendUrl}/launchpads/${raiseId}`;
    const maxRetries = this.config.maxRetries ?? 60;
    const retryDelayMs = this.config.retryDelayMs ?? 5000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await fetch(url);

      if (response.ok) {
        const data = (await response.json()) as { data?: BackendRaiseResponse } & BackendRaiseResponse;
        return data.data || data;
      }

      if (response.status === 404 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }

      throw new Error(`Failed to fetch raise ${raiseId}: ${response.status} ${response.statusText}`);
    }

    throw new Error(`Failed to fetch raise ${raiseId} after ${maxRetries} retries`);
  }

  /**
   * Fetch proposal data from backend API (retries on 404 for indexer lag)
   */
  private async fetchProposal(proposalId: string): Promise<BackendProposalResponse> {
    const url = `${this.config.backendUrl}/proposals/${proposalId}`;
    const maxRetries = this.config.maxRetries ?? 60;
    const retryDelayMs = this.config.retryDelayMs ?? 5000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await fetch(url);

      if (response.ok) {
        const data = (await response.json()) as { data?: BackendProposalResponse } & BackendProposalResponse;
        return data.data || data;
      }

      if (response.status === 404 && attempt < maxRetries) {
        if (attempt % 10 === 0) {
          console.log(`   ⏳ Waiting for indexer to index proposal (attempt ${attempt}/${maxRetries})...`);
        }
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }

      throw new Error(
        `Failed to fetch proposal ${proposalId}: ${response.status} ${response.statusText}`
      );
    }

    throw new Error(`Failed to fetch proposal ${proposalId} after ${maxRetries} retries`);
  }

  /**
   * Fetch DAO data from backend API (for future use)
   */
  async fetchDao(daoId: string): Promise<BackendDaoResponse> {
    const url = `${this.config.backendUrl}/daos/${daoId}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch DAO ${daoId}: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { data?: BackendDaoResponse } & BackendDaoResponse;
    return data.data || data;
  }

  /**
   * Get the IntentExecutor for direct access
   */
  getIntentExecutor(): IntentExecutor {
    return this.intentExecutor;
  }
}

/**
 * Create an auto-executor instance
 *
 * @param client - Sui client
 * @param config - Configuration
 * @returns AutoExecutor instance
 */
export function createAutoExecutor(client: SuiClient, config: AutoExecutorConfig): AutoExecutor {
  return new AutoExecutor(client, config);
}
