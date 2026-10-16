// A machine's standing note ("Seat 4 · Back 2 · Pin 7") shown as chips instead of a grey line.
// The note stays plain text in S.exNotes, so nothing needs migrating and an older client reads it
// as it always did; this only splits it for display and builds the quick-insert snippets.

/** The pieces of a standing note: split on a middle dot, semicolon, bullet or new line. */
export function setupChips(note) {
  if (typeof note !== 'string') return []
  return note.split(/\s*[·•;\n]\s*/).map(s => s.trim()).filter(Boolean).slice(0, 8)
}

/** Whether the note already has a piece for `label`: "Seat", or "Seat 4". */
export function hasSetting(text, label) {
  const l = label.toLowerCase()
  return setupChips(text).some(p => { const q = p.toLowerCase(); return q === l || q.startsWith(l + ' ') })
}
