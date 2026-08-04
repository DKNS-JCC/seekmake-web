// Tiny assertion harness for the standalone test scripts.
//
// The project has no test runner, and pulling one in for a handful of pure
// functions is more machinery than it's worth. These run under tsx:
//
//   npm test

let failures = 0;
let checks = 0;

export function section(name: string): void {
  console.log(`\n${name}`);
}

export function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`);
  }
}

/** Float comparison with a tolerance below one cent. */
export function eq(label: string, actual: number, expected: number, tol = 0.005): void {
  check(label, Math.abs(actual - expected) <= tol, `got ${actual}, expected ${expected}`);
}

export function done(): never {
  if (failures === 0) {
    console.log(`\nAll ${checks} checks passed.`);
    process.exit(0);
  }
  console.log(`\n${failures} of ${checks} checks FAILED.`);
  process.exit(1);
}
