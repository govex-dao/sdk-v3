import assert from "node:assert/strict";
import test from "node:test";
import { Transaction } from "@mysten/sui/transactions";
import {
  isMultisigConfigChangeActionType,
  isSingleMultisigConfigChangeAction,
  MULTISIG_INTENT_STATUS,
  MULTISIG_TERMINAL_INTENT_STATUSES,
  MultisigService,
} from "../dist/esm/services/multisig/index.js";

const ACCOUNT_MULTISIG_PACKAGE =
  "0x00000000000000000000000000000000000000000000000000000000000000ab";
const CONFIG_CHANGE_ACTION_TYPE = `${ACCOUNT_MULTISIG_PACKAGE}::config::ConfigChange`;

test("multisig status constants match on-chain active statuses", () => {
  assert.deepEqual(MULTISIG_INTENT_STATUS, {
    ACTIVE: 0,
    APPROVED: 1,
    REJECTED: 2,
    EXECUTED: 4,
  });
  assert.deepEqual(MULTISIG_TERMINAL_INTENT_STATUSES, [2, 4]);
});

test("config-change action helpers match account_multisig package ids", () => {
  assert.equal(
    isMultisigConfigChangeActionType(CONFIG_CHANGE_ACTION_TYPE, "0xab"),
    true,
  );
  assert.equal(
    isMultisigConfigChangeActionType(
      "0xcd::config::ConfigChange",
      ACCOUNT_MULTISIG_PACKAGE,
    ),
    false,
  );
  assert.equal(
    isSingleMultisigConfigChangeAction(
      [CONFIG_CHANGE_ACTION_TYPE],
      ACCOUNT_MULTISIG_PACKAGE,
    ),
    true,
  );
  assert.equal(
    isSingleMultisigConfigChangeAction(
      [CONFIG_CHANGE_ACTION_TYPE, `${ACCOUNT_MULTISIG_PACKAGE}::memo::Memo`],
      ACCOUNT_MULTISIG_PACKAGE,
    ),
    false,
  );
});

test("evaluateIntent wraps account_multisig::multisig::evaluate_intent", () => {
  const service = new MultisigService({
    client: {},
    packages: { accountMultisig: ACCOUNT_MULTISIG_PACKAGE },
    sharedObjects: { packageRegistry: { id: "0x1" } },
  });

  const tx = new Transaction();
  service.evaluateIntent(tx, "0x1", "delayed-intent");

  const [command] = tx.getData().commands;
  const moveCall = command.MoveCall;
  assert.equal(
    `${moveCall.package}::${moveCall.module}::${moveCall.function}`,
    `${ACCOUNT_MULTISIG_PACKAGE}::multisig::evaluate_intent`,
  );
  assert.equal(moveCall.arguments.length, 3);
});

test("generic actions helper blocks account_multisig ConfigChange specs", () => {
  const service = new MultisigService({
    client: {},
    packages: { accountMultisig: ACCOUNT_MULTISIG_PACKAGE },
    sharedObjects: { packageRegistry: { id: "0x1" } },
  });

  assert.match(
    service.getUnsupportedActions([CONFIG_CHANGE_ACTION_TYPE])[0],
    /config-change flow/,
  );
});
