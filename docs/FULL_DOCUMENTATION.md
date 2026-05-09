# Futarchy SDK

> Comprehensive documentation for AI agents and developers to understand the SDK structure, patterns, and usage.

## Quick Start

```bash
# Install dependencies
npm install

# Run E2E tests on localnet (the primary way to test)
cd ../  # go to project root
./sdk/localnet.sh --fresh --e2e  # Full clean slate + all tests
```

---

## Localnet Testing (Primary E2E Entry Point)

**`localnet.sh`** is the core E2E testing orchestrator. Located at `sdk/localnet.sh`, it manages the entire local development environment.

### Usage

```bash
./localnet.sh              # Start everything (localnet, db, indexer)
./localnet.sh --deploy     # Also deploy packages
./localnet.sh --e2e        # Deploy and run all E2E tests
./localnet.sh --tests-only # Run E2E tests only (assumes already deployed)
./localnet.sh --test NAME  # Run a single test by name
./localnet.sh --stop       # Stop all processes
./localnet.sh --clean      # Stop and clean logs/pids
./localnet.sh --fresh      # HARD RESET: nuke ~/.sui, db, deployments - total fresh start
./localnet.sh --status     # Show status of all processes
```

### What It Does

1. **Starts Sui Localnet** - Full node with faucet, indexer, and GraphQL
2. **Sets Up Database** - SQLite via Prisma for the gRPC indexer
3. **Deploys Packages** - All Move packages to localnet
4. **Runs Indexer** - gRPC streaming indexer that populates the database
5. **Runs E2E Tests** - Each test gets a fresh DAO setup

### E2E Test Flow (Per Test)

```
1. create-test-coins        # Fresh TASSET/TSTABLE/LP coins
2. launchpad-e2e            # Create DAO via launchpad
3. deploy-conditional-coins # Deploy conditional coins for proposal trading
4. run test                 # Run the actual test script
```

### Available Tests

| Test Name | Description | Outcomes |
|-----------|-------------|----------|
| `proposal-with-swaps` | Full proposal lifecycle with trading | 2 |
| `reject-wins` | Proposal where reject outcome wins | 2 |
| `memo-action` | Proposal with memo action execution | 2 |
| `sponsorship` | Proposal sponsorship flow | 2 |
| `multi-outcome` | Multi-outcome proposal (3+ outcomes) | 3 |

### Data Flow Architecture

```
┌──────────────┐     gRPC     ┌───────────────┐    Prisma    ┌───────────┐
│ Sui Localnet │ ─────────────▶│ grpc-indexer │ ─────────────▶│ SQLite DB │
│  (port 9000) │              │  (port 9090)  │              │           │
└──────────────┘              └───────────────┘              └───────────┘
       ▲                             │
       │ Sui RPC                     │ HTTP API
       │                             ▼
┌──────────────┐              ┌───────────────┐
│  E2E Tests   │◀─────────────│  /proposals/  │
│  (SDK)       │              │  /launchpads/ │
└──────────────┘              │  /daos/       │
                              └───────────────┘
```

**Important:** Tests never touch Prisma directly. They either:
- Hit Sui RPC directly for blockchain operations
- Call the indexer's HTTP endpoints (which query Prisma internally)

### Logs

```bash
tail -f /tmp/govex-logs/sui-localnet.log  # Sui node logs
tail -f /tmp/govex-logs/indexer-v2.log    # Indexer logs
cat /tmp/govex-logs/tests/<test-name>.log # Individual test logs
```

---

## Table of Contents

