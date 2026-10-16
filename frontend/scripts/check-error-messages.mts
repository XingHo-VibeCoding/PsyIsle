// Day 23 自检脚本（前端）：验证三类错误（输入错 / 网络错 / 服务端错）都会出中文，
// 且英文原文不会被漏到界面上。
//
// 怎么跑（frontend 目录）：
//   node --experimental-strip-types scripts/check-error-messages.mts
// 退出码 0 = 全过；1 = 有断言没过。
//
// 它 import 的是真实的 ../src/lib/errors.ts，不是副本 —— 改坏了这里就会红。

import {
  AppError,
  ERROR_MESSAGES,
  kindOfCode,
  kindOfStatus,
  messageForStatus,
  toUserMessage,
} from '../src/lib/errors.ts'

const CN = /[\u4e00-\u9fa5]/
const problems: string[] = []
const rows: string[] = []

// [描述, 实际提示, 期望的类别文案（null = 只要求是中文）]
function check(label: string, actual: string, want?: string) {
  if (!CN.test(actual)) problems.push(label + '：不是中文 —— ' + actual)
  if (want && actual !== want) problems.push(label + '：期望「' + want + '」，实际「' + actual + '」')
  rows.push('  ' + label + '\n     给用户：' + actual)
}

// 输入错：后端信封里的中文原文要能透出来（校验文案是后端给的，最具体）
check(
  '输入错 · 信封 INVALID_INPUT（后端中文原文透出）',
  toUserMessage(new AppError(kindOfCode('INVALID_INPUT'), '情绪不在允许范围内，请选择：calm / warm / tired / low / anxious / upset / empty')),
)
check('输入错 · HTTP 400', messageForStatus(400), ERROR_MESSAGES.input)
check('输入错 · 信封 NOT_FOUND', toUserMessage(new AppError(kindOfCode('NOT_FOUND'), '找不到这条打卡记录')))

// 网络错：浏览器抛的是英文原文，必须换掉
check('网络错 · Failed to fetch', toUserMessage(new TypeError('Failed to fetch')), ERROR_MESSAGES.network)
check(
  '网络错 · NetworkError when attempting to fetch resource.',
  toUserMessage(new Error('NetworkError when attempting to fetch resource.')),
  ERROR_MESSAGES.network,
)

// 服务端错：状态码不上屏
check('服务端错 · HTTP 500', messageForStatus(500), ERROR_MESSAGES.server)
check('服务端错 · HTTP 429', messageForStatus(429), ERROR_MESSAGES.server)
check('服务端错 · 信封 INTERNAL', toUserMessage(new AppError('server')), ERROR_MESSAGES.server)

// 兜底：未知英文报错也不许上屏
check('兜底 · Unexpected token < in JSON…', toUserMessage(new Error('Unexpected token < in JSON at position 0')), ERROR_MESSAGES.unknown)
check('兜底 · 非 Error 抛出（字符串）', toUserMessage('boom'), ERROR_MESSAGES.unknown)
check('兜底 · 非 Error 抛出（null）', toUserMessage(null), ERROR_MESSAGES.unknown)

// 真断网：不造字符串，真发一次请求。
//   · 127.0.0.1:1 没人监听 → 连接被拒（等于「把后端停掉」）
//   · .invalid 是保留域，一定解析不到 → DNS 失败（等于「断网」）
// 两次都要被认成网络错，而不是漏成「出了点问题」那种没有指向性的话。
async function realFetchError(url: string): Promise<unknown> {
  try {
    await fetch(url)
    return new Error('居然连上了（不该发生）')
  } catch (e) {
    return e
  }
}

const refused = await realFetchError('http://127.0.0.1:1/api/moods')
check('网络错 · 真发请求到没人监听的端口（连接被拒）', toUserMessage(refused), ERROR_MESSAGES.network)
rows[rows.length - 1] += '\n     底层原文：' + (refused as Error)?.message

const dns = await realFetchError('https://psyisle-does-not-exist.invalid/api/health')
check('网络错 · 真发请求到解析不到的域名（DNS 失败）', toUserMessage(dns), ERROR_MESSAGES.network)
rows[rows.length - 1] += '\n     底层原文：' + (dns as Error)?.message

// 状态码 → 类别 的边界
if (kindOfStatus(400) !== 'input') problems.push('kindOfStatus(400) 期望 input')
if (kindOfStatus(404) !== 'input') problems.push('kindOfStatus(404) 期望 input')
if (kindOfStatus(408) !== 'server') problems.push('kindOfStatus(408) 期望 server')
if (kindOfStatus(500) !== 'server') problems.push('kindOfStatus(500) 期望 server')

console.log('\n前端错误提示自检（' + rows.length + ' 例 + 4 条类别边界）')
rows.forEach((r) => console.log(r))

if (problems.length) {
  console.log('\n✗ 未通过 ' + problems.length + ' 项：')
  problems.forEach((p) => console.log('  - ' + p))
  process.exit(1)
}
console.log('\n✓ 全部通过：三类错误都是中文，英文原文与状态码都没有上屏\n')
