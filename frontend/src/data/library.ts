// 找方向 · 书影音库（PRD v5.0 模块二「内容层，最先出成果」）
// 规则：只给「条目 + 一句话推荐语」，不做书评、不做心理分析、不剧透关键情节。
// 不写「看完你就好了」这类承诺；条目本身是常见公开作品，用户在自己常用的平台搜名字即可。
//
// 2026-10-19 改版：每约有 cover（封面图）与 url（跳转目标），封面缺省走排版占位，绝不破图。
// 2026-10-20 按真人试用反馈再改三处：
//  ⑤ 「只有绿色的颜色，没有书影音图片」——除书（Open Library 公开封面）外一律没有真封面，
//     原来的渐变+类型字看起来像一张「加载失败的图」。改成明说的排版占位：大字书名 + 类型小字，
//     一眼能看出「这一类没有封面图」，而不是「图炸了」。
//  ⑤ 「搜索是空白的」——豆瓣桌面搜索页在手机浏览器里经常只剩白板，换移动版域名。
//  ⑥ 「视频应该是科普视频，和番剧应该分开」——原「视频·番剧」一类拆成「视频」与「番剧」两类。
// 主题轴 2026-10-20 扩到 8 个，存量条目同步补挂新标签（空主题筛不出东西）。

import type { ThemeId } from './themes'

export type LibraryKind = 'book' | 'movie' | 'music' | 'podcast' | 'video' | 'anime'

export type LibraryItem = {
  id: string
  kind: LibraryKind
  title: string
  /** 作者 / 导演 / 演出者 / 主播 / UP 主 */
  by: string
  /** 一句话推荐语 */
  note: string
  themes: ThemeId[]
  /** 封面图 URL；缺省时由页面用排版占位，不会出现破图 */
  cover?: string
  /** 点击整卡跳转的目标（新标签页打开） */
  url?: string
}

export const kindLabel: Record<LibraryKind, string> = {
  book: '书',
  movie: '电影',
  music: '音乐',
  podcast: '播客',
  video: '视频',
  anime: '番剧',
}

// 点卡片之后去哪、按钮上就怎么写——别让用户点完才发现落进了别的地方
export const kindGoLabel: Record<LibraryKind, string> = {
  book: '去豆瓣',
  movie: '去豆瓣',
  music: '去网易云',
  podcast: '去豆瓣',
  video: '去 B 站',
  anime: '去 B 站',
}

// 展示顺序：书 → 电影 → 音乐 → 播客 → 视频 → 番剧
export const kindOrder: LibraryKind[] = ['book', 'movie', 'music', 'podcast', 'video', 'anime']

