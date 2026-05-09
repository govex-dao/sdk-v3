/**
 * Launchpad Workflow - High-level orchestrator for token launches
 *
 * Provides simple, user-friendly API for the entire launchpad lifecycle.
 *
 * RAISE CREATION (single PTB):
 * 1. create_raise_with_account_setup (returns UnsharedRaise)
 * 2. stage_success_intent (on UnsharedRaise)
 * 3. stage_failure_intent (on UnsharedRaise)
 * 4. lock_and_share_raise (consumes UnsharedRaise)
 *
 * SALE PERIOD:
 * 5. Contribute directly, buy from a bonding curve, or submit a CCA bid
 *
 * RAISE COMPLETION:
 * Tx1: completeRaise() - settle + create_completion_intents
 * Tx2+: execute staged intents on the shared Account
 *       (Use IntentExecutor from intent-executor.ts)
 *
 * POST-COMPLETION:
 * 7. Claim tokens
 *
 * @module workflows/launchpad-workflow
 */

import { Transaction, Inputs } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { SuiClient } from '@mysten/sui/client';
import {
  CreateRaiseConfig,
  StageActionsConfig,
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
  isOwnedObjectRef,
  isTxSharedObjectRef,
} from './types';
import type { IntentExecutorPackages } from './intent-executor';
import { assertProtectiveBidActionOrdering } from './action-dependencies';

// SDK defaults. These mirror the "normal" launch configuration:
// - 20% of TOTAL raise goes to AMM bootstrap liquidity
// - 80% of EXCESS (above min) goes to the protective bid wall
const DEFAULT_AMM_PERCENT_OF_RAISE_BPS = 2000n;
const DEFAULT_BID_WALL_PERCENT_OF_EXCESS_BPS = 8000n;

/**
 * Helper to convert ObjectIdOrRef to transaction object argument.
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
 * Package IDs required for launchpad workflow
 */
export interface LaunchpadWorkflowPackages extends IntentExecutorPackages {
  oneShotUtilsPackageId?: string;
}

/**
 * Shared object references
 */
export interface LaunchpadWorkflowSharedObjects {
  factoryId: string;
  factorySharedVersion: number | string;
  packageRegistryId: string;
  packageRegistrySharedVersion: number | string;
  feeManagerId: string;
  feeManagerSharedVersion: number | string;
}

/**
 * Launchpad Workflow - Complete token launch orchestration
 *
 * @example
 * ```typescript
 * const workflow = new LaunchpadWorkflow(client, packages, sharedObjects);
 *
 * // Create a raise
 * const createTx = workflow.createRaise({
 *   creator: '0xabc...',
 *   assetType: '0x123::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   treasuryCap: '0xCAP',
 *   tokensForSale: 1_000_000n,
 *   minRaiseAmount: 100_000_000n,
 *   maxRaiseAmount: LaunchpadWorkflow.UNLIMITED_CAP,
 *   // Enables admin-triggered end_raise_early after min is met.
 *   // Reaching maxRaiseAmount auto-closes the sale on-chain.
 *   allowEarlyCompletion: true,
 *   description: 'My token launch',
 *   launchpadFee: 100n,
 * });
 *
 * // Stage success actions
 * const stageTx = workflow.stageActions({
 *   raiseId: '0x...',
 *   assetType: '0x123::coin::COIN',
 *   stableType: '0x2::sui::SUI',
 *   outcome: 'success',
 *   actions: [
 *     {
 *       type: 'create_stream',
 *       vaultName: 'treasury',
 *       beneficiary: '0xABC',
 *       amountPerIteration: 50_000_000n,
 *       startTime: Date.now() + 300_000, // or null to use execution time
 *       iterationsTotal: 12n,
 *       iterationPeriodMs: 2_592_000_000n,
 *       // Note: All streams are always cancellable by DAO governance
 *     },
 *     {
 *       type: 'create_pool_with_mint',
 *       stableResourceName: 'amm_stable',
 *       mintCapResourceName: 'asset_mint_cap',
 *       // assetAmount omitted = auto-calculate from launchpad_initial_price
 *       feeBps: 150,
 *       lpType: '0x789::lp::LP',
 *       lpTreasuryCapId: '0x...',
 *       lpCurrencyId: '0x...',
 *     },
 *   ],
 * });
 * ```
 */
export class LaunchpadWorkflow {
  private packages: LaunchpadWorkflowPackages;
  private sharedObjects: LaunchpadWorkflowSharedObjects;

