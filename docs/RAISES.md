# Raises (Token Launches)

Complete guide to creating and managing token launches via the Govex Launchpad.

## Overview

A **Raise** is a token launch that:
1. Creates a new DAO Account alongside the fundraise
2. Accepts contributions in a stable coin during a funding period
3. On success: executes staged actions (create pools, streams, protective orders, etc.)
4. On failure: refunds all contributors

DAOs can **only** be created through the Launchpad — there is no standalone `createDAO()`.

## Lifecycle

```
CREATE ──► FUNDING ──► SETTLE ──► EXECUTE INTENTS ──► SUCCESSFUL
                          │                               │
                          │ (min not met)                  │ (timeout)
                          ▼                               ▼
                       FAILED ◄────────────────── COMPLETION_PENDING
```

### States

| State | Value | Description |
|-------|-------|-------------|
| `FUNDING` | 0 | Active contribution period |
| `SUCCESSFUL` | 1 | Min raised & all init actions executed |
| `FAILED` | 2 | Min not raised or force-failed after timeout |
| `COMPLETION_PENDING` | 3 | Min raised, awaiting intent execution |

---

## Step 1: Create Raise (Atomic)

A single transaction creates the raise, the DAO account, stages all success/failure actions, and shares the raise.

```typescript
import { FutarchySDK } from '@govex/futarchy-sdk';

const sdk = new FutarchySDK({ network: 'testnet' });

const { transaction } = sdk.launchpad.createRaise(
  {
    creator: senderAddress,
    assetType: '0x...::coin::MYTOKEN',
    stableType: '0x2::sui::SUI',
    treasuryCap: treasuryCapId,
    metadataCap: metadataCapId,
    assetCurrency: assetCurrencyId,
    stableCurrency: stableCurrencyId,
    tokensForSale: 1_000_000_000n,
    minRaiseAmount: 100_000_000n,
    maxRaiseAmount: 10_000_000_000n,
    allowEarlyCompletion: true,
    durationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    startDelayMs: 0,
    description: 'My token launch',
    launchpadFee: 100n,
    // Optional:
    useAllowedLegacyAsset: false,            // true only for factory-allowlisted legacy assets
    ammPercentOfRaiseBps: 2000,           // 20% of total raise → AMM pool
    bidWallPercentOfExcessBps: 8000,      // 80% of excess → protective bid wall
    metadata: { website: 'https://...' },
    affiliateId: '0x...',
  },
  // Success actions (executed if raise meets min)
  [
    {
      type: 'create_pool_with_mint',
      stableResourceName: 'amm_liquidity',
      mintCapResourceName: 'asset_mint_cap',
      assetAmount: 500_000_000n,
      feeBps: 30,
      launchFeeDurationMs: 0n,
      lpType,
      lpTreasuryCapId,
      lpCurrencyId,
    },
    {
      type: 'create_protective_bid',
      vaultName: 'bid_wall_funds',
      bidPrice: 50_000n,
    },
    {
      type: 'create_stream',
      vaultName: 'treasury',
      beneficiary: teamAddress,
      amountPerIteration: 10_000_000n,
      startTime: Date.now() + 30 * 24 * 60 * 60 * 1000,
      iterationsTotal: 12n,
      iterationPeriodMs: BigInt(30 * 24 * 60 * 60 * 1000),
    },
  ],
  // Failure actions (executed if raise fails)
  [
    { type: 'remove_treasury_cap_to_resources', coinType: assetType, expectedCapId, resourceName: 'treasury_cap' },
    { type: 'transfer', objectType: `0x2::coin::TreasuryCap<${assetType}>`, recipient: senderAddress, resourceName: 'treasury_cap' },
  ]
);

const result = await client.signAndExecuteTransaction({ transaction, signer });
```

### What Happens Internally

The atomic transaction:
1. `create_raise_with_account_setup` — creates UnsharedRaise + DAO Account
2. Auto-inserts helper actions (coin approvals for treasury/amm vaults, spend actions)
3. `stage_success_intent` — registers success actions on the raise
4. `stage_failure_intent` — registers failure actions (if provided)
5. `lock_and_share_raise` — locks intents, shares the Raise object

By default the raise asset coin must be a fresh unregulated Sui registry coin. For legacy assets, the factory owner must add the type with `sdk.admin.factory.addAllowedLegacyAssetType(...)` and the raise config must set `useAllowedLegacyAsset: true`. The factory owner must still allowlist the stable coin type with `sdk.admin.factory.addAllowedStableType(...)`.

### Vault Allocation on Success

Raised stable coins are automatically split:
- **Remainder** → `treasury` vault
- **ammPercentOfRaiseBps** (default 20%) of total → `amm_liquidity` vault
- **bidWallPercentOfExcessBps** (default 80%) of excess above min → `bid_wall_funds` vault

---

## Step 2: Contribute

During the funding period, users contribute stable coins.

