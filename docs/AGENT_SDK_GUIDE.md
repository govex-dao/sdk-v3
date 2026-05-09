# Agent SDK Guide

Use this guide if you are building an autonomous agent (trader, keeper, or proposal bot).

## 1) Discover capabilities

```ts
import { getAgentActionIndex } from '@govex/futarchy-sdk';

const index = getAgentActionIndex();

// High-level SDK methods for agents
console.log(index.methods);

// Staged governance actions that can be attached to outcomes
console.log(index.proposalActions);

// Two-stage actions (protective bid + dissolution flow)
console.log(index.twoStageActions);
```

`index.methods` includes:
- Proposal lifecycle methods (`createAndInitializeProposal`, `advanceToTrading`, `finalizeProposal`, `executeWinningOutcome`, `forceRejectOnTimeout`)
- Conditional trading methods (`conditionalSwap`, `smartConditionalSwap`, `findBestRoute`, `buildLadderedExecutionPlan`)
- Keeper maintenance methods (`parseFinalizationResult`, `getProposalExecutionState`, `cleanupExpiredIntents`)

## 2) Keeper lifecycle flow

```ts
import { FutarchySDK } from '@govex/futarchy-sdk';

const sdk = new FutarchySDK({ network: 'testnet' });

// 1) Advance REVIEW -> TRADING
const advanceTx = sdk.proposal.advanceToTrading({
  daoAccountId,
  proposalId,
  escrowId,
  spotPoolId,
  assetType,
  stableType,
  lpType,
  senderAddress,
});

// 2) Finalize TRADING -> (FINALIZED or execution window)
const finalizeTx = sdk.proposal.finalizeProposal({
  daoAccountId,
  proposalId,
  escrowId,
  spotPoolId,
  assetType,
  stableType,
  lpType,
});

// 3) Parse finalization result for keeper decisioning
const status = sdk.proposal.parseFinalizationResult(txResult);

// 4a) Execute winner if execution window started
if (status.inExecutionWindow) {
  const executeTx = sdk.proposal.executeWinningOutcome({
    daoAccountId,
    proposalId,
    escrowId,
    spotPoolId,
    assetType,
    stableType,
    lpType,
    actions,
  });
}

// 4b) Or force reject on timeout
const rejectTx = sdk.proposal.forceRejectOnTimeout({
  proposalId,
  escrowId,
  spotPoolId,
  assetType,
  stableType,
  lpType,
});
```

## 3) Four Conditional Swap Strategies

All four strategies below are for conditional markets only.
No standalone spot swap strategy is part of this set.

1. Direct Outcome Swap
`sdk.proposal.conditionalSwap(...)` on a chosen `outcomeIndex`.

2. Best Outcome Route
Use `sdk.proposal.trade.findBestRoute(...)` to pick outcome, then execute `sdk.proposal.conditionalSwap(...)`.
The returned route now includes `oracleState` from futarchy conditional oracle (`proposal::get_oracle_state_by_outcome`).
You can also call `sdk.proposal.trade.getOutcomeOracleState(...)` directly.

3. Inventory-first Smart Swap
Use `sdk.proposal.querySmartSwapAvailableCoins(...)` then `sdk.proposal.smartConditionalSwap(...)`.

4. Laddered Conditional Execution
Use `sdk.proposal.trade.buildLadderedExecutionPlan(...)` to split size and execute sequential conditional swaps with re-quoting.

You can fetch the strategy catalog directly:

```ts
const strategies = sdk.proposal.trade.getConditionalTradingStrategies();
console.log(strategies);
```
