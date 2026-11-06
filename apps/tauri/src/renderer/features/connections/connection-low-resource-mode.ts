import type { CreateProfileInput, SshConnectionDefaults } from '@transterm/core'

export function isLowResourceSshMode(form: CreateProfileInput, defaults: SshConnectionDefaults): boolean {
  return (
    form.type === 'ssh' &&
    form.deviceMode !== 'network-device' &&
    !(form.enableExecChannel ?? defaults.enableExecChannel) &&
    !(form.enableResourceMonitoring ?? defaults.enableResourceMonitoring) &&
    form.sftpEnabled === false &&
    (form.connectTimeoutSeconds ?? 30) >= 60
  )
}

export function toggleLowResourceSshMode(
  form: CreateProfileInput,
  defaults: SshConnectionDefaults
): CreateProfileInput {
  if (form.type !== 'ssh' || form.deviceMode === 'network-device') return form
  if (isLowResourceSshMode(form, defaults)) {
    return {
      ...form,
      enableExecChannel: defaults.enableExecChannel,
      enableResourceMonitoring: defaults.enableResourceMonitoring,
      sftpEnabled: true,
      connectTimeoutSeconds: 30
    }
  }
  return {
    ...form,
    enableExecChannel: false,
    enableResourceMonitoring: false,
    sftpEnabled: false,
    connectTimeoutSeconds: Math.max(60, form.connectTimeoutSeconds ?? 30)
  }
}
