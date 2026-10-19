// 心汐微信小程序（原生）。
// 目前只有「日常管家 · 心情打卡」一页，演示小程序如何直连现有 CloudBase HTTP API。
// 鉴权：演示期后端按网关注入的身份或固定演示身份处理（见 cloudfunctions/moods/db.js 的 currentOwner）。
// 接登录后，在 lib/api.js 里给 wx.request 加 Authorization: Bearer <token> 即可（token 由 wx.login 换发）。
App({
  onLaunch() {
    // 启动即进入 pages/mood/mood，无需额外初始化。
  },
})