1. [Directory Structure](#1-directory-structure)
2. [Entry Points & Initialization](#2-entry-points--initialization)
3. [Core Abstractions](#3-core-abstractions)
4. [Service Layer](#4-service-layer)
5. [Workflow Patterns](#5-workflow-patterns)
6. [Transaction Building](#6-transaction-building)
7. [Type System](#7-type-system)
8. [Action System](#8-action-system)
9. [Configuration & Deployment](#9-configuration--deployment)
10. [Script/Usage Patterns](#10-scriptusage-patterns)
11. [Key Concepts](#11-key-concepts)

---

## 1. Directory Structure

```
sdk/src/
├── FutarchySDK.ts                  # Main SDK entry point
├── index.ts                         # Public exports
├── config/                          # Network & deployment configuration
│   ├── network.ts                   # Network setup (mainnet, testnet, devnet, localnet)
│   ├── deployment.ts                # DeploymentManager for package & shared object IDs
│   └── index.ts
├── types/                           # Core type definitions
│   ├── deployment.ts                # Deployment config types
│   ├── sui-types.ts                 # Sui object types (DAOFields, ProposalFields, etc.)
│   ├── init-actions.ts              # Action initialization types
│   └── services/                    # Service-specific types
│       ├── packages.ts              # Packages & SharedObjects interfaces
│       ├── results.ts               # Transaction result types
│       └── swap.ts                  # Swap-related types
├── workflows/                       # High-level orchestration (atomic operations)
│   ├── launchpad-workflow.ts        # LaunchpadWorkflow (create, contribute, complete)
│   ├── proposal-workflow.ts         # ProposalWorkflow (create, trade, finalize)
│   ├── intent-executor.ts           # IntentExecutor (executes staged actions)
│   ├── action-converter.ts          # Backend action → SDK format conversion
│   ├── auto-executor.ts             # Fetches from backend API, builds PTB
│   └── types/                       # Workflow type definitions
│       ├── common.ts                # WorkflowTransaction, ObjectIdOrRef
│       ├── proposal.ts              # Proposal workflow configs
│       ├── launchpad.ts             # Launchpad workflow configs
│       ├── intent.ts                # Intent execution configs
│       └── actions/                 # Action configuration types (60+ action types)
│           ├── index.ts             # ActionConfig union type
│           ├── account.ts           # Stream, vault, currency, transfer actions
│           ├── futarchy.ts          # DAO config, liquidity, dissolution actions
│           ├── governance.ts        # Governance & fee actions
│           └── oracle.ts            # Oracle grant actions
├── services/                        # Service classes for protocol interactions
│   ├── dao/                         # DAO operations
│   │   ├── index.ts                 # DAOService, DAOInfoHelper
│   │   ├── vault.ts                 # VaultService (deposits, streams)
│   │   └── oracle.ts                # OracleService (price-based grants)
│   ├── launchpad/                   # Launchpad operations
│   │   └── index.ts                 # LaunchpadService
│   ├── proposal/                    # Proposal operations
│   │   ├── index.ts                 # ProposalService
│   │   ├── sponsorship.ts           # SponsorshipService
│   │   ├── trade.ts                 # TradeService (swaps on outcomes)
│   │   ├── twap.ts                  # TwapService (time-weighted average price)
│   │   ├── escrow.ts                # EscrowService
│   │   └── markets.ts               # ProposalMarketsService (proposal/market queries)
│   ├── market/                      # Market operations
│   │   ├── index.ts                 # MarketService (swaps, pools)
│   │   └── pool.ts                  # PoolService (liquidity)
│   ├── admin/                       # Admin operations
│   │   └── index.ts                 # AdminService, FactoryAdminService
│   ├── intents/                     # Intent operations
│   │   └── index.ts                 # IntentService
│   └── utils/                       # Utility services
│       ├── index.ts                 # TransactionUtils, BaseTransactionBuilder
│       ├── queries.ts               # QueryHelper (object queries)
│       └── currency.ts              # CurrencyUtils (coin metadata, formatting)
├── protocol/                        # Move module wrappers (low-level)
│   ├── account/                     # Account protocol bindings
│   ├── futarchy/                    # Futarchy core bindings
│   └── markets/                     # Markets core bindings
├── ptb/                             # PTB (Programmable Transaction Block) helpers
│   └── transaction-composer.ts      # TransactionComposer & TransactionBuilder
└── utils/                           # Shared utilities
    ├── hex.ts                       # Hex encoding
    ├── bcs.ts                       # BCS serialization
    └── validation.ts                # Input validation
```

---

## 2. Entry Points & Initialization

### FutarchySDK Class

**Location:** `src/FutarchySDK.ts`

The main entry point for all SDK operations.

```typescript
import { FutarchySDK } from '@govex/futarchy-sdk';

const sdk = new FutarchySDK({
  network: 'devnet',  // 'mainnet' | 'testnet' | 'devnet' | 'localnet' | RPC URL
  deployments?: DeploymentConfig  // Optional custom deployments
});
```

### Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `sdk.client` | `SuiClient` | Sui RPC client |
| `sdk.network` | `NetworkConfig` | Network configuration |
| `sdk.deployments` | `DeploymentManager` | Package & object managers |
| `sdk.packages` | `Packages` | All package IDs |
| `sdk.sharedObjects` | `SharedObjects` | Shared object references |

### Main Services

```typescript
sdk.dao                 // DAOService: DAO, vault, oracle operations
sdk.launchpad          // LaunchpadService: Token launch operations
sdk.proposal           // ProposalService: Governance proposals
sdk.market             // MarketService: AMM & trading
sdk.admin              // AdminService: Protocol admin
sdk.intents            // IntentService: Intent operations

// Utilities
sdk.utils.transactionBuilder  // BaseTransactionBuilder
sdk.utils.queryHelper         // QueryHelper
sdk.utils.currency            // CurrencyUtils

// Low-level workflows
sdk.workflows.launchpad  // LaunchpadWorkflow
sdk.workflows.proposal   // ProposalWorkflow
```

### Top-level Methods

```typescript
await sdk.getRaises()           // Get all launchpad raises
await sdk.getDaos()             // Get all DAOs
await sdk.getProposals()        // Get all proposals
sdk.getPackageId(name)          // Get package ID by name
sdk.getAllPackageIds()          // Get all package IDs as Record
sdk.createAutoExecutor(url)     // Create AutoExecutor for backend API calls
```

---

## 3. Core Abstractions

### ServiceParams Pattern

All services follow a common constructor pattern:

```typescript
interface ServiceParams {
  client: SuiClient;
  packages: Packages;
  sharedObjects: SharedObjects;
}

class AnyService {
  constructor(params: ServiceParams) { /* ... */ }
}
```

### Packages Interface

```typescript
interface Packages {
  accountProtocol: string;           // Account protocol package
  accountActions: string;            // Account actions package
  futarchyCore: string;              // Futarchy core package
  futarchyFactory: string;           // Factory (launchpad) package
  futarchyActions: string;           // Futarchy actions package
  futarchyGovernance: string;        // Governance package
  futarchyGovernanceActions: string; // Governance actions package
  futarchyOracleActions: string;     // Oracle actions package
  futarchyMarketsCore: string;       // Markets core package
  futarchyMarketsPrimitives: string; // Markets primitives package
  futarchyMarketsOperations: string; // Markets operations package
  oneShotUtils?: string;             // Optional one-shot utility package
}
```

### SharedObjects Interface

```typescript
interface SharedObjects {
  factory: SharedObjectRef;         // Factory shared object
  packageRegistry: SharedObjectRef; // Package registry shared object
  feeManager: SharedObjectRef;      // Fee manager shared object
}

interface SharedObjectRef {
  id: string;
  version: number;
}
```

### Transaction Result Types

```typescript
interface DAOCreationResult {
  digest: string;
  daoId: string;
  packageRegistryId: string;
  response: SuiTransactionBlockResponse;
}

interface ProposalCreationResult {
  digest: string;
  proposalId: string;
  escrowId: string;
  response: SuiTransactionBlockResponse;
}

interface RaiseCreationResult {
  digest: string;
  raiseId: string;
  daoId: string;
  response: SuiTransactionBlockResponse;
}
```

---

## 4. Service Layer

### DAOService

**Location:** `src/services/dao/index.ts`

**Sub-services:**
- `sdk.dao.vault: VaultService` - Deposits, streams, balances
- `sdk.dao.oracle: OracleService` - Price-based grants

**Methods:**
```typescript
// Queries
async getInfo(daoId: string): Promise<DAOFields>
async getConfig(daoId: string): Promise<DAOFields>
async getAll(factoryPackageId: string): Promise<RaiseCompletedEvent[]>
async getByCreator(factoryPackageId: string, creator: string): Promise<RaiseCompletedEvent[]>
async getProposals(daoId: string): Promise<ProposalCreatedEvent[]>

// Managed objects
async addManagedObject(config: { daoId, name, objectId, versionWitness }): Promise<Transaction>
async removeManagedObject(config: { daoId, name, objectType, versionWitness }): Promise<Transaction>
async hasManagedObject(daoId: string, name: string): Promise<boolean>
```

### LaunchpadService

**Location:** `src/services/launchpad/index.ts`

**Methods:**
```typescript
// Lifecycle
createRaise(config: CreateRaiseConfig, successActions?, failureActions?): WorkflowTransaction
contribute(config: ContributeConfig): WorkflowTransaction
completeRaise(config: CompleteRaiseConfig): WorkflowTransaction

// Queries
async getRaise(raiseId: string): Promise<RaiseFields>
async getAll(): Promise<RaiseCreatedEvent[]>
async getByCreator(creator: string): Promise<RaiseCreatedEvent[]>
async isSettled(raiseId: string): Promise<boolean>
async getState(raiseId: string): Promise<number>
```

### ProposalService

**Location:** `src/services/proposal/index.ts`

**Sub-services:**
- `sdk.proposal.sponsorship: SponsorshipService`
- `sdk.proposal.trade: TradeService`
- `sdk.proposal.twap: TwapService`
- `sdk.proposal.escrow: EscrowService`
- `sdk.proposal.markets: ProposalMarketsService`

**Methods:**
```typescript
// Lifecycle
createAndInitializeProposal(config): WorkflowTransaction
addActionsToOutcome(config): WorkflowTransaction
advanceToTrading(config): WorkflowTransaction
finalizeProposal(config): WorkflowTransaction

// Queries
async getInfo(proposalId: string): Promise<ProposalFields>
async getAll(): Promise<ProposalCreatedEvent[]>
async getMarket(proposalId: string): Promise<MarketState>
```

### MarketService

**Location:** `src/services/market/index.ts`

**Sub-service:** `sdk.market.pool: PoolService`

**Methods:**
```typescript
// Swaps
swapAssetForStable(config: SwapConfig): Transaction
swapStableForAsset(config: SwapConfig): Transaction
swapSuiForAsset(config): Transaction

// Queries
async getQuote(config): Promise<bigint>
```

### AdminService

**Location:** `src/services/admin/index.ts`

**Sub-services:**
- `sdk.admin.factory: FactoryAdminService`
- `sdk.admin.verification: VerificationService`
- `sdk.admin.packageRegistry: PackageRegistryService`
- `sdk.admin.feeManager: FeeManagerService`

---

## 5. Workflow Patterns

### Launchpad Workflow

**Location:** `src/workflows/launchpad-workflow.ts`

**Atomic Creation Flow (Single PTB):**
```
1. create_raise() → UnsharedRaise (hot potato)
2. stage_success_intent(UnsharedRaise, actions)
3. stage_failure_intent(UnsharedRaise, actions)
4. lock_and_share_raise(UnsharedRaise) → Shared Raise
```

**Complete Raise Flow (Single PTB):**
```
1. settle_raise(raiseId) → returns raised amount
2. create_dao(...) → returns DAO account
3. execute_init_actions(...) → executes success/failure actions
4. share_dao(...) → shares DAO account
```

Factory creation and launchpad creation default to fresh unregulated Sui registry asset coins. Legacy asset coins are only accepted when the factory owner has added the type with `addAllowedLegacyAssetType(...)` and the caller sets `useAllowedLegacyAsset: true`. Stable coins still require factory allowlisting via `addAllowedStableType(...)`.

### Proposal Workflow

**Location:** `src/workflows/proposal-workflow.ts`

**Atomic Proposal Creation (Single PTB):**
```
1. begin_proposal() → [Proposal, TokenEscrow, ProposalCreationTicket] (all unshared)
2. add_outcome_coins_N() → registers conditional coins
3. finalize_proposal() → consumes ProposalCreationTicket, creates AMM pools, shares both objects
```

Note: `add_outcome_coins*` enforces that `dao_account` matches `proposal.dao_id`, and that the `escrow` belongs to the proposal/DAO (embedded MarketState must match). Mixing objects across DAOs/proposals will abort.

Conditional proposal coins must be new unregulated CoinRegistry currencies. The blank coin registry rejects regulated coins and legacy/unmigrated registry state.

**State Transitions:**
```
PREMARKET → REVIEW → TRADING → AWAITING_EXECUTION → FINALIZED
```

**Finalization Result Parsing:**

After calling `finalizeProposal()`, use `parseFinalizationResult()` to determine what happened:

```typescript
const finalizeTx = proposalWorkflow.finalizeProposal({ proposalId, escrowId, ... });
const result = await executeTransaction(finalizeTx.transaction);

const status = proposalWorkflow.parseFinalizationResult(result);

if (status.isFinalized) {
  // REJECT won immediately - proposal is done
  console.log(`Winner: ${status.rejectWon ? 'REJECT' : 'ACCEPT'}`);
} else if (status.inExecutionWindow) {
  // ACCEPT won - need to execute actions or wait for timeout
  console.log('Execution window started, actions must be executed');
}
```

**Return type:**
```typescript
{
  isFinalized: boolean;      // True if proposal is fully finalized
  rejectWon: boolean;        // True if REJECT won immediately via TWAP
  inExecutionWindow: boolean; // True if ACCEPT won, execution window started
  winningOutcome?: number;   // Outcome index (0=reject, 1+=accept), only if finalized
  approved?: boolean;        // Whether proposal was approved
}
```

**Getting Execution State:**

For proposals in execution window, get the market winner:

```typescript
const state = await proposalWorkflow.getProposalExecutionState(client, proposalId);
console.log(`State: ${state.stateName}`);  // 'awaiting_execution'
console.log(`Market winner: ${state.marketWinner}`);  // 1 (accept outcome)
```

### Intent Execution Pattern

**Location:** `src/workflows/intent-executor.ts`

**3-Layer Execution:**
```
1. begin_execution() → creates Executable (hot potato)
2. N × do_init_*() → execute each action in order
3. finalize_execution() → confirms completion
```

---

## 6. Transaction Building

### WorkflowTransaction Type

All workflow methods return:

```typescript
interface WorkflowTransaction {
  transaction: Transaction;
  description: string;
}
```

### Object Reference Types

To avoid RPC lookups (critical for localnet):

```typescript
type ObjectIdOrRef = string | OwnedObjectRef | TxSharedObjectRef;

interface OwnedObjectRef {
  objectId: string;
  version: string | number;
  digest: string;
}

interface TxSharedObjectRef {
  objectId: string;
  initialSharedVersion: string | number;
  mutable: boolean;
}
```

### TransactionComposer

**Location:** `src/ptb/transaction-composer.ts`

```typescript
const composer = new TransactionComposer(packages, sharedObjects);

const tx = composer
  .new()
  .addStream({ vaultName, beneficiary, ... })
  .addPoolWithMint({ stableResourceName, mintCapResourceName, assetAmount, ... })
  .stageToLaunchpad(unsharedRaiseId, assetType, stableType, 'success')
  .build();
```

---

## 7. Type System

### Sui Object Types

**Location:** `types/sui-types.ts`

```typescript
interface DAOFields {
  id: { id: string };
  name: string;
  metadata?: { fields?: { name?, description?, icon_url? } };
  config?: { fields: { spot_pool_id?, trading_period_ms?, ... } };
}

interface ProposalFields {
  id: { id: string };
  title: string;
  state: number;  // ProposalState enum
  market_state?: unknown;
  dao_id?: string;
  winning_outcome?: number;
}

interface RaiseFields {
  id: { id: string };
  state: number;  // 0=PENDING, 1=ACTIVE, 2=SUCCESS, 3=FAILED
  total_raised?: string;
  creator?: string;
  tokens_for_sale?: string;
}
```

### Event Types

```typescript
interface RaiseCreatedEvent {
  raise_id: string;
  creator: string;
  affiliate_id: string;
  raise_token_type: string;
  stable_coin_type: string;
  asset_currency_id: string;
  stable_currency_id: string;
  tokens_for_sale: string;
  min_raise_amount: string;
  max_raise_amount: string;
  start_time_ms: string;
  deadline_ms: string;
  duration_ms: string;
}

interface ActionsStagedEvent {
  action_types: string[];
  action_versions: number[];
  action_data: Array<number[] | string>;
}

interface ProposalCreatedEvent {
  proposal_id: string;
  dao_id: string;
  proposer: string;
  title: string;
}
```

---

## 8. Action System

### Action Categories

**Location:** `workflows/types/actions/`

**Account Actions:** (`account.ts`)
- `create_stream` - Create vesting stream
- `cancel_stream` - Cancel existing stream
- `deposit` - Deposit to vault
- `spend` - Withdraw from vault
- `mint` - Mint tokens
- `burn` - Burn tokens
- `transfer` - Transfer object
- `transfer_coin` - Transfer coin
- 20+ more...

**Futarchy Actions:** (`futarchy.ts`)
- `update_trading_params` - DAO trading parameters
- `update_twap_config` - TWAP configuration
- `update_dao_metadata` - DAO metadata
- `create_pool_with_mint` - Create AMM pool
- `add_liquidity` - Add liquidity
- `swap` - Swap tokens

**Governance Actions:** (`governance.ts`)
- `add_package` - Add package to whitelist
- `update_dao_creation_fee` - Update DAO fee
- `update_proposal_fee` - Update proposal fee
- `pause_account_creation` - Pause account creation

**Oracle Actions:** (`oracle.ts`)
- `create_oracle_grant` - Create price grant
- `cancel_oracle_grant` - Cancel grant

### Action Configuration Example

```typescript
type ActionConfig = CreateStreamActionConfig | MintActionConfig | ... // Union of 60+ types

interface CreateStreamActionConfig {
  type: 'create_stream';
  coinType?: string;
  vaultName: string;
  beneficiary: string;
  amountPerIteration: bigint;
  startTime: number;
  iterationsTotal: bigint;
  iterationPeriodMs: bigint;
  maxPerWithdrawal: bigint;
}

// Usage:
const actions: ActionConfig[] = [
  {
    type: 'create_stream',
    vaultName: 'treasury',
    beneficiary: '0x...',
    amountPerIteration: 100_000_000n,
    startTime: Date.now() + 300_000,
    iterationsTotal: 12n,
    iterationPeriodMs: 2_592_000_000n,
    maxPerWithdrawal: 100_000_000n,
  },
  {
    type: 'mint',
    coinType: '0x...::coin::COIN',
    amount: 1_000_000_000n,
    resourceName: 'team_tokens'
  }
];
```

---

## 9. Configuration & Deployment

### Network Configuration

**Location:** `config/network.ts`

```typescript
type NetworkType = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

const config = createNetworkConfig('devnet');
// or custom RPC
const config = createNetworkConfig('http://localhost:9000');
```

### Deployment Management

**Location:** `config/deployment.ts`

```typescript
class DeploymentManager {
  static fromConfig(config: DeploymentConfig): DeploymentManager
  getPackage(packageName: string): PackageDeployment | undefined
  getPackageId(packageName: string): string | undefined
  getFactory(): SharedObject | undefined
  getPackageRegistry(): SharedObject | undefined
  getFeeAdminCap(): AdminCap | undefined
  getAllPackageIds(): Record<string, string>
}
```

### Bundled Deployments

Currently bundled:
- ✅ devnet
- ❌ testnet (not yet)
- ❌ mainnet (not yet)
- ⚠️ localnet (dynamic via environment)

---

## 10. Script/Usage Patterns

### Complete Launchpad Example

```typescript
import { FutarchySDK } from '@govex/futarchy-sdk';

// 1. Initialize SDK
const sdk = new FutarchySDK({ network: 'devnet' });
const launchpadWorkflow = sdk.workflows.launchpad;

// 2. Create raise with actions (ATOMIC - single PTB)
const createTx = launchpadWorkflow.createRaise(
  {
    assetType: '0x...::coin::ASSET',
    stableType: '0x...::coin::STABLE',
    treasuryCap: treasuryCapId,
    metadataCap: metadataCapId,  // MetadataCap<T> from coin_registry::new_currency_with_otw()
    tokensForSale: 1_000_000_000n,
    minRaiseAmount: 100_000_000n,
    maxRaiseAmount: 10_000_000_000n,
    // Allows admin-triggered end_raise_early once min is met.
    // Hitting maxRaiseAmount auto-closes contributions on-chain regardless.
    allowEarlyCompletion: true,
    description: 'My token launch',
    launchpadFee: 100n,
  },
  // Success actions (executed if raise succeeds)
  [
    { type: 'create_pool_with_mint', stableResourceName: 'amm_liquidity', mintCapResourceName: 'asset_mint_cap', ... },
    { type: 'create_stream', vaultName: 'treasury', ... },
  ],
  // Failure actions (executed if raise fails)
  []
);

const result = await executeTransaction(createTx.transaction);
const raiseId = extractRaiseId(result);

// 3. Contribute to raise
const contributeTx = launchpadWorkflow.contribute({
  raiseId,
  contributorCapId: capId,
  assetType: '0x...::coin::ASSET',
  stableType: '0x...::coin::STABLE',
  amounts: [1_000_000_000n],
});

// 4. Complete raise (ATOMIC: settle + create DAO + execute actions + share)
const completeTx = launchpadWorkflow.completeRaise({
  raiseId,
  assetType: '0x...::coin::ASSET',
  stableType: '0x...::coin::STABLE',
  spotPoolId,
});
```

### Complete Proposal Example

```typescript
// 1. Create and initialize proposal (ATOMIC)
const createTx = sdk.proposal.createAndInitializeProposal({
  daoAccountId: daoId,
  assetType: '0x...::coin::ASSET',
  stableType: '0x...::coin::STABLE',
  lpType: '0x...::lp::LP',
  title: 'Fund Development',
  introduction: 'Allocate funds for Q1',
  metadata: JSON.stringify({ category: 'funding' }),
  outcomeMessages: ['Reject', 'Accept'],
  outcomeDetails: ['Do nothing', 'Approve funding'],
  proposer: senderAddress,
  usedQuota: false,
  feeCoins: [feeCoinId],
  feeAmount: 1_000_000_000n,
  registryId: registryId,
  spotPoolId: spotPoolId,
  senderAddress: senderAddress,
  baseStableMetadataId: stableMetadataId,
  // Optional: conditional coin registry
  conditionalCoinsRegistry: {
    registryId: registryId,
    coinSets: [...]
  },
  // Optional: actions for outcomes
  outcomeActions: [
    {
      outcomeIndex: 1,  // Accept
      actions: [
        {
          type: 'create_stream',
          vaultName: 'treasury',
          beneficiary: teamAddress,
          amountPerIteration: 10_000_000n,
          startTime: Date.now() + 300_000,
          iterationsTotal: 12n,
          iterationPeriodMs: 2_592_000_000n,
          maxPerWithdrawal: 10_000_000n,
        }
      ],
    }
  ],
});

// 2. Advance to trading
const advanceTx = sdk.workflows.proposal.advanceToTrading({
  proposalId: proposalRef,
  daoAccountId: daoAccountRef,
  escrowId: escrowRef,
  spotPoolId: spotPoolRef,
  assetType, stableType, lpType,
});

// 3. Perform swaps during trading
const swapTx = sdk.workflows.proposal.conditionalSwap({
  proposalId: proposalRef,
  escrowId: escrowRef,
  spotPoolId: spotPoolRef,
  assetType, stableType, lpType,
  stableCoins: [stableCoinId],
  amountIn: 1_000_000_000n,
  minAmountOut: 0n,
  direction: 'stable_to_asset',
  outcomeIndex: 1,  // ACCEPT
  allOutcomeCoins: [...],
  recipient: senderAddress,
});

// 4. Finalize proposal
const finalizeTx = sdk.workflows.proposal.finalizeProposal({
  proposalId: proposalRef,
  escrowId: escrowRef,
  spotPoolId: spotPoolRef,
  assetType, stableType, lpType,
});

// 5. Execute winning outcome actions (via AutoExecutor)
const autoExecutor = sdk.createAutoExecutor('http://localhost:9090');
const executeTx = await autoExecutor.executeProposal(proposalId, {
  accountId: daoAccountRef,
  outcome: winningOutcome,
  escrowId: escrowRef,
  spotPoolId: spotPoolRef,
});
```

---

## 11. Executing Staged Intents

After a launchpad or proposal has staged actions, you need to execute them. The SDK provides the `AutoExecutor` class that fetches staged actions from your backend API and builds the execution PTB automatically.

### AutoExecutor (Recommended)

The `AutoExecutor` is the high-level way to execute staged intents. It:
1. Fetches staged actions from your backend API
2. Converts `IndexedAction[]` to SDK execution configs
3. Builds the complete PTB using `IntentExecutor`
4. Returns a ready-to-sign `Transaction`

```typescript
import { FutarchySDK } from '@govex/futarchy-sdk';

const sdk = new FutarchySDK({ network: 'devnet' });
const backendUrl = 'http://localhost:9090';  // Your indexer API

// Create AutoExecutor
const autoExecutor = sdk.createAutoExecutor(backendUrl);

// --- LAUNCHPAD EXECUTION ---
// Execute success or failure actions after raise completes
const { transaction, raise } = await autoExecutor.executeLaunchpad(raiseId, {
  accountId: daoAccountId,
  actionType: 'success',  // or 'failure'
  clockId: '0x6',         // optional
});

// Sign and submit
await client.signAndExecuteTransaction({ transaction, signer });

// --- PROPOSAL EXECUTION ---
// Execute winning outcome actions after proposal finalizes
const { transaction, proposal } = await autoExecutor.executeProposal(proposalId, {
  accountId: daoAccountId,
  outcome: 1,             // optional, defaults to winning_outcome
  escrowId,               // optional, fetched from backend if not provided
  spotPoolId,             // optional, fetched from backend if not provided
  clockId: '0x6',         // optional
});

await client.signAndExecuteTransaction({ transaction, signer });
```

### IntentExecutor (Direct Control)

For more control, use `IntentExecutor` directly with manually-provided actions:

```typescript
import { IntentExecutor, parsedActionsToExecutionConfigs } from '@govex/futarchy-sdk';

const executor = new IntentExecutor(client, sdk.packages);

// Convert backend actions to SDK format
const actions = parsedActionsToExecutionConfigs(parsedActions);

// Build PTB for launchpad
const { transaction } = executor.execute({
  intentType: 'launchpad',
  accountId,
  raiseId,
  assetType,
  stableType,
  actions,
});

// Build PTB for proposal
const { transaction } = executor.execute({
  intentType: 'proposal',
  accountId,
  proposalId,
  escrowId,
  spotPoolId,
  assetType,
  stableType,
  lpType,
  actions,
});
```

### Backend API Endpoints

The `AutoExecutor` fetches from these endpoints:

| Endpoint | Returns | Used For |
|----------|---------|----------|
| `GET /launchpads/:id` | `{ success_actions, failure_actions, ... }` | Launchpad execution |
| `GET /proposals/:id` | `{ staged_actions: { "1": [...], "2": [...] }, ... }` | Proposal execution |
| `GET /daos/:id` | `{ init_actions, ... }` | DAO init execution |

### Action Data Format

Actions are stored as `IndexedAction[]` in the backend:

```typescript
interface IndexedAction {
  index: number;           // Position in batch (0-indexed)
  type: string;            // Short name: "VaultSpend", "CreateStream"
  fullType: string;        // Full Move type with generics
  packageId?: string;      // Extracted from fullType
  coinType?: string;       // First generic parameter
  params: Array<{
    type: string;          // "u64", "String", "address", etc.
    name: string;          // Parameter name
    value: string;         // Value as string
  }>;
}
```

### Execution Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     STAGED ACTIONS (On-Chain)                        │
│  Raise.success_actions / Proposal.staged_actions[outcome]           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Events: DaoInitActionsStaged, LaunchpadActionsStaged, ProposalActionsStaged
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKEND INDEXER (gRPC)                           │
│  Captures events → Stores IndexedAction[] in Prisma                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ HTTP API: /launchpads/:id, /proposals/:id
┌─────────────────────────────────────────────────────────────────────┐
│                     AUTO EXECUTOR (SDK)                              │
│  1. Fetch from backend API                                          │
│  2. Convert to IntentActionConfig[]                                 │
│  3. Build PTB via IntentExecutor                                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Transaction
┌─────────────────────────────────────────────────────────────────────┐
│                     EXECUTION PTB (3-Layer Pattern)                  │
│  1. begin_execution() → Executable (hot potato)                     │
│  2. do_init_*() × N   → Execute each action in order                │
│  3. finalize_execution() → Confirm completion                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Example: Complete Launchpad Flow

```typescript
// 1. Create raise with staged actions
const createTx = launchpadWorkflow.createRaiseWithActions(
  raiseConfig,
  successActions,  // Actions to execute on success
  failureActions,  // Actions to execute on failure
);
await executeTransaction(createTx.transaction);

// 2. Contribute, wait for deadline...

// 3. Complete raise (creates DAO)
const completeTx = launchpadWorkflow.completeRaise({ raiseId, ... });
const result = await executeTransaction(completeTx.transaction);
const accountId = extractAccountId(result);

// 4. Wait for indexer to capture staged actions
await sleep(5000);

// 5. Execute init actions via AutoExecutor
const autoExecutor = sdk.createAutoExecutor(backendUrl);
const { transaction } = await autoExecutor.executeLaunchpad(raiseId, {
  accountId,
  actionType: 'success',  // or 'failure' based on raise outcome
});
await executeTransaction(transaction);
```

### Built-in Launchpad Behavior vs Staged Actions

The launchpad has **built-in behavior** that happens automatically during DAO creation (NOT via staged actions):

| Path | Built-in (Automatic) | What You Stage |
|------|---------------------|----------------|
| **Success** | Locks TreasuryCap + MetadataCap in DAO | Your init actions (pool, streams, etc.) |
| **Failure** | Returns TreasuryCap + MetadataCap to creator | Optional cleanup actions |

**Important:** The SDK executes exactly what was staged - it does NOT prepend any built-in actions. The built-in behavior (locking/returning caps) happens inside Move code before your staged actions run.

### Supported Action Types

The `IntentExecutor` supports **60+ action types**. See `src/config/action-definitions.ts` for the complete registry and `../packages/docs/ACTION_REGISTRY.md` for documentation.

---

## 12. Key Concepts

### Hot Potato Pattern

The SDK uses Move's "hot potato" pattern where objects must be consumed within the same transaction:

```
create_raise() → UnsharedRaise (must pass to next step)
    ↓
stage_success_intent(UnsharedRaise) → UnsharedRaise
    ↓
stage_failure_intent(UnsharedRaise) → UnsharedRaise
    ↓
lock_and_share_raise(UnsharedRaise) → consumes it, shares Raise
```

### Atomic Transaction Blocks

Modern operations are atomic (single PTB):
- **Raise Creation**: create + stage actions + lock
- **Proposal Creation**: begin + register coins + create AMMs + share
- **Raise Completion**: settle + create DAO + execute actions + share

### Type Arguments in Move Calls

Generic types must be passed as `typeArguments`:

```typescript
tx.moveCall({
  target: `${packageId}::module::function`,
  typeArguments: [assetType, stableType, lpType],
  arguments: [/* Move arguments */]
});
```

### Object Reference Management

For localnet (or to avoid RPC lookups), pass full object references:

```typescript
// Instead of just object ID
const ref: TxSharedObjectRef = {
  objectId: '0x...',
  initialSharedVersion: 123,
  mutable: true,
};

// Use in workflow
sdk.workflows.proposal.advanceToTrading({
  proposalId: ref,  // Pass ref instead of string
  ...
});
```

### Intent Execution System

Staged actions flow:
```
Staged Actions → Intent (serialized) → Backend verification → Execution (3-layer PTB)
```

The 3-layer pattern:
1. `begin_execution()` → Executable (hot potato)
2. N × `do_init_*()` → action results
3. `finalize_execution()` → confirmation

---

## Quick Reference Table

| Component | Purpose | Access |
|-----------|---------|--------|
| **FutarchySDK** | Main entry point | `new FutarchySDK({...})` |
| **DAOService** | DAO operations | `sdk.dao` |
| **LaunchpadService** | Token launch | `sdk.launchpad` |
| **ProposalService** | Governance | `sdk.proposal` |
| **MarketService** | AMM & trading | `sdk.market` |
| **AdminService** | Admin ops | `sdk.admin` |
| **LaunchpadWorkflow** | Low-level launch | `sdk.workflows.launchpad` |
| **ProposalWorkflow** | Low-level proposal | `sdk.workflows.proposal` |
| **IntentExecutor** | Action execution | `sdk.workflows.intentExecutor` |
| **QueryHelper** | Object queries | `sdk.utils.queryHelper` |
| **CurrencyUtils** | Coin operations | `sdk.utils.currency` |
| **AutoExecutor** | Backend integration | `sdk.createAutoExecutor(url)` |

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            APPLICATION LAYER                             │
├─────────────────────────────────────────────────────────────────────────┤
│  FutarchySDK                                                            │
│    ├─ Services (high-level API)                                         │
│    │   ├─ dao, launchpad, proposal, market, admin                       │
│    │   └─ Return: WorkflowTransaction { transaction, description }      │
│    ├─ Workflows (low-level orchestration)                               │
│    │   ├─ LaunchpadWorkflow, ProposalWorkflow                           │
│    │   └─ Build atomic PTBs with hot potato handling                    │
│    └─ Utils (helpers)                                                   │
│        └─ queryHelper, currency, transactionBuilder                     │
├─────────────────────────────────────────────────────────────────────────┤
│                            PROTOCOL LAYER                                │
├─────────────────────────────────────────────────────────────────────────┤
│  protocol/                                                              │
│    ├─ account/ (Account protocol bindings)                              │
│    ├─ futarchy/ (Futarchy core bindings)                                │
│    └─ markets/ (Markets core bindings)                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                            INFRASTRUCTURE                                │
├─────────────────────────────────────────────────────────────────────────┤
│  config/                                                                │
│    ├─ NetworkConfig (RPC URL, client)                                   │
│    └─ DeploymentManager (package IDs, shared objects)                   │
│  types/                                                                 │
│    ├─ sui-types.ts (DAOFields, ProposalFields, etc.)                    │
│    └─ services/ (Packages, SharedObjects, Results)                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            SUI BLOCKCHAIN                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Factory   │  │  Registry   │  │ FeeManager  │  │    DAOs     │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                      │
│  │   Raises    │  │  Proposals  │  │    Pools    │                      │
│  └─────────────┘  └─────────────┘  └─────────────┘                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Scripts Directory

The `sdk/scripts/` directory contains all test and utility scripts:

```
sdk/scripts/
├── execute-tx.ts              # Transaction execution helpers (initSDK, executeTransaction)
├── test-utils.ts              # Shared test utilities (sleep, waitForIndexer, loadDaoInfo)
├── e2e-test-utils.ts          # SDK-dependent test utilities

# Setup Scripts (run by localnet.sh)
├── protocol-init.ts           # One-time protocol initialization
├── protocol-setup.ts          # Legacy: init + create coins
├── create-test-coins.ts       # Create fresh TASSET/TSTABLE/LP coins
├── deploy-conditional-coins.ts # Deploy conditional coins for proposals
├── generate-conditional-coins.ts # Generate conditional coin Move code

# E2E Test Scripts
├── launchpad-e2e.ts           # Create DAO via launchpad (2-outcome)
├── proposal-e2e-with-swaps.ts # Full proposal lifecycle test
├── test-reject-wins.ts        # Proposal where reject wins
├── test-memo-action.ts        # Proposal with memo action
├── test-sponsorship.ts        # Proposal sponsorship flow
├── test-multi-outcome.ts      # 3+ outcome proposal test

# Utility Scripts
├── create-dao-direct.ts       # Create DAO directly (not via launchpad)
├── register-new-packages.ts   # Register packages in registry
├── process-deployments.ts     # Process deployment JSON files
├── validate-deployments.ts    # Validate deployment configuration
```

### Key Script Patterns

**SDK Initialization (all scripts use this):**
```typescript
import { initSDK, executeTransaction, getActiveAddress } from "./execute-tx";

const sdk = await initSDK();
const activeAddress = getActiveAddress();
```

**Loading Test Fixtures:**
```typescript
import { loadDaoInfo, loadConditionalCoinsInfo } from "./test-utils";

const daoInfo = loadDaoInfo();  // Reads test-dao-info.json
const conditionalCoins = loadConditionalCoinsInfo();  // Reads conditional-coins-info.json
```

**Waiting for Indexer:**
```typescript
import { waitForIndexer, waitForTimePeriod } from "./test-utils";

await waitForIndexer(network, { description: "proposal created" });
await waitForTimePeriod(TEST_CONFIG.TRADING_PERIOD_MS + 2000, { description: "trading period" });
```

---

## npm Scripts

Available in `sdk/package.json`:

```bash
# Setup
npm run protocol-init          # One-time protocol initialization
npm run create-test-coins      # Create fresh test coins
npm run deploy-conditional-coins # Deploy conditional coins

# DAO Creation
npm run launchpad-e2e-two-outcome  # Create DAO via launchpad
npm run create-dao-direct          # Create DAO directly

# E2E Tests
npm run test:proposal-with-swaps   # Full proposal test
npm run test:reject-wins           # Reject outcome wins
npm run test:memo-action           # Memo action execution
npm run test:sponsorship           # Sponsorship flow
npm run test:multi-outcome         # Multi-outcome proposal
```

---

## File Artifacts

During testing, the following JSON files are created:

| File | Purpose | Created By |
|------|---------|------------|
| `test-coins-info.json` | Test coin types and treasury caps | `create-test-coins.ts` |
| `test-dao-info.json` | DAO account, pool, and type info | `launchpad-e2e.ts` |
| `conditional-coins-info.json` | Conditional coin registry and types | `deploy-conditional-coins.ts` |

These are read by subsequent test scripts to chain operations together.

---

## Move Packages (On-Chain Smart Contracts)

The Futarchy platform consists of multiple core Move packages deployed to Sui. These are the on-chain smart contracts that the SDK interacts with.

### Package Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRAMEWORK LAYER                                      │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐           │
│  │     AccountProtocol         │  │      AccountActions         │           │
│  │  (account, intents, exec)   │──│  (vault, stream, currency)  │           │
│  └─────────────────────────────┘  └─────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CORE LAYER                                         │
│  ┌───────────────┐  ┌───────────────────────┐                              │
│  │futarchy_core  │  │futarchy_one_shot_utils│                              │
│  │  (DaoConfig)  │  │  (constants, math)    │                              │
│  └───────────────┘  └───────────────────────┘                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MARKETS LAYER                                       │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐        │
│  │futarchy_markets_  │  │futarchy_markets_  │  │futarchy_markets_  │        │
│  │   primitives      │──│      core         │──│   operations      │        │
│  │ (AMM, TWAP, escrow│  │(proposal, spot)   │  │ (swap, liquidity) │        │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYER                                    │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │futarchy_      │  │futarchy_      │  │futarchy_      │  │futarchy_     │  │
│  │  actions      │  │  factory      │  │ governance_   │  │ governance   │  │
│  │(config, liq)  │  │(DAO, launch)  │  │   actions     │  │(lifecycle)   │  │
│  └───────────────┘  └───────────────┘  └───────────────┘  └──────────────┘  │
│                                                                              │
│  ┌───────────────────────────┐                                              │
│  │  futarchy_oracle_actions  │                                              │
│  │   (price-based grants)    │                                              │
│  └───────────────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Package Directory

| Package | Location | Purpose |
|---------|----------|---------|
| **AccountProtocol** | `smart_account/protocol` | Core account, intents, executables |
| **AccountActions** | `smart_account/actions` | Vault, stream, currency, transfer |
| **futarchy_one_shot_utils** | `futarchy_one_shot_utils/` | Constants, math, utilities |
| **futarchy_core** | `futarchy_core/` | DaoConfig, FutarchyConfig |
| **futarchy_markets_primitives** | `futarchy_markets_primitives/` | AMM, TWAP oracle, escrow |
| **futarchy_markets_core** | `futarchy_markets_core/` | Proposal, spot pool, fees |
| **futarchy_markets_operations** | `futarchy_markets_operations/` | User swap/liquidity operations |
| **futarchy_oracle_actions** | `futarchy_oracle_actions/` | Price-based token grants |
| **futarchy_actions** | `futarchy_actions/` | Config, liquidity, dissolution |
| **futarchy_factory** | `futarchy_factory/` | DAO creation, launchpad |
| **futarchy_governance_actions** | `futarchy_governance_actions/` | Intent execution, registry |
| **futarchy_governance** | `futarchy_governance/` | Proposal lifecycle, PTB execution |

---

### Framework Layer (2 packages)

#### AccountProtocol
**Location:** `packages/smart_account/protocol`

Core framework for on-chain accounts with intent-based governance.

**Key Modules:**
- `account.move` - Main Account struct (shared multisig with dynamic field config)
- `intents.move` - Intent struct managing action stacks
- `executable.move` - Hot potato for enforcing action execution
- `package_registry.move` - Package dependency tracking

**Key Types:**
```move
struct Account has key { id: UID, ... }
struct Intent { actions: vector<ActionSpec>, ... }
struct Executable { /* hot potato - must be consumed */ }
```

#### AccountActions
**Location:** `packages/smart_account/actions`

Standard actions for accounts (vault, streaming, currency).

**Key Modules:**
- `lib/vault.move` - Vault/escrow management
- `lib/stream_utils.move` - Payment streaming
- `lib/currency.move` - Coin management
- `lib/transfer.move` - Object transfers
- `lib/memo.move` - Transaction memos

---

### Core Layer (2 packages)

#### futarchy_one_shot_utils
**Location:** `packages/futarchy/futarchy_one_shot_utils`

Protocol constants and math utilities.

**Key Constants:**
```move
const PROTOCOL_FEE_BPS: u64 = 50;           // 0.5%
const MAX_AMM_FEE_BPS: u64 = 500;           // 5%
const PRICE_PRECISION_SCALE: u128 = 1_000_000_000_000;  // 1e12
const TWAP_PRICE_CAP_WINDOW: u64 = 60_000;  // 60 seconds
const LAUNCHPAD_DURATION_MS: u64 = 30_000;  // 30s (test), 4 days (prod)
const MAX_OUTCOMES: u64 = 50;
const MAX_ACTIONS: u64 = 50;
```

#### futarchy_core
**Location:** `packages/futarchy/futarchy_core`

DAO configuration and state management.

**Key Types:**
```move
struct DaoConfig {
    trading_params: TradingParams,
    twap_config: TwapConfig,
    governance_config: GovernanceConfig,
    metadata_config: MetadataConfig,
    conditional_coin_config: ConditionalCoinConfig,
    quota_config: QuotaConfig,
    sponsorship_config: SponsorshipConfig,
}

struct FutarchyConfig {
    dao_config: DaoConfig,
    asset_type: TypeName,
    stable_type: TypeName,
    dao_state: DaoState,  // active/terminated
    ...
}
```

---

### Markets Layer (3 packages)

#### futarchy_markets_primitives
**Location:** `packages/futarchy/futarchy_markets_primitives`

Low-level market primitives.

**Key Modules:**
- `conditional/conditional_amm.move` - XY=K AMM for conditional tokens
- `conditional/market_state.move` - Proposal state machine
- `conditional/coin_escrow.move` - Token escrow
- `PCW_TWAP_oracle.move` - Manipulation-resistant TWAP

**State Machine:**
```
PREMARKET → REVIEW → TRADING → AWAITING_EXECUTION → FINALIZED
```

**AMM:**
```move
struct LiquidityPool {
    market_id: ID,
    outcome_idx: u64,
    asset_reserve: u64,
    stable_reserve: u64,
    lp_supply: Supply<LP>,
    oracle: Oracle,
    ...
}
```

#### futarchy_markets_core
**Location:** `packages/futarchy/futarchy_markets_core`

Core proposal and market logic.

**Key Types:**
```move
struct Proposal<AssetType, StableType> has key {
    id: UID,
    state: u8,
    outcome_count: u64,
    outcome_messages: vector<String>,
    intent_specs: VecMap<u64, IntentSpec>,  // actions per outcome
    amm_pools: vector<LiquidityPool>,
    ...
}

struct UnifiedSpotPool<AssetType, StableType, LpType> has key {
    id: UID,
    asset_reserve: Balance<AssetType>,
    stable_reserve: Balance<StableType>,
    lp_supply: Supply<LpType>,
    ...
}
```

#### futarchy_markets_operations
**Location:** `packages/futarchy/futarchy_markets_operations`

User-facing swap and liquidity operations.

**Entry Functions:**
```move
public entry fun swap_asset_for_stable<A, S, L>(...)
public entry fun swap_stable_for_asset<A, S, L>(...)
public entry fun add_liquidity<A, S, L>(...)
public entry fun remove_liquidity<A, S, L>(...)
```

---

### Application Layer (5 packages)

#### futarchy_actions
**Location:** `packages/futarchy/futarchy_actions`

Governance actions for configuration and liquidity.

**Action Types:**
- `SetProposalsEnabled` - Enable/disable proposals
- `TradingParamsUpdate` - Update trading parameters
- `TwapConfigUpdate` - Update TWAP settings
- `MetadataUpdate` - Update DAO metadata
- `TerminateDao` - Irreversible DAO termination

#### futarchy_factory
**Location:** `packages/futarchy/futarchy_factory`

Factory for creating DAOs and launchpad.

**Key Modules:**
- `factory.move` - DAO creation, admin capabilities
- `launchpad.move` - Token sale mechanism
- `dao_init_executor.move` - Init action execution

**Launchpad Flow:**
```
Create Raise → Contribute → Settle → Create DAO → Execute Init Actions
```

#### futarchy_oracle_actions
**Location:** `packages/futarchy/futarchy_oracle_actions`

Price-based token grants.

**Key Functions:**
```move
public fun create_oracle_grant<A, S>(...)  // Create price-conditional grant
public fun execute_grant<A, S>(...)        // Execute when price met
public fun cancel_grant<A, S>(...)         // Cancel grant
```

#### futarchy_governance_actions
**Location:** `packages/futarchy/futarchy_governance_actions`

Intent execution and registry management.

**Key Functions:**
```move
public fun execute_proposal_intent(...)     // Internal helper (used by ptb_executor; returns Executable + ticket)
public fun cleanup_expired_intents(...)     // Remove stale intents
public fun update_package_registry(...)     // Manage packages
```

#### futarchy_governance
**Location:** `packages/futarchy/futarchy_governance`

Complete proposal lifecycle orchestration.

**Key Modules:**
- `proposal/proposal_lifecycle.move` - Full proposal flow
- `execution/ptb_executor.move` - PTB action execution

**Lifecycle Events:**
```move
ProposalActivated { proposal_id }
ProposalMarketFinalized { proposal_id, winning_outcome }
ProposalIntentExecuted { proposal_id, intent_key }
ExecutionTimedOut { proposal_id }
```

**Execution Window:** 30 minutes after TWAP measurement

---

### Key Architectural Patterns

#### 1. Hot Potato Pattern
Executables must be created and destroyed in same transaction:
```move
let (exec, ticket) = begin_execution(...);  // Create hot potato (+ finalize ticket)
do_action_1(exec, ...);
do_action_2(exec, ...);
finalize_execution_success(exec, ticket);   // Must consume both
```

#### 2. Intent-Based Execution
Actions staged in intents, executed with governance approval:
```
Stage Actions → Create Intent → Approve → Execute via PTB
```

#### 3. XY=K Constant Product AMM
Conditional markets use Uniswap V2 style pools:
```
asset_reserve * stable_reserve = K (constant)
```

#### 4. PCW TWAP Oracle
Percent-Capped Windowed TWAP prevents manipulation:
- 1-minute windows
- Cap grows with TWAP (percentage-based)
- O(1) gas complexity

#### 5. State Machine
Proposals flow through defined states:
```
PREMARKET (0) → REVIEW (1) → TRADING (2) → AWAITING_EXECUTION (3) → FINALIZED (4)
```

#### 6. Witness Types
Authorization via witness patterns:
```move
struct ConfigWitness has drop {}
struct GovernanceWitness has drop {}
```

---

### Deployment

Packages are deployed via `packages/scripts/deploy_verified.sh`:

```bash
cd packages
./scripts/deploy_verified.sh --network localnet   # Deploy to localnet
./scripts/deploy_verified.sh --network devnet     # Deploy to devnet
./scripts/deploy_verified.sh --network testnet    # Deploy to testnet
./scripts/deploy_verified.sh --network mainnet    # Deploy to mainnet
```

#### Network-Specific Directory Structure

Each network has its own deployment directory to support parallel deployments:

```
packages/
├── deployments/
│   ├── devnet/                    # Raw deployment JSONs for devnet
│   │   ├── AccountProtocol.json
│   │   ├── futarchy_factory.json
│   │   └── ...
│   ├── testnet/                   # Raw deployment JSONs for testnet
│   ├── mainnet/                   # Raw deployment JSONs for mainnet
│   └── localnet/                  # Raw deployment JSONs for localnet
└── deployment-logs/
    ├── devnet/                    # Deployment logs per network
    ├── testnet/
    └── ...

sdk/
└── deployments-processed/
    ├── _all-packages-devnet.json  # Processed for SDK (devnet)
    ├── _all-packages-testnet.json # Processed for SDK (testnet)
    ├── _all-packages-mainnet.json # Processed for SDK (mainnet)
    ├── _all-packages-localnet.json
    └── _all-packages.json         # Backwards compat (last deployed network)
```

#### How the SDK Loads Deployments

The SDK dynamically loads deployment configs at runtime:

```typescript
// SDK automatically uses the correct deployment for the network
const sdk = new FutarchySDK({ network: "testnet" });

// Or provide custom deployments
const sdk = new FutarchySDK({
  network: "testnet",
  deployments: customDeploymentConfig
});
```

The SDK uses `require()` to load `_all-packages-{network}.json` files. Missing networks gracefully return `undefined`, so you can deploy to new networks without breaking the SDK build.

#### Deployment Process

When you run `./scripts/deploy_verified.sh --network testnet`:

1. **Deploy packages** → Raw JSONs saved to `packages/deployments/testnet/`
2. **Process deployments** → Runs `sdk/scripts/process-deployments.ts --network testnet`
3. **Output** → Creates `sdk/deployments-processed/_all-packages-testnet.json`
4. **SDK ready** → `new FutarchySDK({ network: "testnet" })` works immediately
