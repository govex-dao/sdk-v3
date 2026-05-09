/**
 * FutarchySDK - Main entry point for the Futarchy Protocol SDK
 *
 * @example
 * ```typescript
 * import { FutarchySDK } from 'govex-sdk-v3';
 *
 * // Using bundled deployments (recommended for supported networks)
 * const sdk = new FutarchySDK({ network: 'devnet' });
 *
 * // Using custom deployments
 * const sdk = new FutarchySDK({ network: 'devnet', deployments: customDeployments });
 *
 * // DAO operations
 * const info = await sdk.dao.getInfo(daoId);
 * const tx = sdk.dao.vault.depositApproved({...});
 *
 * // Launchpad operations
 * const tx = sdk.launchpad.createRaise({...});
 *
 * // Proposal operations
 * const tx = sdk.proposal.createProposal({...});
 * const tx = sdk.proposal.spotSwap({...});
 *
 * // Workflows (low-level access)
 * const tx = sdk.workflows.launchpad.createRaiseWithActions({...});
 * const tx = sdk.workflows.proposal.advanceToTrading({...});
 *
 * // Market operations
 * const quote = await sdk.market.getQuote({...});
 * ```
 */

import { SuiClient } from '@mysten/sui/client';
import { NetworkType, createNetworkConfig, NetworkConfig, DeploymentManager, getBundledDeployments } from './config';
import type { DeploymentConfig } from './types/deployment';
import type { Packages, SharedObjects } from './types';

import {
  DAOService,
  MarketService,
  LaunchpadService,
  ProposalService,
  AdminService,
  IntentService,
  MultisigService,
  QueryHelper,
  BaseTransactionBuilder,
  CurrencyUtils,
} from './services';

import { LaunchpadWorkflow, LaunchpadWorkflowPackages, LaunchpadWorkflowSharedObjects } from './workflows/launchpad-workflow';
import { ProposalWorkflow, ProposalWorkflowPackages, ProposalWorkflowSharedObjects } from './workflows/proposal-workflow';
import { AutoExecutor } from './workflows/auto-executor';

export class FutarchySDK {
  // ========================================================================
  // SERVICES
  // ========================================================================

  /** DAO operations (vault, oracle, managed objects) */
  public dao: DAOService;

  /** Launchpad operations (create, buy/bid, complete raises) */
  public launchpad: LaunchpadService;

  /** Proposal operations (create, trade, finalize) */
  public proposal: ProposalService;

  /** Market operations (swaps, liquidity) */
  public market: MarketService;

  /** Admin operations (factory, verification, fees) */
  public admin: AdminService;

  /** Multisig operations (optional, requires accountMultisig package) */
  public multisig?: MultisigService;

  /** Intent operations (internal use) */
  public intents: IntentService;

  /** Utility helpers */
  public utils: {
    transactionBuilder: BaseTransactionBuilder;
    queryHelper: QueryHelper;
    currency: CurrencyUtils;
  };

  /**
   * Direct workflow access for advanced use cases
   * Services wrap these internally, but tests may need direct access
   */
  public workflows: {
    launchpad: LaunchpadWorkflow;
    proposal: ProposalWorkflow;
  };

  // ========================================================================
  // INFRASTRUCTURE
  // ========================================================================

  public client: SuiClient;
  public network: NetworkConfig;
  public deployments: DeploymentManager;
  public packages: Packages;
  public sharedObjects: SharedObjects;

