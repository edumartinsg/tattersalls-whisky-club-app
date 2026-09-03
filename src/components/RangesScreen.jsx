import { useMemo, useState } from 'react'
import { useClubData } from '../context/DataContext'
import { listAllRanges, countOpenSlotsInRange } from '../domain/clubRules'
import { MembershipCard } from './MembershipCard'

export function RangesScreen({ initialRangeId, onOpenAddMember }) {
  const { state, toggleRedemption, lockMembership } = useClubData()
  const ranges = listAllRanges()
  const [activeRangeId, setActiveRangeId] = useState(initialRangeId || ranges[0].id)

  const whiskeySlotsByNumber = useMemo(
    () => new Map(state.whiskeySlots.map((s) => [s.number, s])),
    [state.whiskeySlots]
  )

  const membersById = useMemo(() => new Map(state.members.map((m) => [m.id, m])), [state.members])

  const membershipsForActiveRange = useMemo(() => {
    return state.rangeMemberships
      .filter((m) => m.rangeId === activeRangeId)
      .map((m) => ({ ...m, memberName: membersById.get(m.memberId)?.name || 'Unknown member' }))
      .sort((a, b) => a.memberName.localeCompare(b.memberName))
  }, [state.rangeMemberships, activeRangeId, membersById])

  return (
    <div className="ranges-screen">
      <div className="range-tabs">
        {ranges.map((r) => {
          const openCount = countOpenSlotsInRange(r.id, state.rangeMemberships)
          return (
            <button
              key={r.id}
              className={`range-tab ${activeRangeId === r.id ? 'range-tab-active' : ''}`}
              onClick={() => setActiveRangeId(r.id)}
            >
              {r.id}
              {openCount > 0 && <span className="range-tab-count">{openCount}</span>}
            </button>
          )
        })}
      </div>

      <div className="range-detail-header">
        <h2>Range {activeRangeId}</h2>
        <button className="btn btn-primary" onClick={() => onOpenAddMember(activeRangeId)}>
          Add member to this range
        </button>
      </div>

      {membershipsForActiveRange.length === 0 && (
        <p className="all-clear">No members enrolled in this range yet.</p>
      )}

      {membershipsForActiveRange.map((membership) => (
        <MembershipCard
          key={membership.id}
          membership={membership}
          whiskeySlotsByNumber={whiskeySlotsByNumber}
          onToggle={(membershipId, slotNumber, consumed) => toggleRedemption(membershipId, slotNumber, consumed)}
          onLock={lockMembership}
          showMemberName={true}
        />
      ))}
    </div>
  )
}
