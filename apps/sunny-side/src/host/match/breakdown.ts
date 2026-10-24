// Per-round points breakdown (C2 note, M3-fix-1): who got what points this round, and how.
// Records are tracked by PlayerRecord so ids/names resolve at round end (late rejoiners included).
import {
  PLAYER_COLOR_IDS,
  type RoundBreakdown,
  type RoundBreakdownEntry,
  type RoundPointItem,
} from '../../shared/messages';
import { KNOCKOUT_POINTS, SURVIVOR_POINTS } from './config';
import type { PlayerRecord } from './roster';

type Earned = { kind: 'ko'; victim: PlayerRecord } | { kind: 'survivor' };

export class RoundTally {
  /** Players who got an egg this round. */
  private participants: PlayerRecord[] = [];
  private earned = new Map<PlayerRecord, Earned[]>();
  /** Knocked-out players → who got the credit (null = fell off / no credit), and if by a ghost. */
  private out = new Map<PlayerRecord, { killer: PlayerRecord | null; ghost: boolean }>();

  start(participants: readonly PlayerRecord[]): void {
    this.participants = [...participants];
    this.earned.clear();
    this.out.clear();
  }

  /**
   * An egg went out; `killer` is the player who actually got the +1 (null when none / dropped);
   * `ghost` = a ghost pulse pushed it out (sim `byGhost`).
   */
  knockout(victim: PlayerRecord | undefined, killer: PlayerRecord | null, ghost = false): void {
    if (victim) this.out.set(victim, { killer, ghost });
    if (killer && victim) this.add(killer, { kind: 'ko', victim });
  }

  /** A removed player (Leave / removal) drops out of this round's breakdown with their points. */
  remove(p: PlayerRecord): void {
    this.participants = this.participants.filter((q) => q !== p);
    this.earned.delete(p);
    this.out.delete(p);
  }

  survived(p: PlayerRecord): void {
    this.add(p, { kind: 'survivor' });
  }

  /** Call after the round's scores are applied (`total` = score now). */
  build(round: number): RoundBreakdown {
    const players = [...this.participants]
      .sort((a, b) => b.score - a.score || a.joinIndex - b.joinIndex)
      .map((p): RoundBreakdownEntry => {
        const items = (this.earned.get(p) ?? []).map(toItem);
        const out = this.out.get(p);
        const killer = out?.killer;
        return {
          playerId: p.id,
          name: p.name,
          color: p.color ?? PLAYER_COLOR_IDS[0],
          points: items.reduce((sum, i) => sum + i.points, 0),
          total: p.score,
          left: p.left,
          items,
          out:
            out === undefined
              ? null
              : { by: killer?.id ?? null, byName: killer?.name ?? null, ghost: out.ghost },
        };
      });
    return { round, players };
  }

  private add(p: PlayerRecord, e: Earned): void {
    const list = this.earned.get(p);
    if (list) list.push(e);
    else this.earned.set(p, [e]);
  }
}

function toItem(e: Earned): RoundPointItem {
  return e.kind === 'ko'
    ? { kind: 'ko', victimId: e.victim.id, victimName: e.victim.name, points: KNOCKOUT_POINTS }
    : { kind: 'survivor', points: SURVIVOR_POINTS };
}
