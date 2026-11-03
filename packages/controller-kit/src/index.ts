// @pcg/controller-kit public API: the phone side every game shares (Fort Frenzy SPEC §15.1, §15.6,
// §15.7; PLATFORM §3). DOM only, never Phaser or host code.
// Frozen at FF0 (Fort Frenzy BUILD_PLAN §3): additive changes only.
// The kit ships no CSS: games style its class hooks (`.screen-host`, `.overlay-host`, `.overlay`,
// `.overlay-card`, `.stick-base`, `.stick-knob`, `.pressed`, `.holding`, `.dev-*`) with their own
// brand tokens.

export { el, setChildren } from './dom';
export { defaultStorage, readStored, writeStored } from './storage';

// Platform
export { createWakeLock, type WakeLock } from './platform/wakeLock';
export { fullscreenOnTap, requestFullscreen } from './platform/fullscreen';
export { isPortrait, tryLockLandscape, watchOrientation } from './platform/orientation';
export {
  LOCKED_VIEWPORT,
  lockViewport,
  readSafeInsets,
  safePad,
  setTouchAction,
  type SafeInsets,
  type SafeSide,
} from './platform/viewport';

// App shell, overlays, screen router
export {
  SHELL_OVERLAYS,
  createAppShell,
  type AppShell,
  type AppShellOptions,
  type ShellClient,
  type ShellOverlay,
  type ShellPlatform,
} from './shell/app';
export {
  createOverlayLayer,
  type OverlayClasses,
  type OverlayLayer,
  type OverlayLayerOptions,
  type OverlayText,
} from './shell/overlays';
export {
  createScreenRouter,
  type RoutedView,
  type ScreenRouter,
  type ScreenRouterOptions,
} from './shell/router';

// Widgets
export {
  STICK_DEADZONE,
  STICK_RADIUS_PX,
  STICK_SCALE,
  computeStick,
  createJoystick,
  type Joystick,
  type JoystickOptions,
} from './widgets/joystick';
export { createHoldButton, type HoldButton } from './widgets/holdButton';
export {
  createNearestRouter,
  type NearestRouterOptions,
  type RoutedPad,
} from './widgets/nearestRouter';
export {
  HOLD_TO_CONFIRM_MS,
  createHoldToConfirm,
  type HoldToConfirmOptions,
} from './widgets/holdToConfirm';

// Gestures (pure reducers + DOM adapter)
export type { GestureInput, GestureMachine, GestureResult } from './gestures/types';
export {
  AIMED_DEFAULTS,
  aimToStick,
  aimedGesture,
  aimedStep,
  isAiming,
  type AimedConfig,
  type AimedOutput,
  type AimedState,
} from './gestures/aimed';
export { tapGesture, tapStep, type TapOutput, type TapState } from './gestures/tap';
export {
  RADIAL_DEFAULTS,
  SLOT_DOWN,
  SLOT_LEFT,
  SLOT_NONE,
  SLOT_RIGHT,
  SLOT_UP,
  isRadialOpen,
  pickSlot,
  radialDeadline,
  radialGesture,
  radialStep,
  singleSlot,
  type RadialConfig,
  type RadialOutput,
  type RadialState,
} from './gestures/radial';
export { bindGesture, type BindGestureOptions, type GestureBinding } from './gestures/bind';

// Input sender
export {
  SEND_ACTIVE_HZ,
  SEND_IDLE_HZ,
  SEND_KEEPALIVE_MS,
  SEND_MIN_GAP_MS,
  createInputSender,
  type InputSchema,
  type InputSender,
  type SenderMode,
} from './sender';

// Dev harness
export {
  createDevHarness,
  createLocalClient,
  isDevMode,
  type DevHarness,
  type DevItem,
  type LocalClient,
} from './dev';
