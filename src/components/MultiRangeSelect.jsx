import { useEffect, useRef, useState } from 'react'

/**
 * Looks and behaves like the plain selects sitting next to it in the
 * same form, closed by default, opens on tap, closes on an outside tap.
 * The only real difference is what is inside once it opens, a checkbox
 * at the end of each row instead of a single choice, since a native
 * select has no way to represent picking more than one option at once.
 */
export function MultiRangeSelect({ ranges, selected, onChange }) {
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

  function toggle(rangeId) {
    if (selected.includes(rangeId)) {
      onChange(selected.filter((r) => r !== rangeId))
    } else {
      onChange([...selected, rangeId])
    }
  }

  const summary =
    selected.length === 0
      ? 'Select ranges'
      : selected.length <= 3
        ? selected.join(', ')
        : `${selected.length} ranges selected`

  return (
    <div className="multi-range-select" ref={containerRef}>
      <button type="button" className="multi-range-trigger" onClick={() => setOpen(!open)}>
        <span>{summary}</span>
        <span className="multi-range-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="multi-range-dropdown">
          {ranges.length === 0 && <p className="multi-range-empty">No ranges left to select.</p>}
          {ranges.map((r) => (
            <label key={r.id} className={`multi-range-row ${selected.includes(r.id) ? 'multi-range-row-checked' : ''}`}>
              <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
              <span>{r.id}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}