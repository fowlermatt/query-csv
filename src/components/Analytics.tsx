import { useEffect } from 'react'

export default function Analytics() {
  useEffect(() => {
    if (!import.meta.env.PROD) return

    const s = document.createElement('script')
    s.async = true
    s.src = 'https://plausible.io/js/pa-R_9pBgmNuQ8Y-1C3VQBGe.js'
    s.onload = () => {
      ;(window as any).plausible =
        (window as any).plausible ||
        function () {
          ;(((window as any).plausible.q = (window as any).plausible.q || [])).push(arguments)
        }
      ;(window as any).plausible.init =
        (window as any).plausible.init ||
        function (opts?: any) {
          ;(window as any).plausible.o = opts || {}
        }
      ;(window as any).plausible.init()
    }
    document.head.appendChild(s)
    return () => {
      document.head.removeChild(s)
    }
  }, [])

  return null
}
