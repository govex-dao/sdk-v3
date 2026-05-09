/**
 * Action Configuration Types
 *
 * Re-exports all action configs and the ActionConfig union type.
 *
 * @module workflows/types/actions
 */

// Account actions
export type {
  CreateStreamActionConfig,
  CancelStreamActionConfig,
  CollectStreamActionConfig,
  DepositActionConfig,
  SpendActionConfig,
  ApproveCoinTypeActionConfig,
  RemoveApprovedCoinTypeActionConfig,
  DepositFromResourcesActionConfig,
  DepositObjectFromResourcesActionConfig,
  MintVaultAdminCapActionConfig,
  OpenVaultActionConfig,
  CloseVaultActionConfig,
  DepositExternalActionConfig,
  RemoveTreasuryCapToResourcesActionConfig,
  RemoveMetadataCapToResourcesActionConfig,
  MintActionConfig,
  BurnActionConfig,
  MintCurrencyAdminCapActionConfig,
  UpdateCurrencyActionConfig,
  LockTreasuryCapActionConfig,
  LockMetadataCapActionConfig,
  TransferActionConfig,
  TransferToSenderActionConfig,
  TransferCoinActionConfig,
  TransferCoinToSenderActionConfig,
  MemoActionConfig,
  ProvideObjectActionConfig,
  LockAccessActionConfig,
  UnlockAccessActionConfig,
  WithdrawObjectActionConfig,
  CreateVestingActionConfig,
  CancelVestingActionConfig,
  SetAuthorizationLevelActionConfig,
  AddDepActionConfig,
  RemoveDepActionConfig,
} from './account';

// Futarchy actions
export type {
  TerminateDaoActionConfig,
  UpdateDaoNameActionConfig,
  UpdateTradingParamsActionConfig,
  UpdateDaoMetadataActionConfig,
  UpdateTwapConfigActionConfig,
  UpdateGovernanceActionConfig,
  UpdateMetadataTableActionConfig,
  UpdateConditionalMetadataActionConfig,
  UpdateSponsorshipConfigActionConfig,
  SyncTwapObservationFromProposalActionConfig,
  SetQuotasActionConfig,
  CreatePoolWithMintActionConfig,
  CreatePoolFromCoinsActionConfig,
  AddLiquidityActionConfig,
  RemoveLiquidityToResourcesActionConfig,
  SwapActionConfig,
  CreateProtectiveBidActionConfig,
  CancelProtectiveBidActionConfig,
  CreateProtectiveAskActionConfig,
  CancelProtectiveAskActionConfig,
  CreateDissolutionCapabilityActionConfig,
  CreateDissolutionCapabilityUnsharedActionConfig,
  CreateRedemptionPoolActionConfig,
  AddToRedemptionPoolActionConfig,
  ShareDissolutionCapabilityActionConfig,
} from './futarchy';

// Governance actions
export type {
  AddPackageActionConfig,
  UpdatePackageMetadataActionConfig,
  PackageUpgradeExecutionConfig,
  UpgradePackageActionConfig,
  CommitUpgradeActionConfig,
  RestrictUpgradeActionConfig,
  LockUpgradeCapActionConfig,
  UnlockUpgradeCapActionConfig,
} from './governance';

// Oracle actions
export type {
  CreateOracleGrantActionConfig,
  CancelOracleGrantActionConfig,
} from './oracle';

// Import types for the union
import type {
  CreateStreamActionConfig,
  CancelStreamActionConfig,
  CollectStreamActionConfig,
  DepositActionConfig,
  SpendActionConfig,
  ApproveCoinTypeActionConfig,
  RemoveApprovedCoinTypeActionConfig,
  DepositFromResourcesActionConfig,
  DepositObjectFromResourcesActionConfig,
  MintVaultAdminCapActionConfig,
  OpenVaultActionConfig,
  CloseVaultActionConfig,
  DepositExternalActionConfig,
  RemoveTreasuryCapToResourcesActionConfig,
  RemoveMetadataCapToResourcesActionConfig,
  MintActionConfig,
  BurnActionConfig,
  MintCurrencyAdminCapActionConfig,
  UpdateCurrencyActionConfig,
  LockTreasuryCapActionConfig,
  LockMetadataCapActionConfig,
  TransferActionConfig,
  TransferToSenderActionConfig,
  TransferCoinActionConfig,
  TransferCoinToSenderActionConfig,
  MemoActionConfig,
  ProvideObjectActionConfig,
  LockAccessActionConfig,
  UnlockAccessActionConfig,
  WithdrawObjectActionConfig,
  CreateVestingActionConfig,
  CancelVestingActionConfig,
  SetAuthorizationLevelActionConfig,
  AddDepActionConfig,
  RemoveDepActionConfig,
} from './account';

