import { NavLink } from 'react-router-dom'
import { cn } from '../lib/cn'
import { SyncStatus } from './SyncStatus'

function OverviewIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function SessionsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 5h12M2 11h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6" cy="5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10.5" cy="11" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

const NAV_ITEMS = [
  { to: '/', label: 'Overview', end: true, icon: <OverviewIcon /> },
  { to: '/sessions', label: 'Sessions', end: false, icon: <SessionsIcon /> },
  { to: '/settings', label: 'Settings', end: false, icon: <SettingsIcon /> },
]

/** Desktop navigation rail. Collapses to an icon rail between 900px and 1199px. */
export function SidebarNav() {
  return (
    <aside className="pm-rail">
      <NavLink to="/" className="pm-rail__brand" aria-label="Pi Meter overview">
        <span className="pm-rail__glyph" aria-hidden="true">
          π
        </span>
        <span className="pm-rail__wordmark">meter</span>
      </NavLink>

      <nav aria-label="Primary">
        <ul className="pm-rail__list">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn('pm-nav-item', isActive && 'is-active')}
              >
                <span className="pm-nav-item__icon">{item.icon}</span>
                <span className="pm-nav-item__label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="pm-rail__footer">
        <SyncStatus />
        <p className="pm-rail__version pm-mono">v0.1.0 · local index</p>
      </div>
    </aside>
  )
}
