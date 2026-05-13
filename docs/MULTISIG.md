# Multisig Accounts

Complete guide to creating and managing weighted multisig accounts.

## Overview

A **Multisig Account** is a weighted multi-signature account independent of futarchy DAOs. Members sit in named groups, `approvePolicy` defines vote-for approval paths, `cancelPolicy` defines vote-against cancellation unlocks, and role groups whitelist who can propose, execute, and finalize cancellation.

## Lifecycle

```
CREATE ACCOUNT ──► PROPOSE INTENT ──► APPROVE/REJECT ──► EXECUTE
                                            │
                                            ▼
                                     CANCEL (pending/stale/expired)
```

---

## Create Account

```typescript
import { FutarchySDK } from "@govex/futarchy-sdk";

const sdk = new FutarchySDK({ network: "testnet" });
const tx = new Transaction();
const DAY_MS = 24 * 60 * 60 * 1000;

sdk.multisig.createAccount(tx, paymentCoinId, {
  metadata: {
    name: "Team Multisig",
    description: "Team operations wallet",
  },
  intentExpiryMs: 30 * DAY_MS,
  groups: [
    {
      name: "owners",
      members: [
        { address: alice, weight: 1n },
        { address: bob, weight: 1n },
        { address: carol, weight: 1n },
      ],
      timeBands: [{ afterMs: 14 * DAY_MS, weight: 1n }],
    },
  ],
  approvePolicy: {
    paths: [{ requirements: [{ groupIndex: 0, threshold: 2n }] }],
  },
  cancelPolicy: {
    paths: [{ requirements: [{ groupIndex: 0, threshold: 2n }] }],
  },
  proposeGroups: [0],
  executeGroups: [],
  cancelGroups: [0],
});

await client.signAndExecuteTransaction({ transaction: tx, signer });
```

---

## Propose Intents

### Config Change (Groups, Policies, Role Whitelists)

```typescript
const tx = new Transaction();
const DAY_MS = 24 * 60 * 60 * 1000;

sdk.multisig.proposeConfigChange(tx, {
  accountId: multisigAccountId,
  key: "owner-policy-v2", // unique intent key
  description: "3/4 owners, 2/4 after 30 days, or 1/4 after 90 days",
  executionTimeMs: 0, // when this specific intent can execute
  intentExpiryMs: 120 * DAY_MS, // lifetime for future intents after this config executes
  groups: [
    {
      name: "owners",
      members: [
        { address: alice, weight: 1n },
        { address: bob, weight: 1n },
        { address: carol, weight: 1n },
        { address: dave, weight: 1n },
      ],
      // Time bands apply to both vote-for and vote-against weight.
      timeBands: [
        { afterMs: 30 * DAY_MS, weight: 1n },
        { afterMs: 90 * DAY_MS, weight: 2n },
      ],
    },
  ],
  approvePolicy: {
    paths: [{ requirements: [{ groupIndex: 0, threshold: 3n }] }],
  },
  cancelPolicy: {
    paths: [{ requirements: [{ groupIndex: 0, threshold: 3n }] }],
  },
  proposeGroups: [0],
  executeGroups: [0], // [] means permissionless execution
  cancelGroups: [0], // whitelist for finalizing unlocked cancellation
});

await client.signAndExecuteTransaction({ transaction: tx, signer });
```

### Custom Actions Intent

Propose any combination of the 61 available actions:

```typescript
const tx = new Transaction();

sdk.multisig.proposeActionsIntent(tx, {
  accountId: multisigAccountId,
  key: "fund-team",
  description: "Send team payments",
  executionTimeMs: 0,
  // builderSetup receives the Transaction and action_spec_builder result
  builderSetup: (builderTx, builder) => {
    builderTx.moveCall({
      target: `${sdk.packages.accountActions}::memo_init_actions::add_emit_memo_spec`,
      arguments: [builder, builderTx.pure.string("team payment approved")],
    });
  },
});
```

All multisig intents derive their expiration from on-chain `MultisigConfig.intent_expiry_ms`.
Callers only choose the optional `executionTimeMs`. Config-change proposals set the next
group structure, approval policy, cancellation policy, role whitelists, and `intentExpiryMs`.

---

## Vote For / Vote Against

