// The numbers of the swipe-back gesture from the left edge (components/EdgeSwipeBack.jsx), kept apart
// so they can be tested. The finger drags the screen to the right; the screen under it drifts in from
// the left and clears out of a dim, as in an iOS app.

/** How far from the left edge, in px, a touch has to start to count as the swipe. */
export const EDGE = 22

/** 0..1: how much of the width the screen has been dragged. */
export const progressOf = (dx, width) => (width > 0 ? Math.min(1, Math.max(0, dx / width)) : 0)

/** Past a third of the width, or a short but quick flick, completes the step back; anything else springs back. */
export const shouldComplete = ({ dx, width, vx }) => progressOf(dx, width) > 0.38 || (vx > 0.45 && dx > 36)

/** Where the screen underneath sits at progress p: a little to the left, coming home as the top one leaves. */
export const underShift = (p, width) => -0.28 * width * (1 - p)

/** How dark the screen underneath still is at progress p. */
export const dimAt = p => 0.24 * (1 - p)
