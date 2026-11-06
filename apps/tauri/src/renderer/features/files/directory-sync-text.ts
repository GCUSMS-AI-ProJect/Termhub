import { getLocale } from '../../i18n'

const zh = {
  title: '目录同步',
  local: '本地目录',
  remote: '远程目录',
  upload: '本地 → 远程',
  download: '远程 → 本地',
  ignores: '忽略规则（每行一项）',
  hint: '按文件大小和修改时间比较。只传输勾选的文件，目标端独有的文件会保留。',
  preview: '预览差异',
  scanning: '正在比较…',
  apply: '同步选中文件',
  applying: '正在加入传输队列…',
  selected: '已选择 {count} 个文件',
  new: '新增',
  modified: '修改',
  unchanged: '未变化',
  all: '全选',
  filter: '筛选文件路径',
  queued: '已加入传输队列，可在传输中心查看进度、暂停和重试。',
  replace: '将替换选中目标文件的内容。源文件或目标文件在预览后变化时，会要求重新预览。',
  noFiles: '没有符合条件的文件',
  close: '关闭',
  cancel: '取消',
  direction: '同步方向'
}
const en: typeof zh = {
  title: 'Directory sync',
  local: 'Local directory',
  remote: 'Remote directory',
  upload: 'Local → remote',
  download: 'Remote → local',
  ignores: 'Ignore patterns (one per line)',
  hint: 'Compare file size and modification time. Transfer checked files and preserve files that exist only at the destination.',
  preview: 'Preview changes',
  scanning: 'Comparing…',
  apply: 'Sync selected files',
  applying: 'Adding to transfer queue…',
  selected: '{count} files selected',
  new: 'New',
  modified: 'Modified',
  unchanged: 'Unchanged',
  all: 'Select all',
  filter: 'Filter file paths',
  queued: 'Added to the transfer queue. View progress, pause, or retry in Transfers.',
  replace:
    'Replace the selected destination files. If a source or destination changes after this preview, a new preview is required.',
  noFiles: 'No matching files',
  close: 'Close',
  cancel: 'Cancel',
  direction: 'Sync direction'
}
export const syncText = () => (getLocale() === 'zhCN' ? zh : en)
