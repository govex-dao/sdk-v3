/**
 * Proposal Markets Service - Proposal query operations
 *
 * Provides proposal and market-state query helpers under `sdk.proposal.markets`.
 */

import { SuiClient } from '@mysten/sui/client';
import { extractFields, ProposalFields } from '../../types';
import type { Packages } from '../../types';

export interface ProposalMarketsServiceParams {
  client: SuiClient;
  packages: Packages;
}

export class ProposalMarketsService {
  private client: SuiClient;
  private packages: Packages;

  constructor(params: ProposalMarketsServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
  }

  /**
   * Get proposal info
   */
  async getInfo(proposalId: string): Promise<ProposalFields> {
    const obj = await this.client.getObject({
      id: proposalId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      throw new Error(`Could not fetch proposal: ${proposalId}`);
    }

    const fields = extractFields<ProposalFields>(obj);
    if (!fields) {
      throw new Error(`Proposal has no readable fields: ${proposalId}`);
    }

    return fields;
  }

  /**
   * Alias for getInfo for naming compatibility.
   */
  async getProposal(proposalId: string): Promise<ProposalFields> {
    return this.getInfo(proposalId);
  }

  /**
   * Get market state object ref/id from a proposal.
   */
  async getMarket(proposalId: string): Promise<any> {
    const proposal = await this.getInfo(proposalId);
    return proposal.market_state;
  }

  /**
   * Alias for getMarket for naming compatibility.
   */
  async getMarketState(proposalId: string): Promise<any> {
    return this.getMarket(proposalId);
  }

  /**
   * Alias for getMarket for naming compatibility.
   */
  async getProposalMarketState(proposalId: string): Promise<any> {
    return this.getMarket(proposalId);
  }

  /**
   * Get all proposals
   */
  async getAll(): Promise<any[]> {
    const events = await this.client.queryEvents({
      query: {
        MoveEventType: `${this.packages.futarchyProposal}::proposal::ProposalCreated`,
      },
      limit: 50,
    });

    return events.data.map((e: any) => e.parsedJson);
  }

  /**
   * Get proposals for a specific DAO
   */
  async getByDao(daoId: string): Promise<any[]> {
    const all = await this.getAll();
    return all.filter((p: any) => p.dao_id === daoId);
  }
}
