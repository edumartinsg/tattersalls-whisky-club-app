import { useState } from 'react'

const SESSION_KEY = 'whiskyClub.pinVerified'

/**
 * GitHub Pages cannot host a private site on the free tier, so anyone with
 * the URL can reach this app. This gate deters casual access to member
 * data, it is not real security, since the PIN ships inside the client
 * bundle and a determined visitor could read it there. Real access
 * control would need paid hosting, which is out of scope by request.
 */
export function PinGate({ correctPin, children }) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === 'true')
  const [attempt, setAttempt] = useState('')
  const [showError, setShowError] = useState(false)

  if (unlocked) {
    return children
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (attempt === correctPin) {
      sessionStorage.setItem(SESSION_KEY, 'true')
      setUnlocked(true)
    } else {
      setShowError(true)
    }
  }

  return (
    <div className="pin-gate">
      <form onSubmit={handleSubmit} className="pin-form">
        <h1>Whisky Club</h1>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={attempt}
          onChange={(e) => {
            setAttempt(e.target.value)
            setShowError(false)
          }}
          placeholder="PIN"
        />
        <button type="submit" className="btn btn-primary">Enter</button>
        {showError && <p className="pin-error">Incorrect PIN</p>}
      </form>
    </div>
  )
}
