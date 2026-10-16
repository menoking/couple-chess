export type StoryFragmentKind = 'opening' | 'development' | 'twist' | 'climax' | 'ending';

export interface StoryFragment {
  id: string;
  kind: StoryFragmentKind;
  text: string;
}

export const STORY_FRAGMENTS: StoryFragment[] = [
  // 开场
  { id: 's01', kind: 'opening', text: '雨天的便利店，你们共撑一把伞冲了进来' },
  { id: 's02', kind: 'opening', text: '出差途中，你们发现座位刚好是邻座' },
  { id: 's03', kind: 'opening', text: '朋友聚会上，你们同时伸手去拿最后一串烤翅' },
  { id: 's04', kind: 'opening', text: '搬家第一天，你们在电梯门口重逢' },
  { id: 's05', kind: 'opening', text: '深夜便利店，你们盯上了同一个饭团' },
  { id: 's06', kind: 'opening', text: '公司团建，你们被分到了同一组' },
  { id: 's07', kind: 'opening', text: '健身房裡，你们的跑步机刚好并排' },
  { id: 's08', kind: 'opening', text: '猫咖偶遇，你们给同一只猫拍了照' },

  // 发展
  { id: 's09', kind: 'development', text: '你们开始每天互道晚安，一天都没断过' },
  { id: 's10', kind: 'development', text: '第一次约会，从下午一直聊到了打烊' },
  { id: 's11', kind: 'development', text: '你学会了做对方最爱吃的那道菜' },
  { id: 's12', kind: 'development', text: '你们养成了“吵架不过夜”的默契' },
  { id: 's13', kind: 'development', text: '一次说走就走的旅行，全程只有彼此' },
  { id: 's14', kind: 'development', text: '对方发烧那晚，你们第一次整夜没睡' },
  { id: 's15', kind: 'development', text: '你们把各自的歌单合并成了一个' },
  { id: 's16', kind: 'development', text: '某个普通的周末，一起拼完了整盒乐高' },

  // 转折
  { id: 's17', kind: 'twist', text: '一场误会，让你们三天没说话' },
  { id: 's18', kind: 'twist', text: '对方突然被调去了外地工作' },
  { id: 's19', kind: 'twist', text: '一件旧事被重新翻了出来' },
  { id: 's20', kind: 'twist', text: '你们同时面临一个两难的选择' },
  { id: 's21', kind: 'twist', text: '一句脱口而出的话让气氛降到冰点' },
  { id: 's22', kind: 'twist', text: '现实问题第一次被摆到了桌面上' },
  { id: 's23', kind: 'twist', text: '一个久未联系的人突然出现' },
  { id: 's24', kind: 'twist', text: '计划很久的旅行被迫取消' },

  // 高潮
  { id: 's25', kind: 'climax', text: '你鼓起勇气，把憋了很久的话说了出来' },
  { id: 's26', kind: 'climax', text: '对方带着你最爱吃的，出现在你家楼下' },
  { id: 's27', kind: 'climax', text: '你们决定一起面对那个两难的选择' },
  { id: 's28', kind: 'climax', text: '一次彻夜长谈，把误会全部拆开' },
  { id: 's29', kind: 'climax', text: '你为对方准备了一个笨拙的惊喜' },
  { id: 's30', kind: 'climax', text: '你们在雨里跑了起来，像最开始那样' },
  { id: 's31', kind: 'climax', text: '一个跨越城市的突然出现' },
  { id: 's32', kind: 'climax', text: '你们同时说出了同一句话' },

  // 结局
  { id: 's33', kind: 'ending', text: '从此每个雨天都有人共伞' },
  { id: 's34', kind: 'ending', text: '你们把那一天定成了纪念日' },
  { id: 's35', kind: 'ending', text: '生活回归平凡，但晚安一天没断' },
  { id: 's36', kind: 'ending', text: '你们决定一起搬到那座城市' },
  { id: 's37', kind: 'ending', text: '误会变成了以后讲给孩子听的故事' },
  { id: 's38', kind: 'ending', text: '你们约定，下一个十年也要一起' },
  { id: 's39', kind: 'ending', text: '那碗泡面成了心里最贵的一餐' },
  { id: 's40', kind: 'ending', text: '故事没有终点，只有下一章节' }
];

export const STORY_KIND_LABELS: Record<StoryFragmentKind, string> = {
  opening: '开场',
  development: '发展',
  twist: '转折',
  climax: '高潮',
  ending: '结局'
};

/** 每局的情节推进顺序：8 张卡构成一个完整小故事。 */
export const STORY_SEQUENCE: StoryFragmentKind[] = [
  'opening',
  'development',
  'twist',
  'development',
  'twist',
  'climax',
  'climax',
  'ending'
];
