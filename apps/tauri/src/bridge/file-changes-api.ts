import { invoke } from '@tauri-apps/api/core'
import type {
  FileChangeTarget,
  SaveFileChangeInput,
  SavedFileChange,
  VersionedFile,
  DirectorySyncInput,
  DirectorySyncPreview
} from '@transterm/core'

export function createFileChangesApi() {
  return {
    readVersionedFile: (target: FileChangeTarget) => invoke<VersionedFile>('app_read_versioned_file', { target }),
    saveFileChange: (input: SaveFileChangeInput) => invoke<SavedFileChange>('app_save_file_change', { input }),
    undoFileChange: (changeId: string) => invoke<SavedFileChange>('app_undo_file_change', { changeId }),
    previewDirectorySync: (input: DirectorySyncInput) =>
      invoke<DirectorySyncPreview>('app_preview_directory_sync', { input }),
    cancelDirectorySyncPreview: (requestId: string) => invoke<void>('app_cancel_directory_sync_preview', { requestId }),
    applyDirectorySync: (previewId: string, selectedPaths: string[]) =>
      invoke<string>('app_apply_directory_sync', { previewId, selectedPaths })
  }
}
