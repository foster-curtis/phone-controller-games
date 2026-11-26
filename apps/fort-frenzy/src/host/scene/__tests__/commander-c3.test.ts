// The Commander on the TV (SPEC §2.4, §6.1; RD9): Warcry reuses the old morale super's flash, the
// Morale card has no visual of its own, the Lead from the Front motes are gone, and the "×2" of a
// Rally Cry double spawn pops over the soldiers it threw.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { presentationHost } from '../../../presentation/host';
import { PLAYER_COLOR_IDS } from '../../../shared/ids';
import { sampleClip } from '../../render/clip';
import { BASH_IMPACT_MS } from '../../render/clips/commander';
import { createSim, ScriptedInputSource } from '../../sim';
import { DOUBLE_POP, doublePopLook, thrownCenter } from '../commanderFx';
import { BUILD_VIEWS } from '../buildsView';
import { SUPER_FLASH, warcryFlashOn } from '../support';

const source = (f: string) => readFileSync(join(import.meta.dirname, '..', f), 'utf8');

describe('Warcry flash (§6.1)', () => {
  it('flashes on alternating phases for its duration, then stops', () => {
    const total = 4000;
    expect(warcryFlashOn(0, total)).toBe(true);
    expect(warcryFlashOn(SUPER_FLASH.halfMs, total)).toBe(false);
    expect(warcryFlashOn(SUPER_FLASH.halfMs * 2, total)).toBe(true);
    expect(warcryFlashOn(total, total)).toBe(false);
    expect(warcryFlashOn(total + 500, total)).toBe(false);
  });

  it('caps the glow at the rig’s full boost (bloom budget)', () => {
    expect(SUPER_FLASH.glow).toBeLessThanOrEqual(2);
    expect(SUPER_FLASH.auraAlpha).toBeLessThan(0.6);
  });
});

describe('removed visuals (RD9)', () => {
  it('SupportView has no motes, and no look driven by the morale effect', () => {
    const src = source('supportView.ts');
    expect(src).not.toMatch(/nanite-mote'\), 'effects'|MoteStream|leadTargets|drawLead/);
    expect(src).not.toMatch(/def === 'morale'/);
  });
});

describe('shield bash look (§2.4)', () => {
  const clips = presentationHost.clips;

  it('the shield arm punches forward at the impact and its glow flares', () => {
    const clip = clips['commander/attack']!;
    const rest = sampleClip(clip, 0).parts.get('gauntlet')!;
    const hit = sampleClip(clip, BASH_IMPACT_MS).parts.get('gauntlet')!;
    expect(hit.dx ?? 0).toBeGreaterThan((rest.dx ?? 0) + 8);
    expect(sampleClip(clip, BASH_IMPACT_MS).parts.get('shield-glow')!.glow).toBeGreaterThan(2);
  });

  it('the slash trail needs the optional sword group, off by default', () => {
    expect(source('supportView.ts')).toMatch(/isGroupOn\('sword'\)/);
    expect(presentationHost.rigs.commander!.optional!.sword).toContain('sword');
  });

  it('sparks land on the shield attach point', () => {
    expect(source('supportView.ts')).toMatch(/attach\('shield'\)/);
  });

  it('the footman has a tucked thrown clip', () => {
    expect(clips['footman/thrown']).toBeDefined();
    expect(clips['footman/thrown']!.loop).toBe(true);
  });
});

describe('rally flag view (§7.5)', () => {
  it('is found by the build-view glob', () => {
    expect(BUILD_VIEWS.get('rally_flag')).toBeDefined();
  });

  it('names the flight and planted frames, the cloth tinted', () => {
    const src = source('builds/rallyFlag.ts');
    for (const f of ['flight-pole', 'flight-cloth', 'flight-trim', 'ring', 'pole', 'cloth-trim'])
      expect(src).toContain(`rally-flag/${f}`);
    expect(src).toMatch(/setTint\(s\.ownerTint\)/);
  });
});

describe('Rally Cry ×2 (§2.4)', () => {
  it('pops in, rises and fades out', () => {
    expect(doublePopLook(0).alpha).toBe(0);
    expect(doublePopLook(DOUBLE_POP.ms * 0.4).alpha).toBe(1);
    expect(doublePopLook(DOUBLE_POP.ms).alpha).toBe(0);
    expect(doublePopLook(DOUBLE_POP.ms).rise).toBeCloseTo(DOUBLE_POP.risePx, 6);
  });

  it('sits over the landing spots of the soldiers just thrown', () => {
    const pad = new ScriptedInputSource();
    const sim = createSim(
      {
        seed: 7,
        settings: { difficulty: 'normal' },
        slots: [
          {
            slot: 0,
            name: 'C',
            color: PLAYER_COLOR_IDS[0],
            classId: 'commander',
            connected: true,
          },
        ],
      },
      { sources: new Map([[0, pad]]), content },
    );
    const w = sim.world;
    while (w.phase !== 'build') sim.step();
    sim.command({ c: 'ready', slot: 0, ready: true });
    for (let i = 0; i < 5 && (w.phase as string) !== 'combat'; i++) sim.step();
    expect(thrownCenter(w, 0)).toBeNull();
    const a = sim.addSoldier(0, 10, 12);
    const b = sim.addSoldier(0, 10, 12);
    a.flight = {
      from: { x: 10, y: 12 },
      to: { x: 12, y: 12 },
      launchedAt: w.tick,
      landsAt: w.tick + 20,
    };
    b.flight = {
      from: { x: 10, y: 12 },
      to: { x: 12, y: 13 },
      launchedAt: w.tick,
      landsAt: w.tick + 20,
    };
    // The TV reads the event after the step: the tick has moved on, the throw is still the newest.
    w.tick += 1;
    expect(thrownCenter(w, 0)).toEqual({ x: 12, y: 12.5 });
  });
});
