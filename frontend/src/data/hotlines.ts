// 危机号码独立成文件：危机页断网可用的依据（号码打包进前端构建，不依赖任何接口）
// 核实说明：号码与适用场景按 PRD.md 第 5.1 节 F12 定案内容录入（2026-09-22 人工核实）
export interface Hotline {
  number: string
  organizer: string
  hours: string
  scenario: string
}

export interface RegionHotline {
  region: string
  number: string
  note: string
  verifiedAt: string
}

export const HOTLINES_VERIFIED_AT = '2026-09-22'

// 首屏必须先出现的三个号码（不作任何折叠，不滚动就能看到）
export const emergencyHotlines = [
  { number: '120', label: '急救 · 当下有危险、伤到自己或别人' },
  { number: '110', label: '警察 · 人身安全受到威胁' },
  { number: '12356', label: '心理援助 · 想找人说话，任何时间' },
] as const

// 全国范围（打哪个城市都通，不用查本地号码）
export const nationalHotlines: Hotline[] = [
  {
    number: '12356',
    organizer: '国家卫健委 + 工信部（全国统一心理援助热线）',
    hours: '每日不少于 18 小时，多地已 24 小时',
    scenario: '情绪崩溃、睡不着、想说说话。直接拨 = 接通你所在地；加区号拨 = 接外地的；部分地区可经 12345 转接',
  },
  {
    number: '12355',
    organizer: '共青团中央（青少年心理咨询与法律援助）',
    hours: '9:00–19:00（部分地方 7×24）',
    scenario: '学业压力、家庭冲突、被欺凌、需要法律援助；另有微信小程序「青听益站」可在线打字求助',
  },
  {
    number: '12338',
    organizer: '全国妇联（妇女维权公益服务热线）',
    hours: '维权 24 小时 / 心理咨询 8:00–23:00',
    scenario: '亲密关系暴力、性骚扰、家庭矛盾；含反家暴专线',
  },
  {
    number: '12320',
    organizer: '卫健委（卫生健康公益热线）',
    hours: '人工 9:00–17:00',
    scenario: '想了解该去哪看、挂什么科；多地可按提示转心理援助',
  },
]

// 地区范围（24 小时热线样例，标明为「示例，非完整名单」）
export const regionHotlines: RegionHotline[] = [
  { region: '北京', number: '010-82951332', note: '24 小时', verifiedAt: HOTLINES_VERIFIED_AT },
  { region: '上海', number: '021-962525', note: '24 小时', verifiedAt: HOTLINES_VERIFIED_AT },
  { region: '重庆', number: '023-96320 转 1', note: '24 小时', verifiedAt: HOTLINES_VERIFIED_AT },
  { region: '广东', number: '020-81899120', note: '24 小时', verifiedAt: HOTLINES_VERIFIED_AT },
  { region: '江苏', number: '025-83712977', note: '24 小时', verifiedAt: HOTLINES_VERIFIED_AT },
  { region: '浙江', number: '0571-85029595', note: '24 小时', verifiedAt: HOTLINES_VERIFIED_AT },
  { region: '湖南', number: '0731-85501010', note: '24 小时', verifiedAt: HOTLINES_VERIFIED_AT },
  { region: '四川', number: '96111', note: '24 小时', verifiedAt: HOTLINES_VERIFIED_AT },
]
