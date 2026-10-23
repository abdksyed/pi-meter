import { Outlet } from 'react-router-dom'
import { MobileNavBar } from './MobileNavBar'
import { SidebarNav } from './SidebarNav'
import { StatusBar } from './StatusBar'

/** Persistent application frame: navigation rail, scrollable main region, status strip. */
export function AppShell() {
  return (
    <div className="pm-shell">
      <a className="pm-skip-link" href="#main">
        Skip to main content
      </a>
      <SidebarNav />
      <div className="pm-shell__body">
        <MobileNavBar />
        <main id="main" className="pm-main" tabIndex={-1}>
          <div className="pm-main__inner">
            <Outlet />
          </div>
        </main>
        <StatusBar />
      </div>
    </div>
  )
}
