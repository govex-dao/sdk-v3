/**
 * Sponsorship Service - Proposal sponsorship operations
 *
 * Allows team members to sponsor proposals with per-outcome sponsorship types.
 *
 * Two sponsorship types:
 * - ZERO_THRESHOLD (1): Outcome needs TWAP > reject_twap to pass (no margin)
 * - NEGATIVE_DISCOUNT (2): Outcome can pass with TWAP >= reject_twap - sponsored_threshold%
 *
 * Sponsorship uses quota (one quota per proposal regardless of how many outcomes sponsored).
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';
import type { Packages, SharedObjects } from '../../types';

/**
 * Sponsorship type constants
 * Must match the Move constants in proposal.move
 */
export const SPONSORSHIP_NONE = 0;
export const SPONSORSHIP_ZERO_THRESHOLD = 1;
export const SPONSORSHIP_NEGATIVE_DISCOUNT = 2;

export type SponsorshipType =
  | typeof SPONSORSHIP_NONE
  | typeof SPONSORSHIP_ZERO_THRESHOLD
  | typeof SPONSORSHIP_NEGATIVE_DISCOUNT;

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

/**
 * Configuration for sponsoring a proposal
 */
export interface SponsorProposalConfig {
  /** Proposal object ID */
  proposalId: string;
  /** DAO Account object ID */
  daoAccountId: string;
  /** DAO asset type */
  assetType: string;
  /** DAO stable type */
  stableType: string;
  /**
   * Array of sponsorship types, one per outcome.
   * Index 0 (reject) must be SPONSORSHIP_NONE (0).
   * Example for 3 outcomes: [0, 1, 2] = none, zero_threshold, negative_discount
   */
  sponsorshipTypes: SponsorshipType[];
  /** Optional clock object ID (defaults to 0x6) */
  clockId?: string;
}

/**
 * Result of checking if user can sponsor
 */
export interface CanSponsorResult {
  canSponsor: boolean;
  reason: string;
}

