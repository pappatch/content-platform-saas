import { createContext, useState, useEffect, useCallback } from 'react'

export const DirectionContext = createContext(null)

export function DirectionProvider({ children }) {
  const [direction, setDirection] = useState('ltr')

  useEffect(() => {
    document.documentElement.dir = direction
    document.documentElement.lang = direction === 'rtl' ? 'he' : 'en'
  }, [direction])

  const setRtl = useCallback(() => setDirection('rtl'), [])
  const setLtr = useCallback(() => setDirection('ltr'), [])
  const toggle = useCallback(
    () => setDirection((d) => (d === 'ltr' ? 'rtl' : 'ltr')),
    []
  )

  return (
    <DirectionContext.Provider value={{ direction, setRtl, setLtr, toggle, isRtl: direction === 'rtl' }}>
      {children}
    </DirectionContext.Provider>
  )
}
