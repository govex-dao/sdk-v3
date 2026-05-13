/**
 * Action Converter - Converts parsed actions from backend to SDK execution configs
 *
 * This module bridges the gap between:
 * - Backend indexer output (IndexedAction from event-based parsing)
 * - SDK executor input (IntentActionConfig)
 *
 * Uses action-definitions.ts as single source of truth.
 *
 * @module workflows/action-converter
 */

import type { IntentActionConfig } from './types/intent';
import { ACTION_BY_ID, getActionByFullType, type ActionDefinition } from '../config/action-definitions';
import { bcs, type BcsType } from '@mysten/sui/bcs';

/**
 * Indexed action from backend indexer (event-based format)
 * Matches the output of backend/indexer-v2/grpc-indexer.ts event handlers
 */
export interface IndexedAction {
  /** Position in the action batch (0-indexed) */
  index: number;
  /** Short action type (e.g., "CreateStreamAction", "CurrencyMint") */
  type: string;
  /** Full Move type path (e.g., "0x...::stream_init_actions::CreateStreamAction") */
  fullType: string;
  /** Package ID where the action is defined */
  packageId?: string;
  /** Coin/asset type if applicable (first type arg) */
  coinType?: string;
  /** BCS-serialized action payload from the canonical ActionSpec */
  actionData?: string | number[] | Uint8Array;
  /** Snake-case alias used by some indexer/API paths */
  action_data?: string | number[] | Uint8Array;
  /** Action data schema version from the canonical ActionSpec */
  actionVersion?: number;
  /** Parameters with types, names, and values */
  params: Array<{ type: string; name: string; value: string }>;
}

/**
 * Error thrown when an action cannot be converted
 */
export class ActionConversionError extends Error {
  constructor(
    public actionType: string,
    public reason: string
  ) {
    super(`Cannot convert action '${actionType}': ${reason}`);
    this.name = 'ActionConversionError';
  }
}

function decodeHexUtf8Maybe(value: string): string | null {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (normalized.length === 0) return '';
  if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(normalized)) return null;

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = parseInt(normalized.slice(i, i + 2), 16);
  }

  const decoded = new TextDecoder().decode(bytes);
  const roundTrip = new TextEncoder().encode(decoded);
  if (roundTrip.length !== bytes.length) return null;
  for (let i = 0; i < bytes.length; i += 1) {
    if (roundTrip[i] !== bytes[i]) return null;
  }
  return decoded;
}

function decodeParamValue(type: string, value: string): any {
  if (value === 'null') {
    return undefined;
  }

  if (type === 'String') {
    return decodeHexUtf8Maybe(value) ?? value;
  }

  if (type === 'Option<String>') {
    try {
      const parsed = JSON.parse(value) as { some_hex?: string; none?: boolean };
      if (parsed.none) return undefined;
      if (typeof parsed.some_hex === 'string') {
        return decodeHexUtf8Maybe(parsed.some_hex) ?? value;
      }
    } catch {
      return value;
    }
  }

  if (type === 'vector<String>') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed.map((item) => decodeHexUtf8Maybe(item) ?? item);
      }
    } catch {
      return value;
    }
  }

  return value;
}

/**
 * Convert params array to Record for buildConfig
 */
function normalizeParams(params: Record<string, any> | Array<{ type: string; name: string; value: string }>): Record<string, any> {
  if (!Array.isArray(params)) {
    return params;
  }
  // Convert array format to object
  const result: Record<string, any> = {};
  for (const p of params) {
    // Convert snake_case to camelCase
    const key = p.name.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
    result[key] = decodeParamValue(p.type, p.value);
  }
  return result;
}

function hexToBytes(value: string): Uint8Array {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error('invalid hex actionData');
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = parseInt(normalized.slice(i, i + 2), 16);
  }
  return bytes;
}

function actionDataBytes(action: IndexedAction): Uint8Array | null {
  const raw = action.actionData ?? action.action_data;
  if (!raw) return null;
  if (raw instanceof Uint8Array) return raw;
  if (Array.isArray(raw)) return new Uint8Array(raw.map(Number));
  return hexToBytes(raw);
}

const BcsRecipientMint = bcs.struct('RecipientMint', {
  recipient: bcs.Address,
  amount: bcs.u64(),
});

const BcsTierSpec = bcs.struct('TierSpec', {
  price_threshold: bcs.u128(),
  is_above: bcs.bool(),
  recipients: bcs.vector(BcsRecipientMint),
  tier_description: bcs.string(),
});

const BcsUrl = bcs.struct('Url', {
  url: bcs.string(),
});

const BcsConditionalMetadata = bcs.struct('ConditionalMetadata', {
  decimals: bcs.u8(),
  coin_name_prefix: bcs.string(),
  coin_icon_url: BcsUrl,
});

const BcsLockTreasuryCapAction = bcs.struct('LockTreasuryCapAction', {
  has_max_supply: bcs.bool(),
  max_supply: bcs.u64(),
  can_mint: bcs.bool(),
  can_burn: bcs.bool(),
  can_update_name: bcs.bool(),
  can_update_description: bcs.bool(),
  can_update_icon: bcs.bool(),
  resource_name: bcs.string(),
});

