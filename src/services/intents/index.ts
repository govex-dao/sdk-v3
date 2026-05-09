/**
 * Intent Service - Intent staging, execution, and queries
 *
 * This is primarily for internal use. Users should prefer the higher-level
 * services (dao, proposal, launchpad) instead of working with intents directly.
 *
 * @module services/intents
 */

import { SuiClient } from '@mysten/sui/client';
import type { Packages, SharedObjects } from '../../types';

// Re-export query services
export { OracleQueryService } from './query/oracle';
export { VaultQueryService } from './query/vault';

import { OracleQueryService } from './query/oracle';
import { VaultQueryService } from './query/vault';

export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

/**
 * IntentService - Low-level intent operations and queries
 */
export class IntentService {
  /** Oracle query operations */
  public oracleQueries: OracleQueryService;

  /** Vault query operations */
  public vaultQueries: VaultQueryService;

  constructor(params: ServiceParams) {
    this.oracleQueries = new OracleQueryService(params);
    this.vaultQueries = new VaultQueryService(params);
  }
}
