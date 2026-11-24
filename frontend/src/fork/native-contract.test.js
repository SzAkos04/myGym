// @vitest-environment happy-dom
// The native iOS app (~/Projects/myGym-ios) writes into the same state document as this web app. It
// does not run this code: it writes what native-contract.json says, and its own tests check that it
// does. This test checks the other half: that the web, as it is now, writes the same thing and reads
// it back the same way. An upstream merge (scripts/sync-upstream.sh) that changes the shape of a
// finished workout or how one is read fails here, in CI, instead of on the phone.
import { describe, it, expect } from 'vitest'
import C from './native-contract.json'
import { buildCompletedWorkout } from '../lib/finish-workout.js'
import { nextPrescription } from '../lib/progression.js'
import { workoutVolume, setsDone } from '../lib/history.js'
import { restoredStateFor } from '../store/useStore.js'

describe('native app contract (native-contract.json)', () => {
  it('finishing the same session, the web writes exactly the workout the native app writes', () => {
    expect(buildCompletedWorkout(C.active, { end: C.end, prs: [] })).toEqual(C.workout)
  })

  it('the web loads a document the native app wrote, and reads the workout back as the app does', () => {
    const S = restoredStateFor({}, { ...C.state, workouts: [C.workout] })
    expect(S).not.toBeNull()
    expect(S.workouts).toEqual([C.workout])
    const routine = S.routines[0]
    const next = nextPrescription(S, routine.ex[0], routine)
    expect({ kind: next.kind, weight: next.weight }).toEqual(C.expect.next)
    expect(workoutVolume(S.workouts[0])).toBe(C.expect.volume)
    expect(setsDone(S.workouts[0])).toBe(C.expect.setsDone)
  })
})
