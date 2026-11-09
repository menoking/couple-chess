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

// 赌局轮盘：按赌注分档的任务池，赌注越高任务越刺激
export interface GambleEntry {
  /** 轮盘上显示的短标签 */
  label: string;
  /** 具体任务内容 */
  task: string;
}

export interface GambleTier {
  key: 'light' | 'medium' | 'heavy';
  label: string;
  stake: number;
  hint: string;
  entries: GambleEntry[];
}

export const GAMBLE_TIERS: GambleTier[] = [
  {
    key: 'light',
    label: '轻注',
    stake: 1,
    hint: '轻松试探，输的人做个小动作',
    entries: [
      { label: '喂食', task: '亲手喂对方吃一口东西，看着对方吃完' },
      { label: '夸赞', task: '连夸对方三个优点，不许重复也不许停顿' },
      { label: '哄睡', task: '用一句话把对方哄睡，语气要温柔到对方信以为真' },
      { label: '记忆', task: '十秒内说出对方今天穿的每一件衣物' },
      { label: '捏肩', task: '给对方捏肩 60 秒，力度和位置由对方指挥' },
      { label: '模仿', task: '学对方平时说话的语气，说一句情话' },
      { label: '旧事', task: '说出你们第一次约会的确切地点和时间' },
      { label: '形容', task: '用三个词形容对方此刻的样子，不许说"可爱"' }
    ]
  },
  {
    key: 'medium',
    label: '中注',
    stake: 2,
    hint: '开始升温，需要一点勇气',
    entries: [
      { label: '写字', task: '隔着衣物用手指在对方背上写字，写对才过关' },
      { label: '对视', task: '与对方对视 30 秒，先笑的人认输' },
      { label: '耳语', task: '凑到对方耳边，说一句只有你们两个人听得懂的话' },
      { label: '触觉', task: '闭上眼睛，靠触觉猜出对方刚才碰过的三个部位' },
      { label: '拥抱', task: '给对方一个 20 秒的拥抱，中途不许松手' },
      { label: '亲吻', task: '依次亲吻对方的手背、手腕和脖颈各一次' },
      { label: '蒙眼', task: '蒙上眼睛，让对方喂你喝一口水，猜出是什么' },
      { label: '坦白', task: '说出一个你从没告诉过对方的幻想关键词' }
    ]
  },
  {
    key: 'heavy',
    label: '重注',
    stake: 3,
    hint: '赌上分寸，尺度明显加大',
    entries: [
      { label: '锁骨', task: '从对方的锁骨一路吻到耳后，持续 30 秒不停' },
      { label: '脱衣', task: '由对方指定一件衣物，当场脱下' },
      { label: '留痕', task: '让对方在你身上留下一处持续 5 秒的痕迹' },
      { label: '盲触', task: '蒙眼接受对方 1 分钟的任意触碰，边界由你事先划定' },
      { label: '朗读', task: '用最撩的语气读完对方临时指定的一段话' },
      { label: '支配', task: '接下来 3 分钟，你的姿态由对方决定' },
      { label: '描摹', task: '隔着衣物用双唇描摹对方的肩线' },
      { label: '露骨', task: '十指相扣、额头相抵，说三句最露骨的情话' }
    ]
  }
];

// 高潮边缘：五级递进阶梯，每级动作具体、有明确时长
export interface EdgeLevel {
  level: number;
  title: string;
  action: string;
  seconds: number;
}

export const EDGE_LADDER: EdgeLevel[] = [
  {
    level: 1,
    title: '十指相扣',
    action: '十指相扣、额头相抵，安静对视，谁先移开视线就算先破功',
    seconds: 30
  },
  {
    level: 2,
    title: '手腕到锁骨',
    action: '从对方手腕内侧一路吻到锁骨，中途不许停、不许笑场',
    seconds: 45
  },
  {
    level: 3,
    title: '背脊描摹',
    action: '隔着衣物用手掌沿着对方背脊缓慢描摹，速度由推进方控制',
    seconds: 60
  },
  {
    level: 4,
    title: '耳后低语',
    action: '亲吻对方耳后与脖颈，同时在耳边用最低的音量说一句挑逗的话',
    seconds: 60
  },
  {
    level: 5,
    title: '指定停留',
    action: '由被推进方指定身上任意一处（边界内），推进方用嘴唇停留 20 秒',
    seconds: 20
  }
];