function bcsTypeForParam(type: string): BcsType<any, any> {
  switch (type) {
    case 'u8':
      return bcs.u8();
    case 'u64':
      return bcs.u64();
    case 'u128':
      return bcs.u128();
    case 'bool':
      return bcs.bool();
    case 'string':
      return bcs.string();
    case 'address':
    case 'id':
      return bcs.Address;
    case 'vector<u8>':
      return bcs.vector(bcs.u8());
    case 'vector<string>':
      return bcs.vector(bcs.string());
    case 'vector<address>':
      return bcs.vector(bcs.Address);
    case 'option<u8>':
      return bcs.option(bcs.u8());
    case 'option<u64>':
      return bcs.option(bcs.u64());
    case 'option<u128>':
      return bcs.option(bcs.u128());
    case 'option<bool>':
      return bcs.option(bcs.bool());
    case 'option<string>':
      return bcs.option(bcs.string());
    case 'option<vector<u8>>':
      return bcs.option(bcs.vector(bcs.u8()));
    case 'tier_specs':
      return bcs.vector(BcsTierSpec);
    case 'conditional_metadata':
      return bcs.option(bcs.option(BcsConditionalMetadata));
    default:
      throw new Error(`unsupported BCS param type '${type}'`);
  }
}

function toCamelCaseKey(key: string): string {
  return key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
}

function normalizeBcsValue(value: any): any {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(normalizeBcsValue);
  if (value && typeof value === 'object') {
    const normalized: Record<string, any> = {};
    for (const [key, nested] of Object.entries(value)) {
      normalized[toCamelCaseKey(key)] = normalizeBcsValue(nested);
    }
    return normalized;
  }
  return value;
}

function decodeActionDataParams(action: IndexedAction, def: ActionDefinition): Record<string, any> | null {
  const bytes = actionDataBytes(action);
  if (!bytes) return null;
  if (def.id === 'lock_treasury_cap') {
    const parsed = BcsLockTreasuryCapAction.parse(bytes);
    return {
      maxSupply: parsed.has_max_supply ? normalizeBcsValue(parsed.max_supply) : undefined,
      canMint: parsed.can_mint,
      canBurn: parsed.can_burn,
      canUpdateName: parsed.can_update_name,
      canUpdateDescription: parsed.can_update_description,
      canUpdateIcon: parsed.can_update_icon,
      resourceName: parsed.resource_name,
    };
  }
  if (def.params.length === 0) return {};

  const fields: Record<string, BcsType<any, any>> = {};
  for (const param of def.params) {
    fields[param.name] = bcsTypeForParam(param.type);
  }

  const parsed = bcs.struct(`${def.id}ActionData`, fields).parse(bytes);
  const result: Record<string, any> = {};
  for (const param of def.params) {
    result[param.name] = normalizeBcsValue(parsed[param.name]);
  }
  return result;
}

function normalizeActionParams(action: IndexedAction, def: ActionDefinition): Record<string, any> {
  const decoded = decodeActionDataParams(action, def);
  if (decoded) return decoded;
  return normalizeParams(action.params);
}

/** Ensure all addresses in a Move type string have `0x` prefix (TypeName stores them without). */
function normalizeTypeAddresses(typeStr: string): string {
  return typeStr.replace(/\b([0-9a-fA-F]{64})(?=::)/g, '0x$1');
}

/**
 * Extract type args from fullType string
 * e.g., "0x...::module::Type<A, B, C>" -> ["A", "B", "C"]
 */
function extractTypeArgs(fullType: string): string[] {
  const match = fullType.match(/<(.+)>$/);
  if (!match) return [];

  // Simple split - handles basic cases
  const inner = match[1];
  const args: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of inner) {
    if (char === '<') depth++;
    else if (char === '>') depth--;
    else if (char === ',' && depth === 0) {
      args.push(normalizeTypeAddresses(current.trim()));
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) args.push(normalizeTypeAddresses(current.trim()));

  return args;
}

function isDepositRaiseFundsType(fullType: string): boolean {
  const genericStart = fullType.indexOf('<');
  const cleanType = genericStart > 0 ? fullType.substring(0, genericStart) : fullType;
  return cleanType.endsWith('::launchpad::DepositRaiseFunds');
}

/**
 * Build IntentActionConfig from action definition and parsed params
 * Uses the action definition's params and typeParams to know what fields are needed
 */
