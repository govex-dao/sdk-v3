import assert from "node:assert/strict";
import test from "node:test";
import { bcs } from "@mysten/sui/bcs";
import {
  indexedActionToExecutionConfig,
  LaunchpadWorkflow,
} from "../dist/esm/workflows/index.js";

const PACKAGE_ID =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ACCOUNT_ACTIONS =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const FUTARCHY_FACTORY =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const OBJECT_ID =
  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const OTHER_OBJECT_ID =
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const ASSET_TYPE = `${PACKAGE_ID}::asset::ASSET`;
const STABLE_TYPE = `${PACKAGE_ID}::stable::STABLE`;

function indexedAction(overrides) {
  return {
    index: 0,
    type: "",
    fullType: "",
    params: [],
    ...overrides,
  };
}

function idParam(name, value = OBJECT_ID) {
  return { type: "ID", name, value };
}

function stringParam(name, value) {
  return { type: "String", name, value };
}

function workflow() {
  return new LaunchpadWorkflow(
    {},
    {
      accountProtocolPackageId: PACKAGE_ID,
      accountActionsPackageId: ACCOUNT_ACTIONS,
      futarchyCorePackageId: PACKAGE_ID,
      futarchyFactoryPackageId: FUTARCHY_FACTORY,
      futarchyActionsPackageId: PACKAGE_ID,
      futarchyGovernancePackageId: PACKAGE_ID,
      futarchyGovernanceActionsPackageId: PACKAGE_ID,
      futarchyOracleActionsPackageId: PACKAGE_ID,
      futarchyMarketsCorePackageId: PACKAGE_ID,
      packageRegistryId: OBJECT_ID,
      mutationRegistryId: OBJECT_ID,
      spotPoolMutationRegistryId: OBJECT_ID,
      marketStateMutationRegistryId: OBJECT_ID,
      escrowMutationRegistryId: OBJECT_ID,
    },
    {
      factoryId: OBJECT_ID,
      factorySharedVersion: 1,
      packageRegistryId: OBJECT_ID,
      packageRegistrySharedVersion: 1,
      feeManagerId: OBJECT_ID,
      feeManagerSharedVersion: 1,
    },
  );
}

function baseCreateRaiseConfig() {
  return {
    creator: OBJECT_ID,
    assetType: ASSET_TYPE,
    stableType: STABLE_TYPE,
    treasuryCap: OBJECT_ID,
    metadataCap: OBJECT_ID,
    assetCurrency: OBJECT_ID,
    stableCurrency: OBJECT_ID,
    daoName: "TEST",
    tokensForSale: 1_000n,
    minRaiseAmount: 100n,
    maxRaiseAmount: 1_000n,
    allowEarlyCompletion: true,
    durationMs: 86_400_000,
    description: "test raise",
    launchpadFee: 1n,
  };
}

function moveTargets(tx) {
  return tx
    .getData()
    .commands
    .filter((command) => command.MoveCall)
    .map((command) => {
      const call = command.MoveCall;
      return `${call.package}::${call.module}::${call.function}`;
    });
}

test("action converter preserves runtime IDs needed by auto execution", () => {
  const grantData = bcs
    .struct("CancelGrantAction", { grantId: bcs.Address })
    .serialize({ grantId: OBJECT_ID })
    .toBytes();

  assert.deepEqual(
    indexedActionToExecutionConfig(
      indexedAction({
        type: "CancelGrant",
        fullType: `${PACKAGE_ID}::oracle_actions::CancelGrant<${ASSET_TYPE}, ${STABLE_TYPE}>`,
        actionData: grantData,
      }),
    ),
    {
      action: "cancel_oracle_grant",
      grantId: OBJECT_ID,
      assetType: ASSET_TYPE,
      stableType: STABLE_TYPE,
    },
  );

  assert.equal(
    indexedActionToExecutionConfig(
      indexedAction({
        type: "CancelProtectiveBid",
        fullType: `${PACKAGE_ID}::protective_bid_actions::CancelProtectiveBid<${ASSET_TYPE}, ${STABLE_TYPE}>`,
        params: [idParam("bid_id")],
      }),
    ).bidId,
    OBJECT_ID,
  );

  assert.equal(
    indexedActionToExecutionConfig(
      indexedAction({
        type: "CancelProtectiveAsk",
        fullType: `${PACKAGE_ID}::protective_ask_actions::CancelProtectiveAsk<${ASSET_TYPE}, ${STABLE_TYPE}>`,
        params: [idParam("ask_id")],
      }),
    ).askId,
    OBJECT_ID,
  );

  assert.equal(
    indexedActionToExecutionConfig(
      indexedAction({
        type: "CancelVesting",
        fullType: `${PACKAGE_ID}::vesting::CancelVesting<${STABLE_TYPE}>`,
        params: [idParam("vesting_id"), stringParam("resource_name", "refund")],
      }),
    ).vestingId,
    OBJECT_ID,
  );
});

