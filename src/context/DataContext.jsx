import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { buildRedemptionsForRange } from '../domain/clubRules'

const DataContext = createContext(null)

const EMPTY_STATE = { members: [], whiskeySlots: [], rangeMemberships: [] }

/**
 * State lives here instead of inside individual screens because the same
 * membership can be visible from more than one screen at once, for
 * example a range's table and a member's own detail page. A single shared
 * tree keeps both in sync without either screen refetching.
 */
export function DataProvider({ repository, children }) {
  const [state, setState] = useState(EMPTY_STATE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [servedFromCache, setServedFromCache] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const freshState = await repository.loadState()
      setServedFromCache(Boolean(freshState._servedFromCache))
      setState(freshState)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [repository])

  useEffect(() => {
    reload()
  }, [reload])

  /**
   * The checkbox updates in memory immediately, before the network call
   * resolves, because someone standing at the bar needs to see the tick
   * happen instantly. Waiting for a round trip first would make the app
   * feel broken on the exact slow wifi it needs to tolerate.
   */
  const toggleRedemption = useCallback(async (membershipId, slotNumber, consumed) => {
    setState((prev) => ({
      ...prev,
      rangeMemberships: prev.rangeMemberships.map((m) =>
        m.id !== membershipId
          ? m
          : {
              ...m,
              redemptions: m.redemptions.map((r) =>
                r.slotNumber === slotNumber ? { ...r, consumed } : r
              ),
            }
      ),
    }))
    await repository.saveRedemption({ membershipId, slotNumber, consumed })
  }, [repository])

  /**
   * The activation date moves forward, everything already redeemed stays
   * exactly as it was, since renewal is only ever about buying more from
   * this range going forward, never about re-issuing free pours.
   */
  const renewMembership = useCallback(async (membershipId, paymentMethod) => {
    const renewalDate = new Date().toISOString().slice(0, 10)
    setState((prev) => ({
      ...prev,
      rangeMemberships: prev.rangeMemberships.map((m) =>
        m.id === membershipId ? { ...m, activationDate: renewalDate, paymentMethod } : m
      ),
    }))
    await repository.renewMembership({ membershipId, paymentMethod })
  }, [repository])

  /**
   * Removing a member only ever flips the active flag. The club needs
   * their redemption history to stay visible in case they rejoin, so
   * nothing about a member is ever hard deleted from this screen.
   */
  const setMemberActive = useCallback(async (memberId, active) => {
    setState((prev) => ({
      ...prev,
      members: prev.members.map((m) => (m.id === memberId ? { ...m, active } : m)),
    }))
    const member = state.members.find((m) => m.id === memberId)
    if (member) {
      await repository.saveMember({ ...member, active })
    }
  }, [repository, state.members])

  const renameWhiskeySlot = useCallback(async (slotNumber, name) => {
    setState((prev) => ({
      ...prev,
      whiskeySlots: prev.whiskeySlots.map((s) => (s.number === slotNumber ? { ...s, name } : s)),
    }))
    await repository.saveWhiskeySlot({ number: slotNumber, name })
  }, [repository])

  /**
   * The member's code is their id, so editing the code is really a rename
   * of that id everywhere it appears, not a plain field update. Every
   * membership referencing the old id is rewritten in the same pass so
   * the member's history never ends up split across two ids after a
   * simple typo correction. A collision is checked locally first so the
   * person editing sees the problem immediately, without waiting on a
   * round trip only to have the backend reject it.
   */
  const updateMemberIdentity = useCallback(async (currentId, newName, newCode) => {
    const collidesWithSomeoneElse = state.members.some((m) => m.id === newCode && m.id !== currentId)
    if (collidesWithSomeoneElse) {
      throw new Error(`Code ${newCode} already belongs to another member.`)
    }

    setState((prev) => ({
      ...prev,
      members: prev.members.map((m) =>
        m.id === currentId ? { ...m, id: newCode, name: newName, code: newCode } : m
      ),
      rangeMemberships: prev.rangeMemberships.map((rm) =>
        rm.memberId === currentId ? { ...rm, memberId: newCode } : rm
      ),
    }))

    return repository.updateMemberIdentity({ currentId, newName, newCode })
  }, [repository, state.members])

  /**
   * Enrollment covers three things at once (find or create the member,
   * create the membership with its ten redemption rows, and send the
   * notification email) because the backend needs all three to happen in
   * a single request, not as three separate round trips that could
   * partially fail.
   */
  const enrollMemberInRange = useCallback(async ({ name, code, rangeId, paymentMethod }) => {
    const activationDate = new Date().toISOString().slice(0, 10)
    const result = await repository.enrollMemberInRange({
      name,
      code,
      rangeId,
      paymentMethod,
      activationDate,
    })

    if (result.queued) {
      /**
       * The write is safely queued on this device for the next successful
       * sync, but reloading right now would only show the last state the
       * backend actually confirmed, making the enrollment the staff member
       * just entered seem to vanish. Adding it to local state directly
       * keeps what they see on screen honest about what they just did,
       * while the queued write still catches up with the Sheet later.
       * The member's own code is used as the id here too, matching what
       * the backend will use once the write actually lands.
       */
      const memberId = code
      const membershipId = `pending_${Date.now()}`
      setState((prev) => {
        const memberAlreadyPresent = prev.members.some((m) => m.id === memberId)
        return {
          ...prev,
          members: memberAlreadyPresent
            ? prev.members
            : [...prev.members, { id: memberId, name, code, active: true }],
          rangeMemberships: [
            ...prev.rangeMemberships,
            {
              id: membershipId,
              memberId,
              rangeId,
              activationDate,
              paymentMethod,
              locked: false,
              redemptions: buildRedemptionsForRange(rangeId),
            },
          ],
        }
      })
    } else {
      await reload()
    }

    return result
  }, [repository, reload])

  const value = useMemo(
    () => ({
      state,
      loading,
      error,
      servedFromCache,
      reload,
      toggleRedemption,
      renewMembership,
      setMemberActive,
      renameWhiskeySlot,
      enrollMemberInRange,
      updateMemberIdentity,
    }),
    [state, loading, error, servedFromCache, reload, toggleRedemption, renewMembership, setMemberActive, renameWhiskeySlot, enrollMemberInRange, updateMemberIdentity]
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useClubData() {
  const context = useContext(DataContext)
  if (!context) {
    throw new Error('useClubData must be called inside a DataProvider')
  }
  return context
}