// 找方向 · 小测评（2026-10-19 补内容）
// 红线约定（沿用项目安全规范）：这四套量表均无中文常模，**不存总分、不评级、不 percentile、不位置词**。
// 所以这里只做「自我觉察问卷」——你答完看到的是「你自己这一遍选了什么」，
// 不是一个分数或「你属于哪一类」。它不是诊断，也不替代专业帮助。
//
// 题目为各量表的代表性条目（非完整版），措辞按中文习惯转写，仅用于自我觉察。

export type ScaleId = 'ipip' | 'rses' | 'gse' | 'nfc'

export type AssessScale = {
  id: ScaleId
  name: string
  source: string
  questions: string[]
}

// 五档选项（与所有量表通用）：0 从不 → 4 总是。仅作自我觉察，不参与打分。
export const likert: string[] = ['从不', '很少', '有时', '经常', '总是']

export const scales: AssessScale[] = [
  {
    id: 'ipip',
    name: '我是怎样的（大五节选）',
    source: 'IPIP 大五人格 · 节选',
    questions: [
      '我容易感到紧张。',
      '我享受独处的时间。',
      '我对很多事情充满热情。',
      '我做事前会先想清楚。',
    ],
  },
  {
    id: 'rses',
    name: '我怎么看自己（自尊节选）',
    source: 'RSES 自尊量表 · 节选',
    questions: [
      '我觉得自己是一个有价值的人。',
      '我对自己多半是满意的。',
      '我希望我能更尊重自己一点。',
      '我常觉得自己没什么可取之处。',
    ],
  },
  {
    id: 'gse',
    name: '遇到事我信不信自己（自我效能节选）',
    source: 'GSE 一般自我效能 · 节选',
    questions: [
      '遇到困难时，我通常能想出办法。',
      '面对突发状况，我能保持冷静。',
      '我相信自己能处理好大多数难题。',
      '碰到麻烦时，我容易觉得自己不行。',
    ],
  },
  {
    id: 'nfc',
    name: '我喜不喜欢琢磨（思考需求节选）',
    source: 'NFC-18 思考需求 · 节选',
    questions: [
      '我享受思考复杂的问题。',
      '比起简单的事，我更愿做要动脑子的。',
      '我会对一个想法反复想很久。',
      '能想清楚一件事让我很踏实。',
    ],
  },
]

// 把题目摊平成带归属的列表，便于组件按序号渲染与收集答案。
export type AssessQuestion = {
  index: number
  scaleId: ScaleId
  scaleName: string
  text: string
}

export const allQuestions: AssessQuestion[] = scales
  .flatMap((s) =>
    s.questions.map((text) => ({
      index: 0,
      scaleId: s.id,
      scaleName: s.name,
      text,
    })),
  )
  .map((q, i) => ({ ...q, index: i }))
