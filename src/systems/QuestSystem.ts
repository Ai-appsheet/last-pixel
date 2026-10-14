import { EventBus } from '../core/EventBus';
import { Sfx } from '../core/AudioManager';
import type { QuestDef } from '../data/quests';

/**
 * เนื้อเรื่องทีละข้อ ฟังเหตุการณ์จาก EventBus:
 *  pickup(item,n) craft(item,qty) build(id) mob:killed(id) harvest() fish()
 *  island:enter(biome) day:start(day) disaster:survived() trade() enhance:ok() box:open()
 */
export class QuestSystem {
  index = 0;
  progress = 0;
  private off: (() => void)[] = [];

  constructor(
    readonly list: QuestDef[],
    private giveReward: (items: [string, number][]) => void,
  ) {
    const on = (ev: string, fn: (...a: never[]) => void) => {
      EventBus.on(ev, fn);
      this.off.push(() => EventBus.off(ev, fn));
    };
    on('pickup', (item: string, n: number) => this.track('collect', item, n));
    on('craft', (item: string, n: number) => this.track('craft', item, n));
    on('build', (id: string) => this.track('build', id, 1));
    on('mob:killed', (id: string) => this.track('kill', id, 1));
    on('harvest', () => this.track('harvest', '', 1));
    on('fish', () => this.track('fish', '', 1));
    on('island:enter', (biome: string) => this.track('visit', biome, 1));
    on('day:start', (day: number) => this.track('survive', '', day));
    on('disaster:survived', () => this.track('disaster', '', 1));
    on('trade', () => this.track('trade', '', 1));
    on('enhance:ok', () => this.track('enhance', '', 1));
    on('box:open', () => this.track('box', '', 1));
  }

  get current(): QuestDef | null {
    return this.list[this.index] ?? null;
  }

  get target(): number {
    const g = this.current?.goal;
    if (!g) return 0;
    if (g.type === 'visit') return 1;
    if (g.type === 'survive') return g.days;
    return g.qty;
  }

  private track(type: string, key: string, n: number) {
    const q = this.current;
    if (!q || q.goal.type !== type) return;
    const g = q.goal;
    if ((g.type === 'collect' || g.type === 'craft') && g.item !== key) return;
    if (g.type === 'build' && g.id !== key && !(g.id === 'windmill' && key === 'generator')) return;
    if (g.type === 'kill' && g.mob !== key) return;
    if (g.type === 'visit' && g.island !== key) return;
    if (g.type === 'survive') this.progress = Math.max(this.progress, n);
    else this.progress += n;
    if (this.progress >= this.target) this.complete();
  }

  private complete() {
    const q = this.current!;
    this.giveReward(q.reward);
    Sfx.play('achievement');
    EventBus.emit('quest:done', q);
    this.index++;
    this.progress = 0;
  }

  destroy() {
    this.off.forEach((f) => f());
  }
}