// Open Library 公开封面（按 ISBN，无密钥、CORS 友好）。取不到时页面自动退回排版占位。
const ol = (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`
// 豆瓣移动版搜索：桌面版 douban.com/search 在手机浏览器里经常只剩白板（试用原话：「搜索是空白的」）
const douban = (q: string) => `https://m.douban.com/search?query=${encodeURIComponent(q)}`
const netease = (q: string) => `https://music.163.com/#/search/m/?s=${encodeURIComponent(q)}`
const bili = (q: string) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(q)}`

export const library: LibraryItem[] = [
  // ---------------- 书 ----------------
  {
    id: 'man-search-meaning',
    kind: 'book',
    title: '活出意义来',
    by: '维克多·弗兰克尔',
    note: '一个从集中营里活下来的人，认真回答「人到底靠什么撑下去」。',
    themes: ['meaning', 'loss', 'future'],
    cover: ol('9787508647291'),
    url: douban('活出意义来 弗兰克尔'),
  },
  {
    id: 'lonely-six',
    kind: 'book',
    title: '孤独六讲',
    by: '蒋勋',
    note: '把孤独拆成六种讲法。读完不一定不孤独，但没那么怕它了。',
    themes: ['lonely'],
    cover: ol('9787506044934'),
    url: douban('孤独六讲 蒋勋'),
  },
  {
    id: 'maybe-talk',
    kind: 'book',
    title: '也许你该找个人聊聊',
    by: '洛莉·戈特利布',
    note: '一个心理咨询师自己去做咨询的故事，诊室两头都摊开给你看。',
    themes: ['worth', 'relation', 'family'],
    cover: ol('9787557670373'),
    url: douban('也许你该找个人聊聊'),
  },
  {
    id: 'nvc',
    kind: 'book',
    title: '非暴力沟通',
    by: '马歇尔·卢森堡',
    note: '教你把「你怎么这样」换成「我看到……我感到……」，对越亲近的人越用得上。',
    themes: ['relation', 'family'],
    cover: ol('9787508085690'),
    url: douban('非暴力沟通 卢森堡'),
  },
  {
    id: 'when-breath',
    kind: 'book',
    title: '当呼吸化为空气',
    by: '保罗·卡拉尼什',
    note: '一个医生在生命最后写下的字，不太温柔，但非常真。',
    themes: ['loss', 'meaning'],
    cover: ol('9787518402718'),
    url: douban('当呼吸化为空气'),
  },
  {
    id: 'tsubaki',
    kind: 'book',
    title: '山茶文具店',
    by: '小川糸',
    note: '替别人写信的人，一封信一段别人的关系，读起来很安静。',
    themes: ['relation', 'lonely', 'family'],
    cover: ol('9787544295266'),
    url: douban('山茶文具店 小川糸'),
  },
  {
    id: 'the-little-prince',
    kind: 'book',
    title: '小王子',
    by: '圣埃克苏佩里',
    note: '「真正重要的东西，用眼睛是看不见的。」每个年龄段读都像新的。',
    themes: ['meaning', 'lonely'],
    cover: ol('9787020042494'),
    url: douban('小王子 圣埃克苏佩里'),
  },
  {
    id: 'walden',
    kind: 'book',
    title: '瓦尔登湖',
    by: '亨利·戴维·梭罗',
    note: '一个人去湖边住了两年，写他怎么把生活过到最精简。',
    themes: ['lonely', 'meaning', 'future'],
    cover: ol('9787020105465'),
    url: douban('瓦尔登湖 梭罗'),
  },
  {
    id: 'soul-healing',
    kind: 'book',
    title: '心的重建',
    by: '露易丝·海 / 大卫·凯思乐',
    note: '讲怎么和失去、离别、变动相处，温柔但不鸡汤。',
    themes: ['loss', 'worth'],
    cover: ol('9787512711854'),
    url: douban('心的重建 露易丝海'),
  },
  {
    id: 'quiet',
    kind: 'book',
    title: '安静：内向性格的竞争力',
    by: '苏珊·凯恩',
    note: '如果你在人群里容易累，这本书会告诉你那不是缺点。',
    themes: ['lonely', 'worth', 'stress'],
    cover: ol('9787508638885'),
    url: douban('安静 苏珊凯恩'),
  },
  {
    id: 'courage-disliked',
    kind: 'book',
    title: '被讨厌的勇气',
    by: '岸见一郎 / 古贺史健',
    note: '用对话讲「课题分离」：别人怎么看你，是别人的事。',
    themes: ['worth', 'relation', 'future'],
    url: douban('被讨厌的勇气'),
  },

  // ---------------- 电影 ----------------
  {
    id: 'manchester',
    kind: 'movie',
    title: '海边的曼彻斯特',
    by: '肯尼斯·洛纳根',
    note: '一个人没能从过去走出来，片子里也没人逼他走出来。',
    themes: ['loss', 'lonely'],
    url: douban('海边的曼彻斯特'),
  },
  {
    id: 'soul',
    kind: 'movie',
    title: '心灵奇旅',
    by: '彼特·道格特',
    note: '讲一个终于等到机会的人，和一片落进手里的叶子。',
    themes: ['meaning'],
    url: douban('心灵奇旅'),
  },
  {
    id: 'spirited-away',
    kind: 'movie',
    title: '千与千寻',
    by: '宫崎骏',
    note: '一个小孩在陌生的地方，先做的事是记住自己叫什么。',
    themes: ['worth', 'lonely'],
    url: douban('千与千寻'),
  },
  {
    id: 'before-sunrise',
    kind: 'movie',
    title: '爱在黎明破晓前',
    by: '理查德·林克莱特',
    note: '一整晚的散步和聊天，全片基本就是两个人在说话。',
    themes: ['relation'],
    url: douban('爱在黎明破晓前'),
  },
  {
    id: 'still-walking',
    kind: 'movie',
    title: '步履不停',
    by: '是枝裕和',
    note: '一家人聚一天，什么都没解决，但第二天都还在。',
    themes: ['relation', 'loss', 'family'],
    url: douban('步履不停'),
  },
  {
    id: 'little-forest',
    kind: 'movie',
    title: '小森林',
    by: '森淳一',
    note: '一个人回老家，跟着四季做饭。没什么剧情，但很安神。',
    themes: ['lonely', 'meaning'],
    url: douban('小森林'),
  },
  {
    id: 'coco',
    kind: 'movie',
    title: '寻梦环游记',
    by: '李·昂克里奇',
    note: '关于记住和被记住，哭完心里是暖的。',
    themes: ['loss', 'relation', 'family'],
    url: douban('寻梦环游记'),
  },
  {
    id: 'paterson',
    kind: 'movie',
    title: '帕特森',
    by: '吉姆·贾木许',
    note: '一个公交司机每天写几句诗，把普通日子过成一首。',
    themes: ['meaning', 'lonely'],
    url: douban('帕特森 电影'),
  },

  // ---------------- 音乐 ----------------
  {
    id: 'mcml',
    kind: 'music',
    title: 'Merry Christmas Mr. Lawrence',
    by: '坂本龍一',
    note: '钢琴声一起来，像有人在很远的地方陪着你坐着。',
    themes: ['lonely'],
    url: netease('Merry Christmas Mr. Lawrence'),
  },
  {
    id: 'near-light',
    kind: 'music',
    title: 'Near Light',
    by: 'Ólafur Arnalds',
    note: '弦乐加钢琴，写东西或者发呆的时候放着刚好。',
    themes: ['meaning'],
    url: netease('Near Light Olafur Arnalds'),
  },
  {
    id: 'summer',
    kind: 'music',
    title: 'Summer（菊次郎的夏天）',
    by: '久石让',
    note: '轻快的那一首，听完两分钟人会松一点。',
    themes: ['relation'],
    url: netease('Summer 久石让'),
  },
  {
    id: 'shanqiu',
    kind: 'music',
    title: '山丘',
    by: '李宗盛',
    note: '一个人回头看自己走过的路，不励志，很实在。',
    themes: ['meaning', 'loss', 'future'],
    url: netease('山丘 李宗盛'),
  },
  {
    id: 'yishengsuoai',
    kind: 'music',
    title: '一生所爱',
    by: '卢冠廷',
    note: '一首关于留不住的东西的歌，听的是那个留不住。',
    themes: ['loss'],
    url: netease('一生所爱 卢冠廷'),
  },
  {
    id: 'weightless',
    kind: 'music',
    title: 'Weightless',
    by: 'Marconi Union',
    note: '被拿来当「最放松的曲子」研究的那种，适合睡前。',
    themes: ['lonely', 'worth', 'stress'],
    url: netease('Weightless Marconi Union'),
  },

  // ---------------- 播客 ----------------
  {
    id: 'randomfluct',
    kind: 'podcast',
    title: '随机波动',
    by: '三位主播',
    note: '聊身体、日常和女性处境，很多话题会在心里放很久。',
    themes: ['worth', 'relation'],
    url: douban('随机波动 播客'),
  },
  {
    id: 'steve-says',
    kind: 'podcast',
    title: 'Steve说',
    by: 'Steve',
    note: '偏心理学的长对话，每期都挺长，适合通勤或做家务。',
    themes: ['worth', 'meaning'],
    url: douban('Steve说 播客'),
  },
  {
    id: 'eastwest',
    kind: 'podcast',
    title: '声东击西',
    by: '声动活泼',
    note: '聊技术也聊人怎么过日子，节奏轻，不烧脑。',
    themes: ['meaning'],
    url: douban('声东击西 播客'),
  },
  {
    id: 'just-being',
    kind: 'podcast',
    title: 'Just Being 恰好',
    by: '几位主播',
    note: '聊情绪、关系和自我接纳，语速慢，适合一个人散步听。',
    themes: ['lonely', 'worth', 'stress'],
    url: douban('恰好 播客'),
  },

  // ---------------- 视频（哔哩哔哩，科普 / 治愈向） ----------------
  {
    id: 'bili-mind',
    kind: 'video',
    title: '心理学 UP 主：情绪是怎么来的',
    by: '科普区 UP 主',
    note: '用很通俗的话讲情绪是怎么回事，不诊断、不吓人。',
    themes: ['worth', 'meaning'],
    url: bili('认识自己的情绪 心理学'),
  },
  {
    id: 'bili-nature',
    kind: 'video',
    title: '纪录片：慢下来的自然',
    by: '纪录片 UP 主',
    note: '把镜头停在森林、湿地和星空，几分钟就能喘口气。',
    themes: ['lonely', 'meaning'],
    url: bili('中国野生生物 纪录片'),
  },
  {
    id: 'bili-sleep',
    kind: 'video',
    title: '科普：睡不着的晚上可以试什么',
    by: '科普区 UP 主',
    note: '只讲有据可查的做法，不讲偏方。',
    themes: ['stress'],
    url: bili('睡眠 科普 睡不着'),
  },
  {
    id: 'bili-healing',
    kind: 'video',
    title: '一个人也要好好吃饭',
    by: '美食区 UP 主合集',
    note: '看别人认真做饭，自己也会被带得想好好吃一顿。',
    themes: ['worth', 'lonely'],
    url: bili('一个人也要好好吃饭 美食'),
  },
  {
    id: 'bili-study',
    kind: 'video',
    title: '学习陪伴 · 云端自习室',
    by: '学习区 UP 主',
    note: '开着当背景音，像有人在陪你一起坐着做事。',
    themes: ['lonely', 'worth', 'stress'],
    url: bili('云端自习室 学习陪伴'),
  },
  {
    id: 'bili-clay',
    kind: 'video',
    title: '手工 · 陶艺与羊毛毡的慢时光',
    by: '手工区 UP 主',
    note: '看手一点点把东西做出来，很安神。',
    themes: ['meaning', 'lonely'],
    url: bili('陶艺 羊毛毡 手工'),
  },

  // ---------------- 番剧（哔哩哔哩） ----------------
  {
    id: 'bili-daily-anime',
    kind: 'anime',
    title: '日常系动画：对风说爱你',
    by: '哔哩哔哩番剧',
    note: '没有大起大落，就是普通的日子在慢慢过。',
    themes: ['lonely', 'relation'],
    url: bili('日常系 番剧 治愈'),
  },
  {
    id: 'bili-natsume',
    kind: 'anime',
    title: '夏目友人帐',
    by: '动画剧集',
    note: '人和妖怪互相搭把手的日子，很温柔，也讲失去。',
    themes: ['lonely', 'relation', 'loss'],
    url: bili('夏目友人帐'),
  },
]
