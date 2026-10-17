// 刺激玩法共享素材库：大尺度惩罚、禁区提问、角色剧本等自备内容

export interface RoleplayScript {
  personA: string;
  personB: string;
  scene: string;
  plot: string;
  forcedLine: string;
}

export const SPICY_PENALTIES: string[] = [
  '当众做一件让对方脸红的事（在场允许的范围内）',
  '让对方在你身上任意一个部位留下印记（吻痕/抓痕任选）',
  '整晚只穿对方指定的那件衣服',
  '满足对方一个憋了很久的请求，不许拒绝',
  '用最羞耻的称呼叫对方一晚上',
  '把手机解锁交给对方五分钟，不许抢',
  '在对方耳边用最低的声音说三句平时说不出口的话',
  '任由对方摆一个姿势，保持 30 秒不许动'
];

export const SPICY_TRUTH_QUESTIONS: string[] = [
  '你心里最想被对方怎样对待、但一直没敢说出口？',
  '你偷偷幻想过最过分的一个场景是什么？',
  '如果今晚没有底线，你最想对对方做什么？',
  '对方哪一次的表现让你至今想起来还会心动/脸红？',
  '你私下里最想解锁的玩法是什么？',
  '你希望对方在亲密时多说哪种话？',
  '你最想被对方掌控的时刻是什么？',
  '说一件你从未告诉过任何人的关于对方的幻想'
];

export const SPICY_DARE_CHALLENGES: string[] = [
  '在众人目光下，用十秒完成一个最大胆的互动',
  '连续三次挑战：一次比一次更越界，中途不许停',
  '当众宣布一件关于对方的、别人不知道的事',
  '用最夸张的方式向对方示爱，音量全开',
  '接受对方现场指定的一项大尺度指令',
  '保持眼神对视 60 秒，同时说最撩的话'
];

export const ROLEPLAY_SCRIPTS: RoleplayScript[] = [
  {
    personA: '深夜急诊的医生',
    personB: '深夜就诊的病人',
    scene: '医院诊室，灯光昏暗，只有一张诊疗床',
    plot: '医生主导问诊，步步逼近，病人逐渐失去掌控',
    forcedLine: '医生：脱掉，我需要检查得更彻底'
  },
  {
    personA: '霸道总裁',
    personB: '新来的助理',
    scene: '加班到深夜的办公室，只剩你们两个人',
    plot: '总裁用命令口吻布置任务，助理不得不从',
    forcedLine: '总裁：今晚你哪儿也别想去，就留在这里'
  },
  {
    personA: '神秘陌生人',
    personB: '酒吧独自一人',
    scene: '嘈杂的酒吧，两人隔着吧台对视',
    plot: '陌生人步步搭讪，从试探到占有欲爆棚',
    forcedLine: '陌生人：今晚你会跟我走，你心里清楚'
  },
  {
    personA: '严厉的导师',
    personB: '犯错的学生',
    scene: '放学后的空教室',
    plot: '导师以惩罚为由，逐步升级要求',
    forcedLine: '导师：过来，这件事得单独罚你'
  },
  {
    personA: '警察',
    personB: '被盘问的可疑对象',
    scene: '深夜审讯室，一盏台灯对着你',
    plot: '警察步步紧逼，要你交代所有秘密',
    forcedLine: '警察：老实交代，否则今晚你出不去'
  },
  {
    personA: '国王',
    personB: '被选中的臣民',
    scene: '深夜的寝宫，烛光摇曳',
    plot: '国王今夜要点名宠幸，臣民不可违抗',
    forcedLine: '国王：跪下，今晚你属于我'
  }
];
