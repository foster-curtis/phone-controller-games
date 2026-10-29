// Screen router: screens in the same group share one view, which is updated in place (no DOM churn,
// so a held thumb survives e.g. countdown → playing). A new group destroys the old view and mounts the
// new one. Phone-local screens (joining, removed) mount through `showLocal`.

export interface RoutedView<S> {
  el: HTMLElement;
  update(screen: S): void;
  destroy(): void;
}

export interface ScreenRouterOptions<S, G extends string> {
  host: HTMLElement;
  groupOf(screen: S): G;
  create(screen: S): RoutedView<S>;
}

export interface ScreenRouter<S, G extends string> {
  /** Shows a host screen: updates the current view when `groupOf` matches, else replaces it. */
  show(screen: S): void;
  /**
   * Mounts a phone-local element under `group`. With `view`, it is destroyed on the next switch;
   * without one, the element is kept as is (so it can be shown again).
   */
  showLocal(group: string, el: HTMLElement, view?: { destroy(): void }): void;
  /** The current group, or null before anything was shown. */
  group(): G | string | null;
  destroy(): void;
}

export function createScreenRouter<S, G extends string>(
  opts: ScreenRouterOptions<S, G>,
): ScreenRouter<S, G> {
  let group: G | string | null = null;
  let view: RoutedView<S> | null = null;
  let local: { destroy(): void } | null = null;

  const drop = () => {
    view?.destroy();
    local?.destroy();
    view = null;
    local = null;
  };

  return {
    show(screen) {
      const g = opts.groupOf(screen);
      if (g === group && view) {
        view.update(screen);
        return;
      }
      drop();
      view = opts.create(screen);
      group = g;
      opts.host.replaceChildren(view.el);
    },
    showLocal(g, el, v) {
      drop();
      local = v ?? null;
      group = g;
      opts.host.replaceChildren(el);
    },
    group: () => group,
    destroy: drop,
  };
}
