import Phaser from 'phaser';

/**
 * ช่องทางสื่อสารข้ามระบบ/ข้ามซีน
 *  'toast'        (text: string, color?: string)
 *  'player:died'  ()
 *  'day:start'    (day: number)
 *  'night:start'  (day: number, bloodMoon: boolean)
 *  'mob:killed'   (mobId: string)
 */
export const EventBus = new Phaser.Events.EventEmitter();
