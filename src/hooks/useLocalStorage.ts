import { useCallback, useEffect, useState } from 'react'

export default function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
    }
  }, [key, value])

  const update = useCallback((updater: T | ((prev: T) => T)) => {
    setValue((prev) => (typeof updater === 'function' ? (updater as any)(prev) : updater))
  }, [])

  return [value, update] as const
}
