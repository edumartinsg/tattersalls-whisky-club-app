import * as XLSX from 'xlsx'
import { useClubData } from '../context/DataContext'
import { isMembershipExpired, formatDateDMY } from '../domain/clubRules'

/**
 * The Google Sheet already serves as a live backup, but staff asked for a
 * copy they can personally save without needing to remember where the
 * Sheet lives. Building the file in the browser means this works even if
 * the Apps Script backend is briefly unreachable, since it only reads
 * whatever state is already loaded in memory.
 */
export function BackupButton() {
  const { state } = useClubData()

  function handleExport() {
    const whiskeySlotsByNumber = new Map(state.whiskeySlots.map((s) => [s.number, s]))
    const membersById = new Map(state.members.map((m) => [m.id, m]))

    const rows = []
    for (const membership of state.rangeMemberships) {
      const member = membersById.get(membership.memberId)
      for (const redemption of membership.redemptions) {
        rows.push({
          Member: member?.name || 'Unknown',
          Code: member?.code || '',
          Active: member?.active ? 'Yes' : 'No',
          Range: membership.rangeId,
          ActivationDate: formatDateDMY(membership.activationDate),
          PaymentMethod: membership.paymentMethod || '',
          Expired: isMembershipExpired(membership) ? 'Yes' : 'No',
          Locked: membership.locked ? 'Yes' : 'No',
          Slot: redemption.slotNumber,
          Whiskey: whiskeySlotsByNumber.get(redemption.slotNumber)?.name || `whisky-${redemption.slotNumber}`,
          Consumed: redemption.consumed ? 'Yes' : 'No',
        })
      }
    }

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Backup')

    const timestamp = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(workbook, `whisky_club_backup_${timestamp}.xlsx`)
  }

  return (
    <button className="btn btn-secondary" onClick={handleExport}>
      Export backup to Excel
    </button>
  )
}
