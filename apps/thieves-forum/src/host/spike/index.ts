// `?spike=tipoff` host spike (SPEC §12.6): snapshot the market and send it to a phone by blob transfer,
// to measure size and arrival on real phones. Stub entry: TF4 builds it.
// Frozen at TF0 (BUILD_PLAN §3): the `mount(root)` signature.
export function mount(root: HTMLElement): void {
  root.dataset.mode = 'spike-tipoff';
}
