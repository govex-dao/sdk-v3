import { ActionConfig } from './types';

function consumeResource(resources: Map<string, number>, resourceName: string): boolean {
  const available = resources.get(resourceName) ?? 0;
  if (available <= 0) return false;
  if (available === 1) {
    resources.delete(resourceName);
  } else {
    resources.set(resourceName, available - 1);
  }
  return true;
}

export function assertProtectiveBidActionOrdering(
  actions: readonly ActionConfig[],
  context: string
): void {
  const vaultCapResources = new Map<string, number>();
  const currencyMintCapResources = new Map<string, number>();

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];

    switch (action.type) {
      case 'mint_vault_admin_cap':
        vaultCapResources.set(
          action.resourceName,
          (vaultCapResources.get(action.resourceName) ?? 0) + 1
        );
        break;

      case 'mint_currency_admin_cap':
        currencyMintCapResources.set(
          action.resourceName,
          (currencyMintCapResources.get(action.resourceName) ?? 0) + 1
        );
        break;

      case 'create_protective_bid':
        if (!consumeResource(vaultCapResources, action.vaultCapResourceName)) {
          throw new Error(
            `create_protective_bid at index ${i} in ${context} requires a prior mint_vault_admin_cap action for resource "${action.vaultCapResourceName}"`
          );
        }
        break;

      case 'create_protective_ask':
        if (!consumeResource(currencyMintCapResources, action.mintCapResourceName)) {
          throw new Error(
            `create_protective_ask at index ${i} in ${context} requires a prior mint_currency_admin_cap action for resource "${action.mintCapResourceName}"`
          );
        }
        break;

      case 'create_pool_with_mint':
        {
          if (!consumeResource(currencyMintCapResources, action.mintCapResourceName)) {
            throw new Error(
              `create_pool_with_mint at index ${i} in ${context} requires a prior mint_currency_admin_cap action for resource "${action.mintCapResourceName}"`
            );
          }
        }
        break;

      case 'create_oracle_grant':
        if (!consumeResource(currencyMintCapResources, action.mintCapResourceName)) {
          throw new Error(
            `create_oracle_grant at index ${i} in ${context} requires a prior mint_currency_admin_cap action for resource "${action.mintCapResourceName}"`
          );
        }
        break;

      case 'transfer':
      case 'transfer_to_sender':
        consumeResource(vaultCapResources, action.resourceName);
        consumeResource(currencyMintCapResources, action.resourceName);
        break;
    }
  }
}
