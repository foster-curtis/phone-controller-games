// `?ui=<screen>` TV UI preview (SPEC §12.7): one `TvView` screen with fixture data, no relay or match.
// Stub entry: TF6 builds it. Frozen at TF0 (BUILD_PLAN §3): the `mount(root, screen)` signature.
export function mount(root: HTMLElement, screen: string): void {
  root.dataset.mode = 'ui';
  root.dataset.ui = screen;
}
