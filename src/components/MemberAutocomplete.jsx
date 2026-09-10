import { useEffect, useRef, useState } from 'react'
import { isTemporaryId } from '../domain/clubRules'

/**
 * Matches by name or code as the person types, showing up to eight
 * results, closes on an outside tap same as the range picker. Picking a
 * result is the only way this component communicates back to the form,
 * it never writes into the name or code fields directly, the parent
 * decides what happens with the chosen member.
 */
export function MemberAutocomplete({ members, query, onQueryChange, onSelectMember }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    function handleOutsideTap(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideTap)
    document.addEventListener('touchstart', handleOutsideTap)
    return () => {
      document.removeEventListener('mousedown', handleOutsideTap)
      document.removeEventListener('touchstart', handleOutsideTap)
    }
  }, [])

  const normalisedQuery = query.trim().toLowerCase()
  const matches =
    normalisedQuery.length < 2
      ? []
      : members
          .filter(
            (m) =>
              m.name.toLowerCase().includes(normalisedQuery) ||
              (!isTemporaryId(m.id) && m.id.toLowerCase().includes(normalisedQuery))
          )
          .slice(0, 8)

  return (
    <div className="member-autocomplete" ref={containerRef}>
      <input
        value={query}
        onChange={(e) => {
          onQueryChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Full name"
      />
      {open && matches.length > 0 && (
        <div className="member-autocomplete-dropdown">
          {matches.map((m) => (
            <button
              type="button"
              key={m.id}
              className="member-autocomplete-row"
              onClick={() => {
                onSelectMember(m)
                setOpen(false)
              }}
            >
              <span>{m.name}</span>
              <span className="member-autocomplete-code">
                {!isTemporaryId(m.id) ? m.id : 'no code'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}