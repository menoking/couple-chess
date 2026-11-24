import type { TaskCard, TaskExecutionMode } from '../types';
import { reviewedTaskOf } from '../data/reviewedTaskDirections';
import { roleplayCardOf } from '../data/roleplayTaskRoles';

export interface ResolvedTaskRule {
  executionMode: TaskExecutionMode;
  executorPlayerId: 0 | 1;
  targetPlayerId: 0 | 1 | null;
  label: '男方 → 女方' | '女方 → 男方' | '双方一起';
  /** 正文里「你／对方」的视角，可能与实际提供动作的人相反。 */
  perspectivePlayerId: 0 | 1;
}

const TOGETHER_CUES = /^(?:双方|两人|你们|一起|共同|互相|彼此|轮流|各自|背靠背|面对面|对视时各)|[，、；。](?:双方|两人|互相|彼此|轮流|各自|再交换角色)|交换角色|一人.{0,8}另一人/;
// 只有明确的场景开头才把后续「互相」视为指令，避免把偏好提问或台词误判成共同动作。
const MUTUAL_AFTER_SETUP = /^(?:用[^，。！？“”「」]{1,20}和[^，。！？“”「」]{1,20}的身份|(?:跪姿)?面对面(?:坐好|坐着)?|结束后|赤裸上半身|69式|扮演陌生人只用三句台词完成)(?:[，、]\s*)?(?:互相|相互)(?=\S)/;
const ASSIGNMENT_PREFIX = /^\s*【\s*(?:男方\s*(?:→|->|对)\s*女方|女方\s*(?:→|->|对)\s*男方|双方一起)\s*】/;
const EXPLICIT_ACTOR = /^(?:(?:由|让|请)\s*)?(男方|女方|男生|女生)(?!的)(?=\S)/;
// 双人卡里，「男生被公主抱」的句首是接受者，而不是抱人的一方。
const IMPLIED_HUG_PROVIDER = /^(男方|女方|男生|女生)\s*被\s*(?:(?:对方|对手|另一方)\s*)?公主抱/;
const OTHER_PROVIDES = /^(?:先|闭眼|蒙眼|躺好|坐好)*(?:(?:让|请|由)对方(?:先|再|用|给|为|对|来|替|贴耳|亲|揉|按|抚|触|抱|说)|对方(?:给你|为你|替你))/;
const RECEIVES_SERVICE = /^(?:先|闭眼|蒙眼|躺好|坐好)*接受(?:对方|三种|来自)/;
const SHIFTED_ACTOR = /^对方|(?:让|请|叫|由|换|交给)(?:对方|接受方|被触碰方|胜方|败方|男方|女方|男生|女生)|对方(?:来|负责|主动|给你|为你|替你)|(?:由|让|请)其/;
const FIXED_ROLE = /男方|女方|男生|女生|男朋友|女朋友|胜方|败方|赢家|输家/;
const NAMES = ['男方', '女方'] as const;
const ROLEPLAY_NAMES = { queen: ['男仆', '女王'], master: ['男主', '女仆'] } as const;
const QUEEN_KISS_CARD = '被女王一边亲吻，一边用手隔着衣服抚摸男仆私处';
const SHARED_SETUP = '(?:牵手坐在一起|手牵手坐好|十指相扣|面对面坐着|面对面坐好|背靠背坐好|对视|相拥)';
const SHARED_THEN_SPEAK = new RegExp(
  `^(?:双方)?(${SHARED_SETUP})[，。；、]\\s*((?:再|然后|接着)?(?:用一句话)?(?:说出|说一句|描述|分享|回答)[\\s\\S]+)$`
);
const JOINT_ONLY = /^(?:(?:手牵手|牵手|对视|拥抱|相拥|相互拥抱)(?:[\d一二三四五六七八九十半两]+\s*(?:秒钟?|分钟))?[。！]?$|相互)/;
const MUTUAL_KISS = /^(?:和|与|跟)(?:对方|对手|ta)(?:深情接吻|法式湿吻|湿吻|舌吻|亲吻)[\d一二三四五六七八九十半两]+\s*(?:秒钟?|分钟)[。！]?$/i;
const PARTICIPANT_PRONOUN = /\bta\b|他（她）|他\/她/i;
const PROVIDER_ROLE = /^(?:执行方|主动方|主导方)$/;
const RECEIVER_ROLE = /^(?:接受方|被动方|接受者)$/;
const QUESTION_CARD = /^(?:回答\s*[：:]|你[^。！]*[？?]$)/;
const UNASSIGNED_ACTOR = /^(?:一方|另一方|接受者|主导者|主动方)|(?:让|由|请)(?:ta|他\/她|他（她）)|(?:被|任由)(?:对方|对手|男仆|男主|女仆|女主)/i;

