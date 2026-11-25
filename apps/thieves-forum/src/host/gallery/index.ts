// `?gallery=1` art gallery (SPEC §6.21, §12.7): every rig, pose clip, stall and effect on one screen.
// Stub entry: TF1 builds it. Frozen at TF0 (BUILD_PLAN §3): the `mount(root)` signature.
export function mount(root: HTMLElement): void {
  root.dataset.mode = 'gallery';
}
