// Temporary: per-system time for the bench scenarios (requires the instrumented sim.ts).
const acc = new Map<string, number[]>();
let last = 0n;
let cur = new Map<string, number>();
const steps: Map<string, number>[] = [];
(globalThis as Record<string, unknown>).__T = (label: string) => {
  const now = process.hrtime.bigint();
  if (label === 'start') {
    if (cur.size) steps.push(cur);
    cur = new Map();
  } else cur.set(label, (cur.get(label) ?? 0) + Number(now - last) / 1e6);
  last = process.hrtime.bigint();
};
process.on('exit', () => {
  if (cur.size) steps.push(cur);
  const tail = steps.slice(-3000);
  const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const sorted = [...tail].sort((a, b) => total(b) - total(a));
  const worst = sorted.slice(0, 30);
  const mean = (list: Map<string, number>[]) => {
    const out = new Map<string, number>();
    for (const m of list) for (const [k, v] of m) out.set(k, (out.get(k) ?? 0) + v / list.length);
    return [...out.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ');
  };
  console.log('ALL  ', mean(tail));
  console.log('WORST', mean(worst));
  for (const m of worst.slice(0, 8))
    console.log('  ', total(m).toFixed(2), [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', '));
  void acc;
});
await import('./bench.ts');
