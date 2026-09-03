/**
 * The UI never talks to Google Sheets or local storage directly, it talks
 * to whatever implements this contract. That is what lets the storage
 * backend change later without touching a single screen.
 */
export class DataRepository {
  /**
   * The whole app boots from one snapshot rather than many small requests,
   * because the primary users are bar staff on a shift, not developers.
   * One loading state and one error state is easier to reason about than
   * juggling several independent fetches.
   */
  async loadState() {
    throw new Error('loadState must be implemented by the concrete repository')
  }

  /**
   * Members are archived, never deleted, since the club needs to keep a
   * departed member's history in case they rejoin later.
   */
  async saveMember(member) {
    throw new Error('saveMember must be implemented by the concrete repository')
  }

  /**
   * Kept separate from saveMember because it changes the member's id, not
   * just their name or code field. A plain field update and an id change
   * carry very different risk, one is reversible with another save, the
   * other rewrites every membership that points at that id.
   */
  async updateMemberIdentity(payload) {
    throw new Error('updateMemberIdentity must be implemented by the concrete repository')
  }

  async saveWhiskeySlot(slot) {
    throw new Error('saveWhiskeySlot must be implemented by the concrete repository')
  }

  /**
   * Enrolling is its own operation, separate from saving a plain member
   * record, because it creates both a membership and its ten redemption
   * rows together, and because it is the one action that triggers the
   * notification email the club asked for.
   */
  async enrollMemberInRange(enrollment) {
    throw new Error('enrollMemberInRange must be implemented by the concrete repository')
  }

  async saveRedemption(redemption) {
    throw new Error('saveRedemption must be implemented by the concrete repository')
  }

  async lockMembership(membershipId) {
    throw new Error('lockMembership must be implemented by the concrete repository')
  }
}
