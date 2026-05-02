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
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export function useSSE() {
    const token = useAuthStore((s) => s.token)
    const [events, setEvents] = useState<SSEEvent[]>([])
    const [isConnected, setIsConnected] = useState(false)
    const backoffRef = useRef(2000)
    const eventSourceRef = useRef<EventSource | null>(null)
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const eventIdRef = useRef(0)
    const connectRef = useRef<() => void>(() => {})

    const connect = useCallback(async () => {
        if (!token) return

        const scheduleReconnect = () => {
            const delay = Math.min(backoffRef.current, MAX_BACKOFF)
            backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF)
            reconnectTimerRef.current = setTimeout(() => connectRef.current(), delay)
        }

        try {
            const res = await fetch(`${API_URL}/api/v1/events/token`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })

            if (!res.ok) {
                scheduleReconnect()
                return
            }

            const { sseToken } = (await res.json()) as { sseToken: string }

            const url = `${API_URL}/api/v1/events/stream?token=${sseToken}`
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
                } catch {
                    // SSE messages are best-effort: a single malformed payload from
                    // the server (e.g. truncated keep-alive frame, partial flush)
                    // must not tear down the live connection. We intentionally
                    // swallow parse errors and wait for the next message rather
                    // than reconnecting, which would cause noisy dashboard churn.
                }
            }

            es.onerror = () => {
                es.close()
                setIsConnected(false)
                scheduleReconnect()
            }
        } catch {
            scheduleReconnect()
        }
    }, [token])

    useEffect(() => {
        connectRef.current = () => void connect()
    }, [connect])

    useEffect(() => {
        connect()
        return () => {
            eventSourceRef.current?.close()
            clearTimeout(reconnectTimerRef.current)
        }
    }, [connect])

    return { events, isConnected }
}