function taskDirection(text: string): 'male' | 'female' | 'other' | 'together' | 'uncertain' | 'perspective' {
  const body = taskBody(text);
  const reviewed = reviewedTaskOf(body);
  if (reviewed) return reviewed.direction === 'blocked' ? 'uncertain' : reviewed.direction;
  const roleplay = roleplayCardOf(body);
  if (roleplay) return roleplay[0] === 'blocked' ? 'uncertain' : roleplay[0];
  const provider = body.match(/^(?:男方|女方|男生|女生)(?:闭眼|蒙眼|先)?(?:接受|请|让|由|被)(男方|女方|男生|女生)/)?.[1];
  if (provider) return provider === '男方' || provider === '男生' ? 'male' : 'female';
  const receiver = body.match(IMPLIED_HUG_PROVIDER)?.[1];
  if (receiver) return receiver === '男方' || receiver === '男生' ? 'female' : 'male';
  const actor = body.match(EXPLICIT_ACTOR)?.[1];
  if (actor && !/(?:再|然后|接着)(?:由|让|请|换)?(?:男方|女方|男生|女生)|[，；]\s*(?:男方|女方|男生|女生)(?!的)/.test(body)) {
    return actor === '男方' || actor === '男生' ? 'male' : 'female';
  }
  if (SHARED_THEN_SPEAK.test(body) && !FIXED_ROLE.test(body)) return 'perspective';
  if (/^(?:执行方|接受方)/.test(body) && /执行方/.test(body) && /接受方/.test(body)) return 'perspective';
  if (TOGETHER_CUES.test(body) || JOINT_ONLY.test(body) || MUTUAL_KISS.test(body) || MUTUAL_AFTER_SETUP.test(body)) return 'together';
  if (OTHER_PROVIDES.test(body) || RECEIVES_SERVICE.test(body)) return 'other';
  if (SHIFTED_ACTOR.test(body) || FIXED_ROLE.test(body) || UNASSIGNED_ACTOR.test(body)) return 'uncertain';
  return 'perspective';
}

export function resolveTaskRule(task: Pick<TaskCard, 'text' | 'executor'>, fallbackExecutorPlayerId: number): ResolvedTaskRule {
  const direction = taskDirection(task.text);
  const fallback = fallbackExecutorPlayerId === 1 ? 1 : 0;
  const body = taskBody(task.text);
  const flexible = reviewedTaskOf(body)?.direction === 'perspective'
    || (direction === 'perspective' && SHARED_THEN_SPEAK.test(body) && task.executor === 'together');
  const fixed = direction === 'male' ? 0 : direction === 'female' ? 1
    : flexible ? null : task.executor === 'male' ? 0 : task.executor === 'female' ? 1 : null;
  if (direction === 'together' || (!flexible && fixed === null && task.executor === 'together' && direction !== 'other')) {
    return { executionMode: 'together', executorPlayerId: fallback, targetPlayerId: null, label: '双方一起', perspectivePlayerId: fallback };
  }
  const executorPlayerId = fixed ?? fallback;
  const targetPlayerId = executorPlayerId === 0 ? 1 : 0;
  return {
    executionMode: 'directed',
    executorPlayerId,
    targetPlayerId,
    label: executorPlayerId === 0 ? '男方 → 女方' : '女方 → 男方',
    perspectivePlayerId: roleplayCardOf(body)?.[1] ?? (direction === 'other' ? targetPlayerId : executorPlayerId)
  };
}

