import sprite from '../../../assets/icons/system/lucide-ai-sprite.svg'
import './lucide-icons.css'

// Official Lucide SVGs, bundled locally. See assets/icons/lucide-sources.json.
const icons = {
  'ai-assistant': 'bot',
  'ai-auto': 'sparkles',
  'ai-message': 'message-square',
  'ai-new-chat': 'message-square-plus',
  'ai-settings': 'sliders-horizontal',
  'ai-reasoning': 'brain-circuit',
  'ai-analysis': 'scan-search',
  'ai-loading': 'loader-circle',
  'ai-more': 'ellipsis',
  'ai-info': 'info',
  'ai-plus': 'plus',
  'ai-search': 'search',
  'ai-check': 'check',
  'ai-copy': 'copy',
  'ai-edit': 'pencil',
  'ai-trash': 'trash',
  'ai-refresh': 'refresh-cw',
  'ai-stop': 'square',
  'ai-expand': 'panel-left',
  'ai-collapse': 'panel-right-close',
  'ai-back': 'arrow-left',
  'ai-forward': 'arrow-right',
  'ai-send': 'arrow-up',
  'ai-chevron-up': 'chevron-up',
  'ai-chevron-right': 'chevron-right',
  'ai-close': 'x',
  'ai-external': 'external-link',
  'ai-attach': 'paperclip',
  'ai-folder': 'folder-open',
  'ai-code': 'file-code-corner',
  'ai-document': 'file-text',
  'ai-image': 'image',
  'ai-upload': 'upload',
  'ai-terminal': 'square-terminal',
  'ai-ssh': 'monitor-up',
  'ai-server': 'server',
  'ai-eye': 'eye',
  'ai-eye-off': 'eye-off',
  'ai-shield': 'shield',
  'ai-shield-check': 'shield-check',
  'ai-lock': 'lock-keyhole',
  'ai-key': 'key-round',
  'ai-save': 'save'
} as const

export type LucideIconName = keyof typeof icons

export function isLucideIconName(name: string): name is LucideIconName {
  return Object.hasOwn(icons, name)
}

export function lucideIconHref(name: LucideIconName) {
  return `${sprite}#${icons[name]}`
}
