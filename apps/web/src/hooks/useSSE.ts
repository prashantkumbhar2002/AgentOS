import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { queryClient, agentKeys, approvalKeys, auditKeys } from '@/lib/queryClient'

export interface SSEEvent {
  id: string
  type: string
  data: Record<string, unknown>
  timestamp: Date
}

const MAX_EVENTS = 50
const MAX_BACKOFF = 30_000

export function useSSE() {
  const token = useAuthStore((s) => s.token)
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const backoffRef = useRef(2000)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const eventIdRef = useRef(0)

  const connect = useCallback(() => {
    if (!token) return

    const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/events/stream?token=${token}`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onopen = () => {
      setIsConnected(true)
      backoffRef.current = 2000
    }

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>
        const type = (data.type as string) || 'unknown'
        const newEvent: SSEEvent = {
          id: String(++eventIdRef.current),
          type,
          data,
          timestamp: new Date(),
        }

        setEvents((prev) => [newEvent, ...prev].slice(0, MAX_EVENTS))

        if (type.includes('approval')) {
          queryClient.invalidateQueries({ queryKey: approvalKeys.all })
        }
        if (type.includes('agent')) {
          queryClient.invalidateQueries({ queryKey: agentKeys.all })
        }
        if (type.includes('audit') || type.includes('llm_call') || type.includes('tool_call')) {
          queryClient.invalidateQueries({ queryKey: auditKeys.all })
        }
      } catch {}
    }

    es.onerror = () => {
      es.close()
      setIsConnected(false)
      const delay = Math.min(backoffRef.current, MAX_BACKOFF)
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF)
      reconnectTimerRef.current = setTimeout(connect, delay)
    }
  }, [token])

  useEffect(() => {
    connect()
    return () => {
      eventSourceRef.current?.close()
      clearTimeout(reconnectTimerRef.current)
    }
  }, [connect])

  return { events, isConnected }
}