import type {
  TerminateDaoActionConfig,
  UpdateDaoNameActionConfig,
  UpdateTradingParamsActionConfig,
  UpdateDaoMetadataActionConfig,
  UpdateTwapConfigActionConfig,
  UpdateGovernanceActionConfig,
  UpdateMetadataTableActionConfig,
  UpdateConditionalMetadataActionConfig,
  UpdateSponsorshipConfigActionConfig,
  SyncTwapObservationFromProposalActionConfig,
  SetQuotasActionConfig,
  CreatePoolWithMintActionConfig,
  CreatePoolFromCoinsActionConfig,
  AddLiquidityActionConfig,
  RemoveLiquidityToResourcesActionConfig,
  SwapActionConfig,
  CreateProtectiveBidActionConfig,
  CancelProtectiveBidActionConfig,
  CreateProtectiveAskActionConfig,
  CancelProtectiveAskActionConfig,
  CreateDissolutionCapabilityActionConfig,
  CreateDissolutionCapabilityUnsharedActionConfig,
  CreateRedemptionPoolActionConfig,
  AddToRedemptionPoolActionConfig,
  ShareDissolutionCapabilityActionConfig,
} from './futarchy';

import type {
  AddPackageActionConfig,
  UpdatePackageMetadataActionConfig,
  UpgradePackageActionConfig,
  CommitUpgradeActionConfig,
  RestrictUpgradeActionConfig,
  LockUpgradeCapActionConfig,
  UnlockUpgradeCapActionConfig,
} from './governance';

import type {
  CreateOracleGrantActionConfig,
  CancelOracleGrantActionConfig,
} from './oracle';

/**
 * Union of all action configurations for staging
 */
export type ActionConfig =
  // Stream
  | CreateStreamActionConfig
  | CancelStreamActionConfig
  | CollectStreamActionConfig
  // Vault
  | DepositActionConfig
  | SpendActionConfig
  | ApproveCoinTypeActionConfig
  | RemoveApprovedCoinTypeActionConfig
  | DepositFromResourcesActionConfig
  | DepositObjectFromResourcesActionConfig
  | MintVaultAdminCapActionConfig
  | OpenVaultActionConfig
  | CloseVaultActionConfig
  | DepositExternalActionConfig
  // Currency
  | RemoveTreasuryCapToResourcesActionConfig
  | RemoveMetadataCapToResourcesActionConfig
  | MintActionConfig
  | BurnActionConfig
  | MintCurrencyAdminCapActionConfig
  | UpdateCurrencyActionConfig
  | LockTreasuryCapActionConfig
  | LockMetadataCapActionConfig
  // Transfer (objects via provide_object)
  | TransferActionConfig
  | TransferToSenderActionConfig
  // Transfer (coins via provide_coin)
  | TransferCoinActionConfig
  | TransferCoinToSenderActionConfig
  // Memo
  | MemoActionConfig
  // Provide Object (stage external object for subsequent action)
  | ProvideObjectActionConfig
  // Access Control
  | LockAccessActionConfig
  | UnlockAccessActionConfig
  // Owned Objects
  | WithdrawObjectActionConfig
  // Vesting
  | CreateVestingActionConfig
  | CancelVestingActionConfig
  // Account Config
  | SetAuthorizationLevelActionConfig
  | AddDepActionConfig
  | RemoveDepActionConfig
  // Futarchy Config
  | TerminateDaoActionConfig
  | UpdateDaoNameActionConfig
  | UpdateTradingParamsActionConfig
  | UpdateDaoMetadataActionConfig
  | UpdateTwapConfigActionConfig
  | UpdateGovernanceActionConfig
  | UpdateMetadataTableActionConfig
  | UpdateConditionalMetadataActionConfig
  | UpdateSponsorshipConfigActionConfig
  | SyncTwapObservationFromProposalActionConfig
  // Futarchy Quota
  | SetQuotasActionConfig
  // Futarchy Liquidity
  | CreatePoolWithMintActionConfig
  | CreatePoolFromCoinsActionConfig
  | AddLiquidityActionConfig
  | RemoveLiquidityToResourcesActionConfig
  | SwapActionConfig
  | CreateProtectiveBidActionConfig
  | CancelProtectiveBidActionConfig
  | CreateProtectiveAskActionConfig
  | CancelProtectiveAskActionConfig
  // Futarchy Dissolution
  | CreateDissolutionCapabilityActionConfig
  | CreateDissolutionCapabilityUnsharedActionConfig
  | CreateRedemptionPoolActionConfig
  | AddToRedemptionPoolActionConfig
  | ShareDissolutionCapabilityActionConfig
  // Governance - Package Upgrade
  | UpgradePackageActionConfig
  | CommitUpgradeActionConfig
  | RestrictUpgradeActionConfig
  | LockUpgradeCapActionConfig
  | UnlockUpgradeCapActionConfig
  // Governance - Package Registry
  | AddPackageActionConfig
  | UpdatePackageMetadataActionConfig
  // Oracle
  | CreateOracleGrantActionConfig
  | CancelOracleGrantActionConfig;
