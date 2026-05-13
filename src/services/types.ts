/**
 * Shared Service Types
 *
 * Common types used across all services.
 *
 * @module services/types
 */

import type { SuiClient } from '@mysten/sui/client';
import type { Packages, SharedObjects } from '../types';

export type ServiceNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

/**
 * Service initialization params - shared by all services
 */
export interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
  network?: ServiceNetwork;
}

/**
 * Swap configuration for market operations
 */
export interface SwapConfig {
  poolId: string;
  assetType: string;
  stableType: string;
  amountIn: bigint;
  minOut: bigint;
  coinId?: string;
}
