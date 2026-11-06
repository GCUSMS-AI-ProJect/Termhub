// Profiles whose open request is still in flight in this window. Entry points
// already drop repeat clicks; this guards whatever slips through (another
// control, a keyboard repeat) until the IPC request settles. Once it does,
// opening the profile again is an intentional way to create another tab.
const openingProfileIds = new Set<string>()

export async function runProfileOpenOnce(profileId: string, open: () => Promise<unknown>): Promise<void> {
  if (openingProfileIds.has(profileId)) {
    return
  }
  openingProfileIds.add(profileId)
  try {
    await open()
  } finally {
    openingProfileIds.delete(profileId)
  }
}
