// 指路灯 · 书影音库（PRD v5.0 模块二「内容层，最先出成果」）
// 规则：只给「条目 + 一句话推荐语」，不做书评、不做心理分析、不剧透关键情节。
// 不写「看完你就好了」这类承诺；条目本身是常见公开作品，用户在自己常用的平台搜名字即可。

import type { ThemeId } from './themes'

export type LibraryKind = 'book' | 'movie' | 'music' | 'podcast'

export type LibraryItem = {
  id: string
  kind: LibraryKind
  title: string
  /** 作者 / 导演 / 演出者 / 主播 */
  by: string
  /** 一句话推荐语 */
  note: string
  themes: ThemeId[]
}

export const kindLabel: Record<LibraryKind, string> = {
  book: '书',
  movie: '电影',
  music: '音乐',
  podcast: '播客',
}

// 展示顺序：书 → 电影 → 音乐 → 播客
export const kindOrder: LibraryKind[] = ['book', 'movie', 'music', 'podcast']

export const library: LibraryItem[] = [
  {
    id: 'man-search-meaning',
    kind: 'book',
    title: '活出意义来',
    by: '维克多·弗兰克尔',
    note: '一个从集中营里活下来的人，认真回答「人到底靠什么撑下去」。',
    themes: ['meaning', 'loss'],
  },
  {
    id: 'lonely-six',
    kind: 'book',
    title: '孤独六讲',
    by: '蒋勋',
    note: '把孤独拆成六种讲法。读完不一定不孤独，但没那么怕它了。',
    themes: ['lonely'],
  },
  {
    id: 'maybe-talk',
    kind: 'book',
    title: '也许你该找个人聊聊',
    by: '洛莉·戈特利布',
    note: '一个心理咨询师自己去做咨询的故事，诊室两头都摊开给你看。',
    themes: ['worth', 'relation'],
  },
  {
    id: 'nvc',
    kind: 'book',
    title: '非暴力沟通',
    by: '马歇尔·卢森堡',
    note: '教你把「你怎么这样」换成「我看到……我感到……」，对越亲近的人越用得上。',
    themes: ['relation'],
  },
  {
    id: 'when-breath',
    kind: 'book',
    title: '当呼吸化为空气',
    by: '保罗·卡拉尼什',
    note: '一个医生在生命最后写下的字，不太温柔，但非常真。',
    themes: ['loss', 'meaning'],
  },
  {
    id: 'tsubaki',
    kind: 'book',
    title: '山茶文具店',
    by: '小川糸',
    note: '替别人写信的人，一封信一段别人的关系，读起来很安静。',
    themes: ['relation', 'lonely'],
  },
  {
    id: 'manchester',
    kind: 'movie',
    title: '海边的曼彻斯特',
    by: '肯尼斯·洛纳根',
    note: '一个人没能从过去走出来，片子里也没人逼他走出来。',
    themes: ['loss', 'lonely'],
  },
  {
    id: 'soul',
    kind: 'movie',
    title: '心灵奇旅',
    by: '彼特·道格特',
    note: '讲一个终于等到机会的人，和一片落进手里的叶子。',
    themes: ['meaning'],
  },
  {
    id: 'spirited-away',
    kind: 'movie',
    title: '千与千寻',
    by: '宫崎骏',
    note: '一个小孩在陌生的地方，先做的事是记住自己叫什么。',
    themes: ['worth', 'lonely'],
  },
  {
    id: 'before-sunrise',
    kind: 'movie',
    title: '爱在黎明破晓前',
    by: '理查德·林克莱特',
    note: '一整晚的散步和聊天，全片基本就是两个人在说话。',
    themes: ['relation'],
  },
  {
    id: 'still-walking',
    kind: 'movie',
    title: '步履不停',
    by: '是枝裕和',
    note: '一家人聚一天，什么都没解决，但第二天都还在。',
    themes: ['relation', 'loss'],
  },
  {
    id: 'mcml',
    kind: 'music',
    title: 'Merry Christmas Mr. Lawrence',
    by: '坂本龍一',
    note: '钢琴声一起来，像有人在很远的地方陪着你坐着。',
    themes: ['lonely'],
  },
  {
    id: 'near-light',
    kind: 'music',
    title: 'Near Light',
    by: 'Ólafur Arnalds',
    note: '弦乐加钢琴，写东西或者发呆的时候放着刚好。',
    themes: ['meaning'],
  },
  {
    id: 'summer',
    kind: 'music',
    title: 'Summer（菊次郎的夏天）',
    by: '久石让',
    note: '轻快的那一首，听完两分钟人会松一点。',
    themes: ['relation'],
  },
  {
    id: 'shanqiu',
    kind: 'music',
    title: '山丘',
    by: '李宗盛',
    note: '一个人回头看自己走过的路，不励志，很实在。',
    themes: ['meaning', 'loss'],
  },
  {
    id: 'yishengsuoai',
    kind: 'music',
    title: '一生所爱',
    by: '卢冠廷',
    note: '一首关于留不住的东西的歌，听的是那个留不住。',
    themes: ['loss'],
  },
  {
    id: 'randomfluct',
    kind: 'podcast',
    title: '随机波动',
    by: '三位主播',
    note: '聊身体、日常和女性处境，很多话题会在心里放很久。',
    themes: ['worth', 'relation'],
  },
  {
    id: 'steve-says',
    kind: 'podcast',
    title: 'Steve说',
    by: 'Steve',
    note: '偏心理学的长对话，一期听很久，适合通勤或做家务。',
    themes: ['worth', 'meaning'],
  },
  {
    id: 'eastwest',
    kind: 'podcast',
    title: '声东击西',
    by: '声动活泼',
    note: '聊技术也聊人怎么过日子，节奏轻，不烧脑。',
    themes: ['meaning'],
  },
]
