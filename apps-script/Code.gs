/**
 * This file exists because the club needs shared storage across more than
 * one iPad without paying for hosting. Apps Script bound to a Google
 * Sheet is the only option that satisfies both constraints at once, since
 * the Sheet itself doubles as the human readable backup the club asked
 * for, and MailApp gives free email sending without a separate service.
 *
 * Every write funnels through doPost with an action name instead of using
 * separate endpoints, because a single Apps Script deployment only ever
 * exposes one URL for GET and one for POST.
 */

const SHEET_MEMBERS = 'Members'
const SHEET_MEMBERSHIPS = 'RangeMemberships'
const SHEET_REDEMPTIONS = 'Redemptions'
const SHEET_SLOTS = 'WhiskeySlots'
const MEMBER_CODE_PATTERN = /^[A-Za-z]{1,2}[0-9]{1,3}$/

// Filled in once during setup, see README.md. Left empty here so a forgotten
// setup step fails loudly instead of silently emailing the wrong inbox.
const NOTIFICATION_EMAIL = 'dine@tattersallsclub.org'

function doGet(request) {
  const action = request.parameter.action
  if (action === 'getState') {
    return jsonResponse(getState())
  }
  return jsonResponse({ error: 'Unknown action' })
}

function doPost(request) {
  const body = JSON.parse(request.postData.contents)
  const handlers = {
    upsertMember: upsertMember,
    updateMemberIdentity: updateMemberIdentity,
    mergeMember: mergeMember,
    bulkRenameMembers: bulkRenameMembers,
    upsertWhiskeySlot: upsertWhiskeySlot,
    enrollMemberInRange: enrollMemberInRange,
    upsertRedemption: upsertRedemption,
    renewMembership: renewMembership,
    bulkSeed: bulkSeed,
    bulkUpdateWhiskeyNames: bulkUpdateWhiskeyNames,
  }
  const handler = handlers[body.action]
  if (!handler) {
    return jsonResponse({ error: 'Unknown action' })
  }
  /**
   * A handler throwing (a real validation rejection, like a missing
   * code, or the target row not existing) used to crash the whole
   * request, and an uncaught crash here does not come back as our clean
   * JSON, Apps Script replaces it with its own error page. The frontend
   * would then fail to parse that as JSON and, unable to tell a real
   * rejection apart from the network being down, silently queue it as
   * if it were offline. Catching it here and always returning valid
   * JSON, error included, is what lets the frontend surface the actual
   * reason instead of hiding it behind a wrong "will retry later".
   */
  try {
    const result = handler(body.payload)
    return jsonResponse(result)
  } catch (error) {
    return jsonResponse({ error: error.message })
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON)
}

function getSheet(name) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = spreadsheet.getSheetByName(name)
  if (!sheet) {
    throw new Error(`Sheet "${name}" not found. Run setupSheets() once before first use.`)
  }
  return sheet
}

function readRows(sheet) {
  const values = sheet.getDataRange().getValues()
  const headers = values[0]
  return values.slice(1).map((row) => {
    const record = {}
    headers.forEach((header, index) => {
      record[header] = row[index]
    })
    return record
  })
}

function findRowIndexByValue(sheet, columnName, value) {
  const values = sheet.getDataRange().getValues()
  const headers = values[0]
  const columnIndex = headers.indexOf(columnName)
  for (let i = 1; i < values.length; i++) {
    if (values[i][columnIndex] === value) {
      return i + 1 // Sheet rows are one indexed and row 1 is the header.
    }
  }
  return -1
}

/**
 * Reshapes four flat sheets into the nested structure the frontend works
 * with, so the frontend never needs to know redemptions live in a sheet
 * separate from the membership they belong to.
 *
 * There is no separate code field here, the member's id is their code.
 * Someone with no real code yet has an id following the ID-N pattern
 * instead, which the frontend recognises and displays as "no code on
 * file" rather than showing the placeholder itself.
 */
