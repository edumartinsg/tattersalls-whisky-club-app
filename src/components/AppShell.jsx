import { useState } from 'react'
import { useClubData } from '../context/DataContext'
import { HomeScreen } from './HomeScreen'
import { MembersScreen } from './MembersScreen'
import { WhiskeysScreen } from './WhiskeysScreen'
import { RangesScreen } from './RangesScreen'
import { MemberDetailScreen } from './MemberDetailScreen'
import { AddMemberScreen } from './AddMemberScreen'
import { BackupButton } from './BackupButton'

const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'members', label: 'Members' },
  { id: 'whiskeys', label: 'Whiskeys' },
  { id: 'ranges', label: 'Ranges' },
]

/**
 * Navigation is a small state machine instead of a router because every
 * screen here is reached from inside the app itself, never from an
 * external link, so there is nothing a router would add beyond
 * complexity.
 */
export function AppShell() {
  const { loading, error, servedFromCache, reload } = useClubData()
  const [screen, setScreen] = useState({ tab: 'home' })

  function openMember(memberId) {
    setScreen({ tab: 'memberDetail', memberId, returnTab: screen.tab })
  }

  function openAddMember(rangeId) {
    setScreen({ tab: 'addMember', rangeId, returnTab: screen.tab === 'addMember' ? 'home' : screen.tab })
  }

  function openRange(rangeId) {
    setScreen({ tab: 'ranges', rangeId })
  }

  function selectTab(tabId) {
    setScreen({ tab: tabId })
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Whisky Club</h1>
        <div className="app-header-actions">
          <BackupButton />
          <button className="btn btn-secondary" onClick={reload}>Refresh</button>
        </div>
      </header>

      {servedFromCache && (
        <div className="banner banner-warning">
          Showing locally saved data. Check the connection to sync with the spreadsheet.
        </div>
      )}
      {error && <div className="banner banner-error">Failed to load data: {error}</div>}

      <nav className="app-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`app-tab ${screen.tab === tab.id ? 'app-tab-active' : ''}`}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="app-content">
        {loading ? (
          <p className="loading-indicator">Loading...</p>
        ) : (
          <>
            {screen.tab === 'home' && (
              <HomeScreen
                onOpenMember={openMember}
                onOpenAddMember={() => openAddMember(null)}
                onOpenRange={openRange}
              />
            )}
            {screen.tab === 'members' && (
              <MembersScreen onOpenMember={openMember} onOpenAddMember={() => openAddMember(null)} />
            )}
            {screen.tab === 'whiskeys' && <WhiskeysScreen />}
            {screen.tab === 'ranges' && (
              <RangesScreen initialRangeId={screen.rangeId} onOpenAddMember={openAddMember} />
            )}
            {screen.tab === 'memberDetail' && (
              <MemberDetailScreen
                memberId={screen.memberId}
                onBack={() => selectTab(screen.returnTab || 'home')}
                onIdentityChanged={(newId) => setScreen({ ...screen, memberId: newId })}
              />
            )}
            {screen.tab === 'addMember' && (
              <AddMemberScreen
                initialRangeId={screen.rangeId}
                onDone={() => setScreen({ tab: screen.returnTab || 'home', rangeId: screen.rangeId })}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
