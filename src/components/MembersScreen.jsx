import { useState } from 'react'
import { useClubData } from '../context/DataContext'
import { ConfirmDialog } from './ConfirmDialog'
import { isTemporaryId } from '../domain/clubRules'

export function MembersScreen({ onOpenMember, onOpenAddMember }) {
  const { state, setMemberActive } = useClubData()
  const [pendingRemoval, setPendingRemoval] = useState(null)
  const [pendingReactivation, setPendingReactivation] = useState(null)
  const [showInactive, setShowInactive] = useState(false)

  const visibleMembers = state.members
    .filter((m) => showInactive || m.active)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="admin-screen">
      <div className="admin-screen-header">
        <h2>Members</h2>
        <button className="btn btn-primary" onClick={onOpenAddMember}>Add member</button>
      </div>

      <label className="toggle-inactive">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Show inactive members
      </label>

      <ul className="member-admin-list">
        {visibleMembers.map((m) => (
          <li key={m.id} className={m.active ? '' : 'member-inactive'}>
            <button className="member-name-link" onClick={() => onOpenMember(m.id)}>
              {m.name} {!isTemporaryId(m.id) ? `(${m.id})` : <span className="needs-code-tag">needs code</span>}
            </button>
            {m.active ? (
              <button className="btn btn-danger btn-small" onClick={() => setPendingRemoval(m)}>
                Remove
              </button>
            ) : (
              <button className="btn btn-secondary btn-small" onClick={() => setPendingReactivation(m)}>
                Reactivate
              </button>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        title="Remove member"
        message={`Are you sure you want to remove ${pendingRemoval?.name}? Their redemption history stays saved and can be reactivated later.`}
        confirmLabel="Remove"
        onConfirm={async () => {
          await setMemberActive(pendingRemoval.id, false)
          setPendingRemoval(null)
        }}
        onCancel={() => setPendingRemoval(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingReactivation)}
        title="Reactivate member"
        message={`Reactivate ${pendingReactivation?.name}? Their open balance becomes valid again.`}
        confirmLabel="Reactivate"
        onConfirm={async () => {
          await setMemberActive(pendingReactivation.id, true)
          setPendingReactivation(null)
        }}
        onCancel={() => setPendingReactivation(null)}
      />
    </div>
  )
}