export type StoryFragmentKind = 'opening' | 'development' | 'twist' | 'climax' | 'ending';

export interface StoryFragment {
  id: string;
  kind: StoryFragmentKind;
  text: string;
}

/**
 * 故事碎片库：每类 16 张，共 80 张。
 *
 * 一局只推进 10 张，且同一类最多抽 4 次，所以**同局不会抽到重复碎片**
 * （`StoryModeView` 每抽一张就把该碎片从牌堆里移走）。
 */
export const STORY_FRAGMENTS: StoryFragment[] = [
  // ---------- 开场 ----------
  { id: 'o01', kind: 'opening', text: '雨天的便利店，你们共撑一把伞冲了进来' },
  { id: 'o02', kind: 'opening', text: '出差途中，你们发现座位刚好是邻座' },
  { id: 'o03', kind: 'opening', text: '朋友聚会上，你们同时伸手去拿最后一串烤翅' },
  { id: 'o04', kind: 'opening', text: '搬家第一天，你们在电梯门口重逢' },
  { id: 'o05', kind: 'opening', text: '深夜便利店，你们盯上了同一个饭团' },
  { id: 'o06', kind: 'opening', text: '公司团建，你们被分到了同一组' },
  { id: 'o07', kind: 'opening', text: '健身房里，你们的跑步机刚好并排' },
  { id: 'o08', kind: 'opening', text: '猫咖偶遇，你们给同一只猫拍了照' },
  { id: 'o09', kind: 'opening', text: '一场突如其来的暴雨，把你们困在同一个屋檐下' },
  { id: 'o10', kind: 'opening', text: '朋友的婚礼上，你们被安排坐在同一桌' },
  { id: 'o11', kind: 'opening', text: '深夜加班，整层楼只剩你们两盏灯还亮着' },
  { id: 'o12', kind: 'opening', text: '书店最后一本同名小说，你们各抓住了书的一边' },
  { id: 'o13', kind: 'opening', text: '第一次见面，你们因为同一杯做错的咖啡聊了起来' },
  { id: 'o14', kind: 'opening', text: '旅行团分房时，你们被分到了最后一间双人房' },
  { id: 'o15', kind: 'opening', text: '地铁末班车，你们是车厢里仅剩的两个人' },
  { id: 'o16', kind: 'opening', text: '宠物医院里，你们抱着各自的小家伙坐在一起' },

  // ---------- 发展 ----------
  { id: 'd01', kind: 'development', text: '你们开始每天互道晚安，一天都没断过' },
  { id: 'd02', kind: 'development', text: '第一次约会，从下午一直聊到了打烊' },
  { id: 'd03', kind: 'development', text: '你学会了做对方最爱吃的那道菜' },
  { id: 'd04', kind: 'development', text: '你们养成了“吵架不过夜”的默契' },
  { id: 'd05', kind: 'development', text: '一次说走就走的旅行，全程只有彼此' },
  { id: 'd06', kind: 'development', text: '对方发烧那晚，你们第一次整夜没睡' },
  { id: 'd07', kind: 'development', text: '你们把各自的歌单合并成了一个' },
  { id: 'd08', kind: 'development', text: '某个普通的周末，一起拼完了整盒乐高' },
  { id: 'd09', kind: 'development', text: '你们开始用同一款日历，标记彼此的日程' },
  { id: 'd10', kind: 'development', text: '一起逛超市时，购物车里出现了对方爱吃的零食' },
  { id: 'd11', kind: 'development', text: '你们给彼此起了只有两个人懂的外号' },
  { id: 'd12', kind: 'development', text: '寒冷的那天，对方把手套塞给了你' },
  { id: 'd13', kind: 'development', text: '你们第一次一起下厨，把厨房弄得一团糟' },
  { id: 'd14', kind: 'development', text: '对方记住了你随口提过的每一个小愿望' },
  { id: 'd15', kind: 'development', text: '你们在深夜的电话里，聊起了各自的童年' },
  { id: 'd16', kind: 'development', text: '一起看完一部老电影，片尾歌结束时谁都没动' },

  // ---------- 转折 ----------
  { id: 't01', kind: 'twist', text: '一场误会，让你们三天没说话' },
  { id: 't02', kind: 'twist', text: '对方突然被调去了外地工作' },
  { id: 't03', kind: 'twist', text: '一件旧事被重新翻了出来' },
  { id: 't04', kind: 'twist', text: '你们同时面临一个两难的选择' },
  { id: 't05', kind: 'twist', text: '一句脱口而出的话让气氛降到冰点' },
  { id: 't06', kind: 'twist', text: '现实问题第一次被摆到了桌面上' },
  { id: 't07', kind: 'twist', text: '一个久未联系的人突然出现' },
  { id: 't08', kind: 'twist', text: '计划很久的旅行被迫取消' },
  { id: 't09', kind: 'twist', text: '家里人的一句评价，让两个人都不太舒服' },
  { id: 't10', kind: 'twist', text: '手机里那条没来得及解释的消息，被对方看到了' },
  { id: 't11', kind: 'twist', text: '你们为了“谁先低头”僵持了整整一周' },
  { id: 't12', kind: 'twist', text: '一次重要的机会摆在面前，但只能去一个人' },
  { id: 't13', kind: 'twist', text: '对方的生日，你因为加班彻底忘了' },
  { id: 't14', kind: 'twist', text: '两个人都累到不想说话，沉默从晚上延续到第二天' },
  { id: 't15', kind: 'twist', text: '一次无意间的比较，让其中一个人开始怀疑自己' },
  { id: 't16', kind: 'twist', text: '你们发现彼此对未来的想象并不完全一样' },

  // ---------- 高潮 ----------
  { id: 'c01', kind: 'climax', text: '你鼓起勇气，把憋了很久的话说了出来' },
  { id: 'c02', kind: 'climax', text: '对方带着你最爱吃的，出现在你家楼下' },
  { id: 'c03', kind: 'climax', text: '你们决定一起面对那个两难的选择' },
  { id: 'c04', kind: 'climax', text: '一次彻夜长谈，把误会全部拆开' },
  { id: 'c05', kind: 'climax', text: '你为对方准备了一个笨拙的惊喜' },
  { id: 'c06', kind: 'climax', text: '你们在雨里跑了起来，像最开始那样' },
  { id: 'c07', kind: 'climax', text: '一个跨越城市的突然出现' },
  { id: 'c08', kind: 'climax', text: '你们同时说出了同一句话' },
  { id: 'c09', kind: 'climax', text: '在所有人的注视下，你们抱在了一起' },
  { id: 'c10', kind: 'climax', text: '对方把攒了很久的那封信递给了你' },
  { id: 'c11', kind: 'climax', text: '你第一次在对方家人面前，认真介绍了他/她' },
  { id: 'c12', kind: 'climax', text: '凌晨的机场，你们隔着人群挥手又跑回来拥抱' },
  { id: 'c13', kind: 'climax', text: '两个人在天台上把所有的委屈一次说完' },
  { id: 'c14', kind: 'climax', text: '对方在你最狼狈的时候，说了一句“我在”' },
  { id: 'c15', kind: 'climax', text: '你们把旧照片一张张翻出来，笑着笑着就红了眼' },
  { id: 'c16', kind: 'climax', text: '一句迟到了很久的“对不起”，终于说出口' },

  // ---------- 结局 ----------
  { id: 'e01', kind: 'ending', text: '从此每个雨天都有人共伞' },
  { id: 'e02', kind: 'ending', text: '你们把那一天定成了纪念日' },
  { id: 'e03', kind: 'ending', text: '生活回归平凡，但晚安一天没断' },
  { id: 'e04', kind: 'ending', text: '你们决定一起搬到那座城市' },
  { id: 'e05', kind: 'ending', text: '误会变成了以后讲给孩子听的故事' },
  { id: 'e06', kind: 'ending', text: '你们约定，下一个十年也要一起' },
  { id: 'e07', kind: 'ending', text: '那碗泡面成了心里最贵的一餐' },
  { id: 'e08', kind: 'ending', text: '故事没有终点，只有下一章节' },
  { id: 'e09', kind: 'ending', text: '你们把两个人的名字，写进了同一个门牌号' },
  { id: 'e10', kind: 'ending', text: '多年以后，你们还会为那天的选择笑出声' },
  { id: 'e11', kind: 'ending', text: '那盆一起养活的绿植，长满了整个阳台' },
  { id: 'e12', kind: 'ending', text: '你们终于把“以后”过成了“今天”' },
  { id: 'e13', kind: 'ending', text: '争吵依旧会有，但谁都没再提过离开' },
  { id: 'e14', kind: 'ending', text: '冰箱上贴着两个人写的同一张购物清单' },
  { id: 'e15', kind: 'ending', text: '你们把当初那张纸条，夹进了相册第一页' },
  { id: 'e16', kind: 'ending', text: '睡前灯关掉之后，两个人还是会聊很久' }
];

export const STORY_KIND_LABELS: Record<StoryFragmentKind, string> = {
  opening: '开场',
  development: '发展',
  twist: '转折',
  climax: '高潮',
  ending: '结局'
};

/** 每局的情节推进顺序：10 张卡构成一个完整小故事。 */
export const STORY_SEQUENCE: StoryFragmentKind[] = [
  'opening',
  'development',
  'twist',
  'development',
  'twist',
  'climax',
  'development',
  'climax',
  'twist',
  'ending'
];
