import { SuiClient } from "@mysten/sui/client";
import { extractFields, extractTypeNameString, extractVecSetContents, FactoryFields } from "../types";

function allowedTypeStrings(value: unknown): string[] {
    return extractVecSetContents(value)
        .map(extractTypeNameString)
        .filter((type): type is string => typeof type === "string");
}

/**
 * Factory operations for creating DAOs
 */
export class FactoryOperations {
    private client: SuiClient;
    private factoryObjectId: string;

    constructor(
        client: SuiClient,
        factoryObjectId: string
    ) {
        this.client = client;
        this.factoryObjectId = factoryObjectId;
    }

    /**
     * View: Get total DAO count
     */
    async getDaoCount(): Promise<number> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        const fields = extractFields<FactoryFields>(factory);
        if (!fields) {
            throw new Error('Factory not found');
        }

        return Number(fields.dao_count || 0);
    }

    /**
     * View: Check if factory is paused
     */
    async isPaused(): Promise<boolean> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        const fields = extractFields<FactoryFields>(factory);
        if (!fields) {
            throw new Error('Factory not found');
        }

        return fields.paused === true;
    }

    /**
     * View: Check if a stable type is allowed
     */
    async isStableTypeAllowed(stableType: string): Promise<boolean> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        const fields = extractFields<FactoryFields>(factory);
        if (!fields) {
            throw new Error('Factory not found');
        }

        const allowedTypes = allowedTypeStrings(fields.allowed_stable_types);
        return allowedTypes.includes(stableType);
    }

    /**
     * View: Check if a legacy asset type is explicitly allowed.
     */
    async isLegacyAssetTypeAllowed(assetType: string): Promise<boolean> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        const fields = extractFields<FactoryFields>(factory);
        if (!fields) {
            throw new Error('Factory not found');
        }

        const allowedTypes = allowedTypeStrings(fields.allowed_legacy_asset_types);
        return allowedTypes.includes(assetType);
    }

    /**
     * View: Get launchpad bid fee
     */
    async getLaunchpadBidFee(): Promise<bigint> {
        const factory = await this.client.getObject({
            id: this.factoryObjectId,
            options: { showContent: true },
        });

        const fields = extractFields<FactoryFields>(factory);
        if (!fields) {
            throw new Error('Factory not found');
        }

        return BigInt(fields.launchpad_bid_fee || 0);
    }

}