// 秘密翻倍「加码」时叠加的升级挑战，让任务真正变刺激
export const SPICY_DOUBLE_UPGRADES: string[] = [
  '保持眼神对视，全程不能移开',
  '任务全程由对方口头指挥节奏',
  '加入束缚或蒙眼元素，由对方决定',
  '把动作放慢三倍，感受每一个细节',
  '全程不许发出声音，否则重新开始',
  '脱到只剩最后一件再执行',
  '完成后必须亲口说出此刻最真实的感觉',
  '允许对方临时加一个「更过分」的附加要求'
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
  },
  {
    personA: '严厉的健身教练',
    personB: '新报名的学员',
    scene: '深夜空无一人的健身房',
    plot: '教练要求加练体能，动作纠正越靠越近',
    forcedLine: '教练：姿势不对，我亲自帮你摆正'
  },
  {
    personA: '房东',
    personB: '拖欠房租的房客',
    scene: '深夜出租屋，房东突然上门',
    plot: '房东提出各种方式抵房租，房客进退两难',
    forcedLine: '房东：今晚拿什么抵，你自己说'
  },
  {
    personA: '摄影师大导演',
    personB: '试镜的新人',
    scene: '深夜的摄影棚，只有一盏补光灯',
    plot: '导演不断要求重拍更放开的镜头',
    forcedLine: '导演：再来一条，这次再放开一点'
  },
  {
    personA: '审讯的特工',
    personB: '被抓到的间谍',
    scene: '秘密基地，四周没有监控',
    plot: '特工用尽手段逼问情报，双方暗中较劲',
    forcedLine: '特工：你瞒不过我，乖乖交出来'
  },
  {
    personA: '深夜图书馆的管理员',
    personB: '赖着不走的读者',
    scene: '闭馆后的图书馆，书架之间',
    plot: '管理员以整理书架为由，把你堵在角落',
    forcedLine: '管理员：闭馆了，你得留下来帮我'
  },
  {
    personA: '私人健身私教',
    personB: 'VIP 会员',
    scene: '私教工作室，只服务你一个人',
    plot: '私教全程贴身指导，语言逐渐暧昧',
    forcedLine: '私教：放松，剩下的交给我'
  },
  {
    personA: '摇滚明星',
    personB: '狂热粉丝',
    scene: '演唱会后台化妆间',
    plot: '明星把粉丝单独留下，从偶像变占有',
    forcedLine: '明星：既然这么喜欢我，证明给我看'
  },
  {
    personA: '列车乘务长',
    personB: '末班车乘客',
    scene: '深夜空荡的卧铺车厢',
    plot: '乘务长巡夜时发现你，一步步靠近',
    forcedLine: '乘务长：到站还早，今晚我陪着你'
  },
  {
    personA: '古堡主人',
    personB: '迷路的旅人',
    scene: '暴雨夜的古老城堡，只有一支烛光',
    plot: '主人收留你，却不愿放你离开',
    forcedLine: '主人：进来了，就别想着天亮前走'
  },
  {
    personA: '审讯官',
    personB: '被审讯的囚犯',
    scene: '昏暗的牢房，铁链和手铐',
    plot: '审讯官要你交代秘密，否则加倍惩罚',
    forcedLine: '审讯官：再不说，今晚可没那么好过'
  }
];

// 惩罚阶梯：五级递进，失败一次升一级
export interface PenaltyLevel {
  level: number;
  label: string;
  task: string;
}

export const PENALTY_LADDER: PenaltyLevel[] = [
  { level: 1, label: '第一级 · 轻', task: '让对方在你手心写一个字，猜不出来就再写一个' },
  { level: 2, label: '第二级 · 中', task: '蒙上眼睛，接受对方 30 秒的任意触碰（边界事先约定）' },
  { level: 3, label: '第三级 · 重', task: '由对方指定一件衣物，当场脱下' },
  { level: 4, label: '第四级 · 更重', task: '让对方在你指定的部位留下一处 5 秒的印记' },
  { level: 5, label: '第五级 · 终极', task: '由对方从今晚所有惩罚里挑一条最狠的，你必须完成（边界内）' }
];
