# Proposals (Futarchy Governance)

Complete guide to creating and managing futarchy governance proposals.

## Overview

A **Proposal** is a governance decision resolved by prediction markets. Traders bet on outcomes — the market-determined winner's actions get executed on the DAO.

## Lifecycle

```
CREATE ──► PREMARKET ──► REVIEW ──► TRADING ──► FINALIZE
                                                    │
                                        ┌───────────┴───────────┐
                                        ▼                       ▼
                                  REJECT wins            ACCEPT wins
                                  (FINALIZED)       (AWAITING_EXECUTION)
                                                          │
                                                ┌─────────┴─────────┐
                                                ▼                   ▼
                                          Execute actions    30min timeout
                                          (FINALIZED)       → force REJECT
                                                            (FINALIZED)
```

### States

| State | Value | Description |
|-------|-------|-------------|
| `PREMARKET` | 0 | Just created, not yet in review |
| `REVIEW` | 1 | Visible, actions can be added |
| `TRADING` | 2 | Active market trading period |
| `AWAITING_EXECUTION` | 3 | Accept won, 30-min execution window |
| `FINALIZED` | 4 | Terminal state — winner determined |

---

## Step 1: Create & Initialize Proposal (Atomic)

A single transaction creates the proposal, registers conditional coins, and creates AMM pools.

```typescript
import { FutarchySDK } from '@govex/futarchy-sdk';

const sdk = new FutarchySDK({ network: 'testnet' });

const { transaction } = sdk.proposal.createAndInitializeProposal({
  daoAccountId: daoId,
  assetType: '0x...::coin::MYTOKEN',
  stableType: '0x2::sui::SUI',
  lpType: '0x...::lp::LP',

  // Proposal metadata
  title: 'Fund Q1 Development',
  introduction: 'Allocate 100k tokens for engineering',
  metadata: JSON.stringify({ category: 'funding', urgency: 'medium' }),

  // Outcomes (index 0 is always REJECT)
  outcomeMessages: ['Reject', 'Accept'],
  outcomeDetails: ['Do nothing', 'Approve funding and start streams'],

  // Fee payment
  proposer: senderAddress,
  usedQuota: false,         // true if proposer has feeless quota
  feeCoins: [feeCoinId],
  feeAmount: 1_000_000_000n,

  // Required objects
  registryId: packageRegistryId,
  spotPoolId: spotPoolId,
  senderAddress: senderAddress,
  baseStableMetadataId: stableMetadataId,

  // Conditional coin registry (maps outcomes to coin types)
  conditionalCoinsRegistry: {
    registryId: coinRegistryId,
    coinSets: [
      { outcomeIndex: 0, assetType: rejectAssetType, stableType: rejectStableType },
      { outcomeIndex: 1, assetType: acceptAssetType, stableType: acceptStableType },
    ],
  },

  // Optional: attach actions to outcomes during creation
  outcomeActions: [
    {
      outcomeIndex: 1, // Accept outcome
      actions: [
        {
          type: 'create_stream',
          vaultName: 'treasury',
          beneficiary: teamAddress,
          amountPerIteration: 10_000_000n,
          startTime: Date.now() + 300_000,
          iterationsTotal: 12n,
          iterationPeriodMs: BigInt(30 * 24 * 60 * 60 * 1000),
        },
        {
          type: 'spend',
          coinType: stableType,
          vaultName: 'treasury',
          amount: 50_000_000n,
          resourceName: 'dev_fund',
        },
      ],
    },
  ],
});

const result = await client.signAndExecuteTransaction({ transaction, signer });
```

### What Happens Internally

1. `begin_proposal()` — creates unshared Proposal + TokenEscrow + ProposalCreationTicket
2. `add_outcome_coins_N()` — registers conditional coins for each outcome
3. Actions staged via `new_action_builder()` + `set_intent_spec_for_outcome()`
4. `finalize_proposal()` — consumes ProposalCreationTicket, creates conditional AMM pools, shares both objects

Conditional coins must be newly registered unregulated coins. Blank coin registry deposits reject regulated and legacy/unmigrated coin registry state.