  constructor(config: {
    network: NetworkType | string;
    rpcUrl?: string;
    deployments?: DeploymentConfig;
  }) {
    // Setup network and client
    const networkConfig = createNetworkConfig(config.network, config.rpcUrl);

    // Resolve deployments: use provided or fall back to bundled
    const deploymentsConfig = config.deployments ?? getBundledDeployments(config.network);

    if (!deploymentsConfig) {
      throw new Error(
        `No deployments available for network "${config.network}". ` +
        `Either provide deployments in the config, or use a network with bundled deployments (devnet, testnet, mainnet).`
      );
    }

    const deploymentManager = DeploymentManager.fromConfig(deploymentsConfig);

    this.client = networkConfig.client;
    this.network = networkConfig;
    this.deployments = deploymentManager;

    // Get required shared objects
    const factoryObject = deploymentManager.getFactory();
    const packageRegistry = deploymentManager.getPackageRegistry();
    const marketsCoreDeployment = deploymentManager.getPackage('futarchy_markets_core');
    const feeManager = marketsCoreDeployment?.sharedObjects.find(
      (obj) => obj.name === 'FeeManager'
    );
    const futarchyCoreDeployment = deploymentManager.getPackage('futarchy_core');
    const sponsorshipRegistry = futarchyCoreDeployment?.sharedObjects.find(
      (obj) => obj.name === 'SponsorshipRegistry'
    );
    const mutationRegistry = futarchyCoreDeployment?.sharedObjects.find(
      (obj) => obj.name === 'ProposalMutationRegistry'
    );
    const spotPoolMutationRegistry = marketsCoreDeployment?.sharedObjects.find(
      (obj) => obj.name === 'SpotPoolMutationRegistry'
    );
    const marketStateMutationRegistry = futarchyCoreDeployment?.sharedObjects.find(
      (obj) => obj.name === 'MarketStateMutationRegistry'
    );
    const escrowMutationRegistry = futarchyCoreDeployment?.sharedObjects.find(
      (obj) => obj.name === 'EscrowMutationRegistry'
    );

    if (!factoryObject || !packageRegistry || !feeManager || !sponsorshipRegistry || !mutationRegistry || !spotPoolMutationRegistry || !marketStateMutationRegistry || !escrowMutationRegistry) {
      throw new Error(
        'Missing required deployment objects. Ensure Factory, PackageRegistry, FeeManager, SponsorshipRegistry, ProposalMutationRegistry, SpotPoolMutationRegistry, MarketStateMutationRegistry, and EscrowMutationRegistry are deployed.'
      );
    }

    // Build Packages object with validation
    const requiredPackages: [string, string][] = [
      ['AccountProtocol', 'accountProtocol'],
      ['AccountActions', 'accountActions'],
      ['futarchy_core', 'futarchyCore'],
      ['futarchy_factory', 'futarchyFactory'],
      ['futarchy_actions', 'futarchyActions'],
      ['futarchy_governance', 'futarchyGovernance'],
      ['futarchy_governance_actions', 'futarchyGovernanceActions'],
      ['futarchy_oracle', 'futarchyOracleActions'],
      ['futarchy_markets_core', 'futarchyMarketsCore'],
      ['futarchy_markets_primitives', 'futarchyMarketsPrimitives'],
      ['futarchy_markets_operations', 'futarchyMarketsOperations'],
      ['futarchy_proposal', 'futarchyProposal'],
    ];

    const missingPackages: string[] = [];
    const resolvedIds: Record<string, string> = {};

    for (const [deploymentName] of requiredPackages) {
      const packageId = deploymentManager.getPackageId(deploymentName);
      if (!packageId) {
        missingPackages.push(deploymentName);
      } else {
        resolvedIds[deploymentName] = packageId;
      }
    }

    if (missingPackages.length > 0) {
      throw new Error(
        `Missing required package deployments: ${missingPackages.join(', ')}. ` +
        `Ensure all packages are deployed and included in the deployment config.`
      );
    }

    this.packages = {
      accountProtocol: resolvedIds['AccountProtocol'],
      accountActions: resolvedIds['AccountActions'],
      futarchyCore: resolvedIds['futarchy_core'],
      futarchyFactory: resolvedIds['futarchy_factory'],
      futarchyActions: resolvedIds['futarchy_actions'],
      futarchyGovernance: resolvedIds['futarchy_governance'],
      futarchyGovernanceActions: resolvedIds['futarchy_governance_actions'],
      futarchyOracleActions: resolvedIds['futarchy_oracle'],
      futarchyMarketsCore: resolvedIds['futarchy_markets_core'],
      futarchyMarketsPrimitives: resolvedIds['futarchy_markets_primitives'],
      futarchyMarketsOperations: resolvedIds['futarchy_markets_operations'],
      futarchyProposal: resolvedIds['futarchy_proposal'],
      oneShotUtils: deploymentManager.getPackageId('futarchy_one_shot_utils'),
      accountMultisig: deploymentManager.getPackageId('AccountMultisig'),
    };

    // Build SharedObjects
    this.sharedObjects = {
      factory: {
        id: factoryObject.objectId,
        version: factoryObject.initialSharedVersion,
      },
      feeManager: {
        id: feeManager.objectId,
        version: feeManager.initialSharedVersion,
      },
      packageRegistry: {
        id: packageRegistry.objectId,
        version: packageRegistry.initialSharedVersion,
      },
      sponsorshipRegistry: {
        id: sponsorshipRegistry.objectId,
        version: sponsorshipRegistry.initialSharedVersion,
      },
      mutationRegistry: {
        id: mutationRegistry.objectId,
        version: mutationRegistry.initialSharedVersion,
      },
      spotPoolMutationRegistry: {
        id: spotPoolMutationRegistry.objectId,
        version: spotPoolMutationRegistry.initialSharedVersion,
      },
      marketStateMutationRegistry: {
        id: marketStateMutationRegistry.objectId,
        version: marketStateMutationRegistry.initialSharedVersion,
      },
      escrowMutationRegistry: {
        id: escrowMutationRegistry.objectId,
        version: escrowMutationRegistry.initialSharedVersion,
      },
    };

    // Optionally resolve AccountMultisig shared objects
    const accountMultisigDeployment = deploymentManager.getPackage('AccountMultisig');
    const multisigFeeVault = accountMultisigDeployment?.sharedObjects.find(
      (obj) => obj.name === 'FeeVault' || obj.name === 'MultisigFeeVault'
    );
    if (multisigFeeVault) {
      this.sharedObjects.multisigFeeVault = {
        id: multisigFeeVault.objectId,
        version: multisigFeeVault.initialSharedVersion,
      };
    }

    // Initialize services
    const params = {
      client: this.client,
      packages: this.packages,
      sharedObjects: this.sharedObjects,
    };

    this.admin = new AdminService(params);
    this.dao = new DAOService(params);
    this.market = new MarketService(params);
    this.launchpad = new LaunchpadService(params);
    this.proposal = new ProposalService(params);
    this.intents = new IntentService(params);

    // Initialize optional MultisigService if package is available
    if (this.packages.accountMultisig) {
      this.multisig = new MultisigService(params);
    }

    this.utils = {
      transactionBuilder: new BaseTransactionBuilder(this.client),
      queryHelper: new QueryHelper(this.client),
      currency: new CurrencyUtils({
        client: this.client,
        accountActionsPackageId: this.packages.accountActions,
        packageRegistryId: this.sharedObjects.packageRegistry.id,
      }),
    };

    // Initialize workflows for direct access
    const launchpadWorkflowPackages: LaunchpadWorkflowPackages = {
      accountProtocolPackageId: this.packages.accountProtocol,
      accountActionsPackageId: this.packages.accountActions,
      futarchyCorePackageId: this.packages.futarchyCore,
      futarchyFactoryPackageId: this.packages.futarchyFactory,
      futarchyActionsPackageId: this.packages.futarchyActions,
      futarchyGovernancePackageId: this.packages.futarchyGovernance,
      futarchyGovernanceActionsPackageId: this.packages.futarchyGovernanceActions,
      futarchyOracleActionsPackageId: this.packages.futarchyOracleActions,
      futarchyMarketsCorePackageId: this.packages.futarchyMarketsCore,
      packageRegistryId: this.sharedObjects.packageRegistry.id,
      mutationRegistryId: this.sharedObjects.mutationRegistry.id,
      spotPoolMutationRegistryId: this.sharedObjects.spotPoolMutationRegistry.id,
      marketStateMutationRegistryId: this.sharedObjects.marketStateMutationRegistry.id,
      escrowMutationRegistryId: this.sharedObjects.escrowMutationRegistry.id,
      oneShotUtilsPackageId: this.packages.oneShotUtils,
    };

    const launchpadWorkflowSharedObjects: LaunchpadWorkflowSharedObjects = {
      factoryId: this.sharedObjects.factory.id,
      factorySharedVersion: this.sharedObjects.factory.version,
      packageRegistryId: this.sharedObjects.packageRegistry.id,
      packageRegistrySharedVersion: this.sharedObjects.packageRegistry.version,
      feeManagerId: this.sharedObjects.feeManager.id,
      feeManagerSharedVersion: this.sharedObjects.feeManager.version,
    };

    const proposalWorkflowPackages: ProposalWorkflowPackages = {
      accountProtocolPackageId: this.packages.accountProtocol,
      accountActionsPackageId: this.packages.accountActions,
      futarchyCorePackageId: this.packages.futarchyCore,
      futarchyFactoryPackageId: this.packages.futarchyFactory,
      futarchyActionsPackageId: this.packages.futarchyActions,
      futarchyGovernancePackageId: this.packages.futarchyGovernance,
      futarchyGovernanceActionsPackageId: this.packages.futarchyGovernanceActions,
      futarchyOracleActionsPackageId: this.packages.futarchyOracleActions,
      futarchyMarketsCorePackageId: this.packages.futarchyMarketsCore,
      futarchyMarketsPrimitivesPackageId: this.packages.futarchyMarketsPrimitives,
      futarchyMarketsOperationsPackageId: this.packages.futarchyMarketsOperations,
      futarchyProposalPackageId: this.packages.futarchyProposal,
      packageRegistryId: this.sharedObjects.packageRegistry.id,
      mutationRegistryId: this.sharedObjects.mutationRegistry.id,
      spotPoolMutationRegistryId: this.sharedObjects.spotPoolMutationRegistry.id,
      marketStateMutationRegistryId: this.sharedObjects.marketStateMutationRegistry.id,
      escrowMutationRegistryId: this.sharedObjects.escrowMutationRegistry.id,
      oneShotUtilsPackageId: this.packages.oneShotUtils,
    };

    const proposalWorkflowSharedObjects: ProposalWorkflowSharedObjects = {
      packageRegistryId: this.sharedObjects.packageRegistry.id,
      packageRegistrySharedVersion: this.sharedObjects.packageRegistry.version,
      sponsorshipRegistryId: this.sharedObjects.sponsorshipRegistry.id,
      sponsorshipRegistrySharedVersion: this.sharedObjects.sponsorshipRegistry.version,
      mutationRegistryId: this.sharedObjects.mutationRegistry.id,
      mutationRegistrySharedVersion: this.sharedObjects.mutationRegistry.version,
      spotPoolMutationRegistryId: this.sharedObjects.spotPoolMutationRegistry.id,
      spotPoolMutationRegistrySharedVersion: this.sharedObjects.spotPoolMutationRegistry.version,
      marketStateMutationRegistryId: this.sharedObjects.marketStateMutationRegistry.id,
      marketStateMutationRegistrySharedVersion: this.sharedObjects.marketStateMutationRegistry.version,
      escrowMutationRegistryId: this.sharedObjects.escrowMutationRegistry.id,
      escrowMutationRegistrySharedVersion: this.sharedObjects.escrowMutationRegistry.version,
    };

    this.workflows = {
      launchpad: new LaunchpadWorkflow(this.client, launchpadWorkflowPackages, launchpadWorkflowSharedObjects),
      proposal: new ProposalWorkflow(this.client, proposalWorkflowPackages, proposalWorkflowSharedObjects),
    };
  }

