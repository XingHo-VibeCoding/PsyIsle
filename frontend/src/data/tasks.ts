// 找方向 · 行动小任务库（PRD v5.0 模块二）
// 规则：3–10 分钟、能一个人做完、不需要坚持、做完也不需要记录。
// 每条都过一遍措辞红线：不说教（无「加油 / 想开点 / 别想太多」）、不承诺效果、不诱导打卡。
//
// 2026-10-20 扩主题轴（8 个）同步补内容：新增 3 条覆盖「累与压力 / 家人 / 选择」，
// 存量条目补挂新标签——空主题筛不出东西，比选项少更让人困惑。

import type { ThemeId } from './themes'

export type MicroTask = {
  id: string
  /** 动作本身，一句话 */
  title: string
  /** 补一句怎么做，只说做法不说意义 */
  hint: string
  minutes: number
  themes: ThemeId[]
  /** 已有的现成页面（如呼吸练习），有值就跳转而不是只在原地读 */
  to?: string
}

export const microTasks: MicroTask[] = [
  {
    id: 'breathe',
    title: '做一趟 4-7-8 呼吸',
    hint: '吸 4 秒、屏 7 秒、呼 8 秒，三个循环。中途停下也完全可以。',
    minutes: 1,
    themes: ['meaning', 'lonely', 'stress'],
    to: '/breathe',
  },
  {
    id: 'window',
    title: '关掉通知，看着窗外三分钟',
    hint: '不用想任何事，只看有什么在动。',
    minutes: 3,
    themes: ['lonely', 'meaning', 'stress'],
  },
  {
    id: 'water',
    title: '把一杯温水一口一口喝完',
    hint: '中间不碰手机，喝慢一点。',
    minutes: 4,
    themes: ['worth', 'stress'],
  },
  {
    id: 'put-back',
    title: '把桌上一件碍眼的东西归位',
    hint: '只归一件，归完就停。',
    minutes: 3,
    themes: ['meaning', 'stress'],
  },
  {
    id: 'color',
    title: '写下今天你注意到的第一个颜色',
    hint: '一句话就够，不用写为什么。',
    minutes: 3,
    themes: ['meaning', 'lonely'],
  },
  {
    id: 'old-song',
    title: '听一首你以前循环过的歌',
    hint: '听完这首就停，不用接着找下一首。',
    minutes: 5,
    themes: ['lonely', 'meaning'],
  },
  {
    id: 'body',
    title: '找找今天身体最累的地方，用手按一按',
    hint: '肩膀、后颈、眼睛，哪儿紧就按哪儿。',
    minutes: 3,
    themes: ['worth', 'stress'],
  },
  {
    id: 'photo',
    title: '打开相册往前翻，停在第一张让你走神的照片上',
    hint: '看一眼当时的场景，不用发出去。',
    minutes: 5,
    themes: ['relation', 'loss', 'family'],
  },
  {
    id: 'to-past-self',
    title: '给三年前的自己写两行字',
    hint: '写完不用给谁看，也可以写完就删。',
    minutes: 7,
    themes: ['worth', 'loss', 'future'],
  },
  {
    id: 'one-fact',
    title: '把最近老在想的那件事写下来，只写事实',
    hint: '不写「我是不是很糟」，只写发生了什么。',
    minutes: 8,
    themes: ['meaning', 'future'],
  },
  {
    id: 'small-relic',
    title: '找一件你以为早忘了的小东西，看一眼',
    hint: '票根、便签、旧聊天记录都算，看完收回去。',
    minutes: 5,
    themes: ['loss'],
  },
  {
    id: 'say-something',
    title: '跟还在你生活里的人说一句具体的话',
    hint: '不说「最近怎么样」，说你今天真的注意到的关于他的一件事。',
    minutes: 5,
    themes: ['relation', 'family'],
  },
  {
    id: 'do-nothing',
    title: '什么都不做，坐着五分钟',
    hint: '定个闹钟，到点就起来，中间不用干出什么。',
    minutes: 5,
    themes: ['lonely', 'worth', 'stress'],
  },
  {
    id: 'drop-shoulders',
    title: '先把肩膀放下来，再慢慢呼吸十次',
    hint: '不用教程，就比平时慢一点。',
    minutes: 2,
    themes: ['stress', 'worth'],
  },
  {
    id: 'no-reply-tonight',
    title: '今晚有一条消息可以晚点再回',
    hint: '挑一条最让你紧张的，明早再回也来得及。',
    minutes: 1,
    themes: ['stress', 'family', 'relation'],
  },
  {
    id: 'family-small',
    title: '给一个家里人，发一句今天的小事',
    hint: '不用报喜不报忧，说什么都行。',
    minutes: 3,
    themes: ['family', 'relation'],
  },
  {
    id: 'two-options',
    title: '在纸上写下两个选项，各写三条代价',
    hint: '只写代价不写好处，反而看得清。',
    minutes: 8,
    themes: ['future', 'meaning'],
  },
  {
    id: 'one-step-only',
    title: '把「以后怎么办」换成「下一步是什么」',
    hint: '只想下一步，只想一件能做到的。',
    minutes: 5,
    themes: ['future', 'stress'],
  },
]
