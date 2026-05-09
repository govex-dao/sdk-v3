/**
 * Agent Action Index
 *
 * Agent-focused index of SDK methods and staged governance actions.
 * This gives bots a single, discoverable map of what they can do.
 */

import {
  ACTIONS_BY_CATEGORY,
  LAUNCHPAD_ACTIONS,
  PROPOSAL_ACTIONS,
  type ActionCategory,
  type ActionDefinition,
  type PackageId,
  type ParamDef,
} from '../config/action-definitions';

export type AgentWorkflowStage =
  | 'proposal_lifecycle'
  | 'proposal_trading'
  | 'conditional_strategy'
  | 'keeper'
  | 'maintenance';

export interface AgentMethodDescriptor {
  id: string;
  service: string;
  method: string;
  stage: AgentWorkflowStage;
  description: string;
  requiredArgs: string[];
}

export interface AgentGovernanceActionDescriptor {
  id: string;
  name: string;
  category: ActionCategory;
  package: PackageId;
  description: string;
  typeParams: string[];
  params: ParamDef[];
  launchpadSupported: boolean;
  proposalSupported: boolean;
}

export interface AgentActionIndex {
  methods: AgentMethodDescriptor[];
  proposalActions: AgentGovernanceActionDescriptor[];
  launchpadActions: AgentGovernanceActionDescriptor[];
  actionsByCategory: Record<ActionCategory, AgentGovernanceActionDescriptor[]>;
  twoStageActions: AgentGovernanceActionDescriptor[];
}

const AGENT_METHODS: AgentMethodDescriptor[] = [
  {
    id: 'proposal_create_initialize',
    service: 'sdk.proposal',
    method: 'createAndInitializeProposal',
    stage: 'proposal_lifecycle',
    description: 'Create proposal + initialize conditional markets atomically',
    requiredArgs: ['daoAccountId', 'assetType', 'stableType', 'feeCoins', 'feeAmount'],
  },
  {
    id: 'proposal_add_actions',
    service: 'sdk.proposal',
    method: 'addActionsToOutcome',
    stage: 'proposal_lifecycle',
    description: 'Attach staged intent actions to a specific outcome',
    requiredArgs: ['proposalId', 'daoAccountId', 'registryId', 'outcomeIndex', 'actions'],
  },
  {
    id: 'proposal_advance_to_trading',
    service: 'sdk.proposal',
    method: 'advanceToTrading',
    stage: 'proposal_lifecycle',
    description: 'Move proposal from REVIEW to TRADING',
    requiredArgs: ['daoAccountId', 'proposalId', 'escrowId', 'spotPoolId', 'senderAddress'],
  },
  {
    id: 'proposal_finalize',
    service: 'sdk.proposal',
    method: 'finalizeProposal',
    stage: 'proposal_lifecycle',
    description: 'End trading and start execution window or finalize REJECT immediately',
    requiredArgs: ['daoAccountId', 'proposalId', 'escrowId', 'spotPoolId'],
  },
  {
    id: 'proposal_execute_winner',
    service: 'sdk.proposal',
    method: 'executeWinningOutcome',
    stage: 'proposal_lifecycle',
    description: 'Execute winning accept outcome actions via PTB executor',
    requiredArgs: ['daoAccountId', 'proposalId', 'escrowId', 'spotPoolId', 'actions'],
  },
  {
    id: 'proposal_force_reject_timeout',
    service: 'sdk.proposal',
    method: 'forceRejectOnTimeout',
    stage: 'keeper',
    description: 'Permissionlessly force REJECT if execution window expired',
    requiredArgs: ['proposalId', 'escrowId', 'spotPoolId'],
  },
  {
    id: 'proposal_parse_finalization_result',
    service: 'sdk.proposal',
    method: 'parseFinalizationResult',
    stage: 'keeper',
    description: 'Interpret finalization transaction events for keeper decisioning',
    requiredArgs: ['txResult'],
  },
  {
    id: 'proposal_execution_state',
    service: 'sdk.proposal',
    method: 'getProposalExecutionState',
    stage: 'keeper',
    description: 'Read proposal execution window state and market winner hint',
    requiredArgs: ['proposalId'],
  },
  {
    id: 'conditional_strategy_direct_outcome_swap',
    service: 'sdk.proposal',
    method: 'conditionalSwap',
    stage: 'conditional_strategy',
    description: 'Strategy 1: direct swap in a selected conditional outcome market',
    requiredArgs: ['proposalId', 'escrowId', 'spotPoolId', 'outcomeIndex', 'amountIn', 'stableCoins'],
  },
  {
    id: 'conditional_strategy_best_outcome_swap',
    service: 'sdk.proposal.trade',
    method: 'findBestRoute',
    stage: 'conditional_strategy',
    description:
      'Strategy 2: quote all conditional outcomes, pick best outcome index, and enrich decisioning with futarchy oracle TWAP state',
    requiredArgs: [
      'proposalId',
      'escrowId',
      'spotPoolId',
      'assetType',
      'stableType',
      'lpType',
      'amountIn',
      'direction',
    ],
  },
  {
    id: 'conditional_strategy_outcome_oracle_state',
    service: 'sdk.proposal.trade',
    method: 'getOutcomeOracleState',
    stage: 'conditional_strategy',
    description: 'Read futarchy conditional oracle state for a specific outcome',
    requiredArgs: ['proposalId', 'escrowId', 'assetType', 'stableType', 'outcomeIndex'],
  },
  {
    id: 'conditional_strategy_inventory_first_swap',
    service: 'sdk.proposal',
    method: 'smartConditionalSwap',
    stage: 'conditional_strategy',
    description:
      'Strategy 3: inventory-first smart conditional swap (conditional execution; may source input via wrappers or spot conversion)',
    requiredArgs: ['proposalId', 'escrowId', 'spotPoolId', 'availableCoins', 'outcomeIndex', 'amountIn'],
  },
  {
    id: 'conditional_strategy_laddered_swap',
    service: 'sdk.proposal.trade',
    method: 'buildLadderedExecutionPlan',
    stage: 'conditional_strategy',
    description: 'Strategy 4: split one conditional order into sequential slices',
    requiredArgs: ['totalAmountIn', 'slices'],
  },
  {
    id: 'conditional_strategy_catalog',
    service: 'sdk.proposal.trade',
    method: 'getConditionalTradingStrategies',
    stage: 'conditional_strategy',
    description: 'Return the four built-in conditional-only trading strategies',
    requiredArgs: [],
  },
  {
    id: 'proposal_query_smart_swap_inputs',
    service: 'sdk.proposal',
    method: 'querySmartSwapAvailableCoins',
    stage: 'proposal_trading',
    description: 'Discover available wallet inputs for smart conditional swaps',
    requiredArgs: ['address', 'outcomeIndex', 'direction', 'marketStateId', 'allOutcomeCoins'],
  },
  {
    id: 'proposal_cleanup_expired_intents',
    service: 'sdk.proposal',
    method: 'cleanupExpiredIntents',
    stage: 'maintenance',
    description: 'Permissionless cleanup of expired intents (keeper storage-rebate action)',
    requiredArgs: ['daoAccountId', 'maxToClean'],
  },
];