function getState() {
  const members = readRows(getSheet(SHEET_MEMBERS)).map((row) => ({
    id: row.id,
    name: row.name,
    active: row.active === true || row.active === 'TRUE',
  }))

  const redemptionsByMembership = {}
  for (const row of readRows(getSheet(SHEET_REDEMPTIONS))) {
    if (!redemptionsByMembership[row.membershipId]) {
      redemptionsByMembership[row.membershipId] = []
    }
    redemptionsByMembership[row.membershipId].push({
      slotNumber: Number(row.slotNumber),
      consumed: row.consumed === true || row.consumed === 'TRUE',
    })
  }

  const rangeMemberships = readRows(getSheet(SHEET_MEMBERSHIPS)).map((row) => ({
    id: row.id,
    memberId: row.memberId,
    rangeId: row.rangeId,
    activationDate: row.activationDate,
    paymentMethod: row.paymentMethod || null,
    locked: row.locked === true || row.locked === 'TRUE',
    redemptions: redemptionsByMembership[row.id] || [],
  }))

  const whiskeySlots = readRows(getSheet(SHEET_SLOTS)).map((row) => ({
    number: Number(row.number),
    name: row.name || null,
  }))

  return { members, whiskeySlots, rangeMemberships }
}

function upsertMember(member) {
  const sheet = getSheet(SHEET_MEMBERS)
  const rowIndex = findRowIndexByValue(sheet, 'id', member.id)
  const rowValues = [member.id, member.name, Boolean(member.active)]
  if (rowIndex === -1) {
    sheet.appendRow(rowValues)
  } else {
    sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues])
  }
  return { ok: true }
}

/**
 * Renaming a member is not a plain field edit, because the member's id is
 * their code, there is no separate code column at all. Changing it means
 * every membership row that points at the old id would silently stop
 * matching that member unless it is rewritten too. Doing both updates
 * inside one function, rather than two separate calls from the frontend,
 * is what stops a membership from ever being left pointing at an id
 * nobody has anymore.
 */
function updateMemberIdentity(payload) {
  const membersSheet = getSheet(SHEET_MEMBERS)
  const membershipsSheet = getSheet(SHEET_MEMBERSHIPS)

  const currentId = payload.currentId
  const newCode = payload.newCode
  const newName = payload.newName

  if (!newCode) {
    throw new Error('A member code is required.')
  }
  const isTemporaryPlaceholder = /^ID-\d+$/.test(newCode)
  if (!isTemporaryPlaceholder && !MEMBER_CODE_PATTERN.test(newCode)) {
    throw new Error('Code must be 1 to 2 letters followed by up to 3 numbers, like A213 or M1.')
  }

  const currentRowIndex = findRowIndexByValue(membersSheet, 'id', currentId)
  if (currentRowIndex === -1) {
    throw new Error('Member not found.')
  }

  const idIsChanging = newCode !== currentId
  if (idIsChanging) {
    const collisionRowIndex = findRowIndexByValue(membersSheet, 'id', newCode)
    if (collisionRowIndex !== -1) {
      throw new Error(`Code ${newCode} already belongs to another member.`)
    }
  }

  membersSheet.getRange(currentRowIndex, 1, 1, 2).setValues([[newCode, newName]])

  if (idIsChanging) {
    const values = membershipsSheet.getDataRange().getValues()
    const memberIdCol = values[0].indexOf('memberId')
    for (let i = 1; i < values.length; i++) {
      if (values[i][memberIdCol] === currentId) {
        membershipsSheet.getRange(i + 1, memberIdCol + 1).setValue(newCode)
      }
    }
  }

  return { ok: true, oldId: currentId, newId: newCode }
}

/**
 * A one time cleanup tool for exactly the situation that comes up when
 * the same person exists twice under two different ids, usually because
 * a nickname change split their history into two records before the
 * code was known for both. This moves every membership from the old id
 * onto the surviving id and deletes the old member row entirely, rather
 * than leaving a hollow duplicate behind that could confuse a future
 * search.
 */
