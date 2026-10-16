// Whether an exercise is trained one limb at a time, as the user set it on the exercise itself
// (S.sideEx[exId] = { on, _ts }, stamped like S.loadKind so a sync keeps the last choice). Absent
// means "no": the app never decides this from an exercise's name. A plan slot still carries its
// own `side` flag, which wins; this is only what a newly added slot or freestyle set starts from.

/** The exercise's own choice; false when none was made. */
export const sideDefaultOf = (S, exId) => !!S?.sideEx?.[exId]?.on

/** S.sideEx with the exercise's choice set. Switching off is a stamped entry, not a delete, so it wins the next merge. */
export const withSideDefault = (map, exId, on, now = Date.now()) =>
  ({ ...(map || {}), [exId]: { on: !!on, _ts: now } })
