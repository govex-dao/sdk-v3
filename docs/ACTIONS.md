# Actions Reference

Complete list of all 70 actions available in the Govex Futarchy protocol.

Actions are staged on intents (via raises, proposals, or multisig) and executed atomically using the 3-layer pattern: `begin_execution` → N x `do_init_*` → `finalize_execution`.

## Action Support by Context

| Symbol | Meaning |
|--------|---------|
| L | Supported in Launchpad raises |
| P | Supported in Proposal outcomes |
| M | Supported in Multisig intents |

All 70 actions are available in multisig intents. The L and P columns indicate launchpad/proposal support.

---

## Transfer Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `transfer` | Transfer object to recipient (from executable_resources) | L | P |
| `transfer_to_sender` | Transfer object to transaction sender/cranker | L | P |
| `transfer_coin` | Transfer coin to recipient (from executable_resources) | L | P |
| `transfer_coin_to_sender` | Transfer coin to transaction sender | L | P |

**Common params:** `recipient`, `resourceName`
**Type params:** `ObjectType` or `CoinType`

---

## Vault Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `deposit` | Deposit coins into a named vault | L | P |
| `spend` | Withdraw coins from vault into executable_resources | L | P |
| `deposit_from_resources` | Deposit coins from executable_resources into vault | L | P |
| `deposit_object_from_resources` | Deposit Coin\<T\> object from executable_resources | L | P |
| `mint_vault_admin_cap` | Mint VaultAdminCap for later use | L | P |

**Common params:** `vaultName`, `amount`, `resourceName`
**Type params:** `CoinType`

---

## Currency Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `mint` | Mint tokens into executable_resources | L | P |
| `burn` | Burn tokens from executable_resources | L | P |
| `mint_currency_admin_cap` | Mint CurrencyMintAdminCap into executable_resources | L | P |
| `update_currency` | Update currency metadata (name, symbol, icon) | L | P |
| `lock_treasury_cap` | Lock TreasuryCap with access permissions | L | P |
| `remove_treasury_cap_to_resources` | Remove TreasuryCap into executable_resources | L | P |
| `remove_metadata_cap_to_resources` | Remove MetadataCap into executable_resources | L | P |

**Params for cap removals:** `expectedCapId`, `resourceName`
**Type params:** `CoinType`

---

## Stream Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `create_stream` | Create vesting stream with periodic releases | L | P |
| `cancel_stream` | Cancel an existing stream | L | P |
| `collect_stream` | Collect vested tokens from stream | L | P |

**Params for `create_stream`:**
```typescript
{
  type: 'create_stream',
  coinType?: string,          // coin type (inferred if omitted)
  vaultName: string,          // source vault
  beneficiary: string,        // recipient address
  amountPerIteration: bigint, // tokens per period
  startTime: number,          // start timestamp (ms)
  iterationsTotal: bigint,    // number of periods
  iterationPeriodMs: bigint,  // period duration (ms)
  expiryMs?: bigint,          // spending-limit mode only
  whitelistedRecipients?: string[], // non-empty creates spending-limit mode
}
```

---

## Vesting Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `create_vesting` | Create standalone vesting with fund isolation | L | P |
| `cancel_vesting` | Cancel cancellable vesting | L | P |

---

## Owned Object Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `withdraw_object` | Withdraw owned object from account | L | P |
| `withdraw_funds` | Withdraw address-balance funds from account | L | P |

---

## Memo Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `memo` | Emit an on-chain memo event | L | P |

**Params:** `message: string`

---

## Access Control Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `lock_access` | Lock capability into account | L | P |
| `unlock_access` | Unlock capability and transfer to recipient | L | P |

**Params for `unlock_access`:** `expectedId`, `resourceName`

---

## Account Config Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `set_authorization_level` | Set action package validation level | - | P |
| `add_dep` | Add package to per-account whitelist | - | P |
| `remove_dep` | Remove package from per-account whitelist | - | P |

---

## Futarchy Config Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `terminate_dao` | Permanently terminate the DAO | - | P |
| `update_dao_name` | Update DAO name | - | P |
| `update_trading_params` | Update trading parameters | - | P |
| `update_dao_metadata` | Update DAO metadata (name, icon, description) | - | P |
| `update_twap_config` | Update TWAP oracle configuration | - | P |
| `update_governance` | Update governance settings | - | P |
| `update_metadata_table` | Update metadata key-value table | - | P |
| `update_conditional_metadata` | Update conditional metadata config | - | P |
| `update_sponsorship_config` | Update sponsorship configuration | L | P |
| `sync_twap_observation_from_proposal` | Sync TWAP observation from proposal | - | P |
| `lock_metadata_cap` | Lock MetadataCap with permissions | L | P |

