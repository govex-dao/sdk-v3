import { getFullnodeUrl, SuiClient, SuiHTTPTransport } from "@mysten/sui/client";

export type NetworkType = "mainnet" | "testnet" | "devnet" | "localnet";

export interface NetworkConfig {
    network: NetworkType | "custom";
    url: string;
    client: SuiClient;
}

/**
 * Wraps fetch with retry + exponential backoff for 429 (rate limit) errors.
 */
function createRetryFetch(maxRetries = 5, baseDelayMs = 500): typeof globalThis.fetch {
    return async (input: any, init?: any): Promise<Response> => {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const response = await fetch(input, init);
            if (response.status === 429 && attempt < maxRetries) {
                const retryAfter = response.headers.get("retry-after");
                const delay = retryAfter
                    ? parseInt(retryAfter, 10) * 1000
                    : baseDelayMs * Math.pow(2, attempt);
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }
            return response;
        }
        // Shouldn't reach here, but TypeScript needs it
        return fetch(input, init);
    };
}

/**
 * Creates a SuiClient for the specified network
 *
 * @param network - Network type (mainnet/testnet/devnet/localnet)
 * @param rpcUrl - Optional explicit RPC URL (overrides network-based URL)
 * @returns NetworkConfig with client, network type, and URL
 *
 * @example
 * // Using network name with default public fullnode
 * createNetworkConfig("mainnet")
 *
 * @example
 * // Using explicit RPC URL (recommended for production)
 * createNetworkConfig("mainnet", "https://your-endpoint.sui-mainnet.quiknode.pro")
 *
 */
export function createNetworkConfig(
    network: NetworkType | string,
    rpcUrl?: string
): NetworkConfig {
    // Map aliased networks to their base network
    const networkAliases: Record<string, NetworkType> = {
        testnet_2: "testnet",
    };
    const baseNetwork = networkAliases[network] || network;
    const isStandardNetwork =
        baseNetwork === "mainnet" ||
        baseNetwork === "testnet" ||
        baseNetwork === "devnet" ||
        baseNetwork === "localnet";

    // Priority: explicit rpcUrl > env SUI_RPC_URL > network URL > public fullnode
    let url: string;
    if (rpcUrl) {
        url = rpcUrl;
    } else if (process.env.SUI_RPC_URL) {
        url = process.env.SUI_RPC_URL;
    } else if (isStandardNetwork) {
        url = getFullnodeUrl(baseNetwork as NetworkType);
    } else {
        throw new Error(
            `Unsupported network "${network}". ` +
            `Use one of mainnet/testnet/devnet/localnet, or pass a custom endpoint via rpcUrl.`
        );
    }

    const transport = new SuiHTTPTransport({ url, fetch: createRetryFetch() });
    const client = new SuiClient({ transport });

    return {
        network: isStandardNetwork ? (baseNetwork as NetworkType) : "custom",
        url,
        client,
    };
}
