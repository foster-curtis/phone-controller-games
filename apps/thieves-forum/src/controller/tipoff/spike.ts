// `/play?spike=tipoff` phone spike (SPEC §12.6): receive a tip snapshot by blob transfer and show it with
// its hit areas. Stub entry: TF4 builds it. Frozen at TF0 (BUILD_PLAN §3): the `mount(root)` signature.
// Never imports Phaser or host code.
export function mount(root: HTMLElement): void {
  root.dataset.mode = 'spike-tipoff';
}
