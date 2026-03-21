import { formatDistanceToNow, format, isAfter, subHours } from "date-fns"

export function formatUsd(amount: number): string {
  const decimals = amount < 1 ? 4 : 2
  return `$${amount.toFixed(decimals)}`
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  if (isAfter(d, subHours(new Date(), 24))) {
    return formatDistanceToNow(d, { addSuffix: true })
  }
  return format(d, "MMM d, yyyy HH:mm")
}

export function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  return `${Math.round(ms)}ms`
}

export function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`
  }
  return String(count)
}