```typescript
const { transaction } = sdk.launchpad.contribute({
  raiseId,
  assetType: '0x...::coin::MYTOKEN',
  stableType: '0x2::sui::SUI',
  amount: 1_000_000_000n,
  protocolFee: bidFeeAmount,     // protocol fee in SUI
  feeManagerId: feeManagerId,
  stableCoins: [stableCoinId],   // coins to pay from
});

await client.signAndExecuteTransaction({ transaction, signer });
```

### Accept Reservation (Pre-allocated)

For reserved wallet allocations:

```typescript
const { transaction } = sdk.launchpad.acceptReservation({
  raiseId,
  assetType: '0x...::coin::MYTOKEN',
  stableType: '0x2::sui::SUI',
  amount: reservedAmount,
  protocolFee: bidFeeAmount,
  feeManagerId: feeManagerId,
  stableCoins: [stableCoinId],
});
```

---

## Step 3: Complete Raise

After the funding period ends (or early completion triggered):

```typescript
const { transaction } = sdk.launchpad.completeRaise({
  raiseId,
  accountId: daoAccountId,
  assetType: '0x...::coin::MYTOKEN',
  stableType: '0x2::sui::SUI',
});

await client.signAndExecuteTransaction({ transaction, signer });
```

This performs:
1. `settle_raise` — finalizes contributions, determines success/failure
2. `create_completion_intents` — creates init intents on the DAO Account

If the raise has staged actions, state becomes `COMPLETION_PENDING`.

---

## Step 4: Execute Completion Intents

Execute the staged success/failure actions using the `AutoExecutor`:

```typescript
const autoExecutor = sdk.createAutoExecutor('http://your-indexer-api:9090');

const { transaction, raise } = await autoExecutor.executeLaunchpad(raiseId, {
  accountId: daoAccountId,
  actionType: 'success', // or 'failure'
});

await client.signAndExecuteTransaction({ transaction, signer });
```

Or use `IntentExecutor` for direct control:

```typescript
import { IntentExecutor } from '@govex/futarchy-sdk';

const executor = new IntentExecutor(client, sdk.packages);
const { transaction } = executor.execute({
  type: 'launchpad',
  raiseId,
  accountId: daoAccountId,
  assetType, stableType,
  actions: executionConfigs,
});
```

The 3-layer execution pattern:
1. `begin_success_execution_for_launchpad` → creates Executable (hot potato)
2. N x `do_init_*` → executes each action in order
3. `finalize_completion_execution` → confirms, updates state to SUCCESSFUL

---

## Step 5: Claim Tokens / Refund

After completion:

```typescript
// On success: claim allocated tokens
const { transaction } = sdk.launchpad.claimTokens({
  raiseId,
  assetType: '0x...::coin::MYTOKEN',
  stableType: '0x2::sui::SUI',
});

// On failure: claim refund
const { transaction } = sdk.launchpad.claimRefund({
  raiseId,
  assetType: '0x...::coin::MYTOKEN',
  stableType: '0x2::sui::SUI',
});
```

---

## Recovery Operations

### Rollback After Timeout

If completion stalls for 24+ hours, anyone can force-fail:

```typescript
const { transaction } = sdk.launchpad.rollbackCompletionAfterTimeout({
  raiseId,
  accountId: daoAccountId,
  assetType, stableType,
});
```

### Reconcile Completion State

If intents were executed via an alternate path:

```typescript
const { transaction } = sdk.launchpad.reconcileCompletionState({
  raiseId,
  accountId: daoAccountId,
  assetType, stableType,
});
```

### Burn Unsold Tokens

After a failed raise, burn remaining tokens:

```typescript
const { transaction } = sdk.launchpad.burnUnsoldTokens({
  raiseId,
  treasuryCapId,
  assetType, stableType,
});
```

---

## Query Operations

```typescript
// Get raise details
const raise = await sdk.launchpad.getRaise(raiseId);

// Get all raises
const allRaises = await sdk.launchpad.getAll();

// Get raises by creator
const myRaises = await sdk.launchpad.getByCreator(myAddress);

// Check state
const state = await sdk.launchpad.getState(raiseId);
const settled = await sdk.launchpad.isSettled(raiseId);

// Get total raised
const total = await sdk.launchpad.getTotalRaised(raiseId);
```

---

## Supported Success/Failure Actions

See [ACTIONS.md](ACTIONS.md) for the full list. Common raise actions:

| Action | Description |
|--------|-------------|
| `create_pool_with_mint` | Create AMM pool with minted tokens |
| `create_protective_bid` | Create price-support bid wall |
| `create_protective_ask` | Create fixed-price ask wall |
| `create_stream` | Vesting stream to team/investor |
| `create_vesting` | Standalone vesting with fund isolation |
| `mint` | Mint tokens into executable resources |
| `deposit` | Deposit coins into a vault |
| `spend` | Withdraw coins from a vault |
| `transfer` | Transfer object to recipient |
| `remove_treasury_cap_to_resources` | Remove treasury cap into executable resources |
| `lock_treasury_cap` | Lock treasury cap with permissions |
| `memo` | Emit an on-chain memo event |
