// Sim benchmark (SPEC §15.9): prints per-scenario mean and p99 step time and exits non-zero over the
// 2 ms budget. FF1 stub: FF6 adds the scenarios.
const scenarios: { name: string; run(): number[] }[] = [];

if (scenarios.length === 0) console.log('bench: no scenarios yet');