  /** Unlimited max raise constant (u64::MAX) */
  static readonly UNLIMITED_CAP = 18446744073709551615n;

  constructor(
    _client: SuiClient, // Reserved for future async operations
    packages: LaunchpadWorkflowPackages,
    sharedObjects: LaunchpadWorkflowSharedObjects
  ) {
    this.packages = packages;
    this.sharedObjects = sharedObjects;
  }

  // ============================================================================
  // STEP 1: CREATE RAISE (ATOMIC - includes action staging and locking)
  // ============================================================================

  /**
   * Create a raise with staged actions in a single atomic transaction.
   *
   * This builds a single PTB that:
   * 1. create_raise_with_account_setup → returns UnsharedRaise
   * 2. stage_success_intent → stages success actions on UnsharedRaise
   * 3. stage_failure_intent → stages failure actions on UnsharedRaise
   * 4. lock_and_share_raise → locks intents and shares the Raise
   *
   * All steps happen atomically - if any fails, everything rolls back.
   *
   * Safety note:
   * - Preferred path: use standard launchpad templates and include explicit
   *   failure actions that return caps to the creator.
   * - Custom success/failure action sets are advanced usage. Before mainnet,
   *   run localnet/testnet simulation and/or review with the protocol dev team.
   *
   * @param config - Raise configuration
   * @param successActions - Actions to execute on raise success
   * @param failureActions - Actions to execute on raise failure
   */
  createRaise(
    config: CreateRaiseConfig,
    successActions: ActionConfig[] = [],
    failureActions: ActionConfig[] = []
  ): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const ammPercentOfRaiseBps =
      config.ammPercentOfRaiseBps ?? DEFAULT_AMM_PERCENT_OF_RAISE_BPS;
    const bidWallPercentOfExcessBps =
      config.bidWallPercentOfExcessBps ?? DEFAULT_BID_WALL_PERCENT_OF_EXCESS_BPS;

    const { accountActionsPackageId, futarchyFactoryPackageId } = this.packages;
    const {
      factoryId,
      factorySharedVersion,
      feeManagerId,
      feeManagerSharedVersion,
      packageRegistryId,
      packageRegistrySharedVersion,
    } = this.sharedObjects;

    // Validate daoName is ASCII (Move's std::ascii::String rejects non-ASCII)
    if (config.daoName && /[^\x00-\x7F]/.test(config.daoName)) {
      throw new Error(`daoName must contain only ASCII characters, got: "${config.daoName}"`);
    }