function mergeMember(payload) {
  const membersSheet = getSheet(SHEET_MEMBERS)
  const membershipsSheet = getSheet(SHEET_MEMBERSHIPS)

  const fromRowIndex = findRowIndexByValue(membersSheet, 'id', payload.fromId)
  const toRowIndex = findRowIndexByValue(membersSheet, 'id', payload.toId)
  if (fromRowIndex === -1 || toRowIndex === -1) {
    throw new Error('Both members must exist to merge them.')
  }

  membersSheet.getRange(toRowIndex, 1, 1, 3).setValues([[payload.toId, payload.name, payload.active]])

  const values = membershipsSheet.getDataRange().getValues()
  const memberIdCol = values[0].indexOf('memberId')
  for (let i = 1; i < values.length; i++) {
    if (values[i][memberIdCol] === payload.fromId) {
      membershipsSheet.getRange(i + 1, memberIdCol + 1).setValue(payload.toId)
    }
  }

  membersSheet.deleteRow(fromRowIndex)

  return { ok: true }
}

/**
 * Renames a batch of members in one pass rather than one call per person,
 * since a naming convention change (like standardising to first name
 * before last name) touches every row in the sheet at once, and doing
 * that as dozens of separate network calls would be slow and would leave
 * the sheet half converted if connectivity dropped partway through.
 */
function bulkRenameMembers(renames) {
  const sheet = getSheet(SHEET_MEMBERS)
  const values = sheet.getDataRange().getValues()
  const idCol = values[0].indexOf('id')
  const nameCol = values[0].indexOf('name')
  const renameById = {}
  renames.forEach((r) => { renameById[r.id] = r.name })

  for (let i = 1; i < values.length; i++) {
    const id = values[i][idCol]
    if (Object.prototype.hasOwnProperty.call(renameById, id)) {
      sheet.getRange(i + 1, nameCol + 1).setValue(renameById[id])
    }
  }

  return { ok: true, renamed: renames.length }
}

function upsertWhiskeySlot(slot) {
  const sheet = getSheet(SHEET_SLOTS)
  const rowIndex = findRowIndexByValue(sheet, 'number', slot.number)
  const rowValues = [slot.number, slot.name || '']
  if (rowIndex === -1) {
    sheet.appendRow(rowValues)
  } else {
    sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues])
  }
  return { ok: true }
}

/**
 * A redemption is uniquely identified by membership and slot number
 * together, since the same membership always has exactly ten redemption
 * rows created once, at enrollment, and never re-created afterwards.
 */
function upsertRedemption(redemption) {
  const sheet = getSheet(SHEET_REDEMPTIONS)
  const values = sheet.getDataRange().getValues()
  const headers = values[0]
  const membershipCol = headers.indexOf('membershipId')
  const slotCol = headers.indexOf('slotNumber')

  let rowIndex = -1
  for (let i = 1; i < values.length; i++) {
    if (
      values[i][membershipCol] === redemption.membershipId &&
      Number(values[i][slotCol]) === Number(redemption.slotNumber)
    ) {
      rowIndex = i + 1
      break
    }
  }
  if (rowIndex === -1) {
    throw new Error('Redemption row not found, the membership may not have been enrolled correctly.')
  }
  const consumedCol = headers.indexOf('consumed') + 1
  sheet.getRange(rowIndex, consumedCol).setValue(Boolean(redemption.consumed))
  return { ok: true }
}

/**
 * Renewing resets the one year validity clock without touching what has
 * already been redeemed, since renewal is about keeping member pricing
 * on future pours, not about re-issuing whiskeys already given out for
 * free. The notification email mirrors the enrollment one so the same
 * inbox stays the single log of every payment event, new sign ups and
 * renewals alike, rather than splitting that record across two places.
 */
