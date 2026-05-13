/**
 * Multisig Service - Multisig account operations
 *
 * Transaction builders for creating/managing multisig accounts and intents.
 * Query methods for fetching data from the backend API.
 *
 * @module services/multisig
 */

import { bcs } from "@mysten/sui/bcs";
import type { SuiClient, SuiObjectData } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import type { ServiceParams } from "../types";
import { getActionByFullType } from "../../config/action-definitions";

export const MULTISIG_TREASURY_VAULT_NAME = "treasury";
export const SUI_MAINNET_USDC_COIN_TYPE =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
export const SUI_TESTNET_USDC_COIN_TYPE =
  "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";

export function getDefaultMultisigTreasuryCoinType(
  network?: ServiceParams["network"],
): string {
  return network === "testnet"
    ? SUI_TESTNET_USDC_COIN_TYPE
    : SUI_MAINNET_USDC_COIN_TYPE;
}

export interface MultisigTimeBandInput {
  afterMs: bigint | number;
  weight: bigint | number;
}

export interface MultisigGroupMemberInput {
  address: string;
  weight: bigint | number;
}

export interface MultisigGroupInput {
  name: string;
  members: MultisigGroupMemberInput[];
  timeBands?: MultisigTimeBandInput[];
}

export interface MultisigPathRequirementInput {
  groupIndex: bigint | number;
  threshold: bigint | number;
}

export interface MultisigPolicyPathInput {
  requirements: MultisigPathRequirementInput[];
}

export interface MultisigPolicyInput {
  paths: MultisigPolicyPathInput[];
}

export interface MultisigConfigInput {
  groups: MultisigGroupInput[];
  approvePolicy: MultisigPolicyInput;
  cancelPolicy: MultisigPolicyInput;
  proposeGroups: Array<bigint | number>;
  /** Empty executeGroups means permissionless execution. */
  executeGroups: Array<bigint | number>;
  /** Whitelist whose members may finalize cancellation once cancelPolicy is satisfied by vote-against weight. */
  cancelGroups: Array<bigint | number>;
  intentExpiryMs: bigint | number;
}

export interface CreateMultisigAccountParams extends MultisigConfigInput {
  metadata?: Record<string, string>;
  /**
   * Coin type to approve on the creation-time treasury vault. Defaults to
   * Circle's official Sui USDC for mainnet/testnet. Pass this explicitly for
   * local or custom deployments.
   */
  treasuryCoinType?: string;
}

interface ProposeConfigChangeBaseParams {
  key: string;
  description: string;
  executionTimeMs?: bigint | number;
  accountId: string;
}

export interface ProposeConfigChangeParams extends ProposeConfigChangeBaseParams, MultisigConfigInput {}

export interface ProposeActionsIntentParams {
  accountId: string;
  key: string;
  description: string;
  executionTimeMs?: bigint | number;
  /** Callback to add action specs to the builder via moveCall */
  builderSetup: (tx: Transaction, builder: any) => void;
}

export interface CleanupExpiredConfigChangesParams {
  accountId: string;
  keys: string[];
  maxToClean: bigint | number;
}

export type ActionExecutionRequirementKind =
  | "coinType"
  | "objectType"
  | "objectId"
  | "upgradeArtifacts";

export interface ActionExecutionRequirement {
  actionIndex: number;
  actionType: string;
  actionName: string;
  category: string;
  kind: ActionExecutionRequirementKind;
  label: string;
  placeholder?: string;
}

export interface UpgradeExecutionInput {
  packageId: string;
  modules: string[];
  dependencies: string[];
}

export interface UpgradeArtifactBuildOutput {
  modules: unknown;
  dependencies: unknown;
  digest: unknown;
}

export interface ParsedUpgradeArtifacts {
  modules: string[];
  dependencies: string[];
  digestBytes: number[];
  digestHex: string;
}

export interface UpgradeArtifactsPrepared {
  specDigestHex: string;
  specDigestBytes: number[];
  execution: UpgradeExecutionInput;
  executionJson: string;
}

export interface DiscoverExecutionInputsParams {
  owner: string;
  actionTypes: string[];
  /** Fallback CoinType when an action type does not include generic type args */
  coinType?: string;
  /** Optional expected amount per action index (useful for VaultDepositExternal coin filtering) */
  expectedAmountByAction?: Record<number, bigint | number | string>;
  /** Owner object ID for Currency<T> objects. CoinRegistry is `0xc` by default. */
  coinRegistryOwnerId?: string;
}

export interface DiscoveredObjectCandidate {
  objectId: string;
  type: string;
  version: string;
  digest: string;
  balance?: string;
}

export interface DiscoverExecutionInputsResult {
  requirements: ActionExecutionRequirement[];
  objectIdByAction: Record<number, string>;
  candidatesByAction: Record<number, DiscoveredObjectCandidate[]>;
  unresolved: string[];
}

const DEFAULT_COIN_REGISTRY_OWNER_ID = "0xc";
const UPGRADE_ACTION_TYPE = "package_upgrade::PackageUpgrade";
const COMMIT_ACTION_TYPE = "package_upgrade::PackageCommit";
const RESTRICT_ACTION_TYPE = "package_upgrade::PackageRestrict";
const UNLOCK_UPGRADE_CAP_ACTION_TYPE = "package_upgrade::UnlockUpgradeCap";
const CONFIG_CHANGE_ACTION_TYPE = "config::ConfigChange";

export const MULTISIG_INTENT_STATUS = {
  ACTIVE: 0,
  APPROVED: 1,
  REJECTED: 2,
  EXECUTED: 4,
} as const;

export type MultisigIntentStatus =
  (typeof MULTISIG_INTENT_STATUS)[keyof typeof MULTISIG_INTENT_STATUS];

export const MULTISIG_TERMINAL_INTENT_STATUSES = [
  MULTISIG_INTENT_STATUS.REJECTED,
  MULTISIG_INTENT_STATUS.EXECUTED,
] as const;

const KNOWN_ACTION_LABEL_OVERRIDES: Record<
  string,
  { name: string; category: string; typeParams?: string[] }
> = {
  "owned::ProvideObjectToResources": {
    name: "Provide Object",
    category: "transfer",
    typeParams: ["ObjectType"],
  },
  [UPGRADE_ACTION_TYPE]: { name: "Upgrade Package", category: "package" },
  [COMMIT_ACTION_TYPE]: { name: "Commit Upgrade", category: "package" },
  [RESTRICT_ACTION_TYPE]: { name: "Restrict Package", category: "package" },
  [UNLOCK_UPGRADE_CAP_ACTION_TYPE]: {
    name: "Unlock UpgradeCap",
    category: "package",
  },
  "vault::VaultOpen": { name: "Open Vault", category: "vault" },
  "vault::VaultClose": { name: "Close Vault", category: "vault" },
  "vault::MintVaultAdminCap": {
    name: "Mint Vault Admin Cap",
    category: "vault",
  },
};

