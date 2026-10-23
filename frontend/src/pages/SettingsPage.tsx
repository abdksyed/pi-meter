import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'

/** Route placeholder. Settings are not part of the shared foundation. */
export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" meta="Local index configuration" />
      <Panel title="Settings">
        <EmptyState
          eyebrow="Placeholder"
          title="Settings are not built yet"
          description="Sessions directory, database location, and index diagnostics belong on this route."
        />
      </Panel>
    </>
  )
}
