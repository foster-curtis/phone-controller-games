// Knights' nametags (SPEC §2.4, §15.2 world UI), changed only when their text or color changes.
// Every Phaser Text setText/setColor redraws its canvas and re-uploads the texture; under software GL
// that upload is a GPU readback stall, so calling them every frame starved the TV and every phone
// sharing the browser (the FF7 smoke and reconnect e2e timeouts, BUILD_PLAN §8 FF7-fix-1).

export interface TagText {
  readonly text: string;
  setText(text: string): unknown;
  setColor(color: string): unknown;
}

/** What the tag shows now (`color` null until first set). */
export interface TagState {
  color: string | null;
}

/** Applies `label` and `color` to the tag only where they differ; returns how many redraws it did. */
export function syncTag(tag: TagText, state: TagState, label: string, color: string): number {
  let redraws = 0;
  if (tag.text !== label) {
    tag.setText(label);
    redraws++;
  }
  if (state.color !== color) {
    tag.setColor(color);
    state.color = color;
    redraws++;
  }
  return redraws;
}
