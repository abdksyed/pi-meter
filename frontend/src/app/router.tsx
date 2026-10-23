import { createBrowserRouter, isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ErrorState } from '../components/ErrorState'
import { DashboardPage } from '../pages/DashboardPage'
import SessionDetailPage from '../pages/SessionDetailPage'
import { SessionsPage } from '../pages/SessionsPage'
import { SettingsPage } from '../pages/SettingsPage'

function RouteError() {
  const error = useRouteError()

  let message = 'The page could not be rendered.'
  if (isRouteErrorResponse(error)) message = `${error.status} ${error.statusText}`
  else if (error instanceof Error) message = error.message

  return (
    <main id="main" className="pm-main">
      <div className="pm-main__inner">
        <ErrorState title="Something went wrong" message={message} />
      </div>
    </main>
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'sessions', element: <SessionsPage /> },
      { path: 'sessions/:sessionId', element: <SessionDetailPage /> },
      { path: 'settings', element: <SettingsPage /> },
      {
        path: '*',
        element: <ErrorState title="Page not found" message="That route does not exist in Pi Meter." />,
      },
    ],
  },
])