After creation, the proposal is in **REVIEW** state.

---

## Step 2: Add Actions to Outcomes (Optional, Post-Creation)

Actions can be added while in REVIEW state:

```typescript
const { transaction } = sdk.proposal.addActionsToOutcome({
  daoAccountId: daoId,
  proposalId,
  assetType, stableType, lpType,
  outcomeIndex: 1,
  actions: [
    { type: 'memo', message: 'Proposal accepted!' },
    { type: 'deposit', coinType: stableType, vaultName: 'treasury', amount: 100n, resourceName: 'extra' },
  ],
});
```

---

## Step 3: Advance to Trading

Transitions from REVIEW to TRADING. Triggers quantum LP split (100% liquidity moves to conditional AMMs).

```typescript
const { transaction } = sdk.proposal.advanceToTrading({
  daoAccountId: daoId,
  proposalId,
  escrowId,
  spotPoolId,
  assetType, stableType, lpType,
  senderAddress,
});

await client.signAndExecuteTransaction({ transaction, signer });
```

### Gap Fee

A gap fee prevents spam proposals. It decays from 10,000x the proposal creation fee at t=0 to 0 at t=12h (30-min half-life) since the last proposal ended. If 12+ hours have passed, the fee is zero.

---

## Step 4: Trade / Vote (During Trading Period)

Traders express views by swapping into conditional outcome tokens. Four strategies:

### Direct Conditional Swap

```typescript
const { transaction } = sdk.proposal.conditionalSwap({
  proposalId,
  escrowId,
  spotPoolId,
  assetType, stableType, lpType,
  stableCoins: [stableCoinId],
  amountIn: 1_000_000_000n,
  minAmountOut: 0n,
  direction: 'stable_to_asset', // or 'asset_to_stable'
  outcomeIndex: 1,              // buy ACCEPT tokens
  allOutcomeCoins: outcomeCoinsMap,
  recipient: senderAddress,
});
```

### Smart Conditional Swap (Auto-sources Coins)

Automatically sources coins from balance wrappers, existing conditional coins, and spot coins:

```typescript
// Query available coin sources
const available = await sdk.proposal.querySmartSwapAvailableCoins({
  proposalId, escrowId, owner: senderAddress,
  assetType, stableType, lpType,
});

// Execute smart swap
const { transaction } = sdk.proposal.smartConditionalSwap({
  proposalId, escrowId, spotPoolId,
  assetType, stableType, lpType,
  amountIn: 1_000_000_000n,
  minAmountOut: 0n,
  direction: 'stable_to_asset',
  outcomeIndex: 1,
  availableCoins: available,
  senderAddress,
});
```

### Best Route Discovery

```typescript
const route = await sdk.proposal.trade.findBestRoute({
  proposalId, escrowId, spotPoolId,
  assetType, stableType, lpType,
  amountIn: 1_000_000_000n,
  direction: 'stable_to_asset',
});

console.log(`Best outcome: ${route.bestOutcome}, expected: ${route.expectedOut}`);
console.log(`Oracle state: ${route.oracleState}`);
```

### Laddered Execution

For large orders, split across multiple swaps with re-quoting:

```typescript
const plan = await sdk.proposal.trade.buildLadderedExecutionPlan({
  proposalId, escrowId, spotPoolId,
  assetType, stableType, lpType,
  totalAmount: 10_000_000_000n,
  direction: 'stable_to_asset',
  outcomeIndex: 1,
  numSteps: 5,
});
```

### Spot Swaps

Non-conditional swaps on the base AMM pool:

```typescript
const { transaction } = sdk.proposal.spotSwap({
  proposalId, escrowId, spotPoolId,
  assetType, stableType, lpType,
  amountIn: 1_000_000_000n,
  minAmountOut: 0n,
  direction: 'stable_to_asset',
  stableCoins: [stableCoinId],
  senderAddress,
});
```

---

## Step 5: Finalize Proposal

After the trading period ends, finalize to determine the winner via TWAP:

