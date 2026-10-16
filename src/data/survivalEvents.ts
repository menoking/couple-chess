export interface SurvivalEvent {
  id: string;
  name: string;
  desc: string;
  /** 跳过任务时扣除的共享心血 */
  skipPenalty: number;
  /** 完成任务时回复的共享心血 */
  successHeal: number;
  /** 完成任务时的额外积分 */
  bonusPoints: number;
  /** 本轮限时（秒），超时按跳过处理；0 表示不限时 */
  timeLimit: number;
}

/** 合作生存事件库：每轮抽一张，修正本轮任务的得失。 */
export const SURVIVAL_EVENTS: SurvivalEvent[] = [
  {
    id: 'sv_gentle',
    name: '温柔夜',
    desc: '安全回合：本轮无论如何都不扣心血',
    skipPenalty: 0,
    successHeal: 0,
    bonusPoints: 0,
    timeLimit: 0
  },
  {
    id: 'sv_tired',
    name: '疲惫一天',
    desc: '两个人都很累，跳过会多扣 1 点心血',
    skipPenalty: 1,
    successHeal: 0,
    bonusPoints: 0,
    timeLimit: 0
  },
  {
    id: 'sv_conflict',
    name: '意见不合',
    desc: '本轮任务请交给对方主导，跳过扣 1 点心血',
    skipPenalty: 1,
    successHeal: 0,
    bonusPoints: 0,
    timeLimit: 0
  },
  {
    id: 'sv_romantic',
    name: '浪漫 Buff',
    desc: '完成任务可以回复 1 点心血',
    skipPenalty: 0,
    successHeal: 1,
    bonusPoints: 0,
    timeLimit: 0
  },
  {
    id: 'sv_disturb',
    name: '外界干扰',
    desc: '只有 30 秒决定，超时按跳过处理并扣 1 点心血',
    skipPenalty: 1,
    successHeal: 0,
    bonusPoints: 0,
    timeLimit: 30
  },
  {
    id: 'sv_sick',
    name: '感冒了',
    desc: '身体不舒服，本轮 45 秒内决定，跳过扣 2 点心血',
    skipPenalty: 2,
    successHeal: 0,
    bonusPoints: 0,
    timeLimit: 45
  },
  {
    id: 'sv_coldwar',
    name: '冷战边缘',
    desc: '气氛紧张，跳过直接扣 2 点心血',
    skipPenalty: 2,
    successHeal: 0,
    bonusPoints: 0,
    timeLimit: 0
  },
  {
    id: 'sv_anniversary',
    name: '纪念日前夜',
    desc: '完成任务回复 1 点心血并 +2 分',
    skipPenalty: 0,
    successHeal: 1,
    bonusPoints: 2,
    timeLimit: 0
  },
  {
    id: 'sv_reunion',
    name: '小别胜新婚',
    desc: '完成任务 +3 分',
    skipPenalty: 0,
    successHeal: 0,
    bonusPoints: 3,
    timeLimit: 0
  },
  {
    id: 'sv_tuned',
    name: '心意相通',
    desc: '完成 +2 分，且本轮跳过不扣血',
    skipPenalty: 0,
    successHeal: 0,
    bonusPoints: 2,
    timeLimit: 0
  }
];

export const SURVIVAL_MAX_HEARTS = 5;
export const SURVIVAL_TOTAL_ROUNDS = 10;
