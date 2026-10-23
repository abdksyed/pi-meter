import { NavLink } from 'react-router-dom'
import { cn } from '../lib/cn'

const NAV_ITEMS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/sessions', label: 'Sessions', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

/** Sticky top bar for viewports below 900px. Replaces the desktop rail. */
export function MobileNavBar() {
  return (
    <header className="pm-mobilebar">
      <NavLink to="/" className="pm-mobilebar__brand" aria-label="Pi Meter overview">
        <span aria-hidden="true">π </span>meter
      </NavLink>

      <nav aria-label="Primary">
        <ul className="pm-mobilebar__nav">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn('pm-mobilebar__link', isActive && 'is-active')}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
