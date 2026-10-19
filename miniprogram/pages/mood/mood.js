const { EMOJI_OPTIONS } = require('../../lib/config.js')
const { getMoods, createMood } = require('../../lib/api.js')

const LEVELS = [1, 2, 3, 4, 5]

// 页面的本地数据。注意：接口返回的情绪是 id（如 'calm'），界面要显示中文，所以加载时做 id→label 映射。
Page({
  data: {
    emojiOptions: EMOJI_OPTIONS,
    levels: LEVELS,
    selectedEmoji: '',
    selectedLevel: null,
    note: '',
    items: [],
    loading: false,
    submitting: false,
    errorMsg: '',
  },

  onLoad() {
    this.loadMoods()
  },

  onPullDownRefresh() {
    this.loadMoods().then(() => wx.stopPullDownRefresh())
  },

  loadMoods() {
    this.setData({ loading: true, errorMsg: '' })
    return getMoods(50)
      .then((data) => {
        const labelMap = {}
        EMOJI_OPTIONS.forEach((o) => {
          labelMap[o.id] = o.label
        })
        const items = (data.items || []).map((it) => ({
          id: it.id,
          date: it.date,
          note: it.note || '',
          level: it.level || null,
          emojiLabel: labelMap[it.emoji] || it.emoji,
        }))
        this.setData({ items, loading: false })
      })
      .catch((e) => {
        this.setData({ loading: false, errorMsg: e.message || '加载失败' })
      })
  },

  onPickEmoji(e) {
    this.setData({ selectedEmoji: e.currentTarget.dataset.id })
  },

  onPickLevel(e) {
    const lv = e.currentTarget.dataset.level
    // 再点一次取消选择（强度可留空）
    this.setData({ selectedLevel: this.data.selectedLevel === lv ? null : lv })
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  onSubmit() {
    const { selectedEmoji, selectedLevel, note } = this.data
    if (!selectedEmoji) {
      this.setData({ errorMsg: '先选一个情绪' })
      return
    }
    this.setData({ submitting: true, errorMsg: '' })
    createMood({ emoji: selectedEmoji, level: selectedLevel, note: note || '' })
      .then(() => {
        this.setData({ submitting: false, selectedEmoji: '', selectedLevel: null, note: '' })
        wx.showToast({ title: '已记下', icon: 'success' })
        this.loadMoods()
      })
      .catch((e) => {
        this.setData({ submitting: false, errorMsg: e.message || '提交失败' })
      })
  },
})
