/**
 * BCS Encoding Tests
 *
 * Tests to verify Option<u64> encoding matches Move's BCS format:
 * - None: 0x00
 * - Some(value): 0x01 + little-endian u64 bytes
 *
 * Run with: npx ts-node --esm src/utils/bcs.test.ts
 */

import { bcs } from "@mysten/sui/bcs";
import { serializeOptionU64 } from "./bcs.js";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function runTests() {
  console.log("=== BCS Option<u64> Encoding Tests ===\n");

  // Test 1: None encoding
  {
    const result = serializeOptionU64(null);
    const expected = "00"; // Just the None discriminant
    const actual = bytesToHex(result);
    console.log(`Test 1: Option<u64> None`);
    console.log(`  Expected: ${expected}`);
    console.log(`  Actual:   ${actual}`);
    console.log(`  ${actual === expected ? "✓ PASS" : "✗ FAIL"}\n`);
  }

  // Test 2: Some(0) encoding
  {
    const result = serializeOptionU64(0);
    // 0x01 (Some discriminant) + 8 bytes of little-endian 0
    const expected = "010000000000000000";
    const actual = bytesToHex(result);
    console.log(`Test 2: Option<u64> Some(0)`);
    console.log(`  Expected: ${expected}`);
    console.log(`  Actual:   ${actual}`);
    console.log(`  ${actual === expected ? "✓ PASS" : "✗ FAIL"}\n`);
  }

  // Test 3: Some(1) encoding
  {
    const result = serializeOptionU64(1);
    // 0x01 (Some discriminant) + 1 in little-endian u64
    const expected = "010100000000000000";
    const actual = bytesToHex(result);
    console.log(`Test 3: Option<u64> Some(1)`);
    console.log(`  Expected: ${expected}`);
    console.log(`  Actual:   ${actual}`);
    console.log(`  ${actual === expected ? "✓ PASS" : "✗ FAIL"}\n`);
  }

  // Test 4: Some(1000000) encoding
  {
    const result = serializeOptionU64(1000000);
    // 0x01 + 1000000 = 0x0F4240 in little-endian = 40 42 0f 00 00 00 00 00
    const expected = "0140420f0000000000";
    const actual = bytesToHex(result);
    console.log(`Test 4: Option<u64> Some(1000000)`);
    console.log(`  Expected: ${expected}`);
    console.log(`  Actual:   ${actual}`);
    console.log(`  ${actual === expected ? "✓ PASS" : "✗ FAIL"}\n`);
  }

  // Test 5: Some(BigInt) encoding
  {
    const result = serializeOptionU64(BigInt("18446744073709551615")); // u64 max
    // 0x01 + all ff bytes
    const expected = "01ffffffffffffffff";
    const actual = bytesToHex(result);
    console.log(`Test 5: Option<u64> Some(u64::MAX)`);
    console.log(`  Expected: ${expected}`);
    console.log(`  Actual:   ${actual}`);
    console.log(`  ${actual === expected ? "✓ PASS" : "✗ FAIL"}\n`);
  }

  // Test 6: undefined is treated as None
  {
    const result = serializeOptionU64(undefined);
    const expected = "00";
    const actual = bytesToHex(result);
    console.log(`Test 6: Option<u64> undefined -> None`);
    console.log(`  Expected: ${expected}`);
    console.log(`  Actual:   ${actual}`);
    console.log(`  ${actual === expected ? "✓ PASS" : "✗ FAIL"}\n`);
  }

  // Test 7: Verify tx.pure.option matches our serializeOptionU64
  console.log("=== Verifying tx.pure.option compatibility ===\n");
  {
    // The @mysten/sui library's bcs.option should produce the same encoding
    const directBcs = bcs.option(bcs.u64()).serialize(BigInt(42)).toBytes();
    const ourFunc = serializeOptionU64(42);
    const match = bytesToHex(directBcs) === bytesToHex(ourFunc);
    console.log(`Test 7: Direct bcs.option vs serializeOptionU64`);
    console.log(`  bcs.option:         ${bytesToHex(directBcs)}`);
    console.log(`  serializeOptionU64: ${bytesToHex(ourFunc)}`);
    console.log(`  ${match ? "✓ PASS - encodings match" : "✗ FAIL - encodings differ"}\n`);
  }

  console.log("=== Move BCS Deserialization Reference ===");
  console.log("In Move, Option<u64> is deserialized as:");
  console.log("  let is_some = bcs::peel_bool(&mut reader);");
  console.log("  let value = if (is_some) {");
  console.log("      option::some(bcs::peel_u64(&mut reader))");
  console.log("  } else {");
  console.log("      option::none()");
  console.log("  };");
  console.log("\nThis matches the SDK's encoding: 0x00 for None, 0x01 + u64 for Some.");
}

runTests();