    // Split launchpad fee from gas
    const [launchpadFeeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.launchpadFee)]);

    // Build Option<MetadataCap<AssetType>> argument
    const metadataCapType = `0x2::coin_registry::MetadataCap<${config.assetType}>`;
    const metadataCapOption = tx.moveCall({
      target: '0x1::option::some',
      typeArguments: [metadataCapType],
      arguments: [tx.object(config.metadataCap)],
    });

    // 1. Create raise (returns UnsharedRaise hot potato).
    // This wrapper performs account setup + create_raise atomically.
    const unsharedRaise = tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::create_raise_with_account_setup`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.sharedObjectRef({
          objectId: factoryId,
          initialSharedVersion: factorySharedVersion,
          mutable: true,
        }),
        tx.sharedObjectRef({
          objectId: feeManagerId,
          initialSharedVersion: feeManagerSharedVersion,
          mutable: true,
        }),
        tx.sharedObjectRef({
          objectId: packageRegistryId,
          initialSharedVersion: packageRegistrySharedVersion,
          mutable: false,
        }),
        tx.object(config.treasuryCap),
        metadataCapOption,
        tx.object(config.assetCurrency),
        tx.pure.bool(config.useAllowedLegacyAsset === true),
        tx.object(config.stableCurrency),
        tx.pure.u64(config.tokensForSale),
        tx.pure.string(config.daoName),
        tx.pure.address(config.creator),
        tx.pure.string(config.affiliateId || ''),
        tx.pure.u64(config.minRaiseAmount),
        tx.pure.u64(config.maxRaiseAmount),
        tx.pure.option('u64', config.startDelayMs ?? null),
        tx.pure.u64(config.durationMs),
        tx.pure.bool(config.allowEarlyCompletion),
        tx.pure.string(config.description),
        tx.pure.vector('string', config.metadataKeys || []),
        tx.pure.vector('string', config.metadataValues || []),
        tx.pure.u64(ammPercentOfRaiseBps),
        tx.pure.u64(bidWallPercentOfExcessBps),
        launchpadFeeCoin,
        tx.object(clockId),
      ],
    });

    // 2. Auto-insert common launchpad helper actions.
    // On successful raise completion, Launchpad deposits stable to:
    // - 'treasury' (remainder)
    // - 'amm_liquidity' (total * ammPercentOfRaiseBps)
    // - 'bid_wall_funds' (excess * bidWallPercentOfExcessBps)
    //
    // For convenience, the SDK can auto-insert helper actions immediately before
    // the consuming init action:
    // - `spend` for create_pool_with_mint
    // - `mint_currency_admin_cap` for create_pool_with_mint
    //
    // Protective bids are stricter: callers must stage an explicit
    // `mint_vault_admin_cap` action before `create_protective_bid`.
    const augmentedSuccessActions: ActionConfig[] = [];
    const hasPriorSpendForResource = (resourceName: string): boolean =>
      augmentedSuccessActions.some(
        (a) => a.type === 'spend' && a.resourceName === resourceName
      );
    const hasPriorMintCapForResource = (resourceName: string): boolean =>
      augmentedSuccessActions.some(
        (a) => a.type === 'mint_currency_admin_cap' && a.resourceName === resourceName
      );
    for (const action of successActions) {
      if (action.type === 'create_pool_with_mint') {
        if (!hasPriorSpendForResource(action.stableResourceName)) {
          if (ammPercentOfRaiseBps > 0n) {
            augmentedSuccessActions.push({
              type: 'spend' as const,
              coinType: config.stableType,
              vaultName: 'amm_liquidity',
              amount: 0n, // Ignored when spendAll=true
              spendAll: true,
              resourceName: action.stableResourceName,
            });
          } else {
            console.warn(
              '[LaunchpadWorkflow] create_pool_with_mint found but ammPercentOfRaiseBps is 0 and no prior spend action provides ' +
                `"${action.stableResourceName}". Pool creation will likely fail unless you add an explicit spend action.`
            );
          }
        }
        const mintCapResourceName = action.mintCapResourceName;
        if (!hasPriorMintCapForResource(mintCapResourceName)) {
          augmentedSuccessActions.push({
            type: 'mint_currency_admin_cap',
            coinType: action.assetType || config.assetType,
            resourceName: mintCapResourceName,
          });
        }
      }

      augmentedSuccessActions.push(action);
    }

    assertProtectiveBidActionOrdering(
      augmentedSuccessActions,
      'launchpad success actions'
    );

    // Note: allocating excess to the bid wall is independent from actually creating a protective bid.
    // Creating the bid wall requires an explicit init action (create_protective_bid)
    // and an earlier mint_vault_admin_cap action that provides the VaultAdminCap resource.

    // 3. Stage success actions.
    // DepositRaiseFunds is mandatory and must be staged first for successful raises.
    const successBuilder = tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::new_success_builder`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [unsharedRaise],
    });
    const successRaiseId = tx.moveCall({
      target: `${accountActionsPackageId}::action_spec_builder::source_id`,
      arguments: [successBuilder],
    });
    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::add_deposit_raise_funds_spec`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [successBuilder, successRaiseId],
    });

    // Add user success actions after the mandatory deposit action
    for (const action of augmentedSuccessActions) {
      this.addActionToBuilder(tx, successBuilder, action, {
        assetType: config.assetType,
        stableType: config.stableType,
      } as StageActionsConfig);
    }

    // Stage success intent on UnsharedRaise
    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::stage_success_intent`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        unsharedRaise,
        tx.sharedObjectRef({
          objectId: packageRegistryId,
          initialSharedVersion: packageRegistrySharedVersion,
          mutable: false,
        }),
        successBuilder,
        tx.object(clockId),
      ],
    });

    // 4. Stage failure actions (if any)
    if (failureActions.length > 0) {
      assertProtectiveBidActionOrdering(
        failureActions,
        'launchpad failure actions'
      );

      // Create action spec builder with correct raise ID for event emission
      // Uses helper function that extracts ID from UnsharedRaise internally
      const failureBuilder = tx.moveCall({
        target: `${futarchyFactoryPackageId}::launchpad::new_failure_builder`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [unsharedRaise],
      });

      // Add each action to the builder
      for (const action of failureActions) {
        this.addActionToBuilder(tx, failureBuilder, action, {
          assetType: config.assetType,
          stableType: config.stableType,
        } as StageActionsConfig);
      }

      // Stage failure intent on UnsharedRaise
      tx.moveCall({
        target: `${futarchyFactoryPackageId}::launchpad::stage_failure_intent`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [
          unsharedRaise,
          tx.sharedObjectRef({
            objectId: packageRegistryId,
            initialSharedVersion: packageRegistrySharedVersion,
            mutable: false,
          }),
          failureBuilder,
          tx.object(clockId),
        ],
      });
    }

    // 4b. Add reservations (before lock)
    if (config.reservations && config.reservations.length > 0) {
      for (const reservation of config.reservations) {
        tx.moveCall({
          target: `${futarchyFactoryPackageId}::launchpad_reservations::add_reservation`,
          typeArguments: [config.assetType, config.stableType],
          arguments: [
            unsharedRaise,
            tx.pure.address(reservation.wallet),
            tx.pure.u64(reservation.amount),
          ],
        });
      }
    }

    // 4c. Optional bonding curve channel (before lock)
    if (config.bondingCurve) {
      tx.moveCall({
        target: `${futarchyFactoryPackageId}::launchpad_bonding_curve::configure`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [
          unsharedRaise,
          tx.pure.u64(config.bondingCurve.tokenBudget),
          tx.pure.u64(config.bondingCurve.startPrice),
          tx.pure.u64(config.bondingCurve.endPrice),
        ],
      });
    }

    // 4d. Optional continuous-clearing auction channel (before lock)
    if (config.continuousClearingAuction) {
      tx.moveCall({
        target: `${futarchyFactoryPackageId}::launchpad_cca::configure`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [
          unsharedRaise,
          tx.pure.u64(config.continuousClearingAuction.tokenBudget),
          tx.pure.u64(config.continuousClearingAuction.maxPrice),
          tx.pure.u64(config.continuousClearingAuction.floorPrice),
        ],
      });
    }

    // 5. Lock intents and share raise (consumes UnsharedRaise)
    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::lock_and_share_raise`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [unsharedRaise],
    });

    return {
      transaction: tx,
      description: `Create raise with ${augmentedSuccessActions.length + 1} success and ${failureActions.length} failure action(s)`,
    };
  }

  // ============================================================================
  // NOTE: Stage actions is now integrated into createRaise (atomic flow)
  // The old separate stageActions method has been removed.
  // ============================================================================

  /**
   * Add an action configuration to the builder
   * Type arguments are now required for type-safe staging
   */
  private addActionToBuilder(
    tx: Transaction,
    builder: ReturnType<Transaction['moveCall']>,
    action: ActionConfig,
    config: StageActionsConfig
  ): void {
    const { accountActionsPackageId, futarchyActionsPackageId } = this.packages;

    // Helper to get coin type - uses action's coinType if specified, otherwise falls back to config
    const getCoinType = (actionCoinType?: string, defaultType?: string): string => {
      const coinType = actionCoinType || defaultType;
      if (!coinType) {
        throw new Error('coinType is required for type-safe staging');
      }
      return coinType;
    };

    switch (action.type) {
      case 'create_stream':
        // Note: All streams are always cancellable by DAO governance
        // coinType determines which coin the stream will pay out
        tx.moveCall({
          target: `${accountActionsPackageId}::stream_init_actions::add_create_stream_spec`,
          typeArguments: [getCoinType(action.coinType, config.stableType)],
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
          const coinType = getCoinType(action.coinType, config.stableType);
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
            action.assetType || config.assetType,
            action.stableType || config.stableType,
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

      case 'create_protective_bid':
        // Pool ID is read from FutarchyConfig.spot_pool_id at execution (not staged)
        tx.moveCall({
          target: `${futarchyActionsPackageId}::protective_bid_init_actions::add_create_protective_bid_spec`,
          typeArguments: [
            action.assetType || config.assetType,
            action.stableType || config.stableType,
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

      case 'create_protective_ask':
        // Pool ID is read from FutarchyConfig.spot_pool_id at execution (not staged)
        tx.moveCall({
          target: `${futarchyActionsPackageId}::protective_ask_init_actions::add_create_protective_ask_spec`,
          typeArguments: [
            action.assetType || config.assetType,
            action.stableType || config.stableType,
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

      case 'remove_treasury_cap_to_resources':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_remove_treasury_cap_to_resources_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [builder, tx.pure.id(action.expectedCapId), tx.pure.string(action.resourceName)],
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
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [builder, tx.pure.string(action.resourceName)],
        });
        break;

      case 'approve_coin_type':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_approve_coin_type_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [builder, tx.pure.string(action.vaultName)],
        });
        break;

      case 'remove_approved_coin_type':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_remove_approved_coin_type_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
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

      case 'remove_metadata_cap_to_resources':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_remove_metadata_cap_to_resources_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [builder, tx.pure.id(action.expectedCapId), tx.pure.string(action.resourceName)],
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

      case 'mint':
        // Mint tokens and store in executable_resources for subsequent actions
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_mint_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [
            builder,
            tx.pure.u64(action.amount),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'burn':
        // Burn tokens from executable_resources
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_burn_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
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
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [
            builder,
            tx.pure.string(action.vaultName),
            tx.pure.u64(action.amount),
            tx.pure.string(action.resourceName),
          ],
        });
        break;

      case 'spend':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_spend_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
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
          typeArguments: [getCoinType(action.coinType, config.assetType)],
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
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [builder, tx.pure.string(action.resourceName)],
        });
        break;

      case 'memo':
        tx.moveCall({
          target: `${accountActionsPackageId}::memo_init_actions::add_emit_memo_spec`,
          arguments: [builder, tx.pure.string(action.message)],
        });
        break;

      case 'cancel_stream':
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_cancel_stream_spec`,
          typeArguments: [getCoinType(action.coinType, config.stableType)],
          arguments: [
            builder,
            tx.pure.string(action.vaultName),
            tx.pure.address(action.streamId),
          ],
        });
        break;

      case 'deposit_from_resources':
        // Deposit coins from executable_resources into specified vault
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_deposit_from_resources_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [builder, tx.pure.string(action.vaultName), tx.pure.string(action.resourceName)],
        });
        break;

      case 'deposit_object_from_resources':
        // Deposit Coin<T> objects from executable_resources into specified vault
        tx.moveCall({
          target: `${accountActionsPackageId}::vault_init_actions::add_deposit_object_from_resources_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [builder, tx.pure.string(action.vaultName), tx.pure.string(action.resourceName)],
        });
        break;

      case 'update_currency':
        tx.moveCall({
          target: `${accountActionsPackageId}::currency_init_actions::add_update_spec`,
          typeArguments: [getCoinType(action.coinType, config.assetType)],
          arguments: [
            builder,
            tx.pure.option('string', action.symbol ?? null),
            tx.pure.option('string', action.name ?? null),
            tx.pure.option('string', action.description ?? null),
            tx.pure.option('string', action.iconUrl ?? null),
          ],
        });
        break;

      case 'create_dissolution_capability':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::dissolution_init_actions::add_create_dissolution_capability_spec`,
          typeArguments: [action.assetType || config.assetType],
          arguments: [builder],
        });
        break;

      case 'update_sponsorship_config':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::futarchy_config_init_actions::add_update_sponsorship_config_spec`,
          arguments: [
            builder,
            tx.pure.option('bool', action.enabled ?? null),
          ],
        });
        break;

      case 'set_quotas':
        tx.moveCall({
          target: `${futarchyActionsPackageId}::quota_init_actions::add_set_quotas_spec`,
          arguments: [
            builder,
            tx.pure.vector('address', action.users),
            tx.pure.u64(action.periodMs),
            tx.pure.u64(action.feelessProposalAmount),
            tx.pure.u64(action.sponsorAmount),
          ],
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
        tx.moveCall({
          target: `${accountActionsPackageId}::package_upgrade_init_actions::add_unlock_upgrade_cap_spec`,
          arguments: [
            builder,
            tx.pure.string(action.name),
            tx.pure.string(action.resourceName ?? 'upgrade_cap'),
            tx.pure.id(action.expectedCapId),
          ],
        });
        break;

      default:
        throw new Error(`Unknown action type: ${(action as { type?: string }).type}`);
    }
  }

  // ============================================================================
  // NOTE: Lock intents is now integrated into createRaise (atomic flow)
  // The old separate lockIntentsAndStart method has been removed.
  // ============================================================================

  // ============================================================================
  // STEP 2: BUY / BID
  // ============================================================================

  /**
   * Contribute stable coins to a public FCFS raise.
   */
  contribute(config: ContributeConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';
    const { futarchyFactoryPackageId } = this.packages;

    const coinObjects = config.stableCoins.map((id) => tx.object(id));
    const [firstCoin, ...restCoins] = coinObjects;
    if (!firstCoin) {
      throw new Error('At least one stable coin object is required to contribute');
    }

    if (restCoins.length > 0) {
      tx.mergeCoins(firstCoin, restCoins);
    }

    const [paymentCoin] = tx.splitCoins(firstCoin, [tx.pure.u64(config.amount)]);
    const [protocolFeeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.protocolFee)]);

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::contribute`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.raiseId),
        txObject(tx, config.feeManagerId),
        paymentCoin,
        protocolFeeCoin,
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: `Contribute ${config.amount} to raise`,
    };
  }

  /**
   * Accept a reserved allocation first, then contribute any remaining amount
   * publicly in one PTB. If both paths are used, both on-chain calls charge the
   * launchpad bid fee, so the PTB splits two protocol fee coins from gas.
   */
  contributeWithReservation(config: ContributeWithReservationConfig): WorkflowTransaction {
    if (config.amount <= 0n) {
      throw new Error('amount must be greater than zero');
    }
    if (config.reservationAmount < 0n) {
      throw new Error('reservationAmount cannot be negative');
    }

    const tx = new Transaction();
    const clockId = config.clockId || '0x6';
    const { futarchyFactoryPackageId } = this.packages;

    const reservationAmount =
      config.reservationAmount > config.amount ? config.amount : config.reservationAmount;
    const publicAmount = config.amount - reservationAmount;

    const coinObjects = config.stableCoins.map((id) => tx.object(id));
    const [firstCoin, ...restCoins] = coinObjects;
    if (!firstCoin) {
      throw new Error('At least one stable coin object is required to contribute');
    }

    if (restCoins.length > 0) {
      tx.mergeCoins(firstCoin, restCoins);
    }

    let reservationPayment;
    let publicPayment;
    if (reservationAmount > 0n && publicAmount > 0n) {
      [reservationPayment, publicPayment] = tx.splitCoins(firstCoin, [
        tx.pure.u64(reservationAmount),
        tx.pure.u64(publicAmount),
      ]);
    } else if (reservationAmount > 0n) {
      [reservationPayment] = tx.splitCoins(firstCoin, [tx.pure.u64(reservationAmount)]);
    } else {
      [publicPayment] = tx.splitCoins(firstCoin, [tx.pure.u64(publicAmount)]);
    }

    let reservationFee;
    let publicFee;
    if (reservationAmount > 0n && publicAmount > 0n) {
      [reservationFee, publicFee] = tx.splitCoins(tx.gas, [
        tx.pure.u64(config.protocolFee),
        tx.pure.u64(config.protocolFee),
      ]);
    } else if (reservationAmount > 0n) {
      [reservationFee] = tx.splitCoins(tx.gas, [tx.pure.u64(config.protocolFee)]);
    } else {
      [publicFee] = tx.splitCoins(tx.gas, [tx.pure.u64(config.protocolFee)]);
    }

    if (reservationAmount > 0n) {
      tx.moveCall({
        target: `${futarchyFactoryPackageId}::launchpad_reservations::accept_reservation`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [
          txObject(tx, config.raiseId),
          txObject(tx, config.feeManagerId),
          reservationPayment!,
          reservationFee!,
          tx.object(clockId),
        ],
      });
    }

    if (publicAmount > 0n) {
      tx.moveCall({
        target: `${futarchyFactoryPackageId}::launchpad::contribute`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [
          txObject(tx, config.raiseId),
          txObject(tx, config.feeManagerId),
          publicPayment!,
          publicFee!,
          tx.object(clockId),
        ],
      });
    }

    return {
      transaction: tx,
      description: `Contribute ${config.amount} to raise with reservation routing`,
    };
  }

  /**
   * Buy an exact token amount from the bonding curve channel.
   */
  buyFromBondingCurve(config: BondingCurveBuyConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';
    const { futarchyFactoryPackageId } = this.packages;

    const coinObjects = config.stableCoins.map((id) => tx.object(id));
    const [firstCoin, ...restCoins] = coinObjects;

    if (restCoins.length > 0) {
      tx.mergeCoins(firstCoin, restCoins);
    }

    const [paymentCoin] = tx.splitCoins(firstCoin, [tx.pure.u64(config.maxStableAmount)]);
    const [protocolFeeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.protocolFee)]);

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad_bonding_curve::buy_tokens`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.raiseId),
        txObject(tx, config.feeManagerId),
        paymentCoin,
        protocolFeeCoin,
        tx.pure.u64(config.tokenAmount),
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: `Buy ${config.tokenAmount} from bonding curve`,
    };
  }

  /**
   * Submit stable-denominated CCA demand at a max price.
   */
  submitCCABid(config: CCABidConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';
    const { futarchyFactoryPackageId } = this.packages;

    const coinObjects = config.stableCoins.map((id) => tx.object(id));
    const [firstCoin, ...restCoins] = coinObjects;

    if (restCoins.length > 0) {
      tx.mergeCoins(firstCoin, restCoins);
    }

    const [paymentCoin] = tx.splitCoins(firstCoin, [tx.pure.u64(config.stableAmount)]);
    const [protocolFeeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.protocolFee)]);

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad_cca::submit_bid`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.raiseId),
        txObject(tx, config.feeManagerId),
        paymentCoin,
        protocolFeeCoin,
        tx.pure.u64(config.maxPrice),
        tx.pure.u64(config.stableAmount),
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: `Submit CCA bid for ${config.stableAmount}`,
    };
  }

  /**
   * Checkpoint the live CCA clearing price.
   */
  checkpointCCA(config: CCACheckpointConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';
    const { futarchyFactoryPackageId } = this.packages;

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad_cca::checkpoint`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.raiseId),
        tx.pure.vector('u64', config.priceTicksDesc),
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: `Checkpoint CCA`,
    };
  }

  /**
   * Finalize CCA after the raise deadline.
   */
  finalizeCCA(config: CCAFinalizeConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';
    const { futarchyFactoryPackageId } = this.packages;

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad_cca::finalize_auction`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.raiseId),
        tx.pure.vector('u64', config.priceTicksDesc),
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: `Finalize CCA`,
    };
  }

  /**
   * Settle a finalized CCA bid. If bidder is omitted, settles sender's bid.
   */
  settleCCABid(config: CCASettleBidConfig): WorkflowTransaction {
    const tx = new Transaction();
    const { futarchyFactoryPackageId } = this.packages;

    if (config.bidder) {
      tx.moveCall({
        target: `${futarchyFactoryPackageId}::launchpad_cca::settle_bid_for`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [
          txObject(tx, config.raiseId),
          tx.pure.address(config.bidder),
        ],
      });
    } else {
      tx.moveCall({
        target: `${futarchyFactoryPackageId}::launchpad_cca::settle_bid`,
        typeArguments: [config.assetType, config.stableType],
        arguments: [
          txObject(tx, config.raiseId),
        ],
      });
    }

    return {
      transaction: tx,
      description: config.bidder
        ? `Settle CCA bid for ${config.bidder}`
        : `Settle CCA bid`,
    };
  }

  /**
   * Cancel sender's out-of-range CCA bid.
   */
  cancelCCABid(config: CCACancelBidConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';
    const { futarchyFactoryPackageId } = this.packages;

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad_cca::cancel_bid`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.raiseId),
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: `Cancel CCA bid`,
    };
  }

  // ============================================================================
  // STEP 2b: ACCEPT RESERVATION
  // ============================================================================

  /**
   * Accept a reserved allocation on a raise.
   * The caller must be the reserved wallet.
   * Payment must be >= reserved amount; excess is refunded on-chain.
   */
  acceptReservation(config: AcceptReservationConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyFactoryPackageId } = this.packages;

    // Merge coins if multiple provided
    const coinObjects = config.stableCoins.map((id) => tx.object(id));
    const [firstCoin, ...restCoins] = coinObjects;

    if (restCoins.length > 0) {
      tx.mergeCoins(firstCoin, restCoins);
    }

    // Split payment and protocol fee
    const [paymentCoin] = tx.splitCoins(firstCoin, [tx.pure.u64(config.stableAmount)]);
    const [protocolFeeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(config.protocolFee)]);

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad_reservations::accept_reservation`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.raiseId),
        txObject(tx, config.feeManagerId),
        paymentCoin,
        protocolFeeCoin,
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: `Accept reservation on raise`,
    };
  }

  // ============================================================================
  // STEP 3: COMPLETE RAISE (SETTLE + CREATE COMPLETION INTENTS)
  // ============================================================================

  /**
   * Complete a raise by settling and creating completion intents on the DAO Account.
   *
   * This performs:
   * 1. settle_raise
   * 2. create_completion_intents
   *
   * Execute the resulting intent(s) in a follow-up PTB using IntentExecutor.
   */
  completeRaise(config: CompleteRaiseConfig): WorkflowTransaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    const { futarchyFactoryPackageId } = this.packages;
    const { packageRegistryId } = this.sharedObjects;

    // 1. Settle raise (fee params stored in raise at creation)
    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::settle_raise`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.raiseId),
        tx.object(clockId),
      ],
    });

    // 2. Create completion intents on the pre-linked shared Account
    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::create_completion_intents`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        txObject(tx, config.raiseId),
        txObject(tx, config.accountId),
        tx.object(packageRegistryId),
        tx.object(clockId),
      ],
    });

    return {
      transaction: tx,
      description: 'Complete raise and stage completion intents',
    };
  }

  // ============================================================================
  // STEP 4: CLAIM TOKENS
  // ============================================================================

  /**
   * Claim tokens from a completed raise
   */
  claimTokens(
    raiseId: ObjectIdOrRef,
    assetType: string,
    stableType: string,
    clockId?: string
  ): WorkflowTransaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    const { futarchyFactoryPackageId } = this.packages;

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::claim_tokens`,
      typeArguments: [assetType, stableType],
      arguments: [txObject(tx, raiseId), tx.object(clock)],
    });

    return {
      transaction: tx,
      description: 'Claim tokens from raise',
    };
  }

  /**
   * Claim refund from a failed raise
   */
  claimRefund(
    raiseId: ObjectIdOrRef,
    assetType: string,
    stableType: string,
    clockId?: string
  ): WorkflowTransaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    const { futarchyFactoryPackageId } = this.packages;

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::claim_refund`,
      typeArguments: [assetType, stableType],
      arguments: [txObject(tx, raiseId), tx.object(clock)],
    });

    return {
      transaction: tx,
      description: 'Claim refund from failed raise',
    };
  }

  // ============================================================================
  // RECOVERY
  // ============================================================================

  /**
   * Roll back a raise stuck in COMPLETION_PENDING state after timeout (24h).
   * Moves the raise to FAILED so contributors can claim refunds.
   * Permissionless — anyone can call after the timeout.
   */
  rollbackCompletionAfterTimeout(
    raiseId: ObjectIdOrRef,
    accountId: ObjectIdOrRef,
    assetType: string,
    stableType: string,
    clockId?: string
  ): WorkflowTransaction {
    const tx = new Transaction();
    const clock = clockId || '0x6';

    const { futarchyFactoryPackageId } = this.packages;

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::rollback_completion_after_timeout`,
      typeArguments: [assetType, stableType],
      arguments: [
        txObject(tx, raiseId),
        txObject(tx, accountId),
        tx.object(this.sharedObjects.packageRegistryId),
        tx.object(clock),
      ],
    });

    return {
      transaction: tx,
      description: 'Roll back timed-out raise completion',
    };
  }

  /**
   * Reconcile a completion-pending raise to STATE_SUCCESSFUL once the
   * Account has been finalized. Useful if callers used dao_init_executor
   * directly instead of finalize_completion_execution.
   */
  reconcileCompletionState(
    raiseId: ObjectIdOrRef,
    accountId: ObjectIdOrRef,
    assetType: string,
    stableType: string,
  ): WorkflowTransaction {
    const tx = new Transaction();

    const { futarchyFactoryPackageId } = this.packages;

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::reconcile_completion_state`,
      typeArguments: [assetType, stableType],
      arguments: [txObject(tx, raiseId), txObject(tx, accountId)],
    });

    return {
      transaction: tx,
      description: 'Reconcile completion-pending raise to successful',
    };
  }

  /**
   * Burn unsold tokens from a failed raise.
   * Requires the TreasuryCap (returned to creator via failure intent).
   */
  burnUnsoldTokens(
    raiseId: ObjectIdOrRef,
    assetType: string,
    stableType: string,
    treasuryCapId: ObjectIdOrRef,
  ): WorkflowTransaction {
    const tx = new Transaction();

    const { futarchyFactoryPackageId } = this.packages;

    tx.moveCall({
      target: `${futarchyFactoryPackageId}::launchpad::burn_unsold_tokens`,
      typeArguments: [assetType, stableType],
      arguments: [
        txObject(tx, raiseId),
        txObject(tx, treasuryCapId),
      ],
    });

    return {
      transaction: tx,
      description: 'Burn unsold tokens from failed raise',
    };
  }

}
