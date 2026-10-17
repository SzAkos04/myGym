// What the cloud beside the Settings gear on Home shows (components/SyncCloud.jsx), from the same
// connection view the bar at the top uses (connectionView in components/ServerSync.jsx):
//   'ok'   synced: a quiet cloud with a green tick
//   'sync' a push or a pull has been out for a moment: the arrows turn
//   'wait' a change still waiting past the grace period, or a sign-in question still open
//   'off'  the server cannot be reached
//   'bad'  it answered with an error, or refuses this device
//   null   no server at all (a phone kept local, a guest): a choice, not a state to watch
// Pure, so the table is testable.
export function cloudState({ tone, status, busy = false, pendingWaited = false }) {
  if (!tone || tone === 'quiet') return null
  // Turning only over a connection that works: a retry against a server that is down would
  // otherwise swap the crossed-out cloud for the arrows at every poll.
  if (busy && (tone === 'ok' || tone === 'wait')) return 'sync'
  // A change in its short debounce is not news (the bar waits the same grace, SyncBanner.jsx).
  if (tone === 'wait') return status === 'pending' && !pendingWaited ? 'ok' : 'wait'
  return tone === 'ok' || tone === 'off' || tone === 'bad' ? tone : null
}

// "38 ms", for the panel's response time.
export const fmtPing = ms => Math.max(1, Math.round(ms)) + ' ms'
