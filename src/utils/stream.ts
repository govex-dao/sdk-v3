const U64_MAX = (1n << 64n) - 1n;

function mulU64Checked(a: bigint, b: bigint): bigint {
  const prod = a * b;
  if (prod > U64_MAX) {
    throw new Error('u64 overflow in stream math');
  }
  return prod;
}

function ceilDiv(a: bigint, b: bigint): bigint {
  if (b === 0n) {
    throw new Error('division by zero');
  }
  return (a + b - 1n) / b;
}

/**
 * Port of `account_actions::stream_utils::calculate_available_with_tracking`.
 *
 * Computes how much can be claimed right now from an iteration-based stream/vesting
 * given explicit claim tracking state.
 *
 * Notes:
 * - `currentTimeMs` should be milliseconds since epoch (like Sui `Clock::timestamp_ms()`).
 * - `claimWindowMs` is optional (None in Move).
 */
export function calculateStreamAvailableWithTracking(params: {
  amountPerIteration: bigint;
  firstUnclaimedIteration: bigint;
  partialClaimedInIteration: bigint;
  startTimeMs: bigint;
  iterationsTotal: bigint;
  iterationPeriodMs: bigint;
  currentTimeMs: bigint;
  claimWindowMs?: bigint;
}): bigint {
  const {
    amountPerIteration,
    firstUnclaimedIteration,
    partialClaimedInIteration,
    startTimeMs,
    iterationsTotal,
    iterationPeriodMs,
    currentTimeMs,
    claimWindowMs,
  } = params;

  if (amountPerIteration <= 0n) return 0n;
  if (iterationsTotal <= 0n) return 0n;
  if (iterationPeriodMs <= 0n) return 0n;

  // Before start time, nothing is completed.
  if (currentTimeMs < startTimeMs) {
    return 0n;
  }

  const elapsed = currentTimeMs - startTimeMs;
  const currentIteration = elapsed / iterationPeriodMs;
  const completed = currentIteration > iterationsTotal ? iterationsTotal : currentIteration;

  if (completed <= 0n) {
    return 0n;
  }

  // Compute forfeited iterations based on claim window, matching Move logic.
  let forfeited = 0n;
  if (claimWindowMs !== undefined) {
    const windowInIterations = ceilDiv(claimWindowMs, iterationPeriodMs);

    const forfeitElapsed = currentTimeMs > startTimeMs ? currentTimeMs - startTimeMs : 0n;
    const forfeitTicks = forfeitElapsed / iterationPeriodMs;

    const oldestClaimableUncapped =
      forfeitTicks > windowInIterations ? forfeitTicks - windowInIterations : 0n;
    forfeited = oldestClaimableUncapped > completed ? completed : oldestClaimableUncapped;
  }

  // Advance past forfeited iterations.
  const adjFirst = firstUnclaimedIteration < forfeited ? forfeited : firstUnclaimedIteration;
  const adjPartial = firstUnclaimedIteration < forfeited ? 0n : partialClaimedInIteration;

  if (completed <= adjFirst) {
    return 0n;
  }

  const availableIterations = completed - adjFirst;
  const grossAvailable = mulU64Checked(availableIterations, amountPerIteration);
  return grossAvailable > adjPartial ? grossAvailable - adjPartial : 0n;
}

