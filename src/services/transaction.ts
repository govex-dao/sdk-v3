import { Transaction } from "@mysten/sui/transactions";
import { SuiClient } from "@mysten/sui/client";

/**
 * Base transaction builder utilities with common helpers
 */
export class BaseTransactionBuilder {
    protected tx: Transaction;
    protected client: SuiClient;

    constructor(client: SuiClient, tx?: Transaction) {
        this.client = client;
        this.tx = tx || new Transaction();
    }

    /**
     * Get the underlying Transaction object
     */
    getTransaction(): Transaction {
        return this.tx;
    }

    /**
     * Build and return the transaction
     */
    build(): Transaction {
        return this.tx;
    }

    /**
     * Split SUI coins for payment
     * @param amount - Amount in MIST (1 SUI = 1,000,000,000 MIST)
     * @returns Transaction argument for the split coin
     */
    splitSui(amount: bigint | number): ReturnType<Transaction["splitCoins"]>[0] {
        const [coin] = this.tx.splitCoins(this.tx.gas, [amount]);
        return coin;
    }

    /**
     * Create a vector of Move values
     */
    makeVector(items: any[]): ReturnType<Transaction["makeMoveVec"]> {
        return this.tx.makeMoveVec({ elements: items });
    }

    /**
     * Helper to convert string to Move String type
     */
    pureString(value: string): ReturnType<Transaction["pure"]> {
        return this.tx.pure.string(value);
    }

    /**
     * Helper to convert number to u64
     */
    pureU64(value: number | bigint): ReturnType<Transaction["pure"]> {
        return this.tx.pure.u64(value);
    }

    /**
     * Helper to convert number to u128
     */
    pureU128(value: number | bigint): ReturnType<Transaction["pure"]> {
        return this.tx.pure.u128(value);
    }

    /**
     * Helper to convert boolean
     */
    pureBool(value: boolean): ReturnType<Transaction["pure"]> {
        return this.tx.pure.bool(value);
    }

    /**
     * Helper to create address argument
     */
    pureAddress(address: string): ReturnType<Transaction["pure"]> {
        return this.tx.pure.address(address);
    }

    /**
     * Move call wrapper
     */
    moveCall(args: {
        target: string;
        arguments?: any[];
        typeArguments?: string[];
    }): ReturnType<Transaction["moveCall"]> {
        return this.tx.moveCall(args);
    }

    /**
     * Transfer objects
     */
    transferObjects(objects: any[], recipient: string): void {
        this.tx.transferObjects(objects, recipient);
    }
}

/**
 * Utility functions for transaction building
 */
const PACKAGE_ONLY_TARGETS: Record<string, Set<string>> = {
    dao_config: new Set([
        'trading_params_mut',
        'twap_config_mut',
        'metadata_config_mut',
        'conditional_coin_config_mut',
        'set_min_asset_amount',
        'set_min_stable_amount',
        'set_review_period_ms',
        'set_trading_period_ms',
        'set_conditional_amm_fee_bps',
        'set_conditional_liquidity_ratio_percent',
        'set_start_delay',
        'set_cap_ppm',
        'set_initial_observation',
        'set_threshold',
        'set_sponsored_threshold',
        'set_max_outcomes',
        'set_max_actions_per_outcome',
        'set_proposal_creation_fee',
        'set_proposal_fee_per_outcome',
        'set_proposal_intent_expiry_ms',
        'set_dao_name',
        'set_icon_url',
        'set_description',
        'set_conditional_metadata',
        'set_use_outcome_index',
        'set_sponsorship_enabled',
        'set_dao_name_string',
        'set_icon_url_string',
    ]),
    futarchy_twap_oracle: new Set(['set_oracle_start_time']),
    PCW_TWAP_oracle: new Set([]),
    deps: new Set(['set_authorization_level']),
};

function assertPublicTarget(moduleName: string, functionName: string): void {
    const packageOnly = PACKAGE_ONLY_TARGETS[moduleName];
    if (!packageOnly || !packageOnly.has(functionName)) return;

    throw new Error(
        `Cannot call ${moduleName}::${functionName} via SDK: function is package-visible on-chain.`
    );
}

export const TransactionUtils = {
    /**
     * Convert SUI amount to MIST
     * @param sui - Amount in SUI
     * @returns Amount in MIST
     */
    suiToMist(sui: number): bigint {
        return BigInt(Math.floor(sui * 1_000_000_000));
    },

    /**
     * Convert MIST to SUI
     * @param mist - Amount in MIST
     * @returns Amount in SUI
     */
    mistToSui(mist: bigint | number): number {
        return Number(mist) / 1_000_000_000;
    },

    /**
     * Build fully qualified function target
     * @param packageId - Package ID
     * @param moduleName - Module name
     * @param functionName - Function name
     */
    buildTarget(
        packageId: string,
        moduleName: string,
        functionName: string
    ): string {
        assertPublicTarget(moduleName, functionName);
        return `${packageId}::${moduleName}::${functionName}`;
    },

    /**
     * Create type parameter string
     * @param packageId - Package ID
     * @param moduleName - Module name
     * @param typeName - Type name
     */
    buildType(packageId: string, moduleName: string, typeName: string): string {
        return `${packageId}::${moduleName}::${typeName}`;
    },
};
