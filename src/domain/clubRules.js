/**
 * Ranges replaced the old calendar season concept because the club's real
 * unit of sale is a block of ten whiskeys, not a year. A member can buy
 * into any block at any time, and the numbering wraps from 100 back to 1,
 * so a range is defined purely by its slot numbers, never by a date.
 */

export const RANGE_SIZE = 10
export const TOTAL_SLOTS = 100
export const MEMBERSHIP_VALIDITY_DAYS = 365

/**
 * There are always exactly ten ranges covering the full 1 to 100 catalog.
 * They are generated instead of stored, because storing them would let
 * them drift out of sync with the fixed size the club described.
 */
export function listAllRanges() {
  const ranges = []
  for (let start = 1; start <= TOTAL_SLOTS; start += RANGE_SIZE) {
    const end = start + RANGE_SIZE - 1
    ranges.push({ id: `${start}-${end}`, startSlot: start, endSlot: end })
  }
  return ranges
}

export function getRangeById(rangeId) {
  return listAllRanges().find((r) => r.id === rangeId)
}

/**
 * Finds which range a single slot number belongs to. Used by whiskey
 * search on the home page, since staff search by whiskey, not by range id.
 */
export function findRangeForSlot(slotNumber) {
  return listAllRanges().find((r) => slotNumber >= r.startSlot && slotNumber <= r.endSlot)
}

/**
 * A membership expires exactly one year after its activation date. This
 * only affects whether the member still gets bar side member pricing
 * going forward, which this app does not control. It never blocks ticking
 * a whiskey the member had not yet claimed, because the club confirmed
 * that an unclaimed free whiskey stays honoured regardless of expiration.
 */
export function isMembershipExpired(rangeMembership, today = new Date()) {
  const activationDate = new Date(rangeMembership.activationDate)
  const expiryDate = new Date(activationDate)
  expiryDate.setDate(expiryDate.getDate() + MEMBERSHIP_VALIDITY_DAYS)
  return today > expiryDate
}

export function isMembershipComplete(rangeMembership) {
  return rangeMembership.redemptions.length > 0 && rangeMembership.redemptions.every((r) => r.consumed)
}

/**
 * Google Sheets silently converts a plain date string into an actual date
 * value once it is stored, so the backend can hand back either a clean
 * "2024-02-01" string or a full ISO timestamp with a time zone shift,
 * depending on how that particular cell happened to be typed. Formatting
 * is normalised here, at the one place every screen displays a date,
 * rather than trusting the shape of whatever the Sheet returns.
 */
export function formatDateDMY(dateValue) {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) {
    return dateValue
  }
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = String(date.getUTCFullYear()).slice(-2)
  return `${day}/${month}/${year}`
}

/**
 * Ten fresh, unclaimed redemption rows for a brand new membership. Kept in
 * one place so the shape of a redemption row is defined exactly once.
 */
export function buildRedemptionsForRange(rangeId) {
  const range = getRangeById(rangeId)
  const redemptions = []
  for (let slotNumber = range.startSlot; slotNumber <= range.endSlot; slotNumber++) {
    redemptions.push({ slotNumber, consumed: false })
  }
  return redemptions
}

/**
 * The memberships worth showing on a member's own page are the ones still
 * needing attention, either because they are not yet locked or because
 * they still have unclaimed slots. A fully consumed and locked membership
 * is finished business and would only clutter the view.
 */
export function listOpenMemberships(memberId, rangeMemberships) {
  return rangeMemberships
    .filter((m) => m.memberId === memberId)
    .filter((m) => !m.locked || !isMembershipComplete(m))
    .sort((a, b) => a.rangeId.localeCompare(b.rangeId))
}

/**
 * Used by the dashboard style summary on the ranges list, so staff can see
 * at a glance which range blocks still have outstanding pours without
 * opening every one of them.
 */
export function countOpenSlotsInRange(rangeId, rangeMemberships) {
  return rangeMemberships
    .filter((m) => m.rangeId === rangeId)
    .reduce((total, m) => total + m.redemptions.filter((r) => !r.consumed).length, 0)
}
