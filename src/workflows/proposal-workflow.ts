/**
 * Proposal Workflow - High-level orchestrator for governance proposals
 *
 * Provides simple, user-friendly API for the entire proposal lifecycle:
 * 1. Create proposal
 * 2. Add actions to outcomes
 * 3. Advance through states (PREMARKET → REVIEW → TRADING)
 * 4. Perform swaps during trading
 * 5. Finalize proposal
 * 6. Execute winning outcome actions
 * 7. Redeem conditional tokens
 *
 * @module workflows/proposal-workflow
 */

import {
  Transaction,
  Inputs,
  type TransactionArgument,
  type TransactionObjectArgument,
} from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { SuiClient } from '@mysten/sui/client';
import {
  CreateProposalConfig,
  AddProposalActionsConfig,
  AdvanceToReviewConfig,
  AdvanceToTradingConfig,
  FinalizeProposalConfig,
  ExecuteWinningOutcomeConfig,
  ForceRejectOnTimeoutConfig,
  SpotSwapConfig,
  ConditionalSwapConfig,
  SmartConditionalSwapConfig,
  WorkflowSponsorProposalConfig,
  ActionConfig,
  WorkflowTransaction,
  ObjectIdOrRef,
  isOwnedObjectRef,
  isTxSharedObjectRef,
} from './types';
import type { IntentExecutorPackages } from './intent-executor';
import { IntentExecutor } from './intent-executor';
import { assertProtectiveBidActionOrdering } from './action-dependencies';

/**
 * Helper to convert ObjectIdOrRef to tx.object() input
 * Uses Inputs.ObjectRef for owned objects and sharedObjectRef for shared objects
 * to avoid RPC lookups (important for localnet where indexing may lag).
 */
function txObject(tx: Transaction, input: ObjectIdOrRef) {
  if (isTxSharedObjectRef(input)) {
    const sharedVersion =
      typeof input.initialSharedVersion === 'string'
        ? input.initialSharedVersion
        : String(input.initialSharedVersion);
    return tx.object(
      Inputs.SharedObjectRef({
        objectId: input.objectId,
        initialSharedVersion: sharedVersion,
        mutable: input.mutable,
      })
    );
  }
  if (isOwnedObjectRef(input)) {
    return tx.object(
      Inputs.ObjectRef({
        objectId: input.objectId,
        version: typeof input.version === 'string' ? input.version : String(input.version),
        digest: input.digest,
      })
    );
  }
  return tx.object(input);
}

/**
 * Package IDs required for proposal workflow
 */
export interface ProposalWorkflowPackages extends IntentExecutorPackages {
  futarchyMarketsCorePackageId: string;
  futarchyMarketsPrimitivesPackageId: string;
  futarchyMarketsOperationsPackageId: string;
  futarchyProposalPackageId: string;
  futarchyGovernanceActionsPackageId: string;
  futarchyCorePackageId: string;
  oneShotUtilsPackageId?: string;
}

/**
 * Shared object references
 */
export interface ProposalWorkflowSharedObjects {
  packageRegistryId: string;
  packageRegistrySharedVersion: number;
  sponsorshipRegistryId: string;
  sponsorshipRegistrySharedVersion: number;
  /** ProposalMutationRegistry shared object ID - required for setting intent specs */
  mutationRegistryId: string;
  mutationRegistrySharedVersion: number;
  /** SpotPoolMutationRegistry shared object ID - required for advance_proposal_state */
  spotPoolMutationRegistryId: string;
  spotPoolMutationRegistrySharedVersion: number;
  /** MarketStateMutationRegistry shared object ID - required for finalize_proposal */
  marketStateMutationRegistryId: string;
  marketStateMutationRegistrySharedVersion: number;
  /** EscrowMutationRegistry shared object ID - required for finalize_proposal */
  escrowMutationRegistryId: string;
  escrowMutationRegistrySharedVersion: number;
}

/**
 * Proposal Workflow - Complete governance proposal orchestration
 *
 * @example
 * ```typescript
 * const workflow = new ProposalWorkflow(client, packages, sharedObjects);
 *
 * // Create a proposal
 * const createTx = workflow.createProposal({
 *   daoAccountId: '0x...',
 *   assetType: '0x123::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   title: 'Fund Team Development',
 *   introduction: 'Allocate funds for Q1 development',
 *   metadata: JSON.stringify({ category: 'funding' }),
 *   outcomeMessages: ['Reject', 'Accept'],
 *   outcomeDetails: ['Do nothing', 'Approve funding'],
 *   proposer: '0xABC',
 *   usedQuota: false,
 *   feeCoins: ['0xCOIN1'],
 *   feeAmount: 1_000_000_000n,
 * });
 *
 * // Add actions to Accept outcome
 * const addActionsTx = workflow.addActionsToOutcome({
 *   proposalId: '0x...',
 *   assetType: '0x123::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   outcomeIndex: 1,
 *   actions: [
 *     {
 *       type: 'create_stream',
 *       vaultName: 'treasury',
 *       beneficiary: '0xTEAM',
 *       amountPerIteration: 100_000_000n,
 *       ...
 *     },
 *   ],
 * });
 * ```
 */
export class ProposalWorkflow {
  private client: SuiClient;
  private packages: ProposalWorkflowPackages;
  private sharedObjects: ProposalWorkflowSharedObjects;

  constructor(
    client: SuiClient,
    packages: ProposalWorkflowPackages,
    sharedObjects: ProposalWorkflowSharedObjects
  ) {
    this.client = client;
    this.packages = packages;
    this.sharedObjects = sharedObjects;
  }

  // ============================================================================
  // STEP 1: CREATE AND INITIALIZE PROPOSAL (ATOMIC)
  // ============================================================================
  //
  // The new atomic proposal creation pattern ensures proposals are created with
  // all conditional coins in a single transaction, preventing incomplete proposals.
  //
  // Flow in a single PTB:
  // 1. begin_proposal() → returns [Proposal, TokenEscrow, ProposalCreationTicket]
  // 2. add_outcome_coins() or add_outcome_coins_10() → registers coins with escrow
  //    Note: on-chain relation checks enforce (proposal, escrow, daoAccount) are linked; do not mix objects across DAOs/proposals.
  // 3. finalize_proposal() → consumes the ticket, validates completeness, creates AMM pools, shares both