function buildConfig(def: ActionDefinition, params: Record<string, any>, typeArgs: string[], coinType?: string): IntentActionConfig {
  const { id, typeParams } = def;

  // Build config with action ID and decoded ActionSpec params.
  // Execution only needs some params directly (runtime object IDs, resource names),
  // but preserving all decoded params keeps auto-execution aligned with staged specs.
  const config: Record<string, any> = { action: id };
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      config[key] = value;
    }
  }

  // Check if this action needs type parameters
  if (typeParams && typeParams.length > 0) {
    // Map typeParams to typeArgs
    for (let i = 0; i < typeParams.length; i++) {
      const paramName = typeParams[i];
      const typeArg = typeArgs[i];

      if (paramName === 'CoinType') {
        config.coinType = params.coinType || coinType || typeArg;
        if (!config.coinType) {
          throw new ActionConversionError(id, 'coinType not found');
        }
      } else if (paramName === 'ObjectType') {
        config.objectType = params.objectType || typeArg || '';
      } else if (paramName === 'CapType') {
        config.capType = params.capType || typeArg || '';
      } else if (paramName === 'AssetType') {
        config.assetType = params.assetType || typeArg || '';
      } else if (paramName === 'StableType') {
        config.stableType = params.stableType || typeArg || '';
      } else if (paramName === 'LPType') {
        config.lpType = params.lpType || typeArg || '';
      } else if (paramName === 'KeyType') {
        config.keyType = params.keyType || typeArg || '';
      }
    }
  }

  // Special case: create_pool_with_mint needs extra required params
  if (id === 'create_pool_with_mint') {
    config.mintCapResourceName = params.mintCapResourceName;
    config.lpTreasuryCapId = params.lpTreasuryCapId;
    config.lpCurrencyId = params.lpCurrencyId;
    if (!config.mintCapResourceName || !config.lpTreasuryCapId || !config.lpCurrencyId) {
      throw new ActionConversionError(id, 'mintCapResourceName, lpTreasuryCapId, or lpCurrencyId not found');
    }
  }

  // Special case: update_currency needs Currency<CoinType> shared object ID
  if (id === 'update_currency') {
    config.currencyId = params.currencyId;
    if (!config.currencyId) {
      throw new ActionConversionError(id, 'currencyId not found (Currency<CoinType> shared object required)');
    }
  }

  // Some execution helpers accept `externalArg` as a runtime object handle while
  // the staged ActionSpec stores the same object under a more specific field.
  if (id === 'withdraw_object' && !config.externalArg && config.objectId) {
    config.externalArg = config.objectId;
  }
  if (id === 'lock_upgrade_cap' && !config.externalArg && config.expectedCapId) {
    config.externalArg = config.expectedCapId;
  }

  return config as IntentActionConfig;
}

/**
 * Convert an indexed action to SDK execution config
 *
 * @param action - Indexed action from backend
 * @returns IntentActionConfig for SDK executor
 * @throws ActionConversionError if action cannot be converted
 */
export function indexedActionToExecutionConfig(action: IndexedAction): IntentActionConfig {
  const { type, fullType, coinType } = action;
  const typeArgs = extractTypeArgs(fullType);

  // First try: lookup by fullType (marker type from events)
  let def = getActionByFullType(fullType);

  // Fallback: lookup by action ID
  if (!def) {
    def = ACTION_BY_ID[type];
  }

  if (!def) {
    // Launchpad's internal success action is auto-staged and not part of user action defs.
    if (
      isDepositRaiseFundsType(fullType) ||
      type === 'deposit_raise_funds' ||
      type === 'DepositRaiseFunds'
    ) {
      const fallbackParams = normalizeParams(action.params);
      const assetType = fallbackParams.assetType || typeArgs[0];
      const stableType = fallbackParams.stableType || typeArgs[1];
      if (!assetType || !stableType) {
        throw new ActionConversionError(type, 'deposit_raise_funds missing type arguments');
      }
      return {
        action: 'deposit_raise_funds',
        assetType,
        stableType,
      };
    }
    throw new ActionConversionError(type, `unknown action type - fullType '${fullType}' not in ACTION_BY_MARKER_TYPE`);
  }

  const normalizedParams = normalizeActionParams(action, def);
  return buildConfig(def, normalizedParams, typeArgs, coinType);
}

/**
 * Convert an array of indexed actions to SDK execution configs
 *
 * @param actions - Array of indexed actions from backend
 * @returns Array of IntentActionConfigs for SDK executor
 * @throws ActionConversionError if any action cannot be converted
 */
export function indexedActionsToExecutionConfigs(actions: IndexedAction[]): IntentActionConfig[] {
  return actions.map((action, index) => {
    try {
      return indexedActionToExecutionConfig(action);
    } catch (error) {
      if (error instanceof ActionConversionError) {
        throw new ActionConversionError(
          action.type,
          `at index ${index}: ${error.reason}`
        );
      }
      throw error;
    }
  });
}

/**
 * Validate that all actions in an array can be converted
 * Returns validation result instead of throwing
 *
 * @param actions - Array of indexed actions
 * @returns Validation result with converted configs or errors
 */
export function validateAndConvertActions(actions: IndexedAction[]): {
  success: boolean;
  configs?: IntentActionConfig[];
  errors?: Array<{ index: number; type: string; error: string }>;
} {
  const configs: IntentActionConfig[] = [];
  const errors: Array<{ index: number; type: string; error: string }> = [];

  for (let i = 0; i < actions.length; i++) {
    try {
      configs.push(indexedActionToExecutionConfig(actions[i]));
    } catch (error) {
      errors.push({
        index: i,
        type: actions[i].type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, configs };
}
