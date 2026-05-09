/**
 * Services
 *
 * Service classes that provide protocol interactions.
 * For high-level orchestration, use sdk.workflows instead.
 *
 * @module services
 */

// Shared service types
export type { ServiceParams, SwapConfig } from './types';

// Domain services - explicit exports to avoid conflicts
export { DAOService, DAOInfoHelper, VaultService, OracleService } from './dao';
export { MarketService, PoolService } from './market';
export { LaunchpadService } from './launchpad';
export { ProposalService, SponsorshipService, TradeService, TwapService, EscrowService, ProposalMarketsService } from './proposal';
export { AdminService, FactoryAdminService, PackageRegistryService, FeeManagerService } from './admin';
export { IntentService, OracleQueryService, VaultQueryService } from './intents';

// Utility services
export {
  BaseTransactionBuilder,
  TransactionUtils,
  QueryHelper,
  CurrencyUtils,
  // Balance wrapper utilities
  buildBalanceWrapperType,
  getBalanceWrappers,
  getConditionalCoinObjects,
  getConditionalCoinBalance,
  sumBalanceWrapperAmount,
} from './utils';
export type {
  CoinBalance,
  OutcomeBalances,
  ProposalBalances,
  BalanceWrapperData,
  BalanceWrapperOutcome,
  OwnedCoinObject,
} from './utils';

// Protocol services
export * from './factory';
export * from './factory-admin';
// factory-validator was removed (verification system purged)
// launchpad-intent-executor removed: dead code referencing non-existent Move types.
// Use IntentExecutor instead (handles dao_init_outcome::DaoInitOutcome correctly).
export * from './governance-ptb-executor';
export * from './proposal-lifecycle';
// proposal-sponsorship removed: superseded by services/proposal/sponsorship.ts (SponsorshipService)
export * from './fee-manager';
// package-registry-admin removed: dead code that called wrong module without PackageAdminCap.
// Package registry mutations go through intent-executor.ts withBorrowedCap pattern.
export * from './oracle-actions';
export * from './dissolution-actions';
export * from './coin-registry';
export * from './markets';
export {
  isMultisigConfigChangeActionType,
  isSingleMultisigConfigChangeAction,
  MULTISIG_INTENT_STATUS,
  MULTISIG_TERMINAL_INTENT_STATUSES,
  MultisigService,
  type ActionExecutionRequirement,
  type ActionExecutionRequirementKind,
  type DiscoverExecutionInputsParams,
  type DiscoverExecutionInputsResult,
  type DiscoveredObjectCandidate,
  type MultisigIntentStatus,
  type MultisigGroupInput,
  type MultisigGroupMemberInput,
  type MultisigPathRequirementInput,
  type MultisigPolicyInput,
  type MultisigPolicyPathInput,
  type MultisigTimeBandInput,
  type CreateMultisigAccountParams,
  type ProposeConfigChangeParams,
  type ProposeActionsIntentParams,
  type UpgradeArtifactBuildOutput,
  type UpgradeArtifactsPrepared,
  type UpgradeExecutionInput,
  type ParsedUpgradeArtifacts,
} from './multisig';