const OBJECT_INPUT_BY_ACTION_TYPE: Record<
  string,
  { label: string; placeholder: string }
> = {
  "owned::ProvideObjectToResources": {
    label: "Object ID",
    placeholder: "0x... (wallet-owned object to provide)",
  },
  "currency::CurrencyUpdate": {
    label: "Currency object ID",
    placeholder: "0x... (shared Currency<CoinType>)",
  },
  "vault::VaultDepositExternal": {
    label: "Coin object ID",
    placeholder: "0x... (Coin<CoinType>)",
  },
  "vesting::CancelVesting": {
    label: "Vesting object ID",
    placeholder: "0x... (Vesting<CoinType>)",
  },
};

function parseTypeName(fullType: string): { base: string; typeArgs: string[] } {
  const trimmed = fullType.trim();
  const firstLt = trimmed.indexOf("<");
  if (firstLt < 0 || !trimmed.endsWith(">")) {
    return { base: trimmed, typeArgs: [] };
  }

  let depth = 0;
  let topLt = -1;
  let topGt = -1;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === "<") {
      if (depth === 0) topLt = i;
      depth += 1;
    } else if (ch === ">") {
      depth -= 1;
      if (depth === 0) topGt = i;
      if (depth < 0) return { base: trimmed, typeArgs: [] };
    }
  }

  if (depth !== 0 || topLt < 0 || topGt !== trimmed.length - 1) {
    return { base: trimmed, typeArgs: [] };
  }

  const inner = trimmed.slice(topLt + 1, topGt);
  const typeArgs: string[] = [];
  let chunkStart = 0;
  depth = 0;

  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === "<") depth += 1;
    if (ch === ">") depth -= 1;
    if (ch === "," && depth === 0) {
      const chunk = inner.slice(chunkStart, i).trim();
      if (chunk) typeArgs.push(chunk);
      chunkStart = i + 1;
    }
  }

  const tail = inner.slice(chunkStart).trim();
  if (tail) typeArgs.push(tail);

  return { base: trimmed.slice(0, topLt), typeArgs };
}

function extractModuleType(fullType: string): string {
  const base = parseTypeName(fullType).base;
  const parts = base.split("::");
  if (parts.length >= 3) {
    return `${parts[parts.length - 2]}::${parts[parts.length - 1]}`;
  }
  return base;
}

function extractTypeAddress(fullType: string): string | undefined {
  const base = parseTypeName(fullType).base;
  const parts = base.split("::");
  return parts.length >= 3 ? parts[0] : undefined;
}

function normalizeAddressForCompare(address: string | undefined): string | undefined {
  const trimmed = address?.trim().toLowerCase();
  if (!trimmed) return undefined;
  const noPrefix = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  const noLeadingZeroes = noPrefix.replace(/^0+/, "");
  return noLeadingZeroes || "0";
}

export function isMultisigConfigChangeActionType(
  actionType: string,
  accountMultisigPackageId?: string,
): boolean {
  if (extractModuleType(actionType) !== CONFIG_CHANGE_ACTION_TYPE) {
    return false;
  }

  const expectedPackage = normalizeAddressForCompare(accountMultisigPackageId);
  if (!expectedPackage) return true;

  return normalizeAddressForCompare(extractTypeAddress(actionType)) === expectedPackage;
}

export function isSingleMultisigConfigChangeAction(
  actionTypes: readonly string[],
  accountMultisigPackageId?: string,
): boolean {
  return (
    actionTypes.length === 1 &&
    isMultisigConfigChangeActionType(actionTypes[0], accountMultisigPackageId)
  );
}

/** Ensure all addresses in a Move type string have `0x` prefix (TypeName stores them without). */
function normalizeTypeAddresses(typeStr: string): string {
  // Match hex address at start of a type component (before ::)
  return typeStr.replace(/\b([0-9a-fA-F]{64})(?=::)/g, "0x$1");
}

function firstTypeArg(fullType: string): string | undefined {
  const first = parseTypeName(fullType).typeArgs[0];
  const trimmed = first?.trim();
  return trimmed ? normalizeTypeAddresses(trimmed) : undefined;
}

function normalizeBigintLike(
  value: bigint | number | string | undefined,
): bigint | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) return undefined;
    return BigInt(value);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return BigInt(trimmed);
  } catch {
    return undefined;
  }
}

function extractMoveObjectBalance(
  data: SuiObjectData | undefined,
): string | undefined {
  const content = data?.content;
  if (!content || content.dataType !== "moveObject") return undefined;
  const fields = content.fields as Record<string, unknown>;
  const balance = fields.balance;
  return typeof balance === "string" ? balance : undefined;
}

interface NormalizedConfigChangeArgs {
  groupNames: string[];
  groupMemberCounts: bigint[];
  allMemberAddresses: string[];
  allMemberWeights: bigint[];
  timeBandCounts: bigint[];
  allTimeBandAfters: bigint[];
  allTimeBandWeights: bigint[];
  approvePathReqCounts: bigint[];
  allApproveGroupIndices: bigint[];
  allApproveThresholds: bigint[];
  cancelPathReqCounts: bigint[];
  allCancelGroupIndices: bigint[];
  allCancelThresholds: bigint[];
  proposeGroups: bigint[];
  executeGroups: bigint[];
  cancelGroups: bigint[];
  intentExpiryMs: bigint;
}

function normalizeU64Input(value: bigint | number, fieldName: string): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error(`${fieldName} must be non-negative`);
    return value;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return BigInt(value);
}

function normalizePositiveU64Input(
  value: bigint | number,
  fieldName: string,
): bigint {
  const normalized = normalizeU64Input(value, fieldName);
  if (normalized <= 0n) throw new Error(`${fieldName} must be greater than 0`);
  return normalized;
}

function flattenGroupIndices(
  indices: Array<bigint | number>,
  fieldName: string,
  groupCount: number,
  allowEmpty: boolean,
): bigint[] {
  if (!allowEmpty && indices.length === 0) {
    throw new Error(`${fieldName} must include at least one group`);
  }
  const groupCountBigint = BigInt(groupCount);
  return indices.map((value, index) => {
    const groupIndex = normalizeU64Input(value, `${fieldName}[${index}]`);
    if (groupIndex >= groupCountBigint) {
      throw new Error(
        `${fieldName}[${index}] references missing group ${groupIndex.toString()}`,
      );
    }
    return groupIndex;
  });
}