/**
 * 竞技奖励卡的适配级别：胜方是受益者，败方是执行者。
 * 0 = 固定为败方服务胜方；1 = 按回合分配给败方；2 = 双方共同；3 = 反向。
 */
export function rewardTaskTier(
  task: Pick<TaskCard, 'text' | 'executor'>,
  winnerPlayerId: number,
  loserPlayerId: number
): 0 | 1 | 2 | 3 {
  const direction = taskDirection(task.text);
  if (direction === 'uncertain' || (direction === 'other' && /(?:再|然后|接着)(?:你|对方|交换)/.test(task.text))) return 3;
  const rule = resolveTaskRule(task, loserPlayerId);
  if (rule.executionMode === 'together') return 2;
  if (rule.executorPlayerId !== loserPlayerId || rule.targetPlayerId !== winnerPlayerId) return 3;
  if (reviewedTaskOf(taskBody(task.text))?.direction === 'perspective') return 1;
  return direction === 'male' || direction === 'female' || task.executor === 'male' || task.executor === 'female' ? 0 : 1;
}

export function rewardCandidates<T>(
  items: readonly T[],
  taskOf: (item: T) => Pick<TaskCard, 'text' | 'executor'>,
  winner: number,
  loser: number
): T[] {
  const tiers: [T[], T[], T[]] = [[], [], []];
  for (const item of items) {
    const tier = rewardTaskTier(taskOf(item), winner, loser);
    if (tier !== 3) tiers[tier].push(item);
  }
  return tiers.find(tier => tier.length > 0) ?? [];
}

/** 所选卡包没有合适方向时使用，保证奖励永远不会反过来惩罚胜方。 */
export function createRewardFallbackTask(): TaskCard {
  return {
    text: '接受方选择一项奖励：执行方为接受方倒一杯饮品，或为接受方按揉肩膀三分钟',
    executor: 'both',
    moveDelta: 0
  };
}

export function formatTaskInstruction(text: string, rule: ResolvedTaskRule): string {
  const original = taskBody(text);
  if (IMPLIED_HUG_PROVIDER.test(original)) return original;
  if (original === QUEEN_KISS_CARD) return '女方饰演女王，男方饰演男仆。女王亲吻男仆，同时隔着衣服用手抚摸男仆的私处。';
  const roleplay = roleplayCardOf(original);
  if (roleplay) {
    const [, perspective, scene] = roleplay;
    const [maleRole, femaleRole] = ROLEPLAY_NAMES[scene];
    const viewpoint = perspective === null ? '' : `原文以${ROLEPLAY_NAMES[scene][perspective]}的视角叙述。\n`;
    return `男方饰演${maleRole}，女方饰演${femaleRole}。\n${viewpoint}${original}`;
  }
  const review = reviewedTaskOf(original);
  if (review?.direction === 'blocked') return original;
  const body = review?.wording ?? original;
  if (rule.executionMode === 'together') {
    if (MUTUAL_KISS.test(body)) return `双方${body.slice(3)}`;
    return /^(?:双方|两人|你们|(?:由)?一方|第一轮)/.test(body) ? body : `双方${body}`;
  }
  // 没有明确主体时保留原文，不凭空把「一方」改成当前执行人。
  if (taskDirection(original) === 'uncertain') return body;
  const speaker = NAMES[rule.perspectivePlayerId];
  const partner = NAMES[1 - rule.perspectivePlayerId];
  if (QUESTION_CARD.test(body)) return `${speaker}向${partner}回答：“${body.replace(/^回答\s*[：:]\s*/, '')}”`;
  // 引号里的台词保持原样，代词仍以实际说话者的视角理解。
  const explicit = body.split(/(「[^」]*」|“[^”]*”|「[^」]*$)/).map((part, index) =>
    index % 2 === 1 ? part : part.replace(/对方|\bta\b|他（她）|他\/她|接受方|被动方|接受者|执行方|主动方|主导方|你的|你(?!们)/gi, word => {
      if (word === '对方' || PARTICIPANT_PRONOUN.test(word)) return partner;
      if (RECEIVER_ROLE.test(word)) return NAMES[rule.targetPlayerId ?? (1 - rule.executorPlayerId)];
      if (PROVIDER_ROLE.test(word)) return NAMES[rule.executorPlayerId];
      return word === '你的' ? `${speaker}的` : speaker;
    })
  ).join('');
  // 改写稿已逐句标明角色，可能以双方的准备动作开头。
  if (review?.wording || EXPLICIT_ACTOR.test(body) || /^(?:由)?(?:男方|女方)(?!的)/.test(explicit)) return explicit;
  const mixed = explicit.match(SHARED_THEN_SPEAK);
  if (mixed) return `双方${mixed[1]}。${speaker}${mixed[2].replace(/^(?:再|然后|接着)/, '')}`;
  if (/^贴耳说出/.test(explicit)) return `${speaker}贴近${partner}耳边${explicit.slice(2)}`;
  if (/^(?:说出|说一句|告诉|描述|询问|回答|分享)/.test(explicit) && !explicit.includes(partner)) {
    return `${speaker}向${partner}${explicit}`;
  }
  return `${speaker}${explicit}`;
}

