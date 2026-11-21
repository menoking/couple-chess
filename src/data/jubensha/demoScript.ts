import type { JubenshaScript } from '../../types/jubensha';

/**
 * 极简测试剧本：只用来验证「选本 → 选角 → 分幕读本 → 搜证分享 → 密封抉择 → 结局复盘」
 * 的完整状态流转。文本刻意写短，后续可直接用正式样板剧本替换。
 *
 * 新增剧本：在 `src/data/jubensha/` 下复制本文件的结构写成新文件，
 * 再到 `index.ts` 的 `JUBENSHA_SCRIPTS` 数组里加一项即可，引擎无需改动。
 */
export const DEMO_SCRIPT: JubenshaScript = {
  id: 'demo-midnight-call',
  title: '零点来电',
  subtitle: '一通来自三年前的电话，把两个人困在同一间便利店',
  durationMinutes: 35,
  tags: ['悬疑', '情感', '双人'],
  synopsis:
    '雨夜，你们在同一间便利店避雨。零点整，收银台的电话响了，听筒里是你们其中一人的声音：别让她离开。',
  difficulty: 'easy',
  roles: [
    {
      id: 'linxia',
      name: '林夏',
      tagline: '把每一件事都记得太清楚的插画师',
      publicBio: '你带着一只旧相机，坚持要在雨停前回家。你不喜欢这家店，却说不出为什么。',
      secretGoal: '你真正想确认的是：他是否还记得三年前那场没有赴约的告白。'
    },
    {
      id: 'zhouye',
      name: '周野',
      tagline: '总在道歉的电台夜班主播',
      publicBio: '你熟悉这条街的每一盏灯，却假装第一次走进这家店。你一直在看门口。',
      secretGoal: '你藏着一张当晚的排班表，上面写着你本不该出现在这里。'
    }
  ],
  acts: [
    {
      id: 'act-1',
      title: '第一幕 · 停电的十一点',
      dmNarration:
        '雨把玻璃门敲得很响。十一点零七分，整条街的灯同时灭了，只有收银台后的应急灯还亮着。店员不见踪影，柜台上留着两杯还冒热气的关东煮。',
      roleScripts: {
        linxia: [
          '你认出了其中一杯——萝卜和竹轮，是他每次值夜班必点的组合。',
          '你翻开相机，最后一卷底片只剩三张。取景框里，玻璃门上有一行被雨水冲淡的字：别回头。'
        ],
        zhouye: [
          '你本来不该在这里。今晚的排班表上，你的名字被划掉了。',
          '停电的瞬间，你下意识摸向口袋，那张折了四次的纸条还在。上面是她的字迹：零点，老地方。'
        ]
      },
      clues: [
        {
          id: 'act1-receipt',
          title: '关东煮小票',
          content: '小票上的时间是 23:58，但打印日期和三年前的那一天完全相同。纸边还是热的。',
          location: '收银台',
          owner: 'public',
          shareable: false
        },
        {
          id: 'act1-negatives',
          title: '未冲洗的底片',
          content: '三张底片：一张是空荡的街道，一张是这家店的门口，最后一张被人为剪掉了。',
          location: '相机',
          owner: 'role0',
          shareable: true
        },
        {
          id: 'act1-roster',
          title: '被划掉的排班表',
          content: '周野的名字被红笔划掉，旁边写着一行小字：今晚不要出现。',
          location: '外套口袋',
          owner: 'role1',
          shareable: true
        }
      ],
      discussionPrompts: [
        '小票上的日期，为什么和三年前重合？',
        '停电前，你最后看到对方在做什么？'
      ]
    },
    {
      id: 'act-2',
      title: '第二幕 · 十二点的门',
      dmNarration:
        '零点整，电话响了。你接起，听筒里传来熟悉的声音，却像隔着一层雨。对方只说了一句：别让她离开。然后挂断。门外的雨声突然停了。',
      roleScripts: {
        linxia: [
          '你看向门口。玻璃上倒映着两个人，但你数了三遍，都只有一个人的影子。',
          '你终于想起，三年前你在这家店等到零点，等来的是一条没有发出的消息。'
        ],
        zhouye: [
          '你握紧那张纸条。纸条背面还有一行你从没敢给她看的字：如果那天我来了，你会不会留下？',
          '电话挂断的忙音里，你听见自己说：这次换我留住你。'
        ]
      },
      clues: [
        {
          id: 'act2-phone',
          title: '不会响的电话',
          content: '电话线早已被剪断，听筒却是温的。通话记录停在零点整，备注名是「林夏」。',
          location: '收银台',
          owner: 'public',
          shareable: false
        },
        {
          id: 'act2-letter',
          title: '没有寄出的信',
          content: '信纸被雨浸过，只剩最后一行清楚：我怕的不是你不来，是你来了又走。',
          location: '相机包',
          owner: 'role0',
          shareable: true
        },
        {
          id: 'act2-key',
          title: '店门钥匙',
          content: '钥匙上挂着三年前的旧门牌。你一直留着它，却从没敢再来。',
          location: '口袋',
          owner: 'role1',
          shareable: true
        }
      ],
      discussionPrompts: [
        '如果这通电话真的来自三年前，你们各自最想改变哪一句话？',
        '门外的人，究竟是谁？'
      ],
      decision: {
        id: 'final-door',
        title: '十二点的门',
        prompt: '雨停了。门被推开一条缝，冷风灌进来。你们只有一句话的时间——',
        final: true,
        options: [
          { id: 'stay', label: '留下', description: '关上门，把三年前没说完的话说完。' },
          { id: 'leave', label: '离开', description: '走出这家店，让今晚停在今晚。' },
          { id: 'truth', label: '说出真相', description: '先承认自己一直记得，再决定去留。' }
        ]
      }
    }
  ],
  endings: [
    {
      id: 'ending-truth',
      title: '同一把伞',
      summary: '你们同时开口，雨声替你们把没说完的话补完了。',
      truthReveal:
        '三年前周野在赶来的路上摔坏了手机，那条「等我」没能发出去；林夏等到零点，以为自己被放鸽子。今晚的电话并不是来自过去，而是周野当年留在旧答录机里的声音，被雨夜的线路偶然接通。两个人都没有删掉那段录音。',
      roleSecrets: [
        '林夏一直留着那封没寄出的信，信里写着她其实看见周野在街对面摔倒。',
        '周野的排班表被划掉，是因为他那天请了假，想给林夏一个正式的告白。'
      ],
      match: [{ decisionId: 'final-door', choices: ['truth', 'truth'] }]
    },
    {
      id: 'ending-stay',
      title: '关灯之后',
      summary: '门关上了，应急灯也灭了。你们在黑暗里握住了对方的手。',
      truthReveal:
        '店员是周野的旧同事，那通电话是他提前设好的定时录音——他只想逼两个人把话说开。停电是整条街的线路故障，但两杯关东煮是他拜托店员留的。',
      roleSecrets: [
        '林夏在停电前就认出了周野的背影，只是不敢先开口。',
        '周野把三年前的排班表留到现在，是因为那天他确实请了假，却没能赶到。'
      ],
      match: [{ decisionId: 'final-door', choices: ['stay', 'stay'] }]
    },
    {
      id: 'ending-leave',
      title: '雨停之前',
      summary: '你们一起走出门，谁都没提三年前。雨后的街道很亮。',
      truthReveal:
        '那通电话其实是林夏自己三年前留在旧答录机里的留言，被雷雨天的电流重新播放。她这次回来，本来只是想拿走那台机器；周野却误以为是她在挽留。',
      roleSecrets: [
        '林夏的相机里最后一张底片，拍的是周野站在街对面没有过马路。',
        '周野口袋里的纸条，是三年前写的，一直没有送出去。'
      ],
      match: [{ decisionId: 'final-door', choices: ['leave', 'leave'] }]
    },
    {
      id: 'ending-miss',
      title: '各自的路口',
      summary: '一个人留下，一个人离开，玻璃门在中间来回晃了很久。',
      truthReveal:
        '你们都只说了一半真话。三年前的事不是误会，是两个人同时选择了沉默。今晚的电话没有答案，只是把那句没说出口的话又放了一遍。',
      roleSecrets: [
        '林夏知道周野会来，所以她才一直等到零点。',
        '周野知道林夏在等，却还是在校门口停住了脚步。'
      ]
    }
  ]
};
