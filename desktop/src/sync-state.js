export function remoteAction(currentRevision, dirty, incomingRevision) {
  if (currentRevision === incomingRevision) return 'ignore'
  return dirty ? 'conflict' : 'load'
}

export function saveLeavesDirty(currentGeneration, savedGeneration) {
  return currentGeneration !== savedGeneration
}
