import { useMemo } from 'react'
import { PinGate } from './components/PinGate'
import { AppShell } from './components/AppShell'
import { DataProvider } from './context/DataContext'
import { GoogleSheetsRepository } from './data/GoogleSheetsRepository'
import { LocalCacheRepository } from './data/LocalCacheRepository'
import { APP_PIN, APPS_SCRIPT_WEB_APP_URL } from './config'

/**
 * The repository is composed once, at the top of the tree, so the choice
 * of backend and the choice of caching strategy stay in exactly one
 * place. Every screen below this only ever sees the DataProvider, never
 * these two classes directly.
 */
export default function App() {
  const repository = useMemo(() => {
    const remote = new GoogleSheetsRepository(APPS_SCRIPT_WEB_APP_URL)
    return new LocalCacheRepository(remote)
  }, [])

  return (
    <PinGate correctPin={APP_PIN}>
      <DataProvider repository={repository}>
        <AppShell />
      </DataProvider>
    </PinGate>
  )
}
