/**
 * FeeManager Operations
 *
 * Professional SDK interface for managing protocol fees in the Govex futarchy system.
 * Handles fee configuration, collection, and withdrawal for various coin types.
 *
 * @module FeeManagerOperations
 * @package futarchy_markets_core
 */

import { Transaction } from '@mysten/sui/transactions';
import type { SuiClient } from '@mysten/sui/client';
import { TransactionUtils } from './transaction';
import { extractFields, FeeManagerFields } from '../types';

/**
 * Fee withdrawal parameters
 */
export interface WithdrawFeesParams {
    /** Type of coin to withdraw */
    coinType: string;
    /** Amount to withdraw (in coin's base units). Use 0n to withdraw all. */
    amount: bigint;
    /** Optional recipient address (defaults to sender) */
    recipient?: string;
}

/**
 * FeeManager operations for managing protocol fees
 *
 * This class provides a professional interface for all fee-related operations including:
 * - Updating fee amounts (with 6-month delay and 10x cap safety)
 * - Withdrawing collected fees
 * - Querying fee configurations
 */
export class FeeManagerOperations {
    constructor(
        private readonly client: SuiClient,
        private readonly feeManagerId: string,
        private readonly marketsCorePkgId: string,
    ) {}

    /**
     * Update DAO creation fee (with 6-month delay and 10x cap)
     *
     * Fee updates are subject to safety constraints:
     * - 6-month delay before taking effect
     * - Maximum 10x increase from baseline
     * - Baseline resets every 6 months
     *
     * @param newFee - New DAO creation fee
     * @param adminCapId - FeeAdminCap object ID
     * @param clock - Clock object (defaults to "0x6")
     * @returns Transaction for updating fee
     *
     * @example
     * ```typescript
     * const tx = sdk.feeManager.updateDaoCreationFee(
     *   200_000_000n, // 0.2 SUI
     *   adminCapId
     * );
     * ```
     */
    updateDaoCreationFee(
        newFee: bigint,
        adminCapId: string,
        clock: string = '0x6',
    ): Transaction {
        const tx = new Transaction();

        tx.moveCall({
            target: TransactionUtils.buildTarget(
                this.marketsCorePkgId,
                'fee',
                'update_dao_creation_fee',
            ),
            arguments: [
                tx.object(this.feeManagerId),
                tx.object(adminCapId),
                tx.pure.u64(newFee),
                tx.object(clock),
            ],
        });

        return tx;
    }

    /**
     * Update proposal creation fee per outcome
     *
     * @param newFee - New proposal creation fee per outcome
     * @param adminCapId - FeeAdminCap object ID
     * @param clock - Clock object (defaults to "0x6")
     * @returns Transaction for updating fee
     */
    updateProposalCreationFee(
        newFee: bigint,
        adminCapId: string,
        clock: string = '0x6',
    ): Transaction {
        const tx = new Transaction();

        tx.moveCall({
            target: TransactionUtils.buildTarget(
                this.marketsCorePkgId,
                'fee',
                'update_proposal_creation_fee',
            ),
            arguments: [
                tx.object(this.feeManagerId),
                tx.object(adminCapId),
                tx.pure.u64(newFee),
                tx.object(clock),
            ],
        });

        return tx;
    }

    /**
     * Update launchpad creation fee
     *
     * @param newFee - New launchpad creation fee
     * @param adminCapId - FeeAdminCap object ID
     * @param clock - Clock object (defaults to "0x6")
     * @returns Transaction for updating fee
     */
    updateLaunchpadCreationFee(
        newFee: bigint,
        adminCapId: string,
        clock: string = '0x6',
    ): Transaction {
        const tx = new Transaction();

        tx.moveCall({
            target: TransactionUtils.buildTarget(
                this.marketsCorePkgId,
                'fee',
                'update_launchpad_creation_fee',
            ),
            arguments: [
                tx.object(this.feeManagerId),
                tx.object(adminCapId),
                tx.pure.u64(newFee),
                tx.object(clock),
            ],
        });

        return tx;
    }

    /**
     * Apply a matured pending proposal fee increase (permissionless).
     */
    applyPendingProposalFee(clock: string = '0x6'): Transaction {
        const tx = new Transaction();

        tx.moveCall({
            target: TransactionUtils.buildTarget(
                this.marketsCorePkgId,
                'fee',
                'apply_pending_proposal_fee',
            ),
            arguments: [
                tx.object(this.feeManagerId),
                tx.object(clock),
            ],
        });

        return tx;
    }

    /**
     * Query the pending global proposal fee update.
     */
    async getPendingProposalFee(): Promise<{
        pendingProposalFee: bigint | null;
        pendingProposalFeeEffectiveTs: bigint | null;
    }> {
        const feeManager = await this.client.getObject({
            id: this.feeManagerId,
            options: { showContent: true },
        });

        const fields = extractFields<FeeManagerFields>(feeManager);
        if (!fields) {
            throw new Error('FeeManager not found or invalid');
        }

        const extractOption = (
            field: { vec: string[] } | null | undefined,
        ): bigint | null => {
            if (field && field.vec && field.vec.length > 0) {
                return BigInt(field.vec[0]);
            }
            return null;
        };

        return {
            pendingProposalFee: extractOption(fields.pending_proposal_fee),
            pendingProposalFeeEffectiveTs: extractOption(
                fields.pending_proposal_fee_effective_ts,
            ),
        };
    }

