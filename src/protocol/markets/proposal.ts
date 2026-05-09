/**
 * Proposal Module
 *
 * Core proposal management for futarchy governance.
 *
 * Lifecycle:
 * 1. PREMARKET - Proposal created, awaiting initialization
 * 2. REVIEW - Market initialized, in review period
 * 3. LIVE - Trading active
 * 4. FINALIZED - Winner determined, ready for execution
 *
 * Key Features:
 * - Multi-outcome prediction markets (2-N outcomes)
 * - TWAP-based resolution
 * - Intent specs for executable actions
 * - Sponsorship system for reduced barriers
 * - Quantum LP management
 *
 * @module proposal
 */

import { Transaction } from '@mysten/sui/transactions';
import { TransactionUtils } from '../../services/transaction';

type TxValue = ReturnType<Transaction['moveCall']> | ReturnType<Transaction['object']>;

/**
 * Proposal Static Functions
 *
 * Comprehensive proposal lifecycle management.
 */
export class Proposal {
  // ============================================================================
  // Cancel Witness Functions
  // ============================================================================

  static cancelWitnessProposal(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      witness: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'cancel_witness_proposal'),
      arguments: [config.witness],
    });
  }

  static cancelWitnessOutcomeIndex(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      witness: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'cancel_witness_outcome_index'),
      arguments: [config.witness],
    });
  }

  // ============================================================================
  // Creation Functions - Atomic Proposal Pattern
  // ============================================================================
  //
  // The atomic proposal creation pattern ensures proposals are created with all
  // conditional coins in a single transaction, preventing incomplete proposals.
  //
  // Flow:
  // 1. beginProposal() → returns [Proposal, TokenEscrow, ProposalCreationTicket]
  // 2. addOutcomeCoins() or addOutcomeCoins10() → registers coins with escrow
  // 3. finalizeProposal() → validates completeness, creates AMM pools, shares both
  //
  // Example PTB for 2 outcomes:
  //   const [proposal, escrow, creationTicket] = Proposal.beginProposal(tx, {...});
  //   Proposal.addOutcomeCoins(tx, { proposal, escrow, outcomeIndex: 0, ... });
  //   Proposal.addOutcomeCoins(tx, { proposal, escrow, outcomeIndex: 1, ... });
  //   Proposal.finalizeProposal(tx, { proposal, escrow, creationTicket, ... });
  //
  // Example PTB for 10 outcomes (optimized):
  //   const [proposal, escrow, creationTicket] = Proposal.beginProposal(tx, {...});
  //   Proposal.addOutcomeCoins10(tx, { proposal, escrow, startOutcomeIndex: 0, ... });
  //   Proposal.finalizeProposal(tx, { proposal, escrow, creationTicket, ... });

  /**
   * Begin creating a proposal atomically. Returns UNSHARED proposal and escrow.
   * Must call addOutcomeCoins/addOutcomeCoins10 to register all conditional coins,
   * then finalizeProposal to validate and share.
   *
   * Fee type is determined by DAO config (fee_in_asset_token):
   * - If fee_in_asset_token = false: pass stableFee, assetFee should be zero coin
   * - If fee_in_asset_token = true: pass assetFee, stableFee should be zero coin
   *
   * @returns [Proposal, TokenEscrow, ProposalCreationTicket] - all must be threaded into finalizeProposal
   */
  static beginProposal(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      protocolPackageId: string;
      assetType: string;
      stableType: string;
      daoAccountId: string;
      registry: string | ReturnType<Transaction['moveCall']>;
      title: string;
      introductionDetails: string;
      metadata: string;
      outcomeMessages: string[];
      outcomeDetails: string[];
      proposer: string;
      usedQuota: boolean;
      stableFee: ReturnType<Transaction['moveCall']> | ReturnType<Transaction['splitCoins']>; // Coin<StableType>
      assetFee: ReturnType<Transaction['moveCall']> | ReturnType<Transaction['splitCoins']>; // Coin<AssetType>
      intentSpecForYes?: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    const intentSpec = config.intentSpecForYes || tx.moveCall({
      target: '0x1::option::none',
      typeArguments: [`vector<${config.protocolPackageId}::intents::ActionSpec>`],
      arguments: [],
    });

    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'begin_proposal'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.daoAccountId),
        typeof config.registry === 'string' ? tx.object(config.registry) : config.registry,
        tx.pure.string(config.title),
        tx.pure.string(config.introductionDetails),
        tx.pure.string(config.metadata),
        tx.pure.vector('string', config.outcomeMessages),
        tx.pure.vector('string', config.outcomeDetails),
        tx.pure.address(config.proposer),
        tx.pure.bool(config.usedQuota),
        config.stableFee,
        config.assetFee,
        intentSpec,
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  /**
   * Add one outcome's conditional coins (asset + stable pair).
   * Validates blank metadata, updates with DAO naming, registers caps with escrow.
   *
   * Must be called once per outcome before finalizeProposal.
   * For proposals with many outcomes, use addOutcomeCoins10 for efficiency.
   *
   * Relation checks (on-chain):
   * - `daoAccount` must match `proposal.dao_id`
   * - `escrow` must be the escrow created for this proposal/DAO (its embedded MarketState must match)
   */
  static addOutcomeCoins(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      assetCondCoinType: string;
      stableCondCoinType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']>;
      outcomeIndex: number;
      assetTreasuryCap: ReturnType<Transaction['moveCall']>;
      assetCurrency: ReturnType<Transaction['moveCall']> | string;       // &mut Currency<AssetCondCoin>
      assetMetadataCap: ReturnType<Transaction['moveCall']>;             // MetadataCap<AssetCondCoin>
      stableTreasuryCap: ReturnType<Transaction['moveCall']>;
      stableCurrency: ReturnType<Transaction['moveCall']> | string;      // &mut Currency<StableCondCoin>
      stableMetadataCap: ReturnType<Transaction['moveCall']>;            // MetadataCap<StableCondCoin>
      /** DAO Account - function borrows DaoConfig internally */
      daoAccount: ReturnType<Transaction['moveCall']> | string;
      baseAssetCurrency: ReturnType<Transaction['moveCall']> | string;   // &Currency<AssetType>
      baseStableCurrency: ReturnType<Transaction['moveCall']> | string;  // &Currency<StableType>
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'add_outcome_coins'),
      typeArguments: [
        config.assetType,
        config.stableType,
        config.assetCondCoinType,
        config.stableCondCoinType,
      ],
      arguments: [
        config.proposal,
        config.escrow,
        tx.pure.u64(config.outcomeIndex),
        config.assetTreasuryCap,
        typeof config.assetCurrency === 'string' ? tx.object(config.assetCurrency) : config.assetCurrency,
        config.assetMetadataCap,
        config.stableTreasuryCap,
        typeof config.stableCurrency === 'string' ? tx.object(config.stableCurrency) : config.stableCurrency,
        config.stableMetadataCap,
        typeof config.daoAccount === 'string' ? tx.object(config.daoAccount) : config.daoAccount,
        typeof config.baseAssetCurrency === 'string' ? tx.object(config.baseAssetCurrency) : config.baseAssetCurrency,
        typeof config.baseStableCurrency === 'string' ? tx.object(config.baseStableCurrency) : config.baseStableCurrency,
      ],
    });
  }

  /**
   * Add up to 10 outcomes' conditional coins (20 coins total) in one call.
   * For proposals with up to 10 outcomes, this is a single PTB call.
   * For larger proposals, combine with addOutcomeCoins for remaining outcomes.
   *
   * Unused outcome slots (when outcomeCount < 10) will have their caps/metadata
   * transferred to burn address automatically.
   *
   * Relation checks (on-chain):
   * - `daoAccount` must match `proposal.dao_id`
   * - `escrow` must be the escrow created for this proposal/DAO (its embedded MarketState must match)
   */
  static addOutcomeCoins10(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      // 10 pairs of conditional coin types
      condCoinTypes: Array<{ asset: string; stable: string }>;
      proposal: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']>;
      // 10 pairs of treasury caps
      treasuryCaps: Array<{
        asset: ReturnType<Transaction['moveCall']>;
        stable: ReturnType<Transaction['moveCall']>;
      }>;
      // 10 pairs of Currency<T> references (&mut Currency<T>)
      currencies: Array<{
        asset: ReturnType<Transaction['moveCall']> | string;
        stable: ReturnType<Transaction['moveCall']> | string;
      }>;
      // 10 pairs of MetadataCap<T>
      metadataCaps: Array<{
        asset: ReturnType<Transaction['moveCall']>;
        stable: ReturnType<Transaction['moveCall']>;
      }>;
      /** DAO Account - function borrows DaoConfig internally */
      daoAccount: ReturnType<Transaction['moveCall']> | string;
      baseAssetCurrency: ReturnType<Transaction['moveCall']> | string;   // &Currency<AssetType>
      baseStableCurrency: ReturnType<Transaction['moveCall']> | string;  // &Currency<StableType>
      startOutcomeIndex: number;
    }
  ): void {
    // Validate we have exactly 10 of each
    if (config.condCoinTypes.length !== 10 || config.treasuryCaps.length !== 10 || config.currencies.length !== 10 || config.metadataCaps.length !== 10) {
      throw new Error('addOutcomeCoins10 requires exactly 10 conditional coin type pairs, treasury cap pairs, currency pairs, and metadata cap pairs');
    }

    // Helper to resolve string | moveCall to tx argument
    const obj = (v: ReturnType<Transaction['moveCall']> | string) =>
      typeof v === 'string' ? tx.object(v) : v;

    // Build arguments: proposal, escrow, then per-outcome (treasuryCap, currency, metadataCap) x2 for asset+stable
    const outcomeArgs = [];
    for (let i = 0; i < 10; i++) {
      outcomeArgs.push(
        config.treasuryCaps[i].asset,
        obj(config.currencies[i].asset),
        config.metadataCaps[i].asset,
        config.treasuryCaps[i].stable,
        obj(config.currencies[i].stable),
        config.metadataCaps[i].stable,
      );
    }

    tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'add_outcome_coins_10'),
      typeArguments: [
        config.assetType,
        config.stableType,
        // Outcome 0
        config.condCoinTypes[0].asset, config.condCoinTypes[0].stable,
        // Outcome 1
        config.condCoinTypes[1].asset, config.condCoinTypes[1].stable,
        // Outcome 2
        config.condCoinTypes[2].asset, config.condCoinTypes[2].stable,
        // Outcome 3
        config.condCoinTypes[3].asset, config.condCoinTypes[3].stable,
        // Outcome 4
        config.condCoinTypes[4].asset, config.condCoinTypes[4].stable,
        // Outcome 5
        config.condCoinTypes[5].asset, config.condCoinTypes[5].stable,
        // Outcome 6
        config.condCoinTypes[6].asset, config.condCoinTypes[6].stable,
        // Outcome 7
        config.condCoinTypes[7].asset, config.condCoinTypes[7].stable,
        // Outcome 8
        config.condCoinTypes[8].asset, config.condCoinTypes[8].stable,
        // Outcome 9
        config.condCoinTypes[9].asset, config.condCoinTypes[9].stable,
      ],
      arguments: [
        config.proposal,
        config.escrow,
        // Per-outcome: treasuryCap, currency, metadataCap for asset then stable
        ...outcomeArgs,
        // DAO account and base currencies
        obj(config.daoAccount),
        obj(config.baseAssetCurrency),
        obj(config.baseStableCurrency),
        tx.pure.u64(config.startOutcomeIndex),
      ],
    });
  }

  /**
   * Finalize proposal creation: validate all coins registered, create AMM pools, share.
   * Must be called after all addOutcomeCoins/addOutcomeCoins10 calls.
   */
  static finalizeProposal(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']>;
      creationTicket: ReturnType<Transaction['moveCall']>;
      daoAccount: ReturnType<Transaction['moveCall']> | string;
      spotPool: ReturnType<Transaction['moveCall']> | string;
      spotPoolMutationRegistry: ReturnType<Transaction['moveCall']> | string;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'finalize_proposal'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.proposal,
        config.escrow,
        config.creationTicket,
        typeof config.daoAccount === 'string' ? tx.object(config.daoAccount) : config.daoAccount,
        typeof config.spotPool === 'string' ? tx.object(config.spotPool) : config.spotPool,
        typeof config.spotPoolMutationRegistry === 'string'
          ? tx.object(config.spotPoolMutationRegistry)
          : config.spotPoolMutationRegistry,
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // ============================================================================
  // Fee Escrow Functions
  // ============================================================================

  /**
   * Takes the escrowed fee balance out of the proposal (StableType version)
   * Used for refunding fees to proposer if any accept wins.
   * Call this when feePaidInAsset() returns false.
   * SECURITY: Requires ProposalMutationAuth to prevent unauthorized fee extraction.
   */
  static takeFeeEscrowStable(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      proposalMutationAuth: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'take_fee_escrow_stable'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, config.proposalMutationAuth],
    });
  }

  /**
   * Takes the escrowed fee balance out of the proposal (AssetType version)
   * Used for refunding fees to proposer if any accept wins.
   * Call this when feePaidInAsset() returns true.
   * SECURITY: Requires ProposalMutationAuth to prevent unauthorized fee extraction.
   */
  static takeFeeEscrowAsset(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      proposalMutationAuth: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'take_fee_escrow_asset'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, config.proposalMutationAuth],
    });
  }

  /**
   * Check if fee was paid in AssetType (true) or StableType (false)
   */
  static feePaidInAsset(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'fee_paid_in_asset'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  // ============================================================================
  // TWAP Functions
  // ============================================================================

  static getTwapsForProposal(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      proposal: TxValue;
      spotPool: TxValue;
      escrowRegistry: TxValue;
      marketStateRegistry: TxValue;
      spotPoolMutationRegistry: TxValue;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_twaps_for_proposal'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.proposal,
        config.spotPool,
        config.escrowRegistry,
        config.marketStateRegistry,
        config.spotPoolMutationRegistry,
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  static getTwapsForProposalAt(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      proposal: TxValue;
      spotPool: TxValue;
      escrowRegistry: TxValue;
      marketStateRegistry: TxValue;
      spotPoolMutationRegistry: TxValue;
      targetTime: bigint;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_twaps_for_proposal_at'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      arguments: [
        config.proposal,
        config.spotPool,
        config.escrowRegistry,
        config.marketStateRegistry,
        config.spotPoolMutationRegistry,
        tx.pure.u64(config.targetTime),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  static getTwapPrices(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: TxValue;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_twap_prices'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getLastTwapUpdate(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: TxValue;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_last_twap_update'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getTwapByOutcome(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: TxValue;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_twap_by_outcome'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u64(config.outcomeIdx)],
    });
  }

  static getOracleStateByOutcome(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: TxValue;
      escrow: TxValue;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(
        config.proposalPackageId,
        'proposal',
        'get_oracle_state_by_outcome'
      ),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, config.escrow, tx.pure.u8(config.outcomeIdx)],
    });
  }

  static getWinningTwap(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: TxValue;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_winning_twap'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  // ============================================================================
  // State Functions
  // ============================================================================

  static isFinalized(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'is_finalized'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static state(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'state'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static isLive(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'is_live'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getWinningOutcome(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_winning_outcome'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static isWinningOutcomeSet(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'is_winning_outcome_set'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static advanceState(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      lpType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      /** ProposalMutationAuth - authorizes state transitions */
      auth: ReturnType<Transaction['moveCall']>;
      escrow: ReturnType<Transaction['moveCall']> | string;
      marketStateRegistry: ReturnType<Transaction['moveCall']> | string;
      escrowRegistry: ReturnType<Transaction['moveCall']> | string;
      spotPool: ReturnType<Transaction['moveCall']> | string;
      /** Expected spot pool ID for DAO pool identity validation */
      expectedSpotPoolId: string;
      clock?: string;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'advance_state'),
      typeArguments: [config.assetType, config.stableType, config.lpType],
      // Move: advance_state(proposal, auth, escrow, market_state_registry, escrow_registry,
      //                     spot_pool, expected_spot_pool_id, clock, ctx)
      arguments: [
        config.proposal,
        config.auth,
        typeof config.escrow === 'string' ? tx.object(config.escrow) : config.escrow,
        typeof config.marketStateRegistry === 'string' ? tx.object(config.marketStateRegistry) : config.marketStateRegistry,
        typeof config.escrowRegistry === 'string' ? tx.object(config.escrowRegistry) : config.escrowRegistry,
        typeof config.spotPool === 'string' ? tx.object(config.spotPool) : config.spotPool,
        tx.pure.id(config.expectedSpotPoolId),
        tx.object(config.clock || '0x6'),
      ],
    });
  }

  // NOTE: set_state, set_twap_prices, set_last_twap_update, set_winning_outcome
  // require ProposalMutationAuth which can only be created by authorized Move packages.
  // These are internal-only functions and cannot be called from PTBs.

  // ============================================================================
  // Metadata/Info Functions (Continued in next section due to length)
  // ============================================================================

  static getId(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_id'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static escrowId(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'escrow_id'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static marketStateId(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'market_state_id'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getMarketInitializedAt(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_market_initialized_at'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static outcomeCount(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'outcome_count'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getNumOutcomes(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_num_outcomes'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static proposer(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_proposer'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static createdAt(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_created_at'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getMetadata(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_metadata'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getIntroductionDetails(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_introduction_details'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getAmmPoolIds(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: TxValue;
      escrow: TxValue;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_amm_pool_ids'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, config.escrow],
    });
  }

  static getState(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_state'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getDaoId(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_dao_id'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static proposalId(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'proposal_id'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getCreatedAt(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_created_at'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getReviewPeriodMs(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_review_period_ms'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getTradingPeriodMs(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_trading_period_ms'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getTwapThreshold(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_twap_threshold'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getSponsoredThreshold(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_sponsored_threshold'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getTwapStartDelay(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_twap_start_delay'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getTwapInitialObservation(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_twap_initial_observation'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getTwapCapPpm(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_twap_cap_ppm'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getAmmTotalFeeBps(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_amm_total_fee_bps'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }


  static getOutcomeCreators(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_outcome_creators'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getOutcomeCreator(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_outcome_creator'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u64(config.outcomeIdx)],
    });
  }

  // NOTE: get_outcome_creator_fee and get_outcome_creator_fees do not exist in the current contract.
  // There is no per-outcome creator fee concept in the contract.

  static getLiquidityProvider(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_liquidity_provider'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getProposer(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_proposer'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static getUsedFeelessQuota(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_used_feeless_quota'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static isWithdrawOnly(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'is_withdraw_only'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static setWithdrawOnlyMode(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      mode: boolean;
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'set_withdraw_only_mode'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.bool(config.mode)],
    });
  }

  static getOutcomeMessages(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_outcome_messages'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  // ============================================================================
  // Intent Spec Functions
  // ============================================================================

  static getIntentSpecForOutcome(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_intent_spec_for_outcome'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u64(config.outcomeIdx)],
    });
  }

  // NOTE: take_intent_spec_for_outcome and make_cancel_witness
  // require ProposalMutationAuth which can only be created by authorized Move packages.
  // These are internal-only functions and cannot be called from PTBs.

  /**
   * Set intent spec for an outcome with whitelist validation
   *
   * SECURITY: Validates ALL action types are from authorized packages based on authorization level:
   * - Level 0 (GLOBAL_ONLY): All action packages must be in global registry (checked at staging)
   * - Level 1 (WHITELIST): Any action can be staged, but must be in global OR account whitelist at execution
   * - Level 2 (PERMISSIVE): No checks at staging or execution
   *
   * @param tx - Transaction
   * @param config - Configuration including whitelist validation parameters
   */
  static setIntentSpecForOutcome(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
      intentSpec: ReturnType<Transaction['moveCall']>;
      maxActionsPerOutcome: number;
      account: string | ReturnType<Transaction['moveCall']>;      // DAO account for whitelist check
      registry: string | ReturnType<Transaction['moveCall']>;     // PackageRegistry
      auth: ReturnType<Transaction['moveCall']>;                  // ProposalMutationAuth
    }
  ): void {
    tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'set_intent_spec_for_outcome'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        config.proposal,
        tx.pure.u64(config.outcomeIdx),
        config.intentSpec,
        tx.pure.u64(config.maxActionsPerOutcome),
        typeof config.account === 'string' ? tx.object(config.account) : config.account,
        typeof config.registry === 'string' ? tx.object(config.registry) : config.registry,
        config.auth,
      ],
    });
  }

  static hasIntentSpec(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'has_intent_spec'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u64(config.outcomeIdx)],
    });
  }

  static getActionsForOutcome(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIdx: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_actions_for_outcome'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u64(config.outcomeIdx)],
    });
  }

  // NOTE: clear_intent_spec_for_outcome
  // requires ProposalMutationAuth which can only be created by authorized Move packages.
  // This is an internal-only function and cannot be called from PTBs.

  // NOTE: emit_outcome_mutated and set_outcome_creator do not exist in the current contract.
  // These were legacy functions that have been removed.

  // ============================================================================
  // Helper Functions
  // ============================================================================

  static id(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_id'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  static idAddress(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'id_address'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  // ============================================================================
  // Sponsorship Functions
  // ============================================================================

  // NOTE: get_sponsored_by and get_sponsor_threshold_reduction do not exist in the current contract.
  // Sponsorship is tracked per-outcome via outcome_sponsorship vector. Use getOutcomeSponsorshipType(s) instead.

  /**
   * Check if any outcome in the proposal is sponsored
   */
  static isSponsored(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'is_sponsored'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  /**
   * Check if a specific outcome is sponsored (any type)
   */
  static isOutcomeSponsored(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIndex: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'is_outcome_sponsored'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u64(config.outcomeIndex)],
    });
  }

  /**
   * Get the sponsorship type for a specific outcome
   * Returns: 0 = NONE, 1 = ZERO_THRESHOLD, 2 = NEGATIVE_DISCOUNT
   */
  static getOutcomeSponsorshipType(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      outcomeIndex: number;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_outcome_sponsorship_type'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.pure.u64(config.outcomeIndex)],
    });
  }

  /**
   * Get the full sponsorship types vector for all outcomes
   * Returns vector where index = outcome, value = sponsorship type (0=none, 1=zero, 2=negative)
   */
  static getOutcomeSponsorshipTypes(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'get_outcome_sponsorship_types'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  /**
   * Get sponsorship type constant: NONE (0)
   */
  static sponsorshipNone(
    tx: Transaction,
    config: {
      proposalPackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'sponsorship_none'),
      arguments: [],
    });
  }

  /**
   * Get sponsorship type constant: ZERO_THRESHOLD (1)
   */
  static sponsorshipZeroThreshold(
    tx: Transaction,
    config: {
      proposalPackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'sponsorship_zero_threshold'),
      arguments: [],
    });
  }

  /**
   * Get sponsorship type constant: NEGATIVE_DISCOUNT (2)
   */
  static sponsorshipNegativeDiscount(
    tx: Transaction,
    config: {
      proposalPackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'sponsorship_negative_discount'),
      arguments: [],
    });
  }

  // ============================================================================
  // State Constants (Added for execution-required finalization)
  // ============================================================================

  /**
   * Get PREMARKET state constant (0)
   */
  static statePremarket(
    tx: Transaction,
    config: {
      proposalPackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'state_premarket'),
      arguments: [],
    });
  }

  /**
   * Get REVIEW state constant (1)
   */
  static stateReview(
    tx: Transaction,
    config: {
      proposalPackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'state_review'),
      arguments: [],
    });
  }

  /**
   * Get TRADING state constant (2)
   */
  static stateTrading(
    tx: Transaction,
    config: {
      proposalPackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'state_trading'),
      arguments: [],
    });
  }

  /**
   * Get AWAITING_EXECUTION state constant (3)
   *
   * New state: TWAP measured, 30-minute execution window active.
   */
  static stateAwaitingExecution(
    tx: Transaction,
    config: {
      proposalPackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'state_awaiting_execution'),
      arguments: [],
    });
  }

  /**
   * Get FINALIZED state constant (4)
   *
   * Note: Changed from 3 to 4 with addition of AWAITING_EXECUTION state.
   */
  static stateFinalized(
    tx: Transaction,
    config: {
      proposalPackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'state_finalized'),
      arguments: [],
    });
  }

  // ============================================================================
  // Execution Window Functions (Added for execution-required finalization)
  // ============================================================================

  /**
   * Check if proposal is in the execution window (AWAITING_EXECUTION state)
   *
   * @returns True if proposal is awaiting execution
   */
  static isAwaitingExecution(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'is_awaiting_execution'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal],
    });
  }

  /**
   * Check if the trading period has ended based on current time
   *
   * @returns True if current_time >= trading_end
   */
  static isTradingPeriodEnded(
    tx: Transaction,
    config: {
      proposalPackageId: string;
      assetType: string;
      stableType: string;
      proposal: ReturnType<Transaction['moveCall']>;
      clock?: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'is_trading_period_ended'),
      typeArguments: [config.assetType, config.stableType],
      arguments: [config.proposal, tx.object(config.clock || '0x6')],
    });
  }

  /**
   * Get the execution window duration in milliseconds (30 minutes)
   *
   * @returns 30 * 60 * 1000 = 1800000 ms
   */
  static executionWindowMs(
    tx: Transaction,
    config: {
      proposalPackageId: string;
    }
  ): ReturnType<Transaction['moveCall']> {
    return tx.moveCall({
      target: TransactionUtils.buildTarget(config.proposalPackageId, 'proposal', 'execution_window_ms'),
      arguments: [],
    });
  }
}