function renewMembership(payload) {
  const sheet = getSheet(SHEET_MEMBERSHIPS)
  const rowIndex = findRowIndexByValue(sheet, 'id', payload.membershipId)
  if (rowIndex === -1) {
    throw new Error('Membership not found')
  }
  const headers = sheet.getDataRange().getValues()[0]
  const activationDateCol = headers.indexOf('activationDate') + 1
  const paymentMethodCol = headers.indexOf('paymentMethod') + 1
  const rangeIdCol = headers.indexOf('rangeId') + 1
  const memberIdCol = headers.indexOf('memberId') + 1

  const row = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0]
  const rangeId = row[rangeIdCol - 1]
  const memberId = row[memberIdCol - 1]
  const renewalDate = new Date().toISOString().slice(0, 10)

  sheet.getRange(rowIndex, activationDateCol).setValue(renewalDate)
  sheet.getRange(rowIndex, paymentMethodCol).setValue(payload.paymentMethod)

  const membersSheet = getSheet(SHEET_MEMBERS)
  const memberRowIndex = findRowIndexByValue(membersSheet, 'id', memberId)
  const memberName = memberRowIndex === -1 ? memberId : membersSheet.getRange(memberRowIndex, 2).getValue()

  sendRenewalEmail({ name: memberName, code: memberId, rangeId, paymentMethod: payload.paymentMethod, renewalDate })

  return { ok: true, activationDate: renewalDate }
}

/**
 * Finding or creating the member, creating the membership, writing its
 * ten redemption rows, and sending the notification email all happen in
 * one call, because the club needs a single log entry per enrollment, not
 * a partial record if the email step were ever separated from the write.
 *
 * The member's code is used directly as their id, rather than generating
 * a separate internal id, because the code is what staff already use to
 * look someone up at the bar. Keeping two different identifiers for the
 * same person is what causes duplicate records when a code gets typed
 * into one screen but not linked to the id used on another.
 */
function enrollMemberInRange(enrollment) {
  if (!enrollment.code) {
    throw new Error('A member code is required to enroll someone in a range.')
  }
  if (!MEMBER_CODE_PATTERN.test(enrollment.code)) {
    throw new Error('Code must be 1 to 2 letters followed by up to 3 numbers, like A213 or M1.')
  }

  const membersSheet = getSheet(SHEET_MEMBERS)
  const membershipsSheet = getSheet(SHEET_MEMBERSHIPS)
  const redemptionsSheet = getSheet(SHEET_REDEMPTIONS)

  const memberId = enrollment.code
  const memberAlreadyExists = findRowIndexByValue(membersSheet, 'id', memberId) !== -1
  if (!memberAlreadyExists) {
    membersSheet.appendRow([memberId, enrollment.name, true])
  }

  const membershipId = `rm_${new Date().getTime()}`
  membershipsSheet.appendRow([
    membershipId,
    memberId,
    enrollment.rangeId,
    enrollment.activationDate,
    enrollment.paymentMethod,
    false,
  ])
  // appendRow alone is not enough, a fresh range like "21-30" can still be
  // auto-detected as a date the instant it lands in the sheet. Forcing the
  // format on this exact cell, right after writing it, closes that gap.
  const newRow = membershipsSheet.getLastRow()
  membershipsSheet.getRange(newRow, 3).setNumberFormat('@').setValue(enrollment.rangeId)

  const [startSlot, endSlot] = enrollment.rangeId.split('-').map(Number)
  for (let slotNumber = startSlot; slotNumber <= endSlot; slotNumber++) {
    redemptionsSheet.appendRow([membershipId, slotNumber, false])
  }

  sendEnrollmentEmail(enrollment)

  return { ok: true, memberId, membershipId }
}

/**
 * A payment method of "none" means exactly that, no payment happened,
 * usually a member being re-added after being removed by mistake. The
 * notification email exists to log real payment events, sending it here
 * would create a false record of a charge that never occurred.
 */
function sendEnrollmentEmail(enrollment) {
  if (!NOTIFICATION_EMAIL || enrollment.paymentMethod === 'none') {
    return
  }
  const subject = 'New member added to the whisky club'
  const body = `New member: "${enrollment.name}", code: ${enrollment.code || 'no code'}, was added to range ${enrollment.rangeId}, payment made via ${enrollment.paymentMethod}, date ${enrollment.activationDate}.`
  MailApp.sendEmail(NOTIFICATION_EMAIL, subject, body)
}

