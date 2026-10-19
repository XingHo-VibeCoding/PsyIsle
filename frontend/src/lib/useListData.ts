import { useCallback, useEffect, useRef, useState } from 'react'

// 列表数据的三种请求态。「空」不在这里 —— 空是一次成功请求的正常结果，
// 页面照样要渲染标题和筛选，只是列表里没东西，所以它由 data.length === 0 表达。
export type ListStatus = 'loading' | 'error' | 'ready'

export type ListData<T> = {
  status: ListStatus
  data: T[]
  retry: () => void
}

// load 必须是一个稳定引用（模块级函数或 useCallback 包过的），否则每次渲染都会重新请求。
// 竞态保护：切页面或连点重试时，先前那次请求的结果不再写回 state —— 否则慢的那次
// 可能后到，把新页面的数据覆盖成旧的。
export function useListData<T>(load: () => Promise<T[]>): ListData<T> {
  const [status, setStatus] = useState<ListStatus>('loading')
  const [data, setData] = useState<T[]>([])
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    load().then(
      (rows) => {
        if (!alive) return
        setData(rows)
        setStatus('ready')
      },
      () => {
        if (!alive) return
        setStatus('error')
      },
    )
    return () => {
      alive = false
    }
  }, [load, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { status, data, retry }
}

// 单个对象（非列表）的同款四态。探活接口 /api/health 用它——取回的是一个对象，
// 不是数组。竞态保护与重试语义和 useListData 完全一致：请求态的模式全站只有这一处实现。
export function useFetch<T>(load: () => Promise<T>): {
  status: ListStatus
  data: T | null
  retry: () => void
} {
  const [status, setStatus] = useState<ListStatus>('loading')
  const [data, setData] = useState<T | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    load().then(
      (value) => {
        if (!alive) return
        setData(value)
        setStatus('ready')
      },
      () => {
        if (!alive) return
        setStatus('error')
      },
    )
    return () => {
      alive = false
    }
  }, [load, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { status, data, retry }
}

// ---- 分页列表：一页一页往回翻更早的记录 ----
// 为什么单独一个 hook、而不是给 useListData 加参数：两者语义不同。
// useListData 的数据是「一次全拿到」，重试 = 整份替换；分页列表的数据是「累积的」，
// 翻页要往后追加、重试要从第一页重来。硬塞进一个 hook 会让每条分支都要判「这是第几页」。
export type PagedResult<T> = { items: T[]; nextCursor: string | null }

export type PagedData<T> = {
  status: ListStatus
  data: T[]
  hasMore: boolean
  loadingMore: boolean
  moreError: boolean
  loadMore: () => void
  retry: () => void
}

export function usePagedList<T extends { id: string }>(
  load: (cursor: string | null) => Promise<PagedResult<T>>,
): PagedData<T> {
  const [status, setStatus] = useState<ListStatus>('loading')
  const [data, setData] = useState<T[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // 首屏请求和「加载更多」会交错（比如刚点完更早就刷新）：用递增序号只让最新那一次写回，
  // 否则慢的那次后到，会把新结果覆盖成旧的。
  const seq = useRef(0)
  // 去重要看「已经显示的全部」，不能闭包里抓 data —— loadMore 是 useCallback，
  // 抓到的 data 可能是几轮之前的。ref 每次渲染后同步，用户点的时候一定是最新的。
  const dataRef = useRef<T[]>([])
  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    const mine = ++seq.current
    setStatus('loading')
    setMoreError(false)
    // 新一轮首屏作废上一轮的「加载更多」：那次请求的 then 会因 seq 变化直接 return
    // （见下面 loadMore），若不在这里复位，loadingMore 永远停在 true，
    // 加载更多按钮会永久禁用。场景：点「更早」后请求还在飞，此时点「重试」。
    setLoadingMore(false)
    load(null).then(
      (page) => {
        if (mine !== seq.current) return
        setData(page.items)
        setCursor(page.nextCursor)
        setHasMore(page.nextCursor !== null)
        setStatus('ready')
      },
      () => {
        if (mine !== seq.current) return
        setStatus('error')
      },
    )
  }, [load, attempt])

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || cursor === null) return
    const mine = seq.current
    setLoadingMore(true)
    setMoreError(false)
    load(cursor).then(
      (page) => {
        if (mine !== seq.current) return
        const seen = new Set(dataRef.current.map((row) => row.id))
        const fresh = page.items.filter((row) => !seen.has(row.id))
        // 一条新行都没有，说明后端没按游标翻页（最典型的原因：云函数还是旧版，
        // 不认识 cursor 参数，永远回前 50 条）。这时必须停手 ——
        // 否则按钮点一次转一次、永远显示「还有更早的」，用户会以为记录无限多。
        const stuck = page.items.length > 0 && fresh.length === 0
        if (fresh.length > 0) setData((prev) => [...prev, ...fresh])
        setCursor(page.nextCursor)
        setHasMore(!stuck && page.nextCursor !== null)
        setLoadingMore(false)
      },
      () => {
        if (mine !== seq.current) return
        setLoadingMore(false)
        setMoreError(true)
      },
    )
  }, [load, cursor, hasMore, loadingMore])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { status, data, hasMore, loadingMore, moreError, loadMore, retry }
}
