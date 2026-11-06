import type { CreateProfileInput } from '@transterm/core'
import { t } from '../../i18n'
import { DropdownSelect } from '../common/dropdown-select'
import type { ConnectionFormSetter } from './connection-modal-utils'

export function ConnectionFilePaneSection({
  form,
  setForm
}: {
  form: CreateProfileInput
  setForm: ConnectionFormSetter
}) {
  return (
    <div className="ssh-form-page">
      <fieldset className="ssh-fieldset narrow">
        <legend>{t.filePaneDefaultMode}</legend>
        <div className="ssh-grid single">
          <div className="span-2 ssh-form-field">
            <div className="ssh-form-field__header">
              <label htmlFor="connection-file-pane-mode">{t.filePaneDisplayMode}</label>
            </div>
            <DropdownSelect
              id="connection-file-pane-mode"
              ariaLabel={t.filePaneDefaultMode}
              options={[
                { value: 'local', label: t.filePaneLocal },
                { value: 'remote-tree', label: t.remoteDirectoryTree }
              ]}
              value={form.filePaneMode ?? 'local'}
              onChange={(value) =>
                setForm((previous) => ({
                  ...previous,
                  filePaneMode: value === 'remote-tree' ? 'remote-tree' : 'local'
                }))
              }
            />
            <p className="ssh-field-hint">{t.filePaneDefaultModeHint}</p>
          </div>
        </div>
      </fieldset>
    </div>
  )
}