export class SponsorshipService {
  private client: SuiClient;
  private packages: Packages;
  private sharedObjects: SharedObjects;

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
    this.sharedObjects = params.sharedObjects;
  }

  /**
   * Sponsor specific outcomes of a proposal using quota
   *
   * Sponsorship types per outcome:
   * - SPONSORSHIP_NONE (0): Skip this outcome (or keep unsponsored)
   * - SPONSORSHIP_ZERO_THRESHOLD (1): Outcome needs TWAP > reject_twap
   * - SPONSORSHIP_NEGATIVE_DISCOUNT (2): Can pass with TWAP >= reject_twap - sponsored_threshold%
   *
   * Requirements:
   * - Caller must have sponsorship quota
   * - Proposal must be in valid state for sponsorship (not finalized)
   * - sponsorshipTypes[0] must be 0 (reject outcome cannot be sponsored)
   * - Vector length must match proposal outcome count
   * - Quota will be consumed (one quota per proposal)
   *
   * Idempotent: re-sponsoring already-sponsored outcomes is a no-op.
   *
   * @example
   * ```typescript
   * // For a proposal with 3 outcomes:
   * // - Outcome 0 (reject): cannot sponsor, must be 0
   * // - Outcome 1: ZERO_THRESHOLD (needs TWAP > reject)
   * // - Outcome 2: NEGATIVE_DISCOUNT (can be up to sponsored_threshold% below reject)
   * const tx = sdk.proposal.sponsorship.sponsor({
   *   proposalId: "0x123...",
   *   daoAccountId: "0xabc...",
   *   sponsorshipTypes: [0, 1, 2],
   *   assetType: "0x2::sui::SUI",
   *   stableType: "0x2::sui::USDC",
   * });
   * await client.signAndExecuteTransaction({ transaction: tx, signer });
   * ```
   */
  sponsor(config: SponsorProposalConfig): Transaction {
    const tx = new Transaction();
    const clockId = config.clockId || '0x6';

    // Validate sponsorship types
    if (config.sponsorshipTypes.length === 0) {
      throw new Error('sponsorshipTypes must have at least one element');
    }
    if (config.sponsorshipTypes[0] !== SPONSORSHIP_NONE) {
      throw new Error('sponsorshipTypes[0] must be SPONSORSHIP_NONE (0) - reject cannot be sponsored');
    }

    tx.moveCall({
      target: `${this.packages.futarchyGovernance}::proposal_sponsorship::sponsor_proposal`,
      typeArguments: [config.assetType, config.stableType],
      arguments: [
        tx.object(config.proposalId),
        tx.object(config.daoAccountId),
        tx.object(this.sharedObjects.packageRegistry.id),
        tx.sharedObjectRef({
          objectId: this.sharedObjects.sponsorshipRegistry.id,
          initialSharedVersion: this.sharedObjects.sponsorshipRegistry.version,
          mutable: false,
        }),
        tx.pure.vector('u8', config.sponsorshipTypes),
        tx.object(clockId),
      ],
    });

    return tx;
  }

  /**
   * Check if address can sponsor a proposal
   *
   * View function to check if a specific address can sponsor the proposal.
   * Returns both a boolean result and a reason string.
   *
   * @param proposalId - Proposal object ID
   * @param daoAccountId - DAO account object ID
   * @param potentialSponsor - Address to check
   * @param assetType - DAO asset type
   * @param stableType - DAO stable type
   * @param clock - Optional clock object ID (defaults to 0x6)
   * @returns Promise with can sponsor result and reason
   *
   * @example
   * ```typescript
   * const result = await sdk.proposal.sponsorship.canSponsor(
   *   proposalId,
   *   daoAccountId,
   *   userAddress,
   *   assetType,
   *   stableType
   * );
   * if (result.canSponsor) {
   *   console.log("User can sponsor");
   * } else {
   *   console.log(`Cannot sponsor: ${result.reason}`);
   * }
   * ```
   */
  async canSponsor(
    proposalId: string,
    daoAccountId: string,
    potentialSponsor: string,
    assetType: string,
    stableType: string,
    clock: string = '0x6'
  ): Promise<CanSponsorResult> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.packages.futarchyGovernance}::proposal_sponsorship::can_sponsor_proposal`,
      typeArguments: [assetType, stableType],
      arguments: [
        tx.object(proposalId),
        tx.object(daoAccountId),
        tx.pure.address(potentialSponsor),
        tx.object(clock),
      ],
    });

    const result = await this.client.devInspectTransactionBlock({
      sender: potentialSponsor,
      transactionBlock: tx,
    });

    if (result.results && result.results[0]?.returnValues) {
      const canSponsor = result.results[0].returnValues[0];
      const reasonBytes = result.results[0].returnValues[1];

      const canSponsorBool = canSponsor[0][0] === 1;
      const reason = new TextDecoder().decode(new Uint8Array(reasonBytes[0]));

      return {
        canSponsor: canSponsorBool,
        reason,
      };
    }

    return {
      canSponsor: false,
      reason: 'Failed to query sponsorship eligibility',
    };
  }

  /**
   * Generate sponsorship types array for sponsoring all non-reject outcomes
   *
   * Convenience method to create a sponsorship types array that sponsors
   * all outcomes except reject (index 0) with ZERO_THRESHOLD.
   *
   * @param numOutcomes - Total number of outcomes in the proposal
   * @param sponsorshipType - Type to apply to all non-reject outcomes (default: ZERO_THRESHOLD)
   * @returns Array of sponsorship types suitable for sponsor()
   *
   * @example
   * ```typescript
   * // For a 3-outcome proposal, sponsor all accept outcomes with ZERO_THRESHOLD
   * const types = sdk.proposal.sponsorship.sponsorAllAcceptOutcomes(3);
   * // Returns: [0, 1, 1]
   *
   * // Sponsor with NEGATIVE_DISCOUNT instead
   * const types = sdk.proposal.sponsorship.sponsorAllAcceptOutcomes(3, SPONSORSHIP_NEGATIVE_DISCOUNT);
   * // Returns: [0, 2, 2]
   * ```
   */
  sponsorAllAcceptOutcomes(
    numOutcomes: number,
    sponsorshipType: SponsorshipType = SPONSORSHIP_ZERO_THRESHOLD
  ): SponsorshipType[] {
    if (numOutcomes < 2) {
      throw new Error('Proposal must have at least 2 outcomes (reject + 1 accept)');
    }

    const types: SponsorshipType[] = [SPONSORSHIP_NONE]; // Index 0 is always reject
    for (let i = 1; i < numOutcomes; i++) {
      types.push(sponsorshipType);
    }
    return types;
  }
}
