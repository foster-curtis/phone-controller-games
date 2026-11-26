// What every phone screen receives from the app (SPEC §12.7): the sender, the clock, the private state,
// the input controls and the two injected seams (hold estimator from TF3, tip viewer from TF4).
// Never imports host code.
import type { RoutedView } from '@pcg/controller-kit';
import type { HoldEstimator } from '../shared/hold';
import type { PhoneMsg, Screen } from '../shared/messages';
import type { Controls } from './controls';
import type { PhoneState } from './state';
import type { TipViewerFactory } from './tipViewer';

export interface Ctx {
  send(msg: PhoneMsg): void;
  /** `performance.now()`-style ms, the clock the hold estimator and deadlines share. */
  now(): number;
  state: PhoneState;
  controls: Controls;
  estimator: HoldEstimator;
  tipViewer: TipViewerFactory;
  /** Feedback form link for the match-end screen (`feedbackUrl`, PLATFORM decision #11). */
  feedbackUrl: string;
}

export interface View extends RoutedView<Screen> {
  /** Called every frame while mounted: countdowns and hold bars. */
  tick?(now: number): void;
  /** A private message changed `ctx.state`. */
  refresh?(): void;
}

export type ViewOf<K extends Screen['s']> = (ctx: Ctx, screen: Extract<Screen, { s: K }>) => View;