```typescript
const tx = new Transaction();

// Vote for
sdk.multisig.approveIntent(tx, accountId, "fund-team");

// Remove prior vote-for
sdk.multisig.disapproveIntent(tx, accountId, "fund-team");

// Vote against
sdk.multisig.rejectIntent(tx, accountId, "fund-team");

await client.signAndExecuteTransaction({ transaction: tx, signer });
```

Vote Against uses `cancelPolicy` paths. Time bands are considered only for approvals, never for rejections. A reject vote can also be cast after an intent is approved but before execution; if the old approval quorum no longer holds, the intent returns to Active, and if the vote-against side satisfies `cancelPolicy`, it becomes Cancel Unlocked.

---

## Execute

### Execute Config Change

```typescript
const tx = new Transaction();

sdk.multisig.executeConfigChange(tx, accountId, "add-alice");

await client.signAndExecuteTransaction({ transaction: tx, signer });
```

Internally runs the 3-step pattern:

1. `execute_intent` → creates Executable
2. `execute_config_change` → applies member/threshold changes
3. `confirm_execution` → finalizes

### Execute Actions Intent

```typescript
const tx = new Transaction();

// Begin execution — returns executable + witness for chaining do_* calls
const { executable, witness } = sdk.multisig.beginActionsExecution(
  tx,
  accountId,
  "fund-team",
);

// ... add do_* calls using executable and witness ...

// Confirm execution
sdk.multisig.confirmExecution(tx, accountId, executable);

await client.signAndExecuteTransaction({ transaction: tx, signer });
```

## Cancel Intents

Three cancellation types for each intent kind:

```typescript
const tx = new Transaction();

// Cancel a pending (approved but not yet executed) intent
sdk.multisig.cancelPendingActions(tx, accountId, "fund-team");

// Cancel when config nonce changed (members changed after proposal)
sdk.multisig.cancelStaleActions(tx, accountId, "fund-team");

// Cancel after expiration time passed
sdk.multisig.cancelExpiredActions(tx, accountId, "fund-team");

```

---

## Execution Discovery

For action intents, discover what runtime inputs are needed:

```typescript
// What inputs does this action chain need?
const requirements = sdk.multisig.getActionExecutionRequirements([
  "spend",
  "transfer_coin",
  "create_stream",
]);
// Returns: [{ actionIndex, actionType, kind: 'coinType'|'objectId', label, ... }]

// Which actions are unsupported client-side?
const unsupported = sdk.multisig.getUnsupportedActions(actionTypes);

// Best-effort discovery of runtime object IDs
const inputs = await sdk.multisig.discoverExecutionInputs({
  accountId,
  actionTypes,
  client,
});
```

### Package Upgrade Support

```typescript
// Get build command for upgrade artifacts
const cmd = sdk.multisig.getUpgradeBuildCommand("./packages/my-package");

// Parse build output
const artifacts = sdk.multisig.parseUpgradeBuildOutput(buildOutput);

// Prepare staging digest + execution payload
const prepared = sdk.multisig.prepareUpgradeArtifacts(buildOutput, packageId);
```

---

## Admin

```typescript
// Sweep collected fees (admin only)
const tx = new Transaction();
sdk.multisig.sweepFees(tx, adminCapId);
```

---

## Query

```typescript
// Get accounts where address is a member
const accounts = await sdk.multisig.getAccountsByMember(backendUrl, myAddress);

// Get accounts created by address
const created = await sdk.multisig.getAccountsByCreator(backendUrl, myAddress);

// Get single account config
const account = await sdk.multisig.getAccount(backendUrl, accountId);

// Get intents for an account
const intents = await sdk.multisig.getIntents(backendUrl, accountId);
```

---

## Role Groups

Role access is now group-based, not a per-member bitmask:

| Field           | Meaning                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `proposeGroups` | Members of these groups can create intents                                                                                           |
| `executeGroups` | Members of these groups can execute approved intents; `[]` means permissionless execution                                            |
| `cancelGroups`  | Members of these groups can finalize cancellation once vote-against satisfies `cancelPolicy`, or an approved intent is being abandoned |

`proposeGroups`, `executeGroups`, and `cancelGroups` are whitelists, not quorums. Approval and cancellation have separate quorum policies. Time bands count on both sides, so a long-lived active intent can become cancel-unlocked later if its vote-against side matures.