function flattenPolicy(
  policy: MultisigPolicyInput,
  fieldName: string,
  groupCount: number,
  requirePolicyPath: boolean,
): {
  pathReqCounts: bigint[];
  allGroupIndices: bigint[];
  allThresholds: bigint[];
} {
  if (requirePolicyPath && policy.paths.length === 0) {
    throw new Error(`${fieldName}.paths must include at least one path`);
  }

  const pathReqCounts: bigint[] = [];
  const allGroupIndices: bigint[] = [];
  const allThresholds: bigint[] = [];
  const groupCountBigint = BigInt(groupCount);

  policy.paths.forEach((path, pathIndex) => {
    if (path.requirements.length === 0) {
      throw new Error(
        `${fieldName}.paths[${pathIndex}] must include at least one requirement`,
      );
    }
    pathReqCounts.push(BigInt(path.requirements.length));
    path.requirements.forEach((requirement, requirementIndex) => {
      const groupIndex = normalizeU64Input(
        requirement.groupIndex,
        `${fieldName}.paths[${pathIndex}].requirements[${requirementIndex}].groupIndex`,
      );
      if (groupIndex >= groupCountBigint) {
        throw new Error(
          `${fieldName}.paths[${pathIndex}].requirements[${requirementIndex}].groupIndex references missing group ${groupIndex.toString()}`,
        );
      }
      allGroupIndices.push(groupIndex);
      allThresholds.push(
        normalizePositiveU64Input(
          requirement.threshold,
          `${fieldName}.paths[${pathIndex}].requirements[${requirementIndex}].threshold`,
        ),
      );
    });
  });

  return { pathReqCounts, allGroupIndices, allThresholds };
}

function normalizeConfigInput(
  params: MultisigConfigInput,
): NormalizedConfigChangeArgs {
  if (params.groups.length === 0)
    throw new Error("groups must include at least one group");

  const groupNames: string[] = [];
  const groupMemberCounts: bigint[] = [];
  const allMemberAddresses: string[] = [];
  const allMemberWeights: bigint[] = [];
  const timeBandCounts: bigint[] = [];
  const allTimeBandAfters: bigint[] = [];
  const allTimeBandWeights: bigint[] = [];
  const seenGroupNames = new Set<string>();

  params.groups.forEach((group, groupIndex) => {
    const name = group.name.trim();
    if (!name) throw new Error(`groups[${groupIndex}].name must not be empty`);
    if (seenGroupNames.has(name))
      throw new Error(`duplicate group name: ${name}`);
    seenGroupNames.add(name);
    groupNames.push(name);

    groupMemberCounts.push(BigInt(group.members.length));
    const seenMemberAddresses = new Set<string>();
    group.members.forEach((member, memberIndex) => {
      if (seenMemberAddresses.has(member.address)) {
        throw new Error(
          `groups[${groupIndex}].members contains duplicate address ${member.address}`,
        );
      }
      seenMemberAddresses.add(member.address);
      allMemberAddresses.push(member.address);
      allMemberWeights.push(
        normalizePositiveU64Input(
          member.weight,
          `groups[${groupIndex}].members[${memberIndex}].weight`,
        ),
      );
    });

    const timeBands = group.timeBands ?? [];
    timeBandCounts.push(BigInt(timeBands.length));
    let previousAfter: bigint | undefined;
    let previousWeight: bigint | undefined;
    timeBands.forEach((timeBand, timeBandIndex) => {
      const afterMs = normalizeU64Input(
        timeBand.afterMs,
        `groups[${groupIndex}].timeBands[${timeBandIndex}].afterMs`,
      );
      const weight = normalizePositiveU64Input(
        timeBand.weight,
        `groups[${groupIndex}].timeBands[${timeBandIndex}].weight`,
      );
      if (previousAfter !== undefined && afterMs <= previousAfter) {
        throw new Error(
          `groups[${groupIndex}].timeBands must be sorted by increasing afterMs`,
        );
      }
      if (previousWeight !== undefined && weight < previousWeight) {
        throw new Error(
          `groups[${groupIndex}].timeBands weights must be non-decreasing`,
        );
      }
      previousAfter = afterMs;
      previousWeight = weight;
      allTimeBandAfters.push(afterMs);
      allTimeBandWeights.push(weight);
    });
  });

  const approvePolicy = flattenPolicy(
    params.approvePolicy,
    "approvePolicy",
    params.groups.length,
    true,
  );
  const cancelPolicy = flattenPolicy(
    params.cancelPolicy,
    "cancelPolicy",
    params.groups.length,
    true,
  );

  return {
    groupNames,
    groupMemberCounts,
    allMemberAddresses,
    allMemberWeights,
    timeBandCounts,
    allTimeBandAfters,
    allTimeBandWeights,
    approvePathReqCounts: approvePolicy.pathReqCounts,
    allApproveGroupIndices: approvePolicy.allGroupIndices,
    allApproveThresholds: approvePolicy.allThresholds,
    cancelPathReqCounts: cancelPolicy.pathReqCounts,
    allCancelGroupIndices: cancelPolicy.allGroupIndices,
    allCancelThresholds: cancelPolicy.allThresholds,
    proposeGroups: flattenGroupIndices(
      params.proposeGroups,
      "proposeGroups",
      params.groups.length,
      false,
    ),
    executeGroups: flattenGroupIndices(
      params.executeGroups,
      "executeGroups",
      params.groups.length,
      true,
    ),
    cancelGroups: flattenGroupIndices(
      params.cancelGroups,
      "cancelGroups",
      params.groups.length,
      false,
    ),
    intentExpiryMs: normalizePositiveU64Input(
      params.intentExpiryMs,
      "intentExpiryMs",
    ),
  };
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): number[] {
  const noPrefix = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (noPrefix.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }
  if (!/^[a-fA-F0-9]*$/.test(noPrefix)) {
    throw new Error("Hex string contains non-hex characters");
  }
  const bytes: number[] = [];
  for (let i = 0; i < noPrefix.length; i += 2) {
    bytes.push(parseInt(noPrefix.slice(i, i + 2), 16));
  }
  return bytes;
}

