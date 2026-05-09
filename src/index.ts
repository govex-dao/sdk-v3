/**
 * Govex V3 SDK
 *
 * TypeScript SDK for the Govex v3 packages on Sui.
 *
 * ## Architecture
 *
 * ```
 * src/
 * ├── FutarchySDK.ts  # Main SDK entry point
 * ├── config/         # Network & deployment configuration
 * ├── types/          # TypeScript type definitions
 * ├── workflows/      # High-level orchestration (launchpad, proposal)
 * ├── protocol/       # Move module wrappers (queries)
 * ├── services/       # High-level service classes
 * ├── ptb/            # PTB helpers
 * └── utils/          # Shared utilities
 * ```
 *
 * ## Quick Start
 *
 * ```typescript
 * import { FutarchySDK } from '@govex/futarchy-sdk';
 *
 * const sdk = new FutarchySDK({ network: 'mainnet' });
 *
 * // Use high-level services
 * const info = await sdk.dao.getInfo(daoId);
 * const tx = sdk.launchpad.createRaise({...});
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// MAIN SDK
// ============================================================================

export { FutarchySDK } from './FutarchySDK';

// ============================================================================
// CONFIGURATION
// ============================================================================

export * from './config';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export * from './types';

// ============================================================================
// WORKFLOWS (High-level orchestration)
// ============================================================================

export * from './workflows';

// ============================================================================
// AGENT UTILITIES
// ============================================================================

export * from './agent';

// ============================================================================
// PROTOCOL (Move module wrappers)
// ============================================================================

export * from './protocol';

// ============================================================================
// SERVICES (High-level service classes)
// ============================================================================

export * from './services';

// ============================================================================
// UTILITIES
// ============================================================================

export * from './utils';

// ============================================================================
// PTB HELPERS
// ============================================================================

export * from './ptb';

// ============================================================================
// CONFIG (Action Definitions - single source of truth)
// ============================================================================

export * from './config/action-definitions';

// ============================================================================
// SUI TYPE RE-EXPORTS
// ============================================================================

export type { SuiClient, SuiObjectResponse, SuiObjectData } from '@mysten/sui/client';
export type { Transaction, TransactionResult } from '@mysten/sui/transactions';
