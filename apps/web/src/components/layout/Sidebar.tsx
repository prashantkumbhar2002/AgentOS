import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Bot, ShieldCheck, FileSearch, BarChart3, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogoMark } from '@/components/brand/Logo'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/approvals', label: 'Approvals', icon: ShieldCheck },
  { to: '/audit', label: 'Audit', icon: FileSearch },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/policies', label: 'Policies', icon: Lock },
]

export function Sidebar() {
  return (
    <aside className="flex w-60 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 px-4 border-b border-border">
        <LogoMark className="h-7 w-7" decorative />
        <span className="text-lg font-semibold tracking-tight">
          Agent<span className="text-emerald-600 dark:text-emerald-400">OS</span>
        </span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
