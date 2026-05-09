/**
 * Currency Utilities
 */

import { Transaction } from '@mysten/sui/transactions';
import { SuiClient } from '@mysten/sui/client';

export interface CurrencyUtilsConfig {
  client: SuiClient;
  accountActionsPackageId: string;
  packageRegistryId: string;
}

/**
 * Currency utility functions
 */
export class CurrencyUtils {
  private client: SuiClient;
  private accountActionsPackageId: string;
  private packageRegistryId: string;

  constructor(config: CurrencyUtilsConfig) {
    this.client = config.client;
    this.accountActionsPackageId = config.accountActionsPackageId;
    this.packageRegistryId = config.packageRegistryId;
  }

  /**
   * Get decimals for a coin type
   */
  async getDecimals(coinType: string): Promise<number> {
    const metadata = await this.getMetadata(coinType);
    return metadata?.decimals ?? 9;
  }

  /**
   * Get metadata for a coin type
   */
  async getMetadata(coinType: string): Promise<any> {
    try {
      const result = await this.client.getCoinMetadata({ coinType });
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Get total supply for a coin type
   */
  async getTotalSupply(coinType: string): Promise<bigint> {
    try {
      const result = await this.client.getTotalSupply({ coinType });
      return BigInt(result.value);
    } catch {
      return 0n;
    }
  }

  /**
   * Burn coins (requires appropriate permissions)
   */
  burn(config: {
    daoId: string;
    coinId: string;
    coinType: string;
  }): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.accountActionsPackageId}::currency::public_burn`,
      typeArguments: [config.coinType],
      arguments: [
        tx.object(config.daoId),
        tx.object(this.packageRegistryId),
        tx.object(config.coinId),
      ],
    });

    return tx;
  }

  /**
   * Format an amount with decimals
   */
  formatAmount(amount: bigint, decimals: number): string {
    const str = amount.toString().padStart(decimals + 1, '0');
    const intPart = str.slice(0, -decimals) || '0';
    const decPart = str.slice(-decimals);
    return `${intPart}.${decPart}`;
  }

  /**
   * Parse a string amount to bigint
   */
  parseAmount(amountStr: string, decimals: number): bigint {
    const [intPart, decPart = ''] = amountStr.split('.');
    const paddedDec = decPart.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(intPart + paddedDec);
  }
}