    /**
     * Withdraw collected fees for a specific stable coin type
     *
     * Uses fee::withdraw_fees_as_coin<CoinType> which is the unified withdrawal
     * function for any coin type. Pass amount=0n to withdraw all available fees.
     *
     * @param params - Withdrawal parameters
     * @param adminCapId - FeeAdminCap object ID
     * @param clock - Clock object (defaults to "0x6")
     * @returns Transaction for withdrawing fees
     *
     * @example
     * ```typescript
     * const tx = sdk.feeManager.withdrawStableFees({
     *   coinType: "0x2::sui::SUI",
     *   amount: 1_000_000_000n, // 1 SUI (use 0n for all)
     *   recipient: "0xabc...",
     * }, adminCapId);
     * ```
     */
    withdrawStableFees(params: WithdrawFeesParams, adminCapId: string, clock: string = '0x6'): Transaction {
        const tx = new Transaction();

        // fee::withdraw_fees_as_coin<CoinType>
        // Signature: (fee_manager, admin_cap, amount, clock, ctx) -> Coin<CoinType>
        const [coin] = tx.moveCall({
            target: TransactionUtils.buildTarget(
                this.marketsCorePkgId,
                'fee',
                'withdraw_fees_as_coin',
            ),
            typeArguments: [params.coinType],
            arguments: [
                tx.object(this.feeManagerId),
                tx.object(adminCapId),
                tx.pure.u64(params.amount),
                tx.object(clock),
            ],
        });

        // Transfer the withdrawn coin to recipient or sender
        if (params.recipient) {
            tx.transferObjects([coin], tx.pure.address(params.recipient));
        } else {
            tx.transferObjects([coin], tx.moveCall({
                target: '0x2::tx_context::sender',
            }));
        }

        return tx;
    }

    /**
     * Withdraw collected fees for a specific asset coin type
     *
     * Uses fee::withdraw_fees_as_coin<CoinType> which is the unified withdrawal
     * function for any coin type. Pass amount=0n to withdraw all available fees.
     *
     * @param params - Withdrawal parameters
     * @param adminCapId - FeeAdminCap object ID
     * @param clock - Clock object (defaults to "0x6")
     * @returns Transaction for withdrawing asset fees
     */
    withdrawAssetFees(params: WithdrawFeesParams, adminCapId: string, clock: string = '0x6'): Transaction {
        const tx = new Transaction();

        // fee::withdraw_fees_as_coin<CoinType>
        // Signature: (fee_manager, admin_cap, amount, clock, ctx) -> Coin<CoinType>
        const [coin] = tx.moveCall({
            target: TransactionUtils.buildTarget(
                this.marketsCorePkgId,
                'fee',
                'withdraw_fees_as_coin',
            ),
            typeArguments: [params.coinType],
            arguments: [
                tx.object(this.feeManagerId),
                tx.object(adminCapId),
                tx.pure.u64(params.amount),
                tx.object(clock),
            ],
        });

        // Transfer the withdrawn coin to recipient or sender
        if (params.recipient) {
            tx.transferObjects([coin], tx.pure.address(params.recipient));
        } else {
            tx.transferObjects([coin], tx.moveCall({
                target: '0x2::tx_context::sender',
            }));
        }

        return tx;
    }

    /**
     * Query the current DAO creation fee
     *
     * @returns The DAO creation fee in SUI base units
     *
     * @example
     * ```typescript
     * const fee = await sdk.feeManager.getDaoCreationFee();
     * console.log(`DAO creation fee: ${fee / 1e9} SUI`);
     * ```
     */
    async getDaoCreationFee(): Promise<bigint> {
        const feeManager = await this.client.getObject({
            id: this.feeManagerId,
            options: { showContent: true },
        });

        const fields = extractFields<FeeManagerFields>(feeManager);
        if (!fields) {
            throw new Error('FeeManager not found or invalid');
        }

        return BigInt(fields.dao_creation_fee || 0);
    }

    /**
     * Query the current proposal creation fee per outcome
     *
     * @returns The proposal creation fee per outcome in SUI base units
     */
    async getProposalCreationFee(): Promise<bigint> {
        const feeManager = await this.client.getObject({
            id: this.feeManagerId,
            options: { showContent: true },
        });

        const fields = extractFields<FeeManagerFields>(feeManager);
        if (!fields) {
            throw new Error('FeeManager not found or invalid');
        }

        return BigInt(fields.proposal_creation_fee || 0);
    }

    /**
     * Query the current launchpad creation fee
     *
     * @returns The launchpad creation fee in SUI base units
     */
    async getLaunchpadCreationFee(): Promise<bigint> {
        const feeManager = await this.client.getObject({
            id: this.feeManagerId,
            options: { showContent: true },
        });

        const fields = extractFields<FeeManagerFields>(feeManager);
        if (!fields) {
            throw new Error('FeeManager not found or invalid');
        }

        return BigInt(fields.launchpad_creation_fee || 0);
    }

    /**
     * Query the current SUI balance in the FeeManager
     *
     * @returns The SUI balance in base units
     */
    async getSuiBalance(): Promise<bigint> {
        const feeManager = await this.client.getObject({
            id: this.feeManagerId,
            options: { showContent: true },
        });

        const fields = extractFields<FeeManagerFields>(feeManager);
        if (!fields) {
            throw new Error('FeeManager not found or invalid');
        }

        return BigInt(fields.sui_balance || 0);
    }
}