  /**
   * Create and initialize a proposal atomically
   *
   * This combines the old createProposal + advanceToReview into a single atomic operation.
   * The proposal and escrow are created, conditional coins registered, AMM pools created,
   * and both objects shared - all in one transaction.
   *
   * @param config - Configuration including conditional coins for all outcomes
   */
  createAndInitializeProposal(config: CreateProposalConfig & AdvanceToReviewConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const {
      futarchyProposalPackageId,
      accountProtocolPackageId,
      oneShotUtilsPackageId,
    } = this.packages;
    const registryRef = config.registryId
      ? txObject(tx, config.registryId)
      : tx.object(this.sharedObjects.packageRegistryId);

    // 1. Prepare fee coins according to DAO config.
    // Only create zero_coin for the denomination NOT being split from fee coins.
    // Creating both zero coins upfront and then reassigning one leaves an
    // unconsumed Coin<T> in the PTB (UnusedValueWithoutDrop).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stableFee: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let assetFee: any;

    let unusedFeeCoin: ReturnType<typeof tx.object> | null = null;

    if (config.feeAmount > 0n) {
      const feeCoinObjects = config.feeCoins.map((id) => tx.object(id));
      const [firstFeeCoin, ...restFeeCoins] = feeCoinObjects;
      if (!firstFeeCoin) {
        throw new Error("feeCoins is required when feeAmount > 0");
      }

      if (restFeeCoins.length > 0) {
        tx.mergeCoins(firstFeeCoin, restFeeCoins);
      }

      if (config.feeInAsset) {
        [assetFee] = tx.splitCoins(firstFeeCoin, [tx.pure.u64(config.feeAmount)]);
        stableFee = tx.moveCall({
          target: `${this.packages.futarchyFactoryPackageId}::factory::zero_coin`,
          typeArguments: [config.stableType],
          arguments: [],
        });
      } else {
        [stableFee] = tx.splitCoins(firstFeeCoin, [tx.pure.u64(config.feeAmount)]);
        assetFee = tx.moveCall({
          target: `${this.packages.futarchyFactoryPackageId}::factory::zero_coin`,
          typeArguments: [config.assetType],
          arguments: [],
        });
      }

      unusedFeeCoin = firstFeeCoin;
    } else {
      stableFee = tx.moveCall({
        target: `${this.packages.futarchyFactoryPackageId}::factory::zero_coin`,
        typeArguments: [config.stableType],
        arguments: [],
      });
      assetFee = tx.moveCall({
        target: `${this.packages.futarchyFactoryPackageId}::factory::zero_coin`,
        typeArguments: [config.assetType],
        arguments: [],
      });
    }

    // Create Option::None for intent spec
    const noneOption = tx.moveCall({
      target: '0x1::option::none',
      typeArguments: [`vector<${accountProtocolPackageId}::intents::ActionSpec>`],
      arguments: [],
    });

    // 2. Begin proposal - returns [Proposal, TokenEscrow, ProposalCreationTicket]
    const beginResult = tx.moveCall({
      target: `${futarchyProposalPackageId}::proposal::begin_proposal`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.daoAccountId),
        registryRef,
        tx.pure.string(config.title),
        tx.pure.string(config.introduction),
        tx.pure.string(config.metadata),
        tx.pure.vector('string', config.outcomeMessages),
        tx.pure.vector('string', config.outcomeDetails),
        tx.pure.address(config.proposer),
        tx.pure.bool(config.usedQuota),
        stableFee,
        assetFee,
        noneOption,
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    const proposal = beginResult[0];
    const escrow = beginResult[1];
    const creationTicket = beginResult[2];

    // 3. Take conditional coins from registry and add to proposal
    if (config.conditionalCoinsRegistry && config.conditionalCoinsRegistry.coinSets.length > 0 && oneShotUtilsPackageId) {
      const registryId = config.conditionalCoinsRegistry.registryId;

      // Only use coin sets matching the number of outcomes defined in the proposal
      const outcomeCount = config.outcomeMessages.length;
      const coinSetsToUse = config.conditionalCoinsRegistry.coinSets.slice(0, outcomeCount);

      // Each take_coin_set_for_ptb requires LISTING_FEE (10_000_000 MIST = 0.01 SUI).
      // We take 2 coin sets per outcome (asset + stable), so budget accordingly.
      const LISTING_FEE = 10_000_000n;
      const totalFeeNeeded = LISTING_FEE * BigInt(coinSetsToUse.length) * 2n;
      let feeCoin: ReturnType<typeof tx.splitCoins>[0] = tx.splitCoins(tx.gas, [tx.pure.u64(totalFeeNeeded)])[0];

      for (const coinSet of coinSetsToUse) {
        // Take asset conditional coin from registry
        // Returns 4-tuple: (TreasuryCap<T>, MetadataCap<T>, currency_id: ID, Coin<SUI>)
        const assetResults = tx.moveCall({
          target: `${oneShotUtilsPackageId}::blank_coins::take_coin_set_for_ptb`,
          typeArguments: [coinSet.assetCoinType],
          arguments: [
            tx.object(registryId),
            tx.pure.u8(coinSet.assetDecimals),
            tx.pure.id(coinSet.assetCapId),
            feeCoin,
            tx.sharedObjectRef({
              objectId: clockId,
              initialSharedVersion: 1,
              mutable: false,
            }),
          ],
        });

        const assetTreasuryCap = assetResults[0];
        const assetMetadataCap = assetResults[1];
        // assetResults[2] is currency_id (ID) - we use the known currencyId from config instead
        feeCoin = assetResults[3] as ReturnType<typeof tx.splitCoins>[0];

        // Take stable conditional coin from registry
        // Returns 4-tuple: (TreasuryCap<T>, MetadataCap<T>, currency_id: ID, Coin<SUI>)
        const stableResults = tx.moveCall({
          target: `${oneShotUtilsPackageId}::blank_coins::take_coin_set_for_ptb`,
          typeArguments: [coinSet.stableCoinType],
          arguments: [
            tx.object(registryId),
            tx.pure.u8(coinSet.stableDecimals),
            tx.pure.id(coinSet.stableCapId),
            feeCoin,
            tx.sharedObjectRef({
              objectId: clockId,
              initialSharedVersion: 1,
              mutable: false,
            }),
          ],
        });

        const stableTreasuryCap = stableResults[0];
        const stableMetadataCap = stableResults[1];
        // stableResults[2] is currency_id (ID) - we use the known currencyId from config instead
        feeCoin = stableResults[3] as ReturnType<typeof tx.splitCoins>[0];

        // Add outcome coins to proposal using factory wrapper
        // SECURITY: the Move layer asserts `daoAccountId` matches the proposal's DAO, and the escrow belongs to the proposal (prevents mix-and-match).
        // Arguments must match Move function signature exactly:
        //   proposal, escrow, outcome_index,
        //   asset_treasury_cap, asset_currency, asset_metadata_cap,
        //   stable_treasury_cap, stable_currency, stable_metadata_cap,
        //   dao_account, base_asset_currency, base_stable_currency
        tx.moveCall({
          target: `${this.packages.futarchyFactoryPackageId}::factory::add_outcome_coins_to_proposal`,
          typeArguments: [
            config.assetType,
            config.stableType,
            coinSet.assetCoinType,
            coinSet.stableCoinType,
          ],
          arguments: [
            proposal,
            escrow,
            tx.pure.u64(coinSet.outcomeIndex),
            assetTreasuryCap,
            tx.object(coinSet.assetCurrencyId),   // Currency<AssetCondCoin> (shared)
            assetMetadataCap,
            stableTreasuryCap,
            tx.object(coinSet.stableCurrencyId),  // Currency<StableCondCoin> (shared)
            stableMetadataCap,
            txObject(tx, config.daoAccountId),
            txObject(tx, config.baseAssetCurrencyId),   // Currency<AssetType> (shared)
            txObject(tx, config.baseStableCurrencyId),  // Currency<StableType> (shared)
          ],
        });
      }

      // Transfer remaining fee coin back to sender
      tx.transferObjects([feeCoin], tx.pure.address(config.senderAddress));
    }

    // 5. Add actions to outcomes if provided (before finalization)
    if (config.outcomeActions && config.outcomeActions.length > 0) {
      const { accountActionsPackageId, futarchyProposalPackageId: proposalPackage } = this.packages;

      for (const outcomeAction of config.outcomeActions) {
        // Create action spec builder using proposal's new_action_builder
        // This sets up the correct source context before proposal emits
        // ProposalActionsStaged from the stored ActionSpec vector.
        const builder = tx.moveCall({
          target: `${proposalPackage}::proposal::new_action_builder`,
          typeArguments: [config.assetType, config.stableType],
          arguments: [
            proposal, // unshared proposal from begin_proposal
            tx.pure.u64(outcomeAction.outcomeIndex),
          ],
        });

        // Add each action to the builder
        for (const action of outcomeAction.actions) {
          this.addActionToBuilder(tx, builder, action, config.assetType, config.stableType);
        }

        // Convert builder to vector
        const specs = tx.moveCall({
          target: `${accountActionsPackageId}::action_spec_builder::into_vector`,
          arguments: [builder],
        });

        // Set intent spec for outcome on the UNSHARED proposal
        // Uses wrapper in proposal_lifecycle that creates ProposalMutationAuth internally
        const { futarchyGovernancePackageId } = this.packages;
        tx.moveCall({
          target: `${futarchyGovernancePackageId}::proposal_lifecycle::set_intent_spec_for_outcome`,
          typeArguments: [config.assetType, config.stableType],
          arguments: [
            tx.sharedObjectRef({
              objectId: this.sharedObjects.mutationRegistryId,
              initialSharedVersion: this.sharedObjects.mutationRegistrySharedVersion,
              mutable: false,
            }),
            proposal, // unshared proposal from begin_proposal
            tx.pure.u64(outcomeAction.outcomeIndex),
            specs,
            txObject(tx, config.daoAccountId),
            registryRef,
          ],
        });
      }
    }

    // 6. Finalize proposal - validates all coins registered, creates empty AMM pools, shares both
    // No proposer liquidity needed — pools start empty and are funded at advance-to-trading.
    tx.moveCall({
      target: `${futarchyProposalPackageId}::proposal::finalize_proposal`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        proposal,
        escrow,
        creationTicket,
        txObject(tx, config.daoAccountId),
        txObject(tx, config.spotPoolId),
        tx.sharedObjectRef({
          objectId: this.sharedObjects.spotPoolMutationRegistryId,
          initialSharedVersion: this.sharedObjects.spotPoolMutationRegistrySharedVersion,
          mutable: false,
        }),
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    // Return any unused input fee balance to the proposer.
    if (unusedFeeCoin) {
      tx.transferObjects([unusedFeeCoin], tx.pure.address(config.proposer));
    }

    return {
      transaction: tx,
      description: 'Create and initialize governance proposal (atomic)',
    };
  }

  // ============================================================================
  // SPONSORSHIP (COMPOSABLE)
  // ============================================================================

  /**
   * Append a sponsor_proposal moveCall to an existing transaction.
   *
   * Use this to combine sponsorship with other proposal operations (e.g. advanceToTrading)
   * in a single PTB. The proposal must already be a shared object.
   *
   * NOTE: Cannot be combined with createAndInitializeProposal in the same PTB because
   * finalize_proposal consumes the proposal by value and shares it — the object reference
   * is no longer usable in subsequent commands within the same transaction.
   */
  appendSponsorProposal(tx: Transaction, config: WorkflowSponsorProposalConfig): void {
    // Validate sponsorship types
    if (config.sponsorshipTypes.length === 0) {
      throw new Error('sponsorshipTypes must have at least one element');
    }
    if (config.sponsorshipTypes[0] !== 0) {
      throw new Error('sponsorshipTypes[0] must be 0 - reject outcome cannot be sponsored');
    }

    const clockId = config.clockId || '0x6';
    const { futarchyGovernancePackageId } = this.packages;

    tx.moveCall({
      target: `${futarchyGovernancePackageId}::proposal_sponsorship::sponsor_proposal`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.proposalId),
        txObject(tx, config.daoAccountId),
        tx.object(this.sharedObjects.packageRegistryId),
        tx.sharedObjectRef({
          objectId: this.sharedObjects.sponsorshipRegistryId,
          initialSharedVersion: this.sharedObjects.sponsorshipRegistrySharedVersion,
          mutable: false,
        }),
        tx.pure.vector('u8', config.sponsorshipTypes),
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });
  }

  /**
   * Sponsor a proposal (standalone transaction)
   *
   * Creates a new transaction with a single sponsor_proposal moveCall.
   * Use this when the proposal already exists and is shared.
   *
   * For composing with other operations in the same PTB, use appendSponsorProposal() instead.
   */
  sponsorProposal(config: WorkflowSponsorProposalConfig): WorkflowTransaction {
    const tx = new Transaction();
    this.appendSponsorProposal(tx, config);
    return {
      transaction: tx,
      description: 'Sponsor governance proposal TWAP thresholds',
    };
  }

  // ============================================================================
  // STEP 2: ADD ACTIONS TO OUTCOME
  // ============================================================================

  /**
   * Add actions to a specific proposal outcome
   */
  addActionsToOutcome(config: AddProposalActionsConfig): WorkflowTransaction {
    const tx = new Transaction();

    assertProtectiveBidActionOrdering(
      config.actions,
      `proposal outcome ${config.outcomeIndex} actions`
    );

    const { accountActionsPackageId, futarchyProposalPackageId, futarchyGovernancePackageId } = this.packages;

    // Create action spec builder using proposal's new_action_builder
    // This sets up the correct source context before proposal emits
    // ProposalActionsStaged from the stored ActionSpec vector.
    const builder = tx.moveCall({
      target: `${futarchyProposalPackageId}::proposal::new_action_builder`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.proposalId),
        tx.pure.u64(config.outcomeIndex),
      ],
    });

    // Add each action to the builder
    for (const action of config.actions) {
      this.addActionToBuilder(tx, builder, action, config.assetType, config.stableType);
    }

    // Convert builder to vector
    const specs = tx.moveCall({
      target: `${accountActionsPackageId}::action_spec_builder::into_vector`,
      arguments: [builder],
    });

    // Set intent spec for outcome (with whitelist validation)
    // Uses wrapper in proposal_lifecycle that creates ProposalMutationAuth internally
    tx.moveCall({
      target: `${futarchyGovernancePackageId}::proposal_lifecycle::set_intent_spec_for_outcome`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.sharedObjectRef({
          objectId: this.sharedObjects.mutationRegistryId,
          initialSharedVersion: this.sharedObjects.mutationRegistrySharedVersion,
          mutable: false,
        }),
        txObject(tx, config.proposalId),
        tx.pure.u64(config.outcomeIndex),
        specs,
        txObject(tx, config.daoAccountId),    // account for whitelist check
        txObject(tx, config.registryId),       // PackageRegistry
      ],
    });