```typescript
const { transaction } = sdk.proposal.finalizeProposal({
  proposalId,
  escrowId,
  spotPoolId,
  assetType, stableType, lpType,
});

const result = await client.signAndExecuteTransaction({ transaction, signer });

// Parse the result
const status = sdk.proposal.parseFinalizationResult(result);

if (status.isFinalized) {
  // REJECT won — proposal is done, no actions to execute
  console.log('Proposal rejected by market');
} else if (status.inExecutionWindow) {
  // ACCEPT won — 30-minute window to execute actions
  console.log('Proposal accepted, executing...');
}
```

### Two Resolution Paths

1. **REJECT wins** (fast path): Proposal immediately FINALIZED, quantum LP restored to spot pool
2. **ACCEPT wins**: Enters `AWAITING_EXECUTION` with 30-minute execution window

---

## Step 6: Execute Winning Outcome

If accept won, execute the staged actions within 30 minutes:

```typescript
// Via AutoExecutor (recommended)
const autoExecutor = sdk.createAutoExecutor('http://your-indexer:9090');

const { transaction } = await autoExecutor.executeProposal(proposalId, {
  accountId: daoAccountId,
  outcome: 1, // winning outcome index
  escrowId,
  spotPoolId,
});

await client.signAndExecuteTransaction({ transaction, signer });
```

The 3-layer execution:
1. `begin_execution()` → Executable hot potato, finalizes market, restores quantum LP
2. N x `do_init_*()` → executes each action
3. `finalize_execution_success()` → confirms, refunds proposer fee

---

## Step 7: Timeout Handling

If execution doesn't happen within 30 minutes, anyone can force reject:

```typescript
const { transaction } = sdk.proposal.forceRejectOnTimeout({
  proposalId,
  escrowId,
  spotPoolId,
  assetType, stableType, lpType,
});
```

This is permissionless — keeper bots typically handle it.

---

## Step 8: Redeem Conditional Tokens

After finalization, redeem winning conditional tokens for base coins:

```typescript
const { transaction } = sdk.proposal.redeemConditionalTokens({
  proposalId,
  escrowId,
  spotPoolId,
  assetType, stableType, lpType,
  outcomeIndex: winningOutcome,
  conditionalCoins: myConditionalCoinIds,
  recipient: senderAddress,
});
```

---

## Maintenance

### Cleanup Expired Intents

Anyone can clean up expired intents and earn storage rebates:

```typescript
// Check if maintenance needed
const needed = await sdk.proposal.checkMaintenanceNeeded(daoAccountId);

if (needed) {
  const { transaction } = sdk.proposal.cleanupExpiredIntents({
    daoAccountId,
    assetType, stableType,
  });
}
```

---

## Query Operations

```typescript
// Get proposal info
const proposal = await sdk.proposal.getInfo(proposalId);

// Get all proposals
const all = await sdk.proposal.getAll();

// Get market state
const market = await sdk.proposal.getMarket(proposalId);

// Get execution state (for proposals in execution window)
const state = await sdk.proposal.getProposalExecutionState(proposalId);
console.log(state.stateName);    // 'awaiting_execution'
console.log(state.marketWinner); // 1

// Get DAO's proposals
const daoProposals = await sdk.dao.getProposals(daoId);
```

---

## Supported Outcome Actions

See [ACTIONS.md](ACTIONS.md) for the full list. All 67 proposal-supported actions can be attached to outcomes. Common ones:

| Action | Description |
|--------|-------------|
| `create_stream` | Vesting stream from vault |
| `spend` | Withdraw from vault |
| `deposit` | Deposit into vault |
| `mint` / `burn` | Token supply management |
| `add_liquidity` | Add liquidity to pool |
| `create_protective_bid/ask` | Price protection |
| `update_trading_params` | DAO trading config |
| `update_twap_config` | TWAP configuration |
| `update_governance` | Governance settings |
| `terminate_dao` | Permanently terminate DAO |
| `transfer` / `transfer_coin` | Object/coin transfers |
| `memo` | On-chain memo |
| `create_vesting` | Standalone vesting |
| `set_quotas` | Feeless proposal quotas |