export function taskBody(text: string): string {
  return text.replace(ASSIGNMENT_PREFIX, '').trim();
}

/** 兼容已入队的旧卡，只在有旧前缀时重排正文。 */
export function displayQueuedTask(text: string, executor: number, mode: TaskExecutionMode): string {
  if (!ASSIGNMENT_PREFIX.test(text)) {
    const oldMixed = text.match(/^(男方|女方|双方)(.+)$/);
    if (oldMixed && SHARED_THEN_SPEAK.test(oldMixed[2])) {
      const body = oldMixed[2];
      return formatTaskInstruction(body, resolveTaskRule({ text: body, executor: 'both' }, executor));
    }
    return text;
  }
  const tag = mode === 'together' ? 'together' : executor === 1 ? 'female' : 'male';
  return formatTaskInstruction(text, resolveTaskRule({ text, executor: tag }, executor));
}

/** 题库列表的静态说明；“随回合”会在出卡时解析成明确的男女方向。 */
export function describeStoredTaskRule(task: Pick<TaskCard, 'text' | 'executor'>): string {
  const first = resolveTaskRule(task, 0);
  const second = resolveTaskRule(task, 1);
  if (first.executionMode === 'together') return '双方一起';
  return first.executorPlayerId === second.executorPlayerId ? first.label : '随回合：当前执行方 → 另一方';
}

export function normalizeLegacyTaskExecutor<T extends Pick<TaskCard, 'text' | 'executor'>>(task: T): T {
  const text = taskBody(task.text);
  const reviewed = reviewedTaskOf(text);
  if (reviewed && reviewed.direction !== 'blocked') {
    return {
      ...task,
      text: reviewed.displayOnly ? text : reviewed.wording ?? text,
      executor: reviewed.direction === 'perspective' ? 'both' : reviewed.direction
    };
  }
  return { ...task, text, executor: task.executor === 'both' && taskDirection(text) === 'together' ? 'together' : task.executor };
}

export function themeTaskRuleLabels(tasks: Array<Pick<TaskCard, 'text' | 'executor'>>): string[] {
  const labels = new Set(tasks.map(describeStoredTaskRule));
  return ['男方 → 女方', '女方 → 男方', '双方一起', '随回合：当前执行方 → 另一方']
    .filter(label => labels.has(label));
}
