import { DataRepository } from './DataRepository'

/**
 * Apps Script web apps only expose GET and POST, so every write goes
 * through POST with an action field instead of separate REST endpoints.
 * That constraint comes from the free hosting choice, not from a design
 * preference, and it is isolated to this one file for exactly that reason.
 */
export class GoogleSheetsRepository extends DataRepository {
  constructor(webAppUrl) {
    super()
    if (!webAppUrl) {
      throw new Error('GoogleSheetsRepository needs the deployed Apps Script URL')
    }
    this.webAppUrl = webAppUrl
  }

  async loadState() {
    const response = await fetch(`${this.webAppUrl}?action=getState`)
    if (!response.ok) {
      throw new Error(`Failed to load state: ${response.status}`)
    }
    return response.json()
  }

  async saveMember(member) {
    return this._post('upsertMember', member)
  }

  async updateMemberIdentity(payload) {
    return this._post('updateMemberIdentity', payload)
  }

  async saveWhiskeySlot(slot) {
    return this._post('upsertWhiskeySlot', slot)
  }

  async enrollMemberInRange(enrollment) {
    return this._post('enrollMemberInRange', enrollment)
  }

  async saveRedemption(redemption) {
    return this._post('upsertRedemption', redemption)
  }

  async renewMembership(payload) {
    return this._post('renewMembership', payload)
  }

  /**
   * Apps Script web apps respond to POST with a redirect that most
   * browsers cannot follow under strict CORS preflight rules, so the
   * payload is sent as plain text and parsed as JSON server side instead
   * of using the "application/json" content type. This is a known
   * workaround, not an oversight.
   */
  async _post(action, payload) {
    const response = await fetch(this.webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload }),
    })
    if (!response.ok) {
      throw new Error(`Failed to save (${action}): ${response.status}`)
    }
    return response.json()
  }
}