test("action converter carries object-resource params for staged provide/lock actions", () => {
  const provideObject = indexedActionToExecutionConfig(
    indexedAction({
      type: "ProvideObjectToResources",
      fullType: `${PACKAGE_ID}::owned::ProvideObjectToResources<0x2::coin::TreasuryCap<${ASSET_TYPE}>>`,
      params: [idParam("object_id"), stringParam("resource_name", "treasury_cap")],
    }),
  );
  assert.equal(provideObject.objectId, OBJECT_ID);
  assert.equal(provideObject.resourceName, "treasury_cap");

  const lockUpgradeCap = indexedActionToExecutionConfig(
    indexedAction({
      type: "LockUpgradeCap",
      fullType: `${PACKAGE_ID}::package_upgrade::LockUpgradeCap`,
      params: [
        stringParam("name", "pkg"),
        { type: "u64", name: "delay_ms", value: "1000" },
        stringParam("resource_name", "upgrade_cap"),
        idParam("expected_cap_id", OTHER_OBJECT_ID),
      ],
    }),
  );
  assert.equal(lockUpgradeCap.expectedCapId, OTHER_OBJECT_ID);
  assert.equal(lockUpgradeCap.externalArg, OTHER_OBJECT_ID);

  const lockTreasuryCapData = bcs
    .struct("LockTreasuryCapAction", {
      has_max_supply: bcs.bool(),
      max_supply: bcs.u64(),
      can_mint: bcs.bool(),
      can_burn: bcs.bool(),
      can_update_name: bcs.bool(),
      can_update_description: bcs.bool(),
      can_update_icon: bcs.bool(),
      resource_name: bcs.string(),
    })
    .serialize({
      has_max_supply: false,
      max_supply: 0n,
      can_mint: true,
      can_burn: true,
      can_update_name: true,
      can_update_description: true,
      can_update_icon: true,
      resource_name: "treasury_cap",
    })
    .toBytes();

  const lockTreasuryCap = indexedActionToExecutionConfig(
    indexedAction({
      type: "LockTreasuryCap",
      fullType: `${PACKAGE_ID}::currency::LockTreasuryCap<${ASSET_TYPE}>`,
      actionData: lockTreasuryCapData,
    }),
  );
  assert.equal(lockTreasuryCap.resourceName, "treasury_cap");
  assert.equal(lockTreasuryCap.canMint, true);
  assert.equal(lockTreasuryCap.externalArg, undefined);
});

test("launchpad reservations target the existing launchpad module", () => {
  const createTx = workflow().createRaise({
    ...baseCreateRaiseConfig(),
    reservations: [{ wallet: OTHER_OBJECT_ID, amount: 100n }],
  }).transaction;

  assert.ok(
    moveTargets(createTx).includes(`${FUTARCHY_FACTORY}::launchpad::add_reservation`),
  );

  const acceptTx = workflow().acceptReservation({
    raiseId: OBJECT_ID,
    assetType: ASSET_TYPE,
    stableType: STABLE_TYPE,
    stableAmount: 100n,
    protocolFee: 1n,
    feeManagerId: OBJECT_ID,
    stableCoins: [OTHER_OBJECT_ID],
  }).transaction;

  assert.ok(
    moveTargets(acceptTx).includes(`${FUTARCHY_FACTORY}::launchpad::accept_reservation`),
  );
});

test("unsupported launchpad auction channels fail before building invalid Move targets", () => {
  assert.throws(
    () =>
      workflow().createRaise({
        ...baseCreateRaiseConfig(),
        bondingCurve: {
          tokenBudget: 100n,
          startPrice: 1n,
          endPrice: 2n,
        },
      }),
    /Bonding curve launchpad channel is not supported/,
  );

  assert.throws(
    () => workflow().submitCCABid({}),
    /Continuous clearing auction launchpad channel is not supported/,
  );
});