function sendRenewalEmail(renewal) {
  if (!NOTIFICATION_EMAIL || renewal.paymentMethod === 'none') {
    return
  }
  const subject = 'Whisky club membership renewed'
  const body = `Membership renewed: "${renewal.name}", code: ${renewal.code}, range ${renewal.rangeId}, payment made via ${renewal.paymentMethod}, renewal date ${renewal.renewalDate}.`
  MailApp.sendEmail(NOTIFICATION_EMAIL, subject, body)
}

/**
 * Loads the historical data produced by data-migration/parse_legacy_excel.py
 * in one pass instead of one row per network call, since a few thousand
 * redemption rows sent individually would be slow and would leave the
 * sheet in a half imported state if connectivity dropped partway through.
 */
function bulkSeed(seedData) {
  const membersSheet = getSheet(SHEET_MEMBERS)
  const membershipsSheet = getSheet(SHEET_MEMBERSHIPS)
  const redemptionsSheet = getSheet(SHEET_REDEMPTIONS)
  const slotsSheet = getSheet(SHEET_SLOTS)

  const memberRows = seedData.members.map((m) => [m.id, m.name, Boolean(m.active)])
  if (memberRows.length > 0) {
    membersSheet.getRange(2, 1, memberRows.length, 3).setValues(memberRows)
  }

  const membershipRows = []
  const redemptionRows = []
  for (const membership of seedData.rangeMemberships) {
    membershipRows.push([
      membership.id,
      membership.memberId,
      membership.rangeId,
      membership.activationDate,
      membership.paymentMethod || '',
      Boolean(membership.locked),
    ])
    for (const redemption of membership.redemptions) {
      redemptionRows.push([membership.id, redemption.slotNumber, Boolean(redemption.consumed)])
    }
  }
  if (membershipRows.length > 0) {
    // Format must be forced to text before the values are written, not
    // after. Once Sheets has already converted "21-30" into a date on
    // write, changing the format afterward only changes how that date is
    // displayed, it does not recover the original text.
    membershipsSheet.getRange(2, 3, membershipRows.length, 1).setNumberFormat('@')
    membershipsSheet.getRange(2, 1, membershipRows.length, 6).setValues(membershipRows)
  }
  if (redemptionRows.length > 0) {
    redemptionsSheet.getRange(2, 1, redemptionRows.length, 3).setValues(redemptionRows)
  }

  const slotRows = seedData.whiskeySlots.map((s) => [s.number, s.name || ''])
  slotsSheet.getRange(2, 1, slotRows.length, 2).setValues(slotRows)

  return { ok: true, members: memberRows.length, memberships: membershipRows.length, redemptions: redemptionRows.length }
}

/**
 * Updates only the whiskey catalog, never members, memberships, or
 * redemptions. Kept as its own action instead of folded into bulkSeed
 * because this needs to run safely at any point after real club data
 * already exists, not just during the one time historical import.
 */
function bulkUpdateWhiskeyNames(slots) {
  const sheet = getSheet(SHEET_SLOTS)
  const rows = slots
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((s) => [s.number, s.name || ''])
  sheet.getRange(2, 1, rows.length, 2).setValues(rows)
  return { ok: true, updated: rows.length }
}

/**
 * Run this once, manually, from the Apps Script editor, before the first
 * deployment. It only creates the sheets and headers, it never touches
 * data, so it is safe to run again later if a sheet is accidentally deleted.
 *
 * The rangeId column is forced to plain text because values like "1-10"
 * or "11-20" look enough like a month and day that Google Sheets silently
 * reinterprets them as an actual date the moment they are typed or
 * written, turning "21-30" into a timestamp instead of a range. Locking
 * the column format to text is what stops that from ever happening again.
 */
function setupSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()

  const definitions = {
    [SHEET_MEMBERS]: ['id', 'name', 'active'],
    [SHEET_MEMBERSHIPS]: ['id', 'memberId', 'rangeId', 'activationDate', 'paymentMethod', 'locked'],
    [SHEET_REDEMPTIONS]: ['membershipId', 'slotNumber', 'consumed'],
    [SHEET_SLOTS]: ['number', 'name'],
  }

  for (const [name, headers] of Object.entries(definitions)) {
    let sheet = spreadsheet.getSheetByName(name)
    if (!sheet) {
      sheet = spreadsheet.insertSheet(name)
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
  }

  const membershipsSheet = spreadsheet.getSheetByName(SHEET_MEMBERSHIPS)
  membershipsSheet.getRange('C:C').setNumberFormat('@')
}

/**
 * Read only, changes nothing. A standing diagnostic, not a one time
 * script, worth keeping around for whenever a manual Sheet edit is
 * suspected of having broken the link between a member and their
 * memberships, rather than assuming either way.
 */
function checkForOrphanedMemberships() {
  const membersSheet = getSheet(SHEET_MEMBERS)
  const membershipsSheet = getSheet(SHEET_MEMBERSHIPS)

  const memberIds = new Set(
    membersSheet.getDataRange().getValues().slice(1).map((row) => row[0]).filter(Boolean)
  )

  const membershipsValues = membershipsSheet.getDataRange().getValues()
  const memberIdCol = membershipsValues[0].indexOf('memberId')
  const rangeIdCol = membershipsValues[0].indexOf('rangeId')

  const orphaned = []
  for (let i = 1; i < membershipsValues.length; i++) {
    const memberId = membershipsValues[i][memberIdCol]
    if (memberId && !memberIds.has(memberId)) {
      orphaned.push({ row: i + 1, memberId, rangeId: membershipsValues[i][rangeIdCol] })
    }
  }

  Logger.log(`Checked ${membershipsValues.length - 1} membership rows against ${memberIds.size} members.`)
  Logger.log(`Found ${orphaned.length} orphaned membership rows.`)
  orphaned.forEach((o) => Logger.log(JSON.stringify(o)))
}

/**
 * Read only, changes nothing. Every membership always has exactly ten
 * redemption rows, created once at enrollment and never added to again,
 * so any membership with more or fewer than ten is a sign something got
 * written twice (or partially), not a legitimate state.
 */
function checkForDuplicateRedemptions() {
  const redemptionsSheet = getSheet(SHEET_REDEMPTIONS)
  const values = redemptionsSheet.getDataRange().getValues()
  const membershipIdCol = values[0].indexOf('membershipId')

  const countsByMembershipId = {}
  for (let i = 1; i < values.length; i++) {
    const id = values[i][membershipIdCol]
    countsByMembershipId[id] = (countsByMembershipId[id] || 0) + 1
  }

  const problems = Object.keys(countsByMembershipId).filter((id) => countsByMembershipId[id] !== 10)
  Logger.log(`Checked ${Object.keys(countsByMembershipId).length} memberships' redemption counts.`)
  Logger.log(`Found ${problems.length} with a count other than 10.`)
  problems.forEach((id) => Logger.log(`${id}: ${countsByMembershipId[id]} rows`))
}

/**
 * Read only, changes nothing. One member should never hold two separate
 * membership rows for the exact same range, that would mean they were
 * enrolled into it twice.
 */
function checkForDuplicateMemberships() {
  const membershipsSheet = getSheet(SHEET_MEMBERSHIPS)
  const values = membershipsSheet.getDataRange().getValues()
  const memberIdCol = values[0].indexOf('memberId')
  const rangeIdCol = values[0].indexOf('rangeId')

  const seen = {}
  const duplicates = []
  for (let i = 1; i < values.length; i++) {
    const key = `${values[i][memberIdCol]}::${values[i][rangeIdCol]}`
    if (seen[key]) {
      duplicates.push({ row: i + 1, memberId: values[i][memberIdCol], rangeId: values[i][rangeIdCol] })
    }
    seen[key] = true
  }

  Logger.log(`Checked ${values.length - 1} membership rows.`)
  Logger.log(`Found ${duplicates.length} duplicate member/range pairs.`)
  duplicates.forEach((d) => Logger.log(JSON.stringify(d)))
}