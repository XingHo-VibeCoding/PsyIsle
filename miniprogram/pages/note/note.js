const { getNotes, createNote } = require('../../lib/api.js')

// 小进步页（日常管家·写一写）：记一件小事 + 读回列表。
// 与心情页对齐：加载/错误/空/正常四态；全站暖米色调、禁红。
Page({
  data: {
    text: '',
    items: [],
    loading: false,
    submitting: false,
    errorMsg: '',
  },

  onLoad() {
    this.loadNotes()
  },

  onPullDownRefresh() {
    this.loadNotes().then(() => wx.stopPullDownRefresh())
  },

  loadNotes() {
    this.setData({ loading: true, errorMsg: '' })
    return getNotes(50)
      .then((data) => {
        const items = (data.items || []).map((it) => ({
          id: it.id,
          date: it.date,
          text: it.text || '',
        }))
        this.setData({ items, loading: false })
      })
      .catch((e) => {
        this.setData({ loading: false, errorMsg: e.message || '加载失败' })
      })
  },

  onTextInput(e) {
    this.setData({ text: e.detail.value })
  },

  onSubmit() {
    const text = (this.data.text || '').trim()
    if (text.length === 0) {
      this.setData({ errorMsg: '先写一件今天的小事' })
      return
    }
    if (text.length > 200) {
      this.setData({ errorMsg: '一件小事最多 200 字' })
      return
    }
    this.setData({ submitting: true, errorMsg: '' })
    createNote({ text })
      .then(() => {
        this.setData({ submitting: false, text: '' })
        wx.showToast({ title: '已记下', icon: 'success' })
        this.loadNotes()
      })
      .catch((e) => {
        this.setData({ submitting: false, errorMsg: e.message || '提交失败' })
      })
  },
})
