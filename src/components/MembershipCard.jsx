import { useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { isMembershipComplete, isMembershipExpired, formatDateDMY, PAYMENT_METHODS } from '../domain/clubRules'

/**
 * Completed is computed live from the ten redemption rows on every
 * render, never read from a stored flag, so a membership that arrived
 * already finished (imported historical data, a manual Sheet edit,
 * anything) is correctly treated as finished without needing an explicit
 * action to catch up to reality. There used to be a separate manual lock
 * step here, it was removed once it became clear the club never actually
 * uses it, members who are done are removed at the member level, not
 * frozen range by range.
 *
 * Completed and Expired stay two independent badges rather than one
 * merged status, because they answer different questions. Completed
 * means no more free pours are owed, full stop. Expired means the one
 * year member pricing window has lapsed, which only matters for whether
 * they can still buy at member price, a decision made at the bar, not in
 * this app. A member can be Completed and still well within their year,
 * in which case there is nothing to renew yet, Renew only ever appears
 * once both are true at once.
 */
export function MembershipCard({ membership, whiskeySlotsByNumber, onToggle, onRenew, onOpenMember, showMemberName }) {
  const [showCompletionNotice, setShowCompletionNotice] = useState(false)
  const [pendingUncheckSlot, setPendingUncheckSlot] = useState(null)
  const [renewing, setRenewing] = useState(false)
  const [renewPaymentMethod, setRenewPaymentMethod] = useState(PAYMENT_METHODS[0].value)
  const complete = isMembershipComplete(membership)
  const expired = isMembershipExpired(membership)
  const canRenew = complete && expired
  const [collapsed, setCollapsed] = useState(complete)

  const sortedRedemptions = [...membership.redemptions].sort((a, b) => a.slotNumber - b.slotNumber)
  const consumedCount = sortedRedemptions.filter((r) => r.consumed).length
  const pendingUncheckWhiskeyName = pendingUncheckSlot
    ? whiskeySlotsByNumber.get(pendingUncheckSlot)?.name || `whisky-${pendingUncheckSlot}`
    : null

  /**
   * Ticking a box stays a single tap, since it is the routine action
   * happening constantly during a shift and friction there just slows
   * staff down. Unticking is different, it undoes a pour that already
   * physically happened, so an accidental tap could make the system
   * think a whiskey is still owed when it was already given out. That
   * asymmetry is why only the uncheck direction goes through a prompt.
   */
  function handleToggle(slotNumber, nextConsumed) {
    if (complete) return
    if (!nextConsumed) {
      setPendingUncheckSlot(slotNumber)
      return
    }

    const isLastRemaining = consumedCount + 1 === sortedRedemptions.length
    onToggle(membership.id, slotNumber, true)
    if (isLastRemaining) {
      setShowCompletionNotice(true)
    }
  }

  function confirmUncheck() {
    onToggle(membership.id, pendingUncheckSlot, false)
    setPendingUncheckSlot(null)
  }

  /**
   * Clicking Renew from the header both expands the card and opens the
   * payment form in one tap, so the header button is a genuine shortcut
   * rather than something that still requires manually expanding first
   * to actually use.
   */
  function startRenewing(event) {
    event.stopPropagation()
    setCollapsed(false)
    setRenewing(true)
  }

  async function confirmRenewal() {
    await onRenew(membership.id, renewPaymentMethod)
    setRenewing(false)
  }

  return (
    <div className={`membership-card ${complete ? 'membership-card-complete' : ''}`}>
      <div
        className="membership-card-header membership-card-toggle"
        onClick={() => setCollapsed(!collapsed)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setCollapsed(!collapsed)}
      >
        <div>
          {showMemberName && onOpenMember && (
            <button
              className="membership-member-name membership-member-link"
              onClick={(e) => {
                e.stopPropagation()
                onOpenMember(membership.memberId)
              }}
            >
              {membership.memberName}
            </button>
          )}
          {showMemberName && !onOpenMember && (
            <span className="membership-member-name">{membership.memberName}</span>
          )}
          <span className="range-label">Range {membership.rangeId}</span>
          <span className="activation-date">Joined {formatDateDMY(membership.activationDate)}</span>
          <span className="consumed-count">{consumedCount}/{sortedRedemptions.length}</span>
        </div>
        <div className="membership-badges">
          {complete && <span className="badge badge-complete">Completed</span>}
          {expired && <span className="badge badge-expired">Expired</span>}
          {canRenew && (
            <button className="btn btn-primary btn-small" onClick={startRenewing}>
              Renew subscription
            </button>
          )}
          <span className="collapse-caret">{collapsed ? '+' : '-'}</span>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="slot-grid">
            {sortedRedemptions.map((slot) => (
              <label key={slot.slotNumber} className={`slot-checkbox ${slot.consumed ? 'slot-checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={slot.consumed}
                  disabled={complete}
                  onChange={(e) => handleToggle(slot.slotNumber, e.target.checked)}
                />
                <span className="slot-number">{slot.slotNumber}</span>
                <span className="slot-name">{whiskeySlotsByNumber.get(slot.slotNumber)?.name || `whisky-${slot.slotNumber}`}</span>
              </label>
            ))}
          </div>

          {renewing && (
            <div className="renew-form">
              <label>
                Payment method
                <select value={renewPaymentMethod} onChange={(e) => setRenewPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>
              <div className="form-actions">
                <button className="btn btn-secondary btn-small" onClick={() => setRenewing(false)}>Cancel</button>
                <button className="btn btn-primary btn-small" onClick={confirmRenewal}>Confirm renewal</button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingUncheckSlot)}
        title="Undo this redemption"
        message={`This marks whisky-${pendingUncheckSlot} (${pendingUncheckWhiskeyName}) as not yet redeemed. Only do this if it was ticked by mistake, not to give this member another free pour of the same whiskey.`}
        confirmLabel="Undo"
        onConfirm={confirmUncheck}
        onCancel={() => setPendingUncheckSlot(null)}
      />

      <ConfirmDialog
        open={showCompletionNotice}
        title="Last free whiskey redeemed"
        message={`This was the last free whiskey for this member in range ${membership.rangeId}. No more free redemptions are owed on this range. They can still buy whiskeys from this range at the bar as long as their membership has not expired.`}
        confirmLabel="OK"
        onConfirm={() => setShowCompletionNotice(false)}
        onCancel={() => setShowCompletionNotice(false)}
      />
    </div>
  )
}