---

## Futarchy Quota Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `set_quotas` | Set feeless proposal and TWAP sponsorship quotas | L | P |

---

## Liquidity Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `create_pool_with_mint` | Create AMM pool with minted asset tokens | L | - |
| `add_liquidity` | Add liquidity to existing pool | - | P |
| `remove_liquidity_to_resources` | Remove liquidity to executable_resources | L | P |
| `swap` | Swap tokens in pool | L | P |
| `update_pool_fee` | Update spot pool LP fee | L | P |
| `create_protective_bid` | Create vault-backed protective bid wall | L | P |
| `cancel_protective_bid` | Cancel protective bid | L | P |
| `create_protective_ask` | Create fixed-price protective ask wall | L | P |
| `cancel_protective_ask` | Cancel protective ask | L | P |

**Mint-cap params:** `create_pool_with_mint`, `create_protective_ask`, and `create_oracle_grant` require `mintCapResourceName`, produced by a prior `mint_currency_admin_cap` action.

---

## Dissolution Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `create_dissolution_capability` | Create shared dissolution capability | - | P |
| `create_dissolution_capability_unshared` | Create owned dissolution capability | - | P |
| `share_dissolution_capability` | Share owned dissolution capability | - | P |
| `create_redemption_pool` | Create redemption pool from coins | - | P |
| `add_to_redemption_pool` | Add coins to existing redemption pool | - | P |

---

## Package Upgrade Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `lock_upgrade_cap` | Lock UpgradeCap in account via governance after staging it in resources | - | P |
| `unlock_upgrade_cap` | Unlock UpgradeCap into resources for a follow-up action | - | P |

---

## Package Registry Actions (Governance)

| Action | Description | L | P |
|--------|-------------|---|---|
| `add_package` | Add package to registry | - | P |
| `update_package_metadata` | Update package metadata | - | P |

---

## Oracle Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `create_oracle_grant` | Create price-based oracle grant | L | P |
| `cancel_oracle_grant` | Cancel oracle grant | - | P |

---

## Launchpad-Only Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `deposit_raise_funds` | Deposit raised stable coins from Raise into DAO vaults | L | - |

---

## Deposit External Actions

| Action | Description | L | P |
|--------|-------------|---|---|
| `deposit_external` | Deposit external coins from PTB into vault | L | P |

---

## Programmatic Access

```typescript
import {
  ALL_ACTIONS,
  ACTION_BY_ID,
  ACTIONS_BY_CATEGORY,
  ACTIONS_BY_PACKAGE,
  LAUNCHPAD_ACTIONS,
  PROPOSAL_ACTIONS,
  getActionByFullType,
} from '@govex/futarchy-sdk';

// Get all actions
console.log(ALL_ACTIONS.length); // 70

// Look up by ID
const stream = ACTION_BY_ID['create_stream'];
console.log(stream.params);     // parameter definitions
console.log(stream.markerType); // Move marker type

// Filter by category
const vaultActions = ACTIONS_BY_CATEGORY['vault'];

// Launchpad-supported only (37)
console.log(LAUNCHPAD_ACTIONS.length);

// Proposal-supported only (67)
console.log(PROPOSAL_ACTIONS.length);

// Look up by full Move type string
const action = getActionByFullType('0x...::vault::VaultDeposit');
```

## Action Configuration Types

All action configs are type-safe discriminated unions:

```typescript
import type { ActionConfig } from '@govex/futarchy-sdk';

// TypeScript will enforce correct params per action type
const actions: ActionConfig[] = [
  {
    type: 'create_stream',
    vaultName: 'treasury',
    beneficiary: '0x...',
    amountPerIteration: 10_000_000n,
    startTime: Date.now() + 300_000,
    iterationsTotal: 12n,
    iterationPeriodMs: BigInt(30 * 24 * 60 * 60 * 1000),
  },
  {
    type: 'mint',
    coinType: '0x...::coin::TOKEN',
    amount: 1_000_000_000n,
    resourceName: 'mint_pool',
  },
  {
    type: 'memo',
    message: 'Action executed successfully',
  },
];
```

See `src/workflows/types/actions/` for full type definitions per action.
