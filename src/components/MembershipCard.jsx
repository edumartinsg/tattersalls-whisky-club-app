import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { isMembershipComplete, isMembershipExpired, formatDateDMY } from '../domain/clubRules'

/**
 * The lock prompt fires the instant the tenth box in a membership gets
 * checked, not on some later save step, because the club's old paper
 * process already proved that a gap between finishing and confirming is
 * exactly where mistakes happen. Catching it at the moment of completion
 * removes that gap. A manual lock button is also offered, since staff may
 * want to lock a membership that will never be completed.
 *
 * Collapsing starts true for locked or complete memberships, since those
 * are finished business, staff scrolling a long member history care most
 * about the ranges still needing attention.
 */
export function MembershipCard({ membership, whiskeySlotsByNumber, onToggle, onLock, showMemberName }) {
  const [showLockPrompt, setShowLockPrompt] = useState(false)
  const [pendingUncheckSlot, setPendingUncheckSlot] = useState(null)
  const complete = isMembershipComplete(membership)
  const expired = isMembershipExpired(membership)
  const [collapsed, setCollapsed] = useState(complete || membership.locked)
  const wasCompleteRef = useRef(complete)

  useEffect(() => {
    const justBecameComplete = complete && !wasCompleteRef.current
    wasCompleteRef.current = complete
    if (justBecameComplete && !membership.locked) {
      setShowLockPrompt(true)
    }
  }, [complete, membership.locked])

  /**
   * Ticking a box stays a single tap, since it is the routine action
   * happening constantly during a shift and friction there just slows
   * staff down. Unticking is different, it undoes a pour that already
   * physically happened, so an accidental tap could make the system
   * think a whiskey is still owed when it was already given out. That
   * asymmetry is why only the uncheck direction goes through a prompt.
   */
  function handleToggle(slotNumber, nextConsumed) {
    if (membership.locked) return
    if (!nextConsumed) {
      setPendingUncheckSlot(slotNumber)
      return
    }
    onToggle(membership.id, slotNumber, nextConsumed)
  }

  function confirmUncheck() {
    onToggle(membership.id, pendingUncheckSlot, false)
    setPendingUncheckSlot(null)
  }

  function handleConfirmLock() {
    setShowLockPrompt(false)
    onLock(membership.id)
  }

  const sortedRedemptions = [...membership.redemptions].sort((a, b) => a.slotNumber - b.slotNumber)
  const consumedCount = sortedRedemptions.filter((r) => r.consumed).length
  const pendingUncheckWhiskeyName = pendingUncheckSlot
    ? whiskeySlotsByNumber.get(pendingUncheckSlot)?.name || `whisky-${pendingUncheckSlot}`
    : null

  return (
    <div className={`membership-card ${membership.locked ? 'membership-card-locked' : ''}`}>
      <button className="membership-card-header membership-card-toggle" onClick={() => setCollapsed(!collapsed)}>
        <div>
          {showMemberName && <span className="membership-member-name">{membership.memberName}</span>}
          <span className="range-label">Range {membership.rangeId}</span>
          <span className="activation-date">Joined {formatDateDMY(membership.activationDate)}</span>
          <span className="consumed-count">{consumedCount}/{sortedRedemptions.length}</span>
        </div>
        <div className="membership-badges">
          {expired && <span className="badge badge-expired">Expired</span>}
          {membership.locked && <span className="badge badge-locked">Locked</span>}
          <span className="collapse-caret">{collapsed ? '+' : '-'}</span>
        </div>
      </button>

      {!collapsed && (
        <>
          <div className="slot-grid">
            {sortedRedemptions.map((slot) => (
              <label key={slot.slotNumber} className={`slot-checkbox ${slot.consumed ? 'slot-checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={slot.consumed}
                  disabled={membership.locked}
                  onChange={(e) => handleToggle(slot.slotNumber, e.target.checked)}
                />
                <span className="slot-number">{slot.slotNumber}</span>
                <span className="slot-name">{whiskeySlotsByNumber.get(slot.slotNumber)?.name || `whisky-${slot.slotNumber}`}</span>
              </label>
            ))}
          </div>

          {!membership.locked && (
            <button className="btn btn-secondary btn-small" onClick={() => setShowLockPrompt(true)}>
              Lock member
            </button>
          )}
        </>
      )}

      <ConfirmDialog
        open={showLockPrompt}
        title="Whisky club finished"
        message={`Lock range ${membership.rangeId} for this member? Locked ranges can no longer be ticked on or off.`}
        confirmLabel="Lock range"
        onConfirm={handleConfirmLock}
        onCancel={() => setShowLockPrompt(false)}
      />

      <ConfirmDialog
        open={Boolean(pendingUncheckSlot)}
        title="Undo this redemption"
        message={`This marks whisky-${pendingUncheckSlot} (${pendingUncheckWhiskeyName}) as not yet redeemed. Only do this if it was ticked by mistake, not to give this member another free pour of the same whiskey.`}
        confirmLabel="Undo"
        onConfirm={confirmUncheck}
        onCancel={() => setPendingUncheckSlot(null)}
      />
    </div>
  )
}
