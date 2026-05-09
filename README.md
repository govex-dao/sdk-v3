# Govex V3 SDK

TypeScript SDK for the Govex v3 packages on Sui:

- [decision-markets-v3](https://github.com/govex-dao/decision-markets-v3)
- [multisig-v3](https://github.com/govex-dao/multisig-v3)
- [smart-account-v3](https://github.com/govex-dao/smart-account-v3)

## Install

```bash
npm install govex-sdk-v3 @mysten/sui
```

## Use

```ts
import { FutarchySDK } from 'govex-sdk-v3';

const sdk = new FutarchySDK({
  network: 'mainnet',
  rpcUrl: 'https://fullnode.mainnet.sui.io:443',
});

const dao = await sdk.dao.getInfo(daoId);
```

## Mainnet V3 Packages

The SDK bundles mainnet deployment data in `deployments-processed/_all-packages-mainnet.json`.

| Package | Package ID |
| --- | --- |
| `AccountActions` | `0xaa682664f419d51af5071ed0449dffbcf3a417fd12961d916b1a433542e9478d` |
| `AccountMultisig` | `0x8cc6258e6eb3fa2449316065b4142a557bf6436d0e9c2ec7bc0b1bf46f78a6b1` |
| `AccountProtocol` | `0x0f6ef484a0867ccffe219fa1f4648e58f8c3fd04a4ddcfb318a27f9cc6d2f3d9` |
| `futarchy_actions` | `0x12cb3c69cbbfb1e8e647993dd8a83b4624a81c815ee867af8f5c5be3933e0839` |
| `futarchy_config` | `0x1949b2b186d755e410947a23969abc5b3e2f90cc428b22383a013b4e282123be` |
| `futarchy_core` | `0xd515e9008496dd209ffb71caf0e5783073385cde00083c8a1437a32093aab95c` |
| `futarchy_factory` | `0x8c8ddc258b1ac57f9b18d35a665a0ae3c890684408377b9cd62af752a3cc2adf` |
| `futarchy_governance` | `0x1c00074e80bcb82298b8cb4f743af3f9423b057bfdfaea40e085f62960021f4e` |
| `futarchy_governance_actions` | `0xfad6acc479e56aab0f45264c175f6c86696798641221188aa14cacf280d90619` |
| `futarchy_markets_core` | `0x9a470e2a272f1aa1f81f5cd2a3066f878fffd9ce9c8d22309ad62f81e5b77dd2` |
| `futarchy_markets_operations` | `0x7279de2610213cdc1da0945f41f7ef7a58abf343e88165fb443be60f066e00a2` |
| `futarchy_markets_primitives` | `0x844fcce6ab4bbfb44b09431b0f07765d671d2aee3122f578b15b2402c2033781` |
| `futarchy_one_shot_utils` | `0x8085d42c3f597247c761e0a15e56d201a6e9727f2dff5a1d794491416b5ce82f` |
| `futarchy_oracle` | `0xfabcfa08e80041d07da61540451725deddad5996952b8b6e2e295c50be3417c2` |
| `futarchy_proposal` | `0xa30cef6d80aca88816c94f508c36f9da780ef6b7c1f5f8abd212e40b95f48585` |

## License

MIT
