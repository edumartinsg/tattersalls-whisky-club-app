import { useMemo, useState } from 'react'
import { useClubData } from '../context/DataContext'
import { listAllRanges, PAYMENT_METHODS, isTemporaryId, isValidMemberCode } from '../domain/clubRules'

/**
 * A code that matches an existing member reuses that member's record
 * instead of creating a second one, because the same person buying into a
 * new range next year is the normal case, not an edge case. Creating a
 * fresh member every time would fragment one person's history across
 * several ids.
 */
export function AddMemberScreen({ initialRangeId, onDone }) {
  const { state, enrollMemberInRange } = useClubData()
  const ranges = listAllRanges()

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [rangeId, setRangeId] = useState(initialRangeId || ranges[0].id)
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0].value)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const matchedMember = useMemo(() => {
    const normalisedCode = code.trim().toLowerCase()
    if (!normalisedCode) return null
    return state.members.find((m) => !isTemporaryId(m.id) && m.id.toLowerCase() === normalisedCode) || null
  }, [state.members, code])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!code.trim()) {
      setError('Enter the member code, it is used as their id.')
      return
    }
    if (!isValidMemberCode(code)) {
      setError('Code must be 1 to 2 letters followed by up to 3 numbers, like A213 or M1.')
      return
    }
    if (!name.trim() && !matchedMember) {
      setError('Enter the member name.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await enrollMemberInRange({
        name: matchedMember?.name || name.trim(),
        code: code.trim(),
        rangeId,
        paymentMethod,
      })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-screen">
      <h2>Add member</h2>
      <form onSubmit={handleSubmit} className="add-member-form-vertical">
        <label>
          Name
          <input
            value={matchedMember ? matchedMember.name : name}
            onChange={(e) => setName(e.target.value)}
            disabled={Boolean(matchedMember)}
            placeholder="Full name"
          />
        </label>

        <label>
          Code
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Member code" />
        </label>

        {matchedMember && (
          <p className="match-hint">
            Existing member found, {matchedMember.name}. This will add a new range to their account.
          </p>
        )}

        <label>
          Range
          <select value={rangeId} onChange={(e) => setRangeId(e.target.value)}>
            {ranges.map((r) => (
              <option key={r.id} value={r.id}>{r.id}</option>
            ))}
          </select>
        </label>

        <label>
          Payment method
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            {PAYMENT_METHODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onDone}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Adding...' : 'Add to range'}
          </button>
        </div>
      </form>
    </div>
  )
}