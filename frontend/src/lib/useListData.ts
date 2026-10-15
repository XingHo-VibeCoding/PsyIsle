import { useCallback, useEffect, useState } from 'react'

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