  // ========================================================================
  // TOP-LEVEL QUERIES
  // ========================================================================

  async getRaises(): Promise<any[]> {
    return this.launchpad.getAll();
  }

  async getDaos(): Promise<any[]> {
    const factoryPackageId = this.deployments.getPackageId('futarchy_factory')!;
    return this.dao.getAll(factoryPackageId);
  }

  async getProposals(): Promise<any[]> {
    return this.proposal.getAll();
  }

  // ========================================================================
  // HELPERS
  // ========================================================================

  getPackageId(packageName: string): string | undefined {
    return this.deployments.getPackageId(packageName);
  }

  getAllPackageIds(): Record<string, string> {
    return this.deployments.getAllPackageIds();
  }

  /**
   * Create an AutoExecutor instance for executing actions via backend API
   *
   * @example
   * ```typescript
   * const autoExecutor = sdk.createAutoExecutor('http://localhost:9090');
   *
   * // Execute launchpad init actions
   * const { transaction } = await autoExecutor.executeLaunchpad(raiseId, { accountId });
   *
   * // Execute proposal winning outcome actions
   * const { transaction } = await autoExecutor.executeProposal(proposalId, { accountId });
   * ```
   *
   * @param backendUrl - The backend API base URL (e.g., 'http://localhost:9090')
   * @returns AutoExecutor instance configured with SDK packages
   */
  createAutoExecutor(backendUrl: string): AutoExecutor {
    return new AutoExecutor(this.client, {
      backendUrl,
      packages: {
        accountProtocolPackageId: this.packages.accountProtocol,
        accountActionsPackageId: this.packages.accountActions,
        futarchyCorePackageId: this.packages.futarchyCore,
        futarchyActionsPackageId: this.packages.futarchyActions,
        futarchyFactoryPackageId: this.packages.futarchyFactory,
        futarchyGovernancePackageId: this.packages.futarchyGovernance,
        futarchyGovernanceActionsPackageId: this.packages.futarchyGovernanceActions,
        futarchyOracleActionsPackageId: this.packages.futarchyOracleActions,
        futarchyMarketsCorePackageId: this.packages.futarchyMarketsCore,
        packageRegistryId: this.sharedObjects.packageRegistry.id,
        mutationRegistryId: this.sharedObjects.mutationRegistry.id,
        spotPoolMutationRegistryId: this.sharedObjects.spotPoolMutationRegistry.id,
        marketStateMutationRegistryId: this.sharedObjects.marketStateMutationRegistry.id,
        escrowMutationRegistryId: this.sharedObjects.escrowMutationRegistry.id,
      },
    });
  }
}