    return {
      transaction: tx,
      description: `Add ${config.actions.length} action(s) to outcome ${config.outcomeIndex}`,
    };
  }

  /**
   * Add an action configuration to the builder
   * Type arguments are now required for type-safe staging
   */
  private addActionToBuilder(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    action: ActionConfig,
    assetType: string,
    stableType: string
  ): void {
    const {
      accountActionsPackageId,
      futarchyActionsPackageId,
      futarchyOracleActionsPackageId,
    } =
      this.packages;

    // Helper to get coin type - uses action's coinType if specified, otherwise falls back to default
    const getCoinType = (actionCoinType?: string, defaultType?: string): string => {
      const coinType = actionCoinType || defaultType;
      if (!coinType) {
        throw new Error('coinType is required for type-safe staging');
      }
      return coinType;
    };
    const toAsciiBytes = (value: string, field: string): number[] => {
      const bytes: number[] = [];
      for (let i = 0; i < value.length; i += 1) {
        const charCode = value.charCodeAt(i);
        if (charCode > 0x7f) {
          throw new Error(`${field} must contain only ASCII characters`);
        }
        bytes.push(charCode);
      }
      return bytes;
    };
    const makeAsciiStringOption = (value: string | undefined): ReturnType<Transaction['moveCall']> => {
      if (value == null) {
        return tx.moveCall({
          target: '0x1::option::none',
          typeArguments: ['0x1::ascii::String'],
          arguments: [],
        });
      }
      const asciiString = tx.moveCall({
        target: '0x1::ascii::string',
        arguments: [tx.pure.vector('u8', toAsciiBytes(value, 'daoName'))],
      });
      return tx.moveCall({
        target: '0x1::option::some',
        typeArguments: ['0x1::ascii::String'],
        arguments: [asciiString],
      });
    };
    const makeUrlOption = (value: string | undefined): ReturnType<Transaction['moveCall']> => {
      if (value == null) {
        return tx.moveCall({
          target: '0x1::option::none',
          typeArguments: ['0x2::url::Url'],
          arguments: [],
        });
      }
      const asciiString = tx.moveCall({
        target: '0x1::ascii::string',
        arguments: [tx.pure.vector('u8', toAsciiBytes(value, 'iconUrl'))],
      });
      const url = tx.moveCall({
        target: '0x2::url::new_unsafe',
        arguments: [asciiString],
      });
      return tx.moveCall({
        target: '0x1::option::some',
        typeArguments: ['0x2::url::Url'],
        arguments: [url],
      });
    };

    switch (action.type) {
      case 'create_stream':
        // Note: All streams are always cancellable by DAO governance
        tx.moveCall({
          target: `${accountActionsPackageId}::stream_init_actions::add_create_stream_spec`,
          typeArguments: [getCoinType(action.coinType, stableType)],
          arguments: [
            builder,
            tx.pure.string(action.vaultName),
            tx.pure(bcs.Address.serialize(action.beneficiary).toBytes()),
            tx.pure.u64(action.amountPerIteration),
            tx.pure.option('u64', action.startTime != null ? Number(action.startTime) : null),
            tx.pure.u64(action.iterationsTotal),
            tx.pure.u64(action.iterationPeriodMs),
            tx.pure.option('u64', action.claimWindowMs != null ? Number(action.claimWindowMs) : null),
            tx.pure.option('u64', action.expiryMs != null ? Number(action.expiryMs) : null),
            tx.pure.vector('address', action.whitelistedRecipients ?? []),
          ],
        });
        break;

      case 'collect_stream':
        {
          const coinType = getCoinType(action.coinType, stableType);
          const capResourceName = action.capResourceName ?? 'stream_cap';
          const streamCapId = action.streamCapId ?? action.externalArg;
          if (!streamCapId) throw new Error('collect_stream requires streamCapId or externalArg (StreamCap object ID)');
          tx.moveCall({
            target: `${accountActionsPackageId}::owned_init_actions::add_provide_object_spec`,
            typeArguments: [`${accountActionsPackageId}::vault::StreamCap`],
            arguments: [builder, tx.pure.id(streamCapId), tx.pure.string(capResourceName)],
          });
          tx.moveCall({
            target: `${accountActionsPackageId}::vault_init_actions::add_collect_stream_spec`,
            typeArguments: [coinType],
            arguments: [
              builder,
              tx.pure.string(action.vaultName),
              tx.pure.id(action.streamId),
              tx.pure.string(action.resourceName),
              tx.pure.u64(action.amount),
              tx.pure.string(capResourceName),
            ],
          });
        }
        break;

      case 'create_pool_with_mint':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::liquidity_init_actions::add_create_pool_with_mint_spec`,
          typeArguments: [
            action.assetType || assetType,
            action.stableType || stableType,
            action.lpType,
          ],
          arguments: [
            builder,
            tx.pure.string(action.stableResourceName),
            tx.pure.string(action.mintCapResourceName),
            tx.pure.option('u64', action.assetAmount !== undefined ? action.assetAmount : null),
            tx.pure.u64(action.feeBps),
            tx.pure.u64(action.launchFeeDurationMs ?? 0n),
            tx.pure.id(action.lpTreasuryCapId),
            tx.pure.id(action.lpCurrencyId),
          ],
        });
        break;

      case 'remove_liquidity_to_resources':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::liquidity_actions::add_remove_liquidity_to_resources_spec`,
          typeArguments: [
            action.assetType || assetType,
            action.stableType || stableType,
            action.lpType,
          ],
          arguments: [
            builder,
            tx.pure.id(action.poolId),
            tx.pure.u64(action.lpAmount),
            tx.pure.u64(action.minAssetOut),
            tx.pure.u64(action.minStableOut),
            tx.pure.string(action.lpResourceName),
            tx.pure.string(action.assetOutputName),
            tx.pure.string(action.stableOutputName),
            tx.pure.bool(action.forDissolution),
          ],
        });
        break;

      case 'create_protective_bid':
        // Pool ID is read from FutarchyConfig.spot_pool_id at execution (not staged).
        tx.moveCall({
          target: `${futarchyActionsPackageId}::protective_bid_init_actions::add_create_protective_bid_spec`,
          typeArguments: [
            action.assetType || assetType,
            action.stableType || stableType,
          ],
          arguments: [
            builder,
            tx.pure.string(action.vaultCapResourceName),
            tx.pure.u64(action.reservedAmount),
            tx.pure.u64(action.navDiscountBps ?? 0n),
            tx.pure.u64(action.baseFeeBps),
            tx.pure.u64(action.surgeFeeBps),
            tx.pure.u64(action.surgeDurationMs),
            tx.pure.u64(action.daoAmmAssetPrincipal ?? 0n),
            tx.pure.u64(action.daoAmmStablePrincipal ?? 0n),
            tx.pure.u64(action.releaseDurationMs ?? 0n),
          ],
        });
        break;

      case 'cancel_protective_bid':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::protective_bid_actions::add_cancel_protective_bid_spec`,
          typeArguments: [
            action.assetType || assetType,
            action.stableType || stableType,
          ],
          arguments: [
            builder,
            tx.pure.id(action.bidId),
          ],
        });
        break;

      case 'create_protective_ask':
        // Pool ID is read from FutarchyConfig.spot_pool_id at execution (not staged).
        tx.moveCall({
          target: `${futarchyActionsPackageId}::protective_ask_init_actions::add_create_protective_ask_spec`,
          typeArguments: [
            action.assetType || assetType,
            action.stableType || stableType,
          ],
          arguments: [
            builder,
            tx.pure.string(action.mintCapResourceName),
            tx.pure.u64(action.pricePerToken),
            tx.pure.u64(action.maxMintAmount),
            tx.pure.u64(action.releaseDurationMs ?? 0n),
          ],
        });
        break;

      case 'cancel_protective_ask':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::protective_ask_actions::add_cancel_protective_ask_spec`,
          typeArguments: [
            action.assetType || assetType,
            action.stableType || stableType,
          ],
          arguments: [
            builder,
            tx.pure.id(action.askId),
          ],
        });
        break;

      case 'mint':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_mint_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [
            builder,
            tx.pure.u64(action.amount),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'burn':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_burn_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [
            builder,
            tx.pure.u64(action.amount),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'deposit':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_deposit_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [
            builder,
            tx.pure.string(action.vaultName),
            tx.pure.u64(action.amount),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'deposit_external':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_deposit_external_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [
            builder,
            tx.pure.string(action.vaultName),
            tx.pure.u64(action.expectedAmount),
          ],
        });
        break;

      case 'deposit_from_resources':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_deposit_from_resources_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [builder, tx.pure.string(action.vaultName), tx.pure.string(action.resourceName)],
        });
        break;

      case 'deposit_object_from_resources':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_deposit_object_from_resources_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [builder, tx.pure.string(action.vaultName), tx.pure.string(action.resourceName)],
        });
        break;

      case 'mint_vault_admin_cap':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_mint_vault_admin_cap_spec`,
          arguments: [builder, tx.pure.string(action.vaultName), tx.pure.string(action.resourceName)],
        });
        break;

      case 'mint_currency_admin_cap':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_mint_currency_admin_cap_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [builder, tx.pure.string(action.resourceName)],
        });
        break;

      case 'approve_coin_type':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_approve_coin_type_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [builder, tx.pure.string(action.vaultName)],
        });
        break;

      case 'remove_approved_coin_type':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_remove_approved_coin_type_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [builder, tx.pure.string(action.vaultName)],
        });
        break;

      case 'open_vault':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_open_vault_spec`,
          arguments: [builder, tx.pure.string(action.vaultName)],
        });
        break;

      case 'close_vault':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_close_vault_spec`,
          arguments: [builder, tx.pure.string(action.vaultName)],
        });
        break;

      case 'spend':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_spend_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [
            builder,
            tx.pure.string(action.vaultName),
            tx.pure.u64(action.amount),
            tx.pure.bool(action.spendAll),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'transfer':
        if (!action.objectType) throw new Error('objectType is required for transfer action');
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_object_spec`,
          typeArguments: [action.objectType],
          arguments: [
            builder,
            tx.pure.address(action.recipient),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'transfer_to_sender':
        if (!action.objectType) throw new Error('objectType is required for transfer_to_sender action');
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_to_sender_spec`,
          typeArguments: [action.objectType],
          arguments: [builder, tx.pure.string(action.resourceName)],
        });
        break;

      case 'transfer_coin':
        // Use this when the coin was placed via provide_coin (e.g., from VaultSpend)
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_coin_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [
            builder,
            tx.pure.address(action.recipient),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'transfer_coin_to_sender':
        // Use this for crank fees when the coin was placed via provide_coin
        tx.moveCall({
          target: `${accountActionsPackageId}::transfer_init_actions::add_transfer_coin_to_sender_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [builder, tx.pure.string(action.resourceName)],
        });
        break;

      case 'provide_object':
        {
          if (!action.objectType) throw new Error('objectType is required for provide_object action');
          const objectId = action.objectId ?? action.externalArg;
          if (!objectId) throw new Error('provide_object requires objectId or externalArg');
          tx.moveCall({
            target: `${accountActionsPackageId}::owned_init_actions::add_provide_object_spec`,
            typeArguments: [action.objectType],
            arguments: [builder, tx.pure.id(objectId), tx.pure.string(action.resourceName ?? '')],
          });
          break;
        }

      case 'lock_access':
        {
        const expectedId = action.expectedId ?? action.externalArg;
        if (!expectedId) throw new Error('expectedId or externalArg is required for lock_access action');
        tx.moveCall({
          target: `${accountActionsPackageId}::access_control_init_actions::add_lock_spec`,
          typeArguments: [action.capType],
          arguments: [builder, tx.pure.id(expectedId), tx.pure.string(action.resourceName ?? '')],
        });
        break;
        }

      case 'unlock_access':
        tx.moveCall({
          target: `${accountActionsPackageId}::access_control_init_actions::add_unlock_to_resources_spec`,
          typeArguments: [action.capType],
          arguments: [builder, tx.pure.id(action.expectedId), tx.pure.string(action.resourceName)],
        });
        break;

      case 'withdraw_object':
        tx.moveCall({
          target: `${accountActionsPackageId}::owned_init_actions::add_withdraw_object_spec`,
          typeArguments: [action.objectType],
          arguments: [
            builder,
            tx.pure.id(action.objectId),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'memo':
        tx.moveCall({
          target: `${accountActionsPackageId}::memo_init_actions::add_emit_memo_spec`,
          arguments: [builder, tx.pure.string(action.message)],
        });
        break;

      case 'create_vesting':
        tx.moveCall({
          target: `${accountActionsPackageId}::vesting_init_actions::add_create_vesting_spec`,
          typeArguments: [getCoinType(action.coinType, stableType)],
          arguments: [
            builder,
            tx.pure.address(action.beneficiary),
            tx.pure.u64(action.amountPerIteration),
            tx.pure.option('u64', action.startTime != null ? Number(action.startTime) : null),
            tx.pure.u64(action.iterationsTotal),
            tx.pure.u64(action.iterationPeriodMs),
            tx.pure.bool(action.isCancellable),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'cancel_vesting':
        tx.moveCall({
          target: `${accountActionsPackageId}::vesting_init_actions::add_cancel_vesting_spec`,
          typeArguments: [getCoinType(action.coinType, stableType)],
          arguments: [
            builder,
            tx.pure.address(action.vestingId),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'cancel_stream':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_cancel_stream_spec`,
          typeArguments: [getCoinType(action.coinType, stableType)],
          arguments: [
            builder,
            tx.pure.string(action.vaultName),
            tx.pure.address(action.streamId),
          ],
        });
        break;

      case 'update_currency':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_update_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [
            builder,
            tx.pure.option('string', action.symbol ?? null),
            tx.pure.option('string', action.name ?? null),
            tx.pure.option('string', action.description ?? null),
            tx.pure.option('string', action.iconUrl ?? null),
          ],
        });
        break;

      case 'terminate_dao':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_terminate_dao_spec`,
          arguments: [
            builder,
            tx.pure.string(action.reason),
            tx.pure.u64(action.dissolutionUnlockDelayMs),
          ],
        });
        break;

      case 'update_trading_params':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_trading_params_spec`,
          arguments: [
            builder,
            tx.pure.option('u64', action.minAssetAmount != null ? action.minAssetAmount : null),
            tx.pure.option('u64', action.minStableAmount != null ? action.minStableAmount : null),
            tx.pure.option('u64', action.reviewPeriodMs != null ? action.reviewPeriodMs : null),
            tx.pure.option('u64', action.tradingPeriodMs != null ? action.tradingPeriodMs : null),
            tx.pure.option('u64', action.ammTotalFeeBps ?? null),
            tx.pure.option('u64', action.conditionalLiquidityRatioPercent ?? null),
          ],
        });
        break;

      case 'update_dao_metadata':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_metadata_spec`,
          arguments: [
            builder,
            makeAsciiStringOption(action.daoName),
            makeUrlOption(action.iconUrl),
            tx.pure.option('string', action.description ?? null),
          ],
        });
        break;

      case 'update_governance':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_governance_spec`,
          arguments: [
            builder,
            tx.pure.option('u64', action.maxOutcomes != null ? action.maxOutcomes : null),
            tx.pure.option('u64', action.maxActionsPerOutcome != null ? action.maxActionsPerOutcome : null),
            tx.pure.option('u64', action.proposalIntentExpiryMs != null ? action.proposalIntentExpiryMs : null),
            tx.pure.option('u64', action.proposalCreationFee != null ? action.proposalCreationFee : null),
            tx.pure.option('u64', action.proposalFeePerOutcome != null ? action.proposalFeePerOutcome : null),
            tx.pure.option('bool', action.feeInAssetToken ?? null),
          ],
        });
        break;

      case 'update_twap_config':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_twap_config_spec`,
          arguments: [
            builder,
            tx.pure.option('u64', action.startDelay != null ? action.startDelay : null),
            tx.pure.option('u64', action.capPpm != null ? action.capPpm : null),
            tx.pure.option('u128', action.initialObservation ?? null),
            tx.pure.option('u128', action.threshold ?? null),
            tx.pure.option('u128', action.sponsoredThreshold ?? null),
          ],
        });
        break;

      case 'sync_twap_observation_from_proposal':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_sync_twap_observation_from_proposal_spec`,
          arguments: [builder],
        });
        break;

      case 'create_dissolution_capability':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::dissolution_init_actions::add_create_dissolution_capability_spec`,
          typeArguments: [action.assetType || assetType],
          arguments: [builder],
        });
        break;

      case 'create_dissolution_capability_unshared':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::dissolution_init_actions::add_create_dissolution_capability_unshared_spec`,
          typeArguments: [action.assetType || assetType],
          arguments: [builder],
        });
        break;

      case 'share_dissolution_capability':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::dissolution_init_actions::add_share_dissolution_capability_spec`,
          arguments: [builder],
        });
        break;

      case 'create_redemption_pool':
        {
          if (!action.resourceNames || action.resourceNames.length === 0) {
            throw new Error('create_redemption_pool requires at least one resource name');
          }
          if (action.capabilityId) {
            tx.moveCall({
              target: `${futarchyActionsPackageId}::dissolution_init_actions::add_create_redemption_pool_spec`,
              typeArguments: [getCoinType(action.redeemCoinType, stableType)],
              arguments: [
                builder,
                tx.pure.id(action.capabilityId),
                tx.pure.vector('string', action.resourceNames),
              ],
            });
          } else {
            tx.moveCall({
              target: `${futarchyActionsPackageId}::dissolution_init_actions::add_create_redemption_pool_from_unshared_capability_spec`,
              typeArguments: [getCoinType(action.redeemCoinType, stableType)],
              arguments: [builder, tx.pure.vector('string', action.resourceNames)],
            });
          }
        }
        break;

      case 'add_to_redemption_pool':
        if (!action.poolId) throw new Error('poolId is required for add_to_redemption_pool action');
        tx.moveCall({
          target: `${futarchyActionsPackageId}::dissolution_init_actions::add_add_to_redemption_pool_spec`,
          typeArguments: [getCoinType(action.redeemCoinType, stableType)],
          arguments: [builder, tx.pure.string(action.resourceName), tx.pure.id(action.poolId)],
        });
        break;

      case 'create_oracle_grant': {
        const tierSpecs = action.tierSpecs.map((tier) => {
          const recipients = tier.recipients.map((recipient) =>
            tx.moveCall({
              target: `${futarchyOracleActionsPackageId}::oracle_init_actions::new_recipient_mint`,
              arguments: [
                tx.pure.address(recipient.recipient),
                tx.pure.u64(recipient.amount),
              ],
            })
          );

          const recipientsVec = tx.makeMoveVec({
            type: `${futarchyOracleActionsPackageId}::oracle_actions::RecipientMint`,
            elements: recipients,
          });

          return tx.moveCall({
            target: `${futarchyOracleActionsPackageId}::oracle_init_actions::new_tier_spec`,
            arguments: [
              tx.pure.u128(tier.priceThreshold),
              tx.pure.bool(tier.isAbove),
              recipientsVec,
              tx.pure.string(tier.tierDescription),
            ],
          });
        });

        const tierSpecsVec = tx.makeMoveVec({
          type: `${futarchyOracleActionsPackageId}::oracle_actions::TierSpec`,
          elements: tierSpecs,
        });

        tx.moveCall({
          target: `${futarchyOracleActionsPackageId}::oracle_init_actions::add_create_oracle_grant_spec`,
          typeArguments: [action.assetType || assetType, action.stableType || stableType],
          arguments: [
            builder,
            tx.pure.string(action.mintCapResourceName),
            tierSpecsVec,
            tx.pure.bool(action.useRelativePricing),
            tx.pure.u64(action.launchpadMultiplier),
            tx.pure.u64(action.earliestExecutionOffsetMs),
            tx.pure.u64(action.expiryYears),
            tx.pure.bool(action.cancelable),
            tx.pure.string(action.description),
            tx.pure.u64(action.twapWindowMs ?? 2_592_000_000n), // 30 days default
          ],
        });
        break;
      }

      case 'cancel_oracle_grant':
        tx.moveCall({
          target: `${futarchyOracleActionsPackageId}::oracle_init_actions::add_cancel_grant_spec`,
          typeArguments: [action.assetType || assetType, action.stableType || stableType],
          arguments: [builder, tx.pure.id(action.grantId)],
        });
        break;

      case 'lock_treasury_cap':
        {
          const coinType = getCoinType(action.coinType, assetType);
          const resourceName = action.resourceName ?? 'treasury_cap';
          if (!action.externalArg) throw new Error('lock_treasury_cap requires externalArg (treasury cap object ID)');
          tx.moveCall({
            target: `${accountActionsPackageId}::owned_init_actions::add_provide_object_spec`,
            typeArguments: [`0x2::coin::TreasuryCap<${coinType}>`],
            arguments: [builder, tx.pure.id(action.externalArg), tx.pure.string(resourceName)],
          });
          tx.moveCall({
            target: `${accountActionsPackageId}::currency_init_actions::add_lock_treasury_cap_spec`,
            typeArguments: [coinType],
            arguments: [
              builder,
              tx.pure.option('u64', action.maxSupply ?? null),
              tx.pure.bool(action.canMint),
              tx.pure.bool(action.canBurn),
              tx.pure.bool(action.canUpdateName),
              tx.pure.bool(action.canUpdateDescription),
              tx.pure.bool(action.canUpdateIcon),
              tx.pure.string(resourceName),
            ],
          });
        }
        break;

      case 'lock_metadata_cap':
        {
          const coinType = getCoinType(action.coinType, assetType);
          const resourceName = action.resourceName ?? 'metadata_cap';
          if (!action.externalArg) throw new Error('lock_metadata_cap requires externalArg (metadata cap object ID)');
          tx.moveCall({
            target: `${accountActionsPackageId}::owned_init_actions::add_provide_object_spec`,
            typeArguments: [`0x2::coin_registry::MetadataCap<${coinType}>`],
            arguments: [builder, tx.pure.id(action.externalArg), tx.pure.string(resourceName)],
          });
          tx.moveCall({
            target: `${accountActionsPackageId}::currency_init_actions::add_lock_metadata_cap_spec`,
            typeArguments: [coinType],
            arguments: [
              builder,
              tx.pure.bool(action.canUpdateName),
              tx.pure.bool(action.canUpdateDescription),
              tx.pure.bool(action.canUpdateIcon),
              tx.pure.string(resourceName),
            ],
          });
        }
        break;

      case 'remove_treasury_cap_to_resources':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_remove_treasury_cap_to_resources_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [builder, tx.pure.id(action.expectedCapId), tx.pure.string(action.resourceName)],
        });
        break;

      case 'remove_metadata_cap_to_resources':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_remove_metadata_cap_to_resources_spec`,
          typeArguments: [getCoinType(action.coinType, assetType)],
          arguments: [builder, tx.pure.id(action.expectedCapId), tx.pure.string(action.resourceName)],
        });
        break;

      case 'upgrade_package':
        tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade_init_actions::add_upgrade_spec`,
          arguments: [
            builder,
            tx.pure.string(action.name),
            tx.pure.vector('u8', Array.from(action.digest)),
            tx.pure.id(action.expectedCapId),
          ],
        });
        break;

      case 'commit_upgrade':
        tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade_init_actions::add_commit_spec`,
          arguments: [
            builder,
            tx.pure.string(action.name),
            tx.pure.id(action.expectedCapId),
          ],
        });
        break;

      case 'restrict_upgrade':
        tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade_init_actions::add_restrict_spec`,
          arguments: [
            builder,
            tx.pure.string(action.name),
            tx.pure.u8(action.policy),
            tx.pure.id(action.expectedCapId),
          ],
        });
        break;

      case 'lock_upgrade_cap':
        {
          const resourceName = action.resourceName ?? 'upgrade_cap';
          tx.moveCall({
            target: `${accountActionsPackageId}::owned_init_actions::add_provide_object_spec`,
            typeArguments: ['0x2::package::UpgradeCap'],
            arguments: [builder, tx.pure.id(action.expectedCapId), tx.pure.string(resourceName)],
          });
          tx.moveCall({
            target: `${accountActionsPackageId}::package_upgrade_init_actions::add_lock_upgrade_cap_spec`,
            arguments: [
              builder,
              tx.pure.string(action.name),
              tx.pure.u64(action.delayMs),
              tx.pure.string(resourceName),
              tx.pure.id(action.expectedCapId),
            ],
          });
        }
        break;

      case 'unlock_upgrade_cap':
        {
          const resourceName = action.resourceName ?? 'upgrade_cap';
        tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade_init_actions::add_unlock_upgrade_cap_spec`,
          arguments: [
            builder,
            tx.pure.string(action.name),
            tx.pure.string(resourceName),
            tx.pure.id(action.expectedCapId),
          ],
        });
        }
        break;

      default:
        throw new Error(`Unknown action type: ${(action as { type?: string }).type}`);
    }
  }

  // ============================================================================
  // STEP 3: ADVANCE TO TRADING STATE
  // ============================================================================
  //
  // NOTE: The old advanceToReview() has been removed. Use createAndInitializeProposal()
  // which atomically creates the proposal in REVIEW state with all conditional coins.

  /**
   * Advance proposal from REVIEW to TRADING state
   *
   * This triggers 100% quantum split from spot pool to conditional AMMs.
   *
   * Gap Fee: A fee may be charged based on time since last proposal ended.
   * - Starts at 10000x proposal_creation_fee at t=0
   * - Decays exponentially to 0 at t=12hr (30-minute half-life)
   * - Any excess fee is returned to senderAddress
   */
  advanceToTrading(config: AdvanceToTradingConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyGovernancePackageId, futarchyFactoryPackageId } = this.packages;

    // Prepare gap fee coins
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let gapFeeAsset: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let gapFeeStable: any;

    if (config.gapFeeCoins && config.gapFeeCoins.length > 0) {
      // Merge gap fee coins if multiple
      const coinObjects = config.gapFeeCoins.map((id) => tx.object(id));
      const [firstCoin, ...restCoins] = coinObjects;

      if (restCoins.length > 0) {
        tx.mergeCoins(firstCoin, restCoins);
      }

      // Split the max fee amount if specified
      const feeCoin = config.maxGapFee
        ? tx.splitCoins(firstCoin, [tx.pure.u64(config.maxGapFee)])[0]
        : firstCoin;

      if (config.feeInAsset) {
        // Gap fee in AssetType - create zero stable coin
        gapFeeAsset = feeCoin;
        gapFeeStable = tx.moveCall({
          target: `${futarchyFactoryPackageId}::factory::zero_coin`,
          typeArguments: [config.stableType],
          arguments: [],
        });
      } else {
        // Gap fee in StableType (default) - create zero asset coin
        gapFeeStable = feeCoin;
        gapFeeAsset = tx.moveCall({
          target: `${futarchyFactoryPackageId}::factory::zero_coin`,
          typeArguments: [config.assetType],
          arguments: [],
        });
      }
    } else {
      // No gap fee coins - create zero coins for both types
      gapFeeAsset = tx.moveCall({
        target: `${futarchyFactoryPackageId}::factory::zero_coin`,
        typeArguments: [config.assetType],
        arguments: [],
      });
      gapFeeStable = tx.moveCall({
        target: `${futarchyFactoryPackageId}::factory::zero_coin`,
        typeArguments: [config.stableType],
        arguments: [],
      });
    }

    // Call advance_proposal_state which returns (bool, Coin<Asset>, Coin<Stable>)
    const result = tx.moveCall({
      target: `${futarchyGovernancePackageId}::proposal_lifecycle::advance_proposal_state`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        txObject(tx, config.daoAccountId), // account
        tx.sharedObjectRef({
          objectId: this.sharedObjects.mutationRegistryId,
          initialSharedVersion: this.sharedObjects.mutationRegistrySharedVersion,
          mutable: false,
        }), // mutation_registry (ProposalMutationRegistry)
        tx.sharedObjectRef({
          objectId: this.sharedObjects.spotPoolMutationRegistryId,
          initialSharedVersion: this.sharedObjects.spotPoolMutationRegistrySharedVersion,
          mutable: false,
        }), // spot_pool_mutation_registry
        tx.sharedObjectRef({
          objectId: this.sharedObjects.marketStateMutationRegistryId,
          initialSharedVersion: this.sharedObjects.marketStateMutationRegistrySharedVersion,
          mutable: false,
        }), // market_state_mutation_registry
        tx.sharedObjectRef({
          objectId: this.sharedObjects.escrowMutationRegistryId,
          initialSharedVersion: this.sharedObjects.escrowMutationRegistrySharedVersion,
          mutable: false,
        }), // escrow_mutation_registry
        txObject(tx, config.proposalId),
        txObject(tx, config.spotPoolId),
        gapFeeAsset,
        gapFeeStable,
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    // result[0] is bool (state_changed) - we don't need to use it
    // result[1] is excess asset coin - transfer back to sender
    // result[2] is excess stable coin - transfer back to sender
    const excessAsset = result[1];
    const excessStable = result[2];

    tx.transferObjects([excessAsset, excessStable], tx.pure.address(config.senderAddress));

    // If we had gap fee coins and split from them, return the remainder too
    if (config.gapFeeCoins && config.gapFeeCoins.length > 0 && config.maxGapFee) {
      const coinObjects = config.gapFeeCoins.map((id) => tx.object(id));
      const [firstCoin] = coinObjects;
      tx.transferObjects([firstCoin], tx.pure.address(config.senderAddress));
    }

    return {
      transaction: tx,
      description: 'Advance to TRADING state (100% quantum split)',
    };
  }

  // ============================================================================
  // STEP 5: PERFORM SWAPS
  // ============================================================================

  /**
   * Execute a spot swap during an active proposal
   */
  spotSwap(config: SpotSwapConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyMarketsOperationsPackageId, futarchyMarketsPrimitivesPackageId } =
      this.packages;

    // Merge input coins if multiple provided
    const coinObjects = config.inputCoins.map((id) => tx.object(id));
    const [firstCoin, ...restCoins] = coinObjects;

    if (restCoins.length > 0) {
      tx.mergeCoins(firstCoin, restCoins);
    }

    // Split input amount
    const [inputCoin] = tx.splitCoins(firstCoin, [tx.pure.u64(config.amountIn)]);

    // Create Option::None for existing balance
    const noneBalance = tx.moveCall({
      target: '0x1::option::none',
      typeArguments: [
        `${futarchyMarketsPrimitivesPackageId}::conditional_balance::ConditionalMarketBalance<${config.assetType}, ${config.stableType}>`,
      ],
      arguments: [],
    });

    // Execute swap
    const swapTarget =
      config.direction === 'stable_to_asset'
        ? `${futarchyMarketsOperationsPackageId}::swap_entry::swap_spot_stable_to_asset`
        : `${futarchyMarketsOperationsPackageId}::swap_entry::swap_spot_asset_to_stable`;

    const [outputOpt, balanceOpt] = tx.moveCall({
      target: swapTarget,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        txObject(tx, config.spotPoolId),
        inputCoin,
        tx.pure.u64(config.minAmountOut),
        tx.pure.address(config.recipient),
        noneBalance,
        tx.pure.bool(false), // return_balance = false
        tx.sharedObjectRef({
          objectId: this.sharedObjects.spotPoolMutationRegistryId,
          initialSharedVersion: this.sharedObjects.spotPoolMutationRegistrySharedVersion,
          mutable: false,
        }), // spot_pool_mutation_registry
        tx.sharedObjectRef({
          objectId: this.sharedObjects.escrowMutationRegistryId,
          initialSharedVersion: this.sharedObjects.escrowMutationRegistrySharedVersion,
          mutable: false,
        }), // escrow_registry
        tx.sharedObjectRef({
          objectId: this.sharedObjects.marketStateMutationRegistryId,
          initialSharedVersion: this.sharedObjects.marketStateMutationRegistrySharedVersion,
          mutable: false,
        }), // market_state_registry
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    // Destroy empty options
    tx.moveCall({
      target: '0x1::option::destroy_none',
      typeArguments: [
        `0x2::coin::Coin<${config.direction === 'stable_to_asset' ? config.assetType : config.stableType}>`,
      ],
      arguments: [outputOpt],
    });

    tx.moveCall({
      target: '0x1::option::destroy_none',
      typeArguments: [
        `${futarchyMarketsPrimitivesPackageId}::conditional_balance::ConditionalMarketBalance<${config.assetType}, ${config.stableType}>`,
      ],
      arguments: [balanceOpt],
    });

    // Return remaining input coins
    tx.transferObjects([firstCoin], tx.pure.address(config.recipient));

    return {
      transaction: tx,
      description: `Spot swap ${config.direction}`,
    };
  }

  /**
   * Execute a conditional swap to buy tokens in a specific outcome market
   */
  conditionalSwap(config: ConditionalSwapConfig): WorkflowTransaction {
    if (config.direction !== 'stable_to_asset') {
      throw new Error(
        'conditionalSwap currently only supports stable_to_asset. ' +
          'Use smartConditionalSwap for asset_to_stable (inventory-first, supports wrappers).'
      );
    }

    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyMarketsOperationsPackageId } = this.packages;

    // Merge input coins
    const coinObjects = config.stableCoins.map((id) => tx.object(id));
    const [firstCoin, ...restCoins] = coinObjects;

    if (restCoins.length > 0) {
      tx.mergeCoins(firstCoin, restCoins);
    }

    // Split input amount
    const [stableCoin] = tx.splitCoins(firstCoin, [tx.pure.u64(config.amountIn)]);

    // Find the target outcome coin types
    const targetOutcome = config.allOutcomeCoins.find(o => o.outcomeIndex === config.outcomeIndex);
    if (!targetOutcome) {
      throw new Error(`No conditional coin types found for outcome ${config.outcomeIndex}`);
    }

    tx.moveCall({
      target: `${futarchyMarketsOperationsPackageId}::swap_entry::conditional_swap_stable_to_asset_with_wrapped_escrow`,
      typeArguments: [
        config.assetType,
        config.stableType,
        config.lpType,
        targetOutcome.stableCoinType,
        targetOutcome.assetCoinType,
      ],
      arguments: [
        txObject(tx, config.proposalId),
        txObject(tx, config.spotPoolId),
        stableCoin,
        tx.pure.u8(config.outcomeIndex),
        tx.pure.u64(config.minAmountOut),
        tx.pure.address(config.recipient),
        tx.sharedObjectRef({
          objectId: this.sharedObjects.spotPoolMutationRegistryId,
          initialSharedVersion: this.sharedObjects.spotPoolMutationRegistrySharedVersion,
          mutable: false,
        }),
        tx.sharedObjectRef({
          objectId: this.sharedObjects.escrowMutationRegistryId,
          initialSharedVersion: this.sharedObjects.escrowMutationRegistrySharedVersion,
          mutable: false,
        }),
        tx.sharedObjectRef({
          objectId: this.sharedObjects.marketStateMutationRegistryId,
          initialSharedVersion: this.sharedObjects.marketStateMutationRegistrySharedVersion,
          mutable: false,
        }),
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    // Return remaining input coins
    tx.transferObjects([firstCoin], tx.pure.address(config.recipient));

    return {
      transaction: tx,
      description: `Conditional swap in outcome ${config.outcomeIndex}`,
    };
  }

  /**
   * Execute a smart conditional swap that automatically sources coins from multiple places
   *
   * Priority order:
   * 1. Balance wrapper NFTs (ConditionalMarketBalance objects)
   * 2. Existing conditional coins in user's wallet
   * 3. Spot coins (split across all outcomes and unwrap residuals to coins)
   *
   * This provides the best UX by automatically finding and using available coins.
   */
  smartConditionalSwap(config: SmartConditionalSwapConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyMarketsOperationsPackageId } = this.packages;
    const { availableCoins, direction, outcomeIndex, amountIn } = config;
    const isAssetToStable = direction === 'asset_to_stable';

    if (amountIn <= 0n) {
      throw new Error('amountIn must be > 0');
    }

    const targetOutcome = config.allOutcomeCoins.find((o) => o.outcomeIndex === outcomeIndex);
    if (!targetOutcome) {
      throw new Error(`No conditional coin types found for outcome ${outcomeIndex}`);
    }

    const inputConditionalType = isAssetToStable
      ? targetOutcome.assetCoinType
      : targetOutcome.stableCoinType;
    const outputConditionalType = isAssetToStable
      ? targetOutcome.stableCoinType
      : targetOutcome.assetCoinType;

    const availableConditional = availableCoins.conditionalCoins.reduce(
      (sum, c) => sum + c.balance,
      0n
    );

    const wrapperRows = availableCoins.balanceWrappers.map((wrapper) => {
      const outcomeRow = wrapper.outcomes.find((row) => row.outcomeIndex === outcomeIndex);
      const available = isAssetToStable
        ? (outcomeRow?.asset ?? 0n)
        : (outcomeRow?.stable ?? 0n);
      return {
        objectId: wrapper.objectId,
        available,
      };
    });
    const availableWrappers = wrapperRows.reduce((sum, row) => sum + row.available, 0n);
    const availableSpot = availableCoins.spotCoins.reduce((sum, c) => sum + c.balance, 0n);
    const totalAvailable = availableWrappers + availableConditional + availableSpot;
    if (totalAvailable < amountIn) {
      throw new Error(
        `Insufficient inventory for smartConditionalSwap: need=${amountIn} ` +
          `wrappers=${availableWrappers} conditional=${availableConditional} spot=${availableSpot}`
      );
    }

    type WrapperChunk = {
      objectId: string;
      amount: bigint;
    };

    let remainingToSource = amountIn;
    const wrapperChunks: WrapperChunk[] = [];
    for (const row of wrapperRows) {
      if (remainingToSource === 0n) break;
      if (row.available === 0n) continue;
      const take = row.available < remainingToSource ? row.available : remainingToSource;
      wrapperChunks.push({ objectId: row.objectId, amount: take });
      remainingToSource -= take;
    }

    const conditionalCoinIds: string[] = [];
    let conditionalSelected = 0n;
    while (
      remainingToSource > 0n &&
      conditionalCoinIds.length < availableCoins.conditionalCoins.length
    ) {
      const coin = availableCoins.conditionalCoins[conditionalCoinIds.length];
      conditionalCoinIds.push(coin.objectId);
      conditionalSelected += coin.balance;
      if (conditionalSelected >= remainingToSource) break;
    }
    const conditionalChunkAmount = conditionalSelected < remainingToSource
      ? conditionalSelected
      : remainingToSource;
    remainingToSource -= conditionalChunkAmount;

    const spotCoinIds: string[] = [];
    let spotSelected = 0n;
    while (remainingToSource > 0n && spotCoinIds.length < availableCoins.spotCoins.length) {
      const coin = availableCoins.spotCoins[spotCoinIds.length];
      spotCoinIds.push(coin.objectId);
      spotSelected += coin.balance;
      if (spotSelected >= remainingToSource) break;
    }
    const spotChunkAmount = spotSelected < remainingToSource ? spotSelected : remainingToSource;
    remainingToSource -= spotChunkAmount;

    if (remainingToSource > 0n) {
      throw new Error(`Failed to source full input amount, remaining=${remainingToSource}`);
    }

    type ExecutionChunk =
      | { kind: 'wrapper'; amount: bigint; wrapperId: string }
      | { kind: 'conditional'; amount: bigint }
      | { kind: 'spot'; amount: bigint };

    const executionChunks: ExecutionChunk[] = [
      ...wrapperChunks.map((chunk) => ({
        kind: 'wrapper' as const,
        amount: chunk.amount,
        wrapperId: chunk.objectId,
      })),
      ...(conditionalChunkAmount > 0n
        ? [{ kind: 'conditional' as const, amount: conditionalChunkAmount }]
        : []),
      ...(spotChunkAmount > 0n ? [{ kind: 'spot' as const, amount: spotChunkAmount }] : []),
    ];

    if (executionChunks.length === 0) {
      throw new Error('No available sources for smart conditional swap');
    }

    const buildCommonSharedArgs = () => [
      tx.sharedObjectRef({
        objectId: this.sharedObjects.spotPoolMutationRegistryId,
        initialSharedVersion: this.sharedObjects.spotPoolMutationRegistrySharedVersion,
        mutable: false,
      }),
      tx.sharedObjectRef({
        objectId: this.sharedObjects.escrowMutationRegistryId,
        initialSharedVersion: this.sharedObjects.escrowMutationRegistrySharedVersion,
        mutable: false,
      }),
      tx.sharedObjectRef({
        objectId: this.sharedObjects.marketStateMutationRegistryId,
        initialSharedVersion: this.sharedObjects.marketStateMutationRegistrySharedVersion,
        mutable: false,
      }),
      tx.sharedObjectRef({
        objectId: clockId,
        initialSharedVersion: 1,
        mutable: false,
      }),
    ];

    const buildSpotPoolRegistryArg = () =>
      tx.sharedObjectRef({
        objectId: this.sharedObjects.spotPoolMutationRegistryId,
        initialSharedVersion: this.sharedObjects.spotPoolMutationRegistrySharedVersion,
        mutable: false,
      });

    const buildEscrowRegistryArg = () =>
      tx.sharedObjectRef({
        objectId: this.sharedObjects.escrowMutationRegistryId,
        initialSharedVersion: this.sharedObjects.escrowMutationRegistrySharedVersion,
        mutable: false,
      });

    const buildMarketStateRegistryArg = () =>
      tx.sharedObjectRef({
        objectId: this.sharedObjects.marketStateMutationRegistryId,
        initialSharedVersion: this.sharedObjects.marketStateMutationRegistrySharedVersion,
        mutable: false,
      });

    const buildClockArg = () =>
      tx.sharedObjectRef({
        objectId: clockId,
        initialSharedVersion: 1,
        mutable: false,
      });

    const buildCoinOnlySpotSwap = (
      spotInputCoin: TransactionArgument,
      spotAmount: bigint,
      minAmountOut: bigint
    ) => {
      const [escrow, receipt] = tx.moveCall({
        target: `${futarchyMarketsOperationsPackageId}::swap_entry::extract_escrow_for_batch`,
        typeArguments: [config.assetType, config.stableType, config.lpType],
        arguments: [
          txObject(tx, config.spotPoolId),
          buildSpotPoolRegistryArg(),
        ],
      });

      let batch: TransactionArgument = tx.moveCall({
        target: `${futarchyMarketsOperationsPackageId}::swap_entry::begin_conditional_swaps`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [escrow, buildClockArg()],
      });

      const session = tx.moveCall({
        target: `${this.packages.futarchyMarketsCorePackageId}::swap_core::begin_swap_session`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [escrow],
      });

      batch = tx.moveCall({
        target: `${futarchyMarketsOperationsPackageId}::swap_entry::${
          isAssetToStable ? 'split_asset_to_batch' : 'split_stable_to_batch'
        }`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [batch, escrow, spotInputCoin],
      });

      const [batchAfterInputUnwrap, swapInputCoin] = tx.moveCall({
        target: `${futarchyMarketsOperationsPackageId}::swap_entry::unwrap_from_batch`,
        typeArguments: [config.assetType, config.stableType, inputConditionalType],
        arguments: [
          batch,
          escrow,
          tx.pure.u8(outcomeIndex),
          tx.pure.bool(isAssetToStable),
          tx.pure.u64(spotAmount),
        ],
      });
      batch = batchAfterInputUnwrap;

      const [batchAfterSwap, outputCoin] = tx.moveCall({
        target: `${futarchyMarketsOperationsPackageId}::swap_entry::swap_in_batch`,
        typeArguments: [
          config.assetType,
          config.stableType,
          inputConditionalType,
          outputConditionalType,
        ],
        arguments: [
          batch,
          session,
          escrow,
          tx.pure.u8(outcomeIndex),
          swapInputCoin,
          tx.pure.bool(isAssetToStable),
          tx.pure.u64(minAmountOut),
          buildEscrowRegistryArg(),
          buildClockArg(),
        ],
      });
      batch = batchAfterSwap;

      const outputCoins: TransactionObjectArgument[] = [outputCoin];
      for (const outcome of config.allOutcomeCoins) {
        if (outcome.outcomeIndex === outcomeIndex) {
          continue;
        }

        const residualCoinType = isAssetToStable
          ? outcome.assetCoinType
          : outcome.stableCoinType;
        const [nextBatch, residualCoin] = tx.moveCall({
          target: `${futarchyMarketsOperationsPackageId}::swap_entry::unwrap_from_batch`,
          typeArguments: [config.assetType, config.stableType, residualCoinType],
          arguments: [
            batch,
            escrow,
            tx.pure.u8(outcome.outcomeIndex),
            tx.pure.bool(isAssetToStable),
            tx.pure.u64(spotAmount),
          ],
        });
        batch = nextBatch;
        outputCoins.push(residualCoin);
      }

      tx.moveCall({
        target: `${futarchyMarketsOperationsPackageId}::swap_entry::finalize_conditional_swaps`,
        typeArguments: [config.assetType, config.stableType, config.lpType],
        arguments: [
          batch,
          txObject(tx, config.spotPoolId),
          txObject(tx, config.proposalId),
          escrow,
          session,
          tx.pure.address(config.recipient),
          buildEscrowRegistryArg(),
          buildMarketStateRegistryArg(),
          buildClockArg(),
        ],
      });

      tx.moveCall({
        target: `${futarchyMarketsOperationsPackageId}::swap_entry::store_escrow_after_batch`,
        typeArguments: [config.assetType, config.stableType, config.lpType],
        arguments: [
          txObject(tx, config.spotPoolId),
          escrow,
          receipt,
          buildSpotPoolRegistryArg(),
          buildEscrowRegistryArg(),
          buildMarketStateRegistryArg(),
          tx.pure.address(config.recipient),
          buildClockArg(),
        ],
      });

      tx.transferObjects(outputCoins, tx.pure.address(config.recipient));
    };

    const conditionalCoinObjects = conditionalCoinIds.map((id) => tx.object(id));
    const firstConditionalCoin = conditionalCoinObjects[0];
    if (firstConditionalCoin) {
      const restConditionalCoins = conditionalCoinObjects.slice(1);
      if (restConditionalCoins.length > 0) {
        tx.mergeCoins(firstConditionalCoin, restConditionalCoins);
      }
    }

    const spotCoinObjects = spotCoinIds.map((id) => tx.object(id));
    const firstSpotCoin = spotCoinObjects[0];
    if (firstSpotCoin) {
      const restSpotCoins = spotCoinObjects.slice(1);
      if (restSpotCoins.length > 0) {
        tx.mergeCoins(firstSpotCoin, restSpotCoins);
      }
    }

    let remainingMinAmountOut = config.minAmountOut;
    for (let i = 0; i < executionChunks.length; i++) {
      const chunk = executionChunks[i];
      const isLast = i === executionChunks.length - 1;
      const chunkMinAmountOut = isLast
        ? remainingMinAmountOut
        : (config.minAmountOut * chunk.amount) / amountIn;
      remainingMinAmountOut -= chunkMinAmountOut;

      if (chunk.kind === 'wrapper') {
        tx.moveCall({
          target: `${futarchyMarketsOperationsPackageId}::swap_entry::conditional_swap_balance_with_wrapped_escrow`,
          typeArguments: [
            config.assetType,
            config.stableType,
            config.lpType,
            inputConditionalType,
            outputConditionalType,
          ],
          arguments: [
            txObject(tx, config.proposalId),
            txObject(tx, config.spotPoolId),
            tx.object(chunk.wrapperId),
            tx.pure.u8(outcomeIndex),
            tx.pure.bool(isAssetToStable),
            tx.pure.u64(chunk.amount),
            tx.pure.u64(chunkMinAmountOut),
            tx.pure.address(config.recipient),
            ...buildCommonSharedArgs(),
          ],
        });
        continue;
      }

      if (chunk.kind === 'conditional') {
        if (!firstConditionalCoin) {
          throw new Error('Missing conditional input coins for smart swap');
        }
        const [swapInputCoin] = tx.splitCoins(firstConditionalCoin, [tx.pure.u64(chunk.amount)]);
        tx.moveCall({
          target: `${futarchyMarketsOperationsPackageId}::swap_entry::conditional_swap_coin_with_wrapped_escrow`,
          typeArguments: [
            config.assetType,
            config.stableType,
            config.lpType,
            inputConditionalType,
            outputConditionalType,
          ],
          arguments: [
            txObject(tx, config.proposalId),
            txObject(tx, config.spotPoolId),
            swapInputCoin,
            tx.pure.u8(outcomeIndex),
            tx.pure.bool(isAssetToStable),
            tx.pure.u64(chunkMinAmountOut),
            tx.pure.address(config.recipient),
            ...buildCommonSharedArgs(),
          ],
        });
        continue;
      }

      if (!firstSpotCoin) {
        throw new Error('Missing spot input coins for smart swap');
      }
      const [spotInputCoin] = tx.splitCoins(firstSpotCoin, [tx.pure.u64(chunk.amount)]);

      buildCoinOnlySpotSwap(spotInputCoin, chunk.amount, chunkMinAmountOut);
    }

    // Return unused inventory to recipient.
    if (firstConditionalCoin) {
      tx.transferObjects([firstConditionalCoin], tx.pure.address(config.recipient));
    }
    if (firstSpotCoin) {
      tx.transferObjects([firstSpotCoin], tx.pure.address(config.recipient));
    }

    return {
      transaction: tx,
      description: `Smart conditional swap in outcome ${outcomeIndex} (${direction})`,
    };
  }

  /**
   * Query available coins for a smart conditional swap
   *
   * Use this to populate the `availableCoins` field of `SmartConditionalSwapConfig`.
   *
   * @param address - Wallet address to query
   * @param outcomeIndex - The outcome index for the swap
   * @param direction - Swap direction (determines which coin type to query)
   * @param assetType - DAO asset type
   * @param stableType - DAO stable type
   * @param marketStateId - Market state ID for filtering balance wrappers
   * @param allOutcomeCoins - Conditional coin types for each outcome
   * @returns SmartSwapAvailableCoins ready for use in config
   */
  async querySmartSwapAvailableCoins(params: {
    address: string;
    outcomeIndex: number;
    direction: 'stable_to_asset' | 'asset_to_stable';
    assetType: string;
    stableType: string;
    marketStateId: string;
    allOutcomeCoins: Array<{
      outcomeIndex: number;
      assetCoinType: string;
      stableCoinType: string;
    }>;
  }): Promise<import('./types').SmartSwapAvailableCoins> {
    const { address, outcomeIndex, direction, assetType, stableType, marketStateId, allOutcomeCoins } = params;
    const isAsset = direction === 'asset_to_stable';

    // Find target outcome coin type
    const targetOutcome = allOutcomeCoins.find((o) => o.outcomeIndex === outcomeIndex);
    if (!targetOutcome) {
      throw new Error(`No conditional coin types found for outcome ${outcomeIndex}`);
    }

    const targetConditionalType = isAsset
      ? targetOutcome.assetCoinType
      : targetOutcome.stableCoinType;

    const spotCoinType = isAsset ? assetType : stableType;
    const resolveDecimals = async (coinType: string): Promise<number> => {
      const metadata = await this.client.getCoinMetadata({ coinType });
      if (!metadata || metadata.decimals === undefined || metadata.decimals === null) {
        throw new Error(`Coin metadata missing decimals for ${coinType}`);
      }
      if (!Number.isInteger(metadata.decimals) || metadata.decimals < 0 || metadata.decimals > 18) {
        throw new Error(`Coin metadata decimals out of range for ${coinType}: ${metadata.decimals}`);
      }
      return metadata.decimals;
    };
    const getAllSpotCoins = async (): Promise<Array<{ objectId: string; balance: bigint }>> => {
      const allCoins: Array<{ objectId: string; balance: bigint }> = [];
      let cursor: string | null | undefined = undefined;

      for (;;) {
        const page = await this.client.getCoins({
          owner: address,
          coinType: spotCoinType,
          cursor,
        });

        allCoins.push(
          ...page.data.map((c) => ({
            objectId: c.coinObjectId,
            balance: BigInt(c.balance),
          }))
        );

        if (!page.hasNextPage || !page.nextCursor) {
          break;
        }
        cursor = page.nextCursor;
      }

      return allCoins;
    };

    // Import balance wrapper utilities
    const { getBalanceWrappers, buildBalanceWrapperType, getConditionalCoinObjects } = await import('../services/utils/balance-wrappers');
    const [assetDecimals, stableDecimals] = await Promise.all([
      resolveDecimals(assetType),
      resolveDecimals(stableType),
    ]);

    // Query all in parallel
    const [conditionalCoins, balanceWrappers, spotCoins] = await Promise.all([
      // 1. Query existing conditional coins
      getConditionalCoinObjects(this.client, address, targetConditionalType),

      // 2. Query balance wrappers
      getBalanceWrappers(
        this.client,
        address,
        buildBalanceWrapperType(this.packages.futarchyMarketsPrimitivesPackageId, assetType, stableType),
        marketStateId,
        assetDecimals,
        stableDecimals
      ),

      // 3. Query spot coins
      getAllSpotCoins(),
    ]);

    return {
      conditionalCoins: conditionalCoins.map((c) => ({
        objectId: c.objectId,
        balance: c.balance,
      })),
      balanceWrappers: balanceWrappers.map((w) => ({
        objectId: w.objectId,
        outcomes: w.outcomes.map((o) => ({
          outcomeIndex: o.outcomeIndex,
          asset: o.asset.raw,
          stable: o.stable.raw,
        })),
      })),
      spotCoins,
    };
  }

  // ============================================================================
  // STEP 6: FINALIZE PROPOSAL
  // ============================================================================

  /**
   * Finalize proposal after trading period ends
   *
   * Determines winner via TWAP and auto-recombines winning liquidity to spot pool
   */
  finalizeProposal(config: FinalizeProposalConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyGovernancePackageId } = this.packages;

    if (!config.daoAccountId) {
      throw new Error('daoAccountId is required for finalizeProposal');
    }

    tx.moveCall({
      target: `${futarchyGovernancePackageId}::proposal_lifecycle::end_trading_and_start_execution_window`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        txObject(tx, config.daoAccountId), // account
        tx.sharedObjectRef({
          objectId: this.sharedObjects.mutationRegistryId,
          initialSharedVersion: this.sharedObjects.mutationRegistrySharedVersion,
          mutable: false,
        }), // mutation_registry
        tx.sharedObjectRef({
          objectId: this.sharedObjects.spotPoolMutationRegistryId,
          initialSharedVersion: this.sharedObjects.spotPoolMutationRegistrySharedVersion,
          mutable: false,
        }), // spot_pool_mutation_registry
        tx.sharedObjectRef({
          objectId: this.sharedObjects.marketStateMutationRegistryId,
          initialSharedVersion: this.sharedObjects.marketStateMutationRegistrySharedVersion,
          mutable: false,
        }), // market_state_mutation_registry
        tx.sharedObjectRef({
          objectId: this.sharedObjects.escrowMutationRegistryId,
          initialSharedVersion: this.sharedObjects.escrowMutationRegistrySharedVersion,
          mutable: false,
        }), // escrow_mutation_registry
        txObject(tx, config.proposalId),
        txObject(tx, config.spotPoolId),
        tx.sharedObjectRef({
          objectId: this.sharedObjects.packageRegistryId,
          initialSharedVersion: this.sharedObjects.packageRegistrySharedVersion,
          mutable: false,
        }), // package_registry
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    return {
      transaction: tx,
      description: 'Finalize proposal and determine winner',
    };
  }

  // ============================================================================
  // STEP 6b: EXECUTE WINNING OUTCOME
  // ============================================================================

  /**
   * Execute the winning outcome's actions
   *
   * Use this after finalizeProposal when an ACCEPT outcome wins (enters execution window).
   * Handles all cases:
   * - Normal execution with actions
   * - No-action execution (empty actions array - just finalizes the proposal)
   * - Sponsored proposals that won via TWAP threshold bypass
   *
   * @example
   * ```typescript
   * // After finalizeProposal shows inExecutionWindow: true
   * const executeTx = workflow.executeWinningOutcome({
   *   proposalId,
   *   spotPoolId,
   *   daoAccountId,
   *   assetType,
   *   stableType,
   *   lpType,
   *   actions: [], // or actions from backend
   * });
   * ```
   */
  executeWinningOutcome(config: ExecuteWinningOutcomeConfig): WorkflowTransaction {
    const intentExecutor = new IntentExecutor(this.client, {
      accountActionsPackageId: this.packages.accountActionsPackageId,
      accountProtocolPackageId: this.packages.accountProtocolPackageId,
      futarchyCorePackageId: this.packages.futarchyCorePackageId,
      futarchyActionsPackageId: this.packages.futarchyActionsPackageId,
      futarchyFactoryPackageId: this.packages.futarchyFactoryPackageId,
      futarchyGovernancePackageId: this.packages.futarchyGovernancePackageId,
      futarchyGovernanceActionsPackageId: this.packages.futarchyGovernanceActionsPackageId,
      futarchyOracleActionsPackageId: this.packages.futarchyOracleActionsPackageId || this.packages.futarchyActionsPackageId,
      futarchyMarketsCorePackageId: this.packages.futarchyMarketsCorePackageId,
      packageRegistryId: this.sharedObjects.packageRegistryId,
      mutationRegistryId: this.sharedObjects.mutationRegistryId,
      spotPoolMutationRegistryId: this.sharedObjects.spotPoolMutationRegistryId,
      marketStateMutationRegistryId: this.sharedObjects.marketStateMutationRegistryId,
      escrowMutationRegistryId: this.sharedObjects.escrowMutationRegistryId,
    });

    return intentExecutor.execute({
      intentType: 'proposal',
      accountId: config.daoAccountId,
      senderAddress: config.senderAddress,
      assetType: config.assetType,
      stableType: config.stableType,
      lpType: config.lpType,
      proposalId: config.proposalId,
      spotPoolId: config.spotPoolId,
      actions: config.actions,
      clockId: config.clockId,
    });
  }

  /**
   * Force reject after execution timeout
   *
   * Use when a proposal is in AWAITING_EXECUTION state but the execution deadline
   * has passed. This forces REJECT to win regardless of what TWAP indicated.
   *
   * Anyone can call this - it's a public cleanup function that ensures
   * unexecutable proposals cannot win.
   *
   * @example
   * ```typescript
   * // Keeper bot checking for timed-out proposals
   * const rejectTx = workflow.forceRejectOnTimeout({
   *   daoAccountId,
   *   proposalId,
   *   spotPoolId,
   *   assetType,
   *   stableType,
   *   lpType,
   * });
   * ```
   */
  forceRejectOnTimeout(config: ForceRejectOnTimeoutConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyGovernancePackageId } = this.packages;

    if (!config.daoAccountId) {
      throw new Error('daoAccountId is required for forceRejectOnTimeout');
    }

    tx.moveCall({
      target: `${futarchyGovernancePackageId}::proposal_lifecycle::force_reject_on_timeout`,
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        txObject(tx, config.daoAccountId), // account
        tx.sharedObjectRef({
          objectId: this.sharedObjects.mutationRegistryId,
          initialSharedVersion: this.sharedObjects.mutationRegistrySharedVersion,
          mutable: false,
        }), // mutation_registry
        tx.sharedObjectRef({
          objectId: this.sharedObjects.spotPoolMutationRegistryId,
          initialSharedVersion: this.sharedObjects.spotPoolMutationRegistrySharedVersion,
          mutable: false,
        }), // spot_pool_mutation_registry
        tx.sharedObjectRef({
          objectId: this.sharedObjects.marketStateMutationRegistryId,
          initialSharedVersion: this.sharedObjects.marketStateMutationRegistrySharedVersion,
          mutable: false,
        }), // market_state_mutation_registry
        tx.sharedObjectRef({
          objectId: this.sharedObjects.escrowMutationRegistryId,
          initialSharedVersion: this.sharedObjects.escrowMutationRegistrySharedVersion,
          mutable: false,
        }), // escrow_mutation_registry
        txObject(tx, config.proposalId),
        txObject(tx, config.spotPoolId),
        tx.sharedObjectRef({
          objectId: this.sharedObjects.packageRegistryId,
          initialSharedVersion: this.sharedObjects.packageRegistrySharedVersion,
          mutable: false,
        }), // package_registry
        tx.sharedObjectRef({
          objectId: clockId,
          initialSharedVersion: 1,
          mutable: false,
        }),
      ],
    });

    return {
      transaction: tx,
      description: 'Force reject on execution timeout',
    };
  }

  /**
   * Parse the result of finalizeProposal to determine what happened
   *
   * After calling finalizeProposal and executing the transaction, use this to check:
   * - Did REJECT win immediately? (proposal is fully finalized)
   * - Or did an ACCEPT outcome win? (proposal is in execution window, needs action execution)
   *
   * @param txResult - The transaction result from executing finalizeProposal
   * @param governancePackageId - Optional override for governance package ID
   * @returns Object with finalization status
   */
  parseFinalizationResult(
    txResult: { events?: Array<{ type: string; parsedJson?: unknown }> },
    governancePackageId?: string
  ): {
    /** True if proposal is fully finalized (REJECT won or execution completed) */
    isFinalized: boolean;
    /** True if REJECT won immediately via TWAP */
    rejectWon: boolean;
    /** True if an ACCEPT outcome won and execution window started */
    inExecutionWindow: boolean;
    /** The winning outcome index (0 = reject, 1+ = accept outcomes), only set if finalized */
    winningOutcome?: number;
    /** Whether the proposal was approved (accept outcome won and executed) */
    approved?: boolean;
  } {
    // governancePackageId is available but we match events by type suffix for flexibility
    void governancePackageId;

    // Look for ProposalMarketFinalized event - emitted when proposal is fully finalized
    const finalizedEvent = txResult.events?.find(
      (e) =>
        e.type.includes('::proposal_lifecycle::ProposalMarketFinalized') ||
        e.type.includes('::ptb_executor::ProposalMarketFinalized')
    );

    if (finalizedEvent && finalizedEvent.parsedJson) {
      const data = finalizedEvent.parsedJson as {
        winning_outcome: string | number;
        approved: boolean;
      };
      const winningOutcome =
        typeof data.winning_outcome === 'string'
          ? parseInt(data.winning_outcome, 10)
          : data.winning_outcome;

      return {
        isFinalized: true,
        rejectWon: winningOutcome === 0,
        inExecutionWindow: false,
        winningOutcome,
        approved: data.approved,
      };
    }

    // ACCEPT path: execution window started, winner is available in execution-window events.
    const executionWindowEvent = txResult.events?.find(
      (e) =>
        e.type.includes('::proposal_lifecycle::ExecutionWindowStarted') ||
        e.type.includes('::market_state::ExecutionWindowStartedEvent')
    );

    if (executionWindowEvent && executionWindowEvent.parsedJson) {
      const data = executionWindowEvent.parsedJson as {
        market_winner?: string | number;
        winning_outcome?: string | number;
      };
      const rawWinner =
        data.market_winner !== undefined ? data.market_winner : data.winning_outcome;
      const winningOutcome =
        rawWinner === undefined
          ? undefined
          : typeof rawWinner === 'string'
            ? parseInt(rawWinner, 10)
            : rawWinner;

      return {
        isFinalized: false,
        rejectWon: winningOutcome === 0,
        inExecutionWindow: true,
        winningOutcome,
      };
    }

    // Fallback: no recognizable finalization events found.
    return {
      isFinalized: false,
      rejectWon: false,
      inExecutionWindow: true,
    };
  }

  /**
   * Get the current state and market winner for a proposal in execution window
   *
   * Use this after parseFinalizationResult returns inExecutionWindow: true
   * to determine which outcome won according to TWAP.
   *
   * @param client - SuiClient instance
   * @param proposalId - The proposal object ID
   * @returns Proposal state info including market winner
   */
  async getProposalExecutionState(
    client: SuiClient,
    proposalId: string
  ): Promise<{
    state: number;
    stateName: 'premarket' | 'review' | 'trading' | 'awaiting_execution' | 'finalized';
    /** The market winner according to TWAP (0 = reject, 1+ = accept outcomes) */
    marketWinner?: number;
    /** TWAP prices for each outcome */
    twapPrices?: string[];
  }> {
    const obj = await client.getObject({
      id: proposalId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    const fields = (obj.data.content as { fields: Record<string, unknown> }).fields as {
      state: number | string;
      twap_prices?: string[];
      outcome_data?: { fields: { winning_outcome?: string | number } };
    };

    const state = typeof fields.state === 'string' ? parseInt(fields.state, 10) : fields.state;
    const stateNames = ['premarket', 'review', 'trading', 'awaiting_execution', 'finalized'] as const;

    // If in awaiting_execution, the TWAP prices indicate which outcome won
    // The accept outcome with the highest TWAP wins, provided it exceeds reject's TWAP (index 0)
    // This handles multi-outcome proposals (3+ outcomes), not just 2-outcome
    let marketWinner: number | undefined;
    if (state === 3 && fields.twap_prices && fields.twap_prices.length > 0) {
      const prices = fields.twap_prices.map((p) => BigInt(p));
      if (prices.length >= 2) {
        const rejectPrice = prices[0];
        // Find the accept outcome (index >= 1) with the highest TWAP
        let bestAcceptIndex = 1;
        let bestAcceptPrice = prices[1];
        for (let i = 2; i < prices.length; i++) {
          if (prices[i] > bestAcceptPrice) {
            bestAcceptPrice = prices[i];
            bestAcceptIndex = i;
          }
        }
        // Winner is the best accept outcome if its TWAP exceeds reject's, otherwise reject wins
        marketWinner = bestAcceptPrice > rejectPrice ? bestAcceptIndex : 0;
      }
    }

    return {
      state,
      stateName: stateNames[state] || 'premarket',
      marketWinner,
      twapPrices: fields.twap_prices,
    };
  }

  // ============================================================================
  // STEP 7: REDEEM CONDITIONAL TOKENS
  // ============================================================================

  /**
   * Redeem winning conditional tokens for underlying assets
   */
  redeemConditionalTokens(
    proposalId: ObjectIdOrRef,
    escrowId: ObjectIdOrRef,
    assetType: string,
    stableType: string,
    conditionalCoinId: string,
    conditionalCoinType: string,
    outcomeIndex: number,
    isAsset: boolean,
    recipient: string,
    clockId?: string,
    spotPoolId?: ObjectIdOrRef,
    lpType?: string
  ): WorkflowTransaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    const { futarchyMarketsOperationsPackageId } = this.packages;
    const useWrappedEscrow = spotPoolId !== undefined && lpType !== undefined;
    const spotPoolMutationRegistryRef = useWrappedEscrow
      ? tx.sharedObjectRef({
          objectId: this.sharedObjects.spotPoolMutationRegistryId,
          initialSharedVersion: this.sharedObjects.spotPoolMutationRegistrySharedVersion,
          mutable: false,
        })
      : undefined;
    const redeemedCoin = useWrappedEscrow
      ? tx.moveCall({
          target: isAsset
            ? `${futarchyMarketsOperationsPackageId}::liquidity_interact::redeem_conditional_asset_with_wrapped_escrow`
            : `${futarchyMarketsOperationsPackageId}::liquidity_interact::redeem_conditional_stable_with_wrapped_escrow`,
          typeArguments: [assetType, stableType, lpType!, conditionalCoinType],
          arguments: [
            txObject(tx, proposalId),
            txObject(tx, spotPoolId!),
            tx.object(conditionalCoinId),
            tx.pure.u64(outcomeIndex),
            spotPoolMutationRegistryRef!,
            tx.sharedObjectRef({
              objectId: clock,
              initialSharedVersion: 1,
              mutable: false,
            }),
          ],
        })
      : tx.moveCall({
          target: isAsset
            ? `${futarchyMarketsOperationsPackageId}::liquidity_interact::redeem_conditional_asset`
            : `${futarchyMarketsOperationsPackageId}::liquidity_interact::redeem_conditional_stable`,
          typeArguments: [assetType, stableType, conditionalCoinType],
          arguments: [
            txObject(tx, proposalId),
            txObject(tx, escrowId),
            tx.object(conditionalCoinId),
            tx.pure.u64(outcomeIndex),
            tx.sharedObjectRef({
              objectId: clock,
              initialSharedVersion: 1,
              mutable: false,
            }),
          ],
        });

    tx.transferObjects([redeemedCoin], tx.pure.address(recipient));

    return {
      transaction: tx,
      description: `Redeem conditional ${isAsset ? 'asset' : 'stable'} tokens`,
    };
  }

  // ============================================================================
  // MAINTENANCE: JANITOR OPERATIONS
  // ============================================================================

  /**
   * Clean up expired intents and earn storage rebates
   *
   * Anyone can call this to clean up expired governance intents. The caller
   * receives storage rebates as a reward, making this a public good that's
   * economically incentivized.
   *
   * @param daoAccountId - The DAO account to clean up
   * @param maxToClean - Maximum intents to clean (up to 20)
   * @param clockId - Optional clock object ID
   *
   * @example
   * ```typescript
   * // Bot/keeper can call this to earn storage rebates
   * const cleanupTx = workflow.cleanupExpiredIntents(
   *   daoAccountId,
   *   10 // Clean up to 10 expired intents
   * );
   * ```
   */
  cleanupExpiredIntents(
    daoAccountId: string,
    maxToClean: number,
    clockId?: string
  ): WorkflowTransaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    const { futarchyGovernanceActionsPackageId } = this.packages;
    const { packageRegistryId } = this.sharedObjects;

    tx.moveCall({
      target: `${futarchyGovernanceActionsPackageId}::intent_janitor::cleanup_expired_futarchy_intents`,
      arguments: [
        tx.object(daoAccountId),
        tx.object(packageRegistryId),
        tx.pure.u64(Math.min(maxToClean, 20)), // Cap at 20 per Move contract
        tx.object(clock),
      ],
    });

    return {
      transaction: tx,
      description: `Clean up to ${maxToClean} expired intents (with storage rebate reward)`,
    };
  }

  /**
   * Check if DAO maintenance is needed
   *
   * Emits a MaintenanceNeeded event if the DAO has more than 10 expired intents.
   * This is a view function used by bots/keepers to determine when cleanup is profitable.
   *
   * @param daoAccountId - The DAO account to check
   * @param clockId - Optional clock object ID
   */
  checkMaintenanceNeeded(
    daoAccountId: string,
    clockId?: string
  ): WorkflowTransaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    const { futarchyGovernanceActionsPackageId } = this.packages;
    const { packageRegistryId } = this.sharedObjects;

    tx.moveCall({
      target: `${futarchyGovernanceActionsPackageId}::intent_janitor::check_maintenance_needed`,
      arguments: [
        tx.object(daoAccountId),
        tx.object(packageRegistryId),
        tx.object(clock),
      ],
    });

    return {
      transaction: tx,
      description: 'Check if DAO intent cleanup is needed',
    };
  }
}