function toDescriptor(action: ActionDefinition): AgentGovernanceActionDescriptor {
  return {
    id: action.id,
    name: action.name,
    category: action.category,
    package: action.package,
    description: action.description,
    typeParams: action.typeParams ?? [],
    params: action.params,
    launchpadSupported: action.launchpadSupported,
    proposalSupported: action.proposalSupported,
  };
}

function buildActionsByCategory(): Record<ActionCategory, AgentGovernanceActionDescriptor[]> {
  return {
    transfer: ACTIONS_BY_CATEGORY.transfer.map(toDescriptor),
    vault: ACTIONS_BY_CATEGORY.vault.map(toDescriptor),
    currency: ACTIONS_BY_CATEGORY.currency.map(toDescriptor),
    stream: ACTIONS_BY_CATEGORY.stream.map(toDescriptor),
    memo: ACTIONS_BY_CATEGORY.memo.map(toDescriptor),
    config: ACTIONS_BY_CATEGORY.config.map(toDescriptor),
    quota: ACTIONS_BY_CATEGORY.quota.map(toDescriptor),
    liquidity: ACTIONS_BY_CATEGORY.liquidity.map(toDescriptor),
    dissolution: ACTIONS_BY_CATEGORY.dissolution.map(toDescriptor),
    package_registry: ACTIONS_BY_CATEGORY.package_registry.map(toDescriptor),
    package_upgrade: (ACTIONS_BY_CATEGORY.package_upgrade ?? []).map(toDescriptor),
    oracle: ACTIONS_BY_CATEGORY.oracle.map(toDescriptor),
    launchpad: (ACTIONS_BY_CATEGORY.launchpad ?? []).map(toDescriptor),
  };
}

/**
 * Two-stage governance actions with special execution flow.
 * These are useful for bots that manage proposal execution planning.
 */
function getTwoStageActions(): AgentGovernanceActionDescriptor[] {
  const ids = new Set([
    'create_dissolution_capability',
    'create_redemption_pool',
    'add_to_redemption_pool',
  ]);

  return PROPOSAL_ACTIONS.filter((a) => ids.has(a.id)).map(toDescriptor);
}

/**
 * Build an agent-first index of SDK methods and staged governance actions.
 */
export function getAgentActionIndex(): AgentActionIndex {
  return {
    methods: AGENT_METHODS,
    proposalActions: PROPOSAL_ACTIONS.map(toDescriptor),
    launchpadActions: LAUNCHPAD_ACTIONS.map(toDescriptor),
    actionsByCategory: buildActionsByCategory(),
    twoStageActions: getTwoStageActions(),
  };
}