function base64ToBytes(base64: string): number[] {
  if (typeof Buffer !== "undefined") {
    return Array.from(Buffer.from(base64, "base64"));
  }
  const atobFn = (globalThis as { atob?: (data: string) => string }).atob;
  if (!atobFn) {
    throw new Error("No base64 decoder available in this environment");
  }
  const binary = atobFn(base64);
  return Array.from(binary, (ch) => ch.charCodeAt(0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUpgradeBuildOutputShape(
  value: unknown,
): value is UpgradeArtifactBuildOutput {
  if (!isRecord(value)) return false;
  return "modules" in value && "dependencies" in value && "digest" in value;
}

function extractJsonObjectCandidates(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === "}") {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        out.push(input.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return out;
}

export class MultisigService {
  private client: SuiClient;
  private packages: ServiceParams["packages"];
  private sharedObjects: ServiceParams["sharedObjects"];
  private network?: ServiceParams["network"];

  constructor(params: ServiceParams) {
    this.client = params.client;
    this.packages = params.packages;
    this.sharedObjects = params.sharedObjects;
    this.network = params.network;
  }

  // ========================================================================
  // TRANSACTION BUILDERS
  // ========================================================================

  /**
   * Create a new multisig account.
   * Returns a transaction that calls multisig::new_account, initializes the
   * treasury vault with USDC approval, then calls multisig::share.
   */
  createAccount(
    tx: Transaction,
    paymentCoinId: string,
    params: CreateMultisigAccountParams,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    const actionsPackage = this.packages.accountActions;
    const feeVault = this.sharedObjects.multisigFeeVault;
    const registryId = this.sharedObjects.packageRegistry.id;

    if (!pkg) throw new Error("accountMultisig package not configured");
    if (!actionsPackage) throw new Error("accountActions package not configured");
    if (!feeVault)
      throw new Error("multisigFeeVault shared object not configured");

    const keys = Object.keys(params.metadata ?? {});
    const values = Object.values(params.metadata ?? {});
    const configArgs = normalizeConfigInput(params);
    const treasuryCoinType =
      params.treasuryCoinType ?? getDefaultMultisigTreasuryCoinType(this.network);

    const account = tx.moveCall({
      target: `${pkg}::multisig::new_account`,
      arguments: [
        tx.object(feeVault.id),
        tx.object(registryId),
        tx.object(paymentCoinId),
        tx.pure.vector("string", keys),
        tx.pure.vector("string", values),
        tx.pure.vector("string", configArgs.groupNames),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.groupMemberCounts)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.Address)
            .serialize(configArgs.allMemberAddresses)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.allMemberWeights)
            .toBytes(),
        ),
        tx.pure(
          bcs.vector(bcs.u64()).serialize(configArgs.timeBandCounts).toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.allTimeBandAfters)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.allTimeBandWeights)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.approvePathReqCounts)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.allApproveGroupIndices)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.allApproveThresholds)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.cancelPathReqCounts)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.allCancelGroupIndices)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.allCancelThresholds)
            .toBytes(),
        ),
        tx.pure(
          bcs.vector(bcs.u64()).serialize(configArgs.proposeGroups).toBytes(),
        ),
        tx.pure(
          bcs.vector(bcs.u64()).serialize(configArgs.executeGroups).toBytes(),
        ),
        tx.pure(
          bcs.vector(bcs.u64()).serialize(configArgs.cancelGroups).toBytes(),
        ),
        tx.pure.u64(configArgs.intentExpiryMs),
      ],
    });

    tx.moveCall({
      target: `${actionsPackage}::vault::init_treasury_vault_with_coin_type`,
      typeArguments: [treasuryCoinType],
      arguments: [account, tx.object(registryId)],
    });

    tx.moveCall({
      target: `${pkg}::multisig::share`,
      arguments: [account],
    });

    return tx;
  }

  /**
   * Create (stage) a multisig config-change proposal with explicit execution policy.
   * Flow: authenticate -> multisig::new_params_from_config -> config::request_config_change
   */
  proposeConfigChange(
    tx: Transaction,
    params: ProposeConfigChangeParams,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    const registryId = this.sharedObjects.packageRegistry.id;
    if (!pkg) throw new Error("accountMultisig package not configured");

    const executionTime = normalizeU64Input(
      params.executionTimeMs ?? 0,
      "executionTimeMs",
    );
    const configArgs = normalizeConfigInput(params);

    const account = tx.object(params.accountId);

    const auth = tx.moveCall({
      target: `${pkg}::multisig::authenticate`,
      arguments: [account],
    });

    const intentParams = tx.moveCall({
      target: `${pkg}::multisig::new_params_from_config`,
      arguments: [
        account,
        tx.pure.string(params.key),
        tx.pure.string(params.description),
        tx.pure.u64(executionTime),
        tx.object("0x6"), // Clock
      ],
    });

    tx.moveCall({
      target: `${pkg}::config::request_config_change`,
      arguments: [
        auth,
        account,
        tx.object(registryId),
        intentParams,
        tx.pure.vector("string", configArgs.groupNames),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.groupMemberCounts)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.Address)
            .serialize(configArgs.allMemberAddresses)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.allMemberWeights)
            .toBytes(),
        ),
        tx.pure(
          bcs.vector(bcs.u64()).serialize(configArgs.timeBandCounts).toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.allTimeBandAfters)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.allTimeBandWeights)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.approvePathReqCounts)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.allApproveGroupIndices)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.allApproveThresholds)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.cancelPathReqCounts)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.allCancelGroupIndices)
            .toBytes(),
        ),
        tx.pure(
          bcs
            .vector(bcs.u64())
            .serialize(configArgs.allCancelThresholds)
            .toBytes(),
        ),
        tx.pure(
          bcs.vector(bcs.u64()).serialize(configArgs.proposeGroups).toBytes(),
        ),
        tx.pure(
          bcs.vector(bcs.u64()).serialize(configArgs.executeGroups).toBytes(),
        ),
        tx.pure(
          bcs.vector(bcs.u64()).serialize(configArgs.cancelGroups).toBytes(),
        ),
        tx.pure.u64(configArgs.intentExpiryMs),
      ],
    });

    return tx;
  }

  /**
   * Approve an intent on a multisig account.
   */
  approveIntent(tx: Transaction, accountId: string, key: string): Transaction {
    const pkg = this.packages.accountMultisig;
    if (!pkg) throw new Error("accountMultisig package not configured");

    tx.moveCall({
      target: `${pkg}::multisig::approve_intent`,
      arguments: [
        tx.object(accountId),
        tx.pure.string(key),
        tx.object("0x6"), // Clock
      ],
    });

    return tx;
  }

  /**
   * Remove a prior approval on an active intent.
   */
  disapproveIntent(
    tx: Transaction,
    accountId: string,
    key: string,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    if (!pkg) throw new Error("accountMultisig package not configured");

    tx.moveCall({
      target: `${pkg}::multisig::disapprove_intent`,
      arguments: [tx.object(accountId), tx.pure.string(key)],
    });

    return tx;
  }

  /**
   * Reject an intent on a multisig account.
   */
  rejectIntent(tx: Transaction, accountId: string, key: string): Transaction {
    const pkg = this.packages.accountMultisig;
    if (!pkg) throw new Error("accountMultisig package not configured");

    tx.moveCall({
      target: `${pkg}::multisig::reject_intent`,
      arguments: [
        tx.object(accountId),
        tx.pure.string(key),
        tx.object("0x6"), // Clock
      ],
    });

    return tx;
  }

  /**
   * Re-evaluate an active intent against current time bands.
   *
   * This lets keepers move delayed approvals from ACTIVE to APPROVED once a
   * configured time band matures without requiring another vote.
   */
  evaluateIntent(tx: Transaction, accountId: string, key: string): Transaction {
    const pkg = this.packages.accountMultisig;
    if (!pkg) throw new Error("accountMultisig package not configured");

    tx.moveCall({
      target: `${pkg}::multisig::evaluate_intent`,
      arguments: [
        tx.object(accountId),
        tx.pure.string(key),
        tx.object("0x6"), // Clock
      ],
    });

    return tx;
  }

  /**
   * Execute a config change intent.
   * 3-step: execute_intent -> config::execute_config_change -> confirm_execution
   */
  executeConfigChange(
    tx: Transaction,
    accountId: string,
    key: string,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    const registryId = this.sharedObjects.packageRegistry.id;
    if (!pkg) throw new Error("accountMultisig package not configured");

    // Step 1: execute_intent returns Executable<Approvals>
    const executable = tx.moveCall({
      target: `${pkg}::multisig::execute_intent`,
      arguments: [
        tx.object(accountId),
        tx.object(registryId),
        tx.pure.string(key),
        tx.object("0x6"), // Clock
      ],
    });

    // Step 2: execute_config_change
    tx.moveCall({
      target: `${pkg}::config::execute_config_change`,
      arguments: [executable, tx.object(accountId), tx.object(registryId)],
    });

    // Step 3: confirm_execution (account_protocol::account)
    tx.moveCall({
      target: `${this.packages.accountProtocol}::account::confirm_execution`,
      typeArguments: [`${pkg}::multisig::Approvals`],
      arguments: [tx.object(accountId), executable],
    });

    return tx;
  }

  /**
   * Cancel a pending (approved) config change.
   */
  cancelPendingConfigChange(
    tx: Transaction,
    accountId: string,
    key: string,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    const registryId = this.sharedObjects.packageRegistry.id;
    if (!pkg) throw new Error("accountMultisig package not configured");

    tx.moveCall({
      target: `${pkg}::config::cancel_pending_config_change`,
      arguments: [
        tx.object(accountId),
        tx.object(registryId),
        tx.pure.string(key),
        tx.object("0x6"),
      ],
    });

    return tx;
  }

  /**
   * Cancel a stale config change (config nonce changed).
   */
  cancelStaleConfigChange(
    tx: Transaction,
    accountId: string,
    key: string,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    const registryId = this.sharedObjects.packageRegistry.id;
    if (!pkg) throw new Error("accountMultisig package not configured");

    tx.moveCall({
      target: `${pkg}::config::cancel_stale_config_change`,
      arguments: [
        tx.object(accountId),
        tx.object(registryId),
        tx.pure.string(key),
      ],
    });

    return tx;
  }

  /**
   * Cancel a rejected config change.
   */
  cancelRejectedConfigChange(
    tx: Transaction,
    accountId: string,
    key: string,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    const registryId = this.sharedObjects.packageRegistry.id;
    if (!pkg) throw new Error("accountMultisig package not configured");

    tx.moveCall({
      target: `${pkg}::config::cancel_rejected_config_change`,
      arguments: [
        tx.object(accountId),
        tx.object(registryId),
        tx.pure.string(key),
      ],
    });

    return tx;
  }

  /**
   * Cancel an expired config change.
   */
  cancelExpiredConfigChange(
    tx: Transaction,
    accountId: string,
    key: string,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    const registryId = this.sharedObjects.packageRegistry.id;
    if (!pkg) throw new Error("accountMultisig package not configured");

    tx.moveCall({
      target: `${pkg}::config::cancel_expired_config_change`,
      arguments: [
        tx.object(accountId),
        tx.object(registryId),
        tx.pure.string(key),
        tx.object("0x6"),
      ],
    });

    return tx;
  }

  /**
   * Permissionless cleanup for expired config changes.
   */
  cleanupExpiredConfigChanges(
    tx: Transaction,
    params: CleanupExpiredConfigChangesParams,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    const registryId = this.sharedObjects.packageRegistry.id;
    if (!pkg) throw new Error("accountMultisig package not configured");

    tx.moveCall({
      target: `${pkg}::config::cleanup_expired_config_changes`,
      arguments: [
        tx.object(params.accountId),
        tx.object(registryId),
        tx.pure.vector("string", params.keys),
        tx.pure.u64(params.maxToClean),
        tx.object("0x6"),
      ],
    });

    return tx;
  }

  // ========================================================================
  // ACTIONS INTENT BUILDERS
  // ========================================================================

  /**
   * Propose an actions intent using the action_spec_builder PTB pattern.
   * The `builderSetup` callback adds action specs to the builder via moveCall.
   */
  proposeActionsIntent(
    tx: Transaction,
    params: ProposeActionsIntentParams,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    const actionsPackage = this.packages.accountActions;
    const registryId = this.sharedObjects.packageRegistry.id;
    if (!pkg) throw new Error("accountMultisig package not configured");
    if (!actionsPackage) throw new Error("accountActions package not configured");

    const executionTime = BigInt(params.executionTimeMs ?? 0);

    const account = tx.object(params.accountId);

    const auth = tx.moveCall({
      target: `${pkg}::multisig::authenticate`,
      arguments: [account],
    });

    const intentParams = tx.moveCall({
      target: `${pkg}::multisig::new_params_from_config`,
      arguments: [
        account,
        tx.pure.string(params.key),
        tx.pure.string(params.description),
        tx.pure.u64(executionTime),
        tx.object("0x6"), // Clock
      ],
    });

    // Build action specs
    const builder = tx.moveCall({
      target: `${actionsPackage}::action_spec_builder::new`,
      arguments: [tx.pure.u8(0), tx.pure.id(params.accountId), tx.pure.u64(0)],
    });

    params.builderSetup(tx, builder);

    const specs = tx.moveCall({
      target: `${actionsPackage}::action_spec_builder::into_vector`,
      arguments: [builder],
    });

    // Stage through actions_staging::request_actions
    tx.moveCall({
      target: `${pkg}::actions_staging::request_actions`,
      arguments: [auth, account, tx.object(registryId), intentParams, specs],
    });

    return tx;
  }

  /**
   * Execute an approved actions intent.
   * Returns the executable and witness for callers to add do_* calls.
   * Call `confirmExecution` after all do_* calls.
   */
  beginActionsExecution(
    tx: Transaction,
    accountId: string,
    key: string,
  ): { executable: any; witness: any } {
    const pkg = this.packages.accountMultisig;
    const registryId = this.sharedObjects.packageRegistry.id;
    if (!pkg) throw new Error("accountMultisig package not configured");

    const executable = tx.moveCall({
      target: `${pkg}::multisig::execute_intent`,
      arguments: [
        tx.object(accountId),
        tx.object(registryId),
        tx.pure.string(key),
        tx.object("0x6"), // Clock
      ],
    });

    const witness = tx.moveCall({
      target: `${pkg}::actions_staging::witness`,
    });

    return { executable, witness };
  }

  /**
   * Confirm execution of an intent (call after all do_* calls).
   * Re-adds the completed intent after verifying all actions were processed.
   */
  confirmExecution(
    tx: Transaction,
    accountId: string,
    executable: any,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    if (!pkg) throw new Error("accountMultisig package not configured");

    tx.moveCall({
      target: `${this.packages.accountProtocol}::account::confirm_execution`,
      typeArguments: [`${pkg}::multisig::Approvals`],
      arguments: [tx.object(accountId), executable],
    });

    return tx;
  }

  /**
   * Cancel a pending (approved) actions intent.
   */
  cancelPendingActions(
    tx: Transaction,
    accountId: string,
    key: string,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    if (!pkg) throw new Error("accountMultisig package not configured");

    tx.moveCall({
      target: `${pkg}::actions_staging::cancel_pending_actions`,
      arguments: [tx.object(accountId), tx.pure.string(key), tx.object("0x6")],
    });

    return tx;
  }

  /**
   * Cancel a stale actions intent (config nonce changed).
   */
  cancelStaleActions(
    tx: Transaction,
    accountId: string,
    key: string,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    if (!pkg) throw new Error("accountMultisig package not configured");

    tx.moveCall({
      target: `${pkg}::actions_staging::cancel_stale_actions`,
      arguments: [tx.object(accountId), tx.pure.string(key)],
    });

    return tx;
  }

  /**
   * Cancel a rejected actions intent (approval mathematically impossible).
   */
  cancelRejectedActions(
    tx: Transaction,
    accountId: string,
    key: string,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    if (!pkg) throw new Error("accountMultisig package not configured");

    tx.moveCall({
      target: `${pkg}::actions_staging::cancel_rejected_actions`,
      arguments: [tx.object(accountId), tx.pure.string(key)],
    });

    return tx;
  }

  /**
   * Cancel an expired actions intent.
   */
  cancelExpiredActions(
    tx: Transaction,
    accountId: string,
    key: string,
  ): Transaction {
    const pkg = this.packages.accountMultisig;
    if (!pkg) throw new Error("accountMultisig package not configured");

    tx.moveCall({
      target: `${pkg}::actions_staging::cancel_expired_actions`,
      arguments: [tx.object(accountId), tx.pure.string(key), tx.object("0x6")],
    });

    return tx;
  }

  /**
   * Sweep collected fees from the multisig fee vault (admin only).
   */
  sweepFees(tx: Transaction, adminCapId: string): Transaction {
    const pkg = this.packages.accountMultisig;
    const feeVault = this.sharedObjects.multisigFeeVault;
    if (!pkg) throw new Error("accountMultisig package not configured");
    if (!feeVault)
      throw new Error("multisigFeeVault shared object not configured");

    tx.moveCall({
      target: `${pkg}::multisig::sweep_fees`,
      arguments: [tx.object(adminCapId), tx.object(feeVault.id)],
    });

    return tx;
  }

  /**
   * Permissionless cleanup: remove a fully-depleted vesting from the registry.
   * Anyone can call this as long as the vesting balance is zero.
   */
  cleanupDepletedVesting(
    tx: Transaction,
    config: { vestingId: string; accountId: string; coinType: string },
  ): Transaction {
    const pkg = this.packages.accountActions;
    const registryId = this.sharedObjects.packageRegistry.id;
    if (!pkg) throw new Error("accountActions package not configured");

    tx.moveCall({
      target: `${pkg}::vesting::cleanup_depleted_vesting`,
      typeArguments: [config.coinType],
      arguments: [
        tx.object(config.vestingId),
        tx.object(config.accountId),
        tx.object(registryId),
      ],
    });

    return tx;
  }

  // ========================================================================
  // EXECUTION DISCOVERY HELPERS
  // ========================================================================

  /**
   * Return required runtime inputs for a staged actions intent.
   *
   * This is useful before execution to determine which fields still need
   * user input (coin type, object IDs, package upgrade artifacts).
   */
  getActionExecutionRequirements(
    actionTypes: string[],
  ): ActionExecutionRequirement[] {
    const requirements: ActionExecutionRequirement[] = [];

    for (let i = 0; i < actionTypes.length; i += 1) {
      const actionType = actionTypes[i];
      const moduleType = extractModuleType(actionType);
      const actionDef = getActionByFullType(actionType);
      const overrideMeta = KNOWN_ACTION_LABEL_OVERRIDES[moduleType];
      if (!actionDef && !overrideMeta) {
        continue;
      }

      const actionName = actionDef?.name ?? overrideMeta!.name;
      const category = actionDef?.category ?? overrideMeta!.category;

      const hasTypeArg = !!firstTypeArg(actionType);
      const typeParams =
        actionDef?.typeParams ?? overrideMeta?.typeParams ?? [];

      if (!hasTypeArg && typeParams.includes("CoinType")) {
        requirements.push({
          actionIndex: i,
          actionType,
          actionName,
          category,
          kind: "coinType",
          label: "Coin type",
          placeholder: "0x2::sui::SUI",
        });
      }

      if (!hasTypeArg && typeParams.includes("ObjectType")) {
        requirements.push({
          actionIndex: i,
          actionType,
          actionName,
          category,
          kind: "objectType",
          label: "Object type",
          placeholder: "0x2::example::MyObject",
        });
      }

      const objectReq = OBJECT_INPUT_BY_ACTION_TYPE[moduleType];
      if (objectReq) {
        requirements.push({
          actionIndex: i,
          actionType,
          actionName,
          category,
          kind: "objectId",
          label: objectReq.label,
          placeholder: objectReq.placeholder,
        });
      }

      if (moduleType === UPGRADE_ACTION_TYPE) {
        requirements.push({
          actionIndex: i,
          actionType,
          actionName,
          category,
          kind: "upgradeArtifacts",
          label: "Upgrade artifacts",
          placeholder: "packageId + modules + dependencies",
        });
      }
    }

    return requirements;
  }

  /**
   * Return unsupported/unsafe action chain reasons detectable client-side.
   */
  getUnsupportedActions(actionTypes: string[]): string[] {
    const reasons: string[] = [];
    let pendingUpgradeReceipts = 0;

    for (let i = 0; i < actionTypes.length; i += 1) {
      const actionType = actionTypes[i];
      const moduleType = extractModuleType(actionType);
      if (
        isMultisigConfigChangeActionType(
          actionType,
          this.packages.accountMultisig,
        )
      ) {
        reasons.push(
          `ConfigChange action at position ${i + 1} must use the multisig config-change flow, not a generic actions intent`,
        );
        continue;
      }

      const known =
        !!getActionByFullType(actionType) ||
        !!KNOWN_ACTION_LABEL_OVERRIDES[moduleType];
      if (!known) {
        reasons.push(
          `Unsupported action type at position ${i + 1}: ${actionType}`,
        );
        continue;
      }

      if (moduleType === UPGRADE_ACTION_TYPE) {
        pendingUpgradeReceipts += 1;
        continue;
      }

      if (moduleType === COMMIT_ACTION_TYPE) {
        if (pendingUpgradeReceipts === 0) {
          reasons.push(
            `Commit Upgrade (action ${i + 1}) requires an earlier Upgrade Package action in the same intent`,
          );
        } else {
          pendingUpgradeReceipts -= 1;
        }
      }
    }

    return reasons;
  }

  /**
   * Best-effort discovery of runtime object IDs needed for execution.
   *
   * Covered:
   * - `owned::ProvideObjectToResources<T>` -> owned `T` (wallet-provided execution objects)
   * - `vault::VaultDepositExternal` -> owned `Coin<CoinType>` (optionally filtered by expected amount)
   * - `currency::CurrencyUpdate` -> `Currency<CoinType>` owned by CoinRegistry object (`0xc` by default)
   * - `vesting::CancelVesting` -> best-effort owned `Vesting<CoinType>` lookup (manual fallback usually needed)
   */
  async discoverExecutionInputs(
    params: DiscoverExecutionInputsParams,
  ): Promise<DiscoverExecutionInputsResult> {
    const requirements = this.getActionExecutionRequirements(
      params.actionTypes,
    );
    const objectIdByAction: Record<number, string> = {};
    const candidatesByAction: Record<number, DiscoveredObjectCandidate[]> = {};
    const unresolved: string[] = [];
    const fallbackCoinType = params.coinType?.trim() || undefined;
    const coinRegistryOwnerId =
      params.coinRegistryOwnerId?.trim() || DEFAULT_COIN_REGISTRY_OWNER_ID;

    for (const req of requirements) {
      if (req.kind !== "objectId") continue;

      const moduleType = extractModuleType(req.actionType);
      const coinType = firstTypeArg(req.actionType) ?? fallbackCoinType;
      if (!coinType) {
        unresolved.push(
          `Action ${req.actionIndex + 1} (${req.actionName}) needs CoinType to discover ${req.label}`,
        );
        continue;
      }

      let candidates: DiscoveredObjectCandidate[] = [];
      try {
        if (moduleType === "owned::ProvideObjectToResources") {
          candidates = await this.getOwnedObjectsByExactType(
            params.owner,
            coinType,
          );
        } else if (moduleType === "currency::LockTreasuryCap") {
          candidates = await this.getOwnedObjectsByExactType(
            params.owner,
            `0x2::coin::TreasuryCap<${coinType}>`,
          );
        } else if (moduleType === "currency::LockMetadataCap") {
          candidates = await this.getOwnedObjectsByExactType(
            params.owner,
            `0x2::coin_registry::MetadataCap<${coinType}>`,
          );
        } else if (moduleType === "vault::VaultDepositExternal") {
          const allCoins = await this.getOwnedObjectsByExactType(
            params.owner,
            `0x2::coin::Coin<${coinType}>`,
          );
          const expectedAmount = normalizeBigintLike(
            params.expectedAmountByAction?.[req.actionIndex],
          );
          if (expectedAmount === undefined) {
            candidates = allCoins;
          } else {
            const exact = allCoins.filter((coin) => {
              const balance = normalizeBigintLike(coin.balance);
              return balance !== undefined && balance === expectedAmount;
            });
            candidates = exact.length > 0 ? exact : allCoins;
          }
        } else if (moduleType === "currency::CurrencyUpdate") {
          candidates = await this.discoverCurrencyObjects(
            coinType,
            coinRegistryOwnerId,
          );
        } else if (moduleType === "vesting::CancelVesting") {
          candidates = await this.getOwnedObjectsByExactType(
            params.owner,
            `${this.packages.accountActions}::vesting::Vesting<${coinType}>`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        unresolved.push(
          `Action ${req.actionIndex + 1} (${req.actionName}) discovery failed: ${message}`,
        );
        continue;
      }

      candidatesByAction[req.actionIndex] = candidates;
      if (candidates.length === 1) {
        objectIdByAction[req.actionIndex] = candidates[0].objectId;
      } else if (
        moduleType === "vault::VaultDepositExternal" &&
        candidates.length > 1
      ) {
        const expectedAmount = normalizeBigintLike(
          params.expectedAmountByAction?.[req.actionIndex],
        );
        if (expectedAmount !== undefined) {
          const allExact = candidates.every((candidate) => {
            const balance = normalizeBigintLike(candidate.balance);
            return balance !== undefined && balance === expectedAmount;
          });
          if (allExact) {
            const [selected] = [...candidates].sort((a, b) =>
              a.objectId.localeCompare(b.objectId),
            );
            objectIdByAction[req.actionIndex] = selected.objectId;
            continue;
          }
        }
      } else if (candidates.length === 0) {
        unresolved.push(
          `Action ${req.actionIndex + 1} (${req.actionName}) has no discoverable candidate for ${req.label}`,
        );
      } else {
        unresolved.push(
          `Action ${req.actionIndex + 1} (${req.actionName}) has ${candidates.length} candidates for ${req.label}; manual selection required`,
        );
      }
    }

    return {
      requirements,
      objectIdByAction,
      candidatesByAction,
      unresolved,
    };
  }

  /**
   * Build command hint to generate upgrade artifacts from a local Move package.
   */
  getUpgradeBuildCommand(packagePath = "."): string {
    return `sui move build --path ${packagePath} --dump-bytecode-as-base64 --with-unpublished-dependencies --no-tree-shaking`;
  }

  /**
   * Parse `sui move build --dump-bytecode-as-base64` output into normalized artifacts.
   */
  parseUpgradeBuildOutput(
    buildOutput: string | UpgradeArtifactBuildOutput,
  ): ParsedUpgradeArtifacts {
    const raw = this.parseUpgradeBuildOutputRaw(buildOutput);
    const modules = this.ensureStringArray(raw.modules, "modules");
    const dependencies = this.ensureStringArray(
      raw.dependencies,
      "dependencies",
    );
    const digestBytes = this.normalizeDigestBytes(raw.digest);

    return {
      modules,
      dependencies,
      digestBytes,
      digestHex: bytesToHex(digestBytes),
    };
  }

  /**
   * Prepare both staging digest and execution payload for package upgrades.
   *
   * - `specDigestHex/specDigestBytes` is used for `add_upgrade_and_commit_specs`.
   * - `execution` is used for `tx.upgrade`.
   */
  prepareUpgradeArtifacts(
    buildOutput: string | UpgradeArtifactBuildOutput,
    packageId: string,
  ): UpgradeArtifactsPrepared {
    const trimmedPackageId = packageId.trim();
    if (!trimmedPackageId) {
      throw new Error("packageId is required for upgrade execution payload");
    }

    const parsed = this.parseUpgradeBuildOutput(buildOutput);
    const execution: UpgradeExecutionInput = {
      packageId: trimmedPackageId,
      modules: parsed.modules,
      dependencies: parsed.dependencies,
    };

    return {
      specDigestHex: parsed.digestHex,
      specDigestBytes: parsed.digestBytes,
      execution,
      executionJson: JSON.stringify(execution, null, 2),
    };
  }

  private parseUpgradeBuildOutputRaw(
    buildOutput: string | UpgradeArtifactBuildOutput,
  ): UpgradeArtifactBuildOutput {
    if (typeof buildOutput !== "string") {
      if (!isUpgradeBuildOutputShape(buildOutput)) {
        throw new Error(
          "Build output object must include modules, dependencies, and digest",
        );
      }
      return buildOutput;
    }

    const trimmed = buildOutput.trim();
    if (!trimmed) throw new Error("Empty build output");

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!isUpgradeBuildOutputShape(parsed)) {
        throw new Error(
          "JSON missing required fields (modules, dependencies, digest)",
        );
      }
      return parsed;
    } catch {
      const candidates = extractJsonObjectCandidates(trimmed);
      const parsedMatches: UpgradeArtifactBuildOutput[] = [];
      for (const candidate of candidates) {
        try {
          const parsed = JSON.parse(candidate) as unknown;
          if (isUpgradeBuildOutputShape(parsed)) {
            parsedMatches.push(parsed);
          }
        } catch {
          // Ignore non-JSON candidates.
        }
      }

      if (parsedMatches.length === 1) {
        return parsedMatches[0];
      }
      if (parsedMatches.length > 1) {
        throw new Error(
          "Build output contains multiple JSON objects with upgrade fields; pass only the exact build JSON",
        );
      }
      throw new Error(
        "Could not find upgrade build JSON with modules/dependencies/digest in the provided output",
      );
    }
  }

  private ensureStringArray(value: unknown, fieldName: string): string[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(`${fieldName} must be a non-empty string array`);
    }

    const normalized = value.map((entry) => {
      if (typeof entry !== "string" || !entry.trim()) {
        throw new Error(`${fieldName} contains non-string values`);
      }
      return entry.trim();
    });
    return normalized;
  }

  private normalizeDigestBytes(digest: unknown): number[] {
    if (Array.isArray(digest)) {
      if (digest.length === 0) throw new Error("digest byte array is empty");
      const bytes = digest.map((n) => {
        if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 255) {
          throw new Error("digest byte array contains invalid values");
        }
        return n;
      });
      return bytes;
    }

    if (typeof digest !== "string" || !digest.trim()) {
      throw new Error("digest must be a non-empty string or byte array");
    }

    const trimmed = digest.trim();
    if (/^(0x)?[a-fA-F0-9]+$/.test(trimmed)) {
      return hexToBytes(trimmed);
    }
    return base64ToBytes(trimmed);
  }

  private async getOwnedObjectsByExactType(
    owner: string,
    structType: string,
  ): Promise<DiscoveredObjectCandidate[]> {
    const out: DiscoveredObjectCandidate[] = [];
    let cursor: string | null | undefined = null;

    do {
      const page = await this.client.getOwnedObjects({
        owner,
        filter: { StructType: structType },
        cursor: cursor ?? undefined,
        options: {
          showType: true,
          showContent: true,
        },
      });

      for (const obj of page.data) {
        const data = obj.data;
        if (!data?.objectId || !data.type || !data.version || !data.digest)
          continue;
        out.push({
          objectId: data.objectId,
          type: data.type,
          version: String(data.version),
          digest: data.digest,
          balance: extractMoveObjectBalance(data),
        });
      }

      cursor = page.hasNextPage ? page.nextCursor : null;
    } while (cursor);

    return out;
  }

  private async discoverCurrencyObjects(
    coinType: string,
    coinRegistryOwnerId: string,
  ): Promise<DiscoveredObjectCandidate[]> {
    const currencyStructType = `0x2::coin_registry::Currency<${coinType}>`;
    const fromRegistry = await this.getOwnedObjectsByExactType(
      coinRegistryOwnerId,
      currencyStructType,
    );
    if (fromRegistry.length > 0) {
      return fromRegistry;
    }

    const fromMetadata: DiscoveredObjectCandidate[] = [];

    try {
      const metadata = await this.client.getCoinMetadata({ coinType });
      const currencyId = metadata?.id?.trim();
      if (currencyId) {
        const obj = await this.client.getObject({
          id: currencyId,
          options: {
            showType: true,
            showContent: true,
          },
        });
        const data = obj.data;
        if (
          data?.objectId &&
          data.type === currencyStructType &&
          data.version &&
          data.digest
        ) {
          fromMetadata.push({
            objectId: data.objectId,
            type: data.type,
            version: String(data.version),
            digest: data.digest,
            balance: extractMoveObjectBalance(data),
          });
        }
      }
    } catch {
      // Ignore metadata lookup errors; registry lookup already ran above.
    }

    return fromMetadata;
  }

  // ========================================================================
  // QUERY METHODS (via backend API)
  // ========================================================================

  /**
   * Get multisig accounts where the address is a member.
   */
  async getAccountsByMember(
    backendUrl: string,
    address: string,
  ): Promise<any[]> {
    const res = await fetch(`${backendUrl}/api/multisigs?member=${address}`);
    if (!res.ok)
      throw new Error(`Failed to fetch multisigs: ${res.statusText}`);
    return (await res.json()) as any[];
  }

  /**
   * Get multisig accounts created by the given address.
   */
  async getAccountsByCreator(
    backendUrl: string,
    address: string,
  ): Promise<any[]> {
    const res = await fetch(`${backendUrl}/api/multisigs?creator=${address}`);
    if (!res.ok)
      throw new Error(`Failed to fetch multisigs: ${res.statusText}`);
    return (await res.json()) as any[];
  }

  /**
   * Get a single multisig account config.
   */
  async getAccount(backendUrl: string, id: string): Promise<any> {
    const res = await fetch(`${backendUrl}/api/multisigs/${id}`);
    if (!res.ok) throw new Error(`Failed to fetch multisig: ${res.statusText}`);
    return await res.json();
  }

  /**
   * Get intents for a multisig account.
   */
  async getIntents(backendUrl: string, accountId: string): Promise<any[]> {
    const res = await fetch(`${backendUrl}/api/multisigs/${accountId}/intents`);
    if (!res.ok) throw new Error(`Failed to fetch intents: ${res.statusText}`);
    return (await res.json()) as any[];
  }
}
