import { EventBus } from '../core/EventBus';
import { MetaSave } from '../core/MetaSave';
import { Sfx } from '../core/AudioManager';
import { ACHIEVEMENTS } from '../data/achievements';
import { ITEMS } from '../data/items';
import { BUILD } from '../data/buildables';
import { vehicleKind } from '../data/vehicles';
import { MOBS } from '../data/mobs';

/** นับสถิติแล้วปลดล็อกความสำเร็จ (บันทึกถาวรใน MetaSave) */
export class AchievementSystem {
  counters: Record<string, number> = {};
  visited = new Set<string>();
  private off: (() => void)[] = [];

  constructor() {
    const on = (ev: string, fn: (...a: never[]) => void) => {
      EventBus.on(ev, fn);
      this.off.push(() => EventBus.off(ev, fn));
    };
    on('node:harvested', (type: string) => {
      if (type === 'tree') this.bump('trees', 25, 'lumberjack');
      if (type.startsWith('ore') || type === 'crystal' || type === 'meteor_rock') this.bump('ores', 15, 'miner');
    });
    on('harvest', () => this.bump('crops', 1, 'farmer'));
    on('fish', () => this.bump('fish', 10, 'angler'));
    on('build', (id: string) => {
      this.bump('built', 50, 'builder');
      const boat = BUILD[id]?.boat;
      if (boat && vehicleKind(boat) === 'water') this.unlock('sailor');
    });
    on('mob:killed', (id: string) => {
      if (['crab_king', 'king_boar', 'demon_lord'].includes(id)) this.unlock('king_slayer');
      if (id === 'demon_lord') this.unlock('demon_slayer');
      if (MOBS[id]?.legendary) {
        this.counters[`legend_${id}`] = 1;
        this.unlock('legend_slayer');
        if (Object.keys(this.counters).filter((k) => k.startsWith('legend_')).length >= 4) this.unlock('legend_master');
      }
      if (['shark', 'electric_eel', 'octopus'].includes(id)) this.bump('sea_kills', 10, 'sea_hunter');
    });
    on('island:visit_other', (slot: number) => {
      this.visited.add(String(slot));
      if (this.visited.size >= 3) this.unlock('explorer');
    });
    on('trade', () => this.bump('trades', 10, 'trader'));
    on('disaster:survived', () => this.bump('disasters', 5, 'defender'));
    on('enhance:level', (plus: number) => plus >= 7 && this.unlock('plus7'));
    on('pickup', (item: string) => ITEMS[item]?.rarity === 'legendary' && ITEMS[item].type !== 'box' && this.unlock('legendary'));
    on('day:start', (day: number) => {
      if (day >= 2) this.unlock('first_night');
      if (day >= 7) this.unlock('week');
      if (day >= 30) this.unlock('month');
    });
    on('coins', (n: number) => n >= 1000 && this.unlock('rich'));
  }

  private bump(key: string, need: number, id: string) {
    this.counters[key] = (this.counters[key] ?? 0) + 1;
    if (this.counters[key] >= need) this.unlock(id);
  }

  unlock(id: string) {
    if (!MetaSave.unlockAchievement(id)) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    Sfx.play('achievement');
    EventBus.emit('achievement', a);
  }

  destroy() {
    this.off.forEach((f) => f());
  }
}
