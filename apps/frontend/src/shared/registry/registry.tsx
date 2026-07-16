import { type ComponentType } from 'react'
import {
  StickyNote,
  ListTodo,
  Bookmark,
  FileText,
  Settings as SettingsIcon,
  SquareTerminal,
  FolderOpen,
  Activity,
} from 'lucide-react'
import { StickyNotes } from '../../modules/sticky-notes/StickyNotes'
import { Todo } from '../../modules/todo/Todo'
import { Bookmarks } from '../../modules/bookmarks/Bookmarks'
import { Notepad } from '../../modules/notepad/Notepad'
import { Settings } from '../../modules/settings/Settings'
import { Terminal } from '../../modules/repl-interpreter/Terminal'
import { FileManager } from '../../modules/file-manager/FileManager'
import { SystemMonitor } from '../../modules/system-monitor/SystemMonitor'

export type AppConfig = {
  id: string
  name: string
  description: string
  meta: string[]
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  component: ComponentType<{ windowId: string }>
  multiInstance: boolean
  defaultSize: { width: number; height: number }
  minSize: { width: number; height: number }
}

// TODO: Replace placeholder components with real app imports once modules are built





export const APP_REGISTRY: AppConfig[] = [
  {
    id: 'sticky-notes',
    name: 'Sticky Notes',
    description: 'Quick floating sticky notes',
    meta: ['post-it', 'memo', 'note'],
    icon: StickyNote,
    component: StickyNotes,
    multiInstance: true,
    defaultSize: { width: 320, height: 280 },
    minSize: { width: 240, height: 200 },
  },
  {
    id: 'todo',
    name: 'Todo',
    description: 'Task list and to-dos',
    meta: ['tasks', 'checklist', 'reminders'],
    icon: ListTodo,
    component: Todo,
    multiInstance: false,
    defaultSize: { width: 360, height: 480 },
    minSize: { width: 280, height: 300 },
  },
  {
    id: 'bookmarks',
    name: 'Bookmarks',
    description: 'Save and organize links',
    meta: ['links', 'favorites', 'urls'],
    icon: Bookmark,
    component: Bookmarks,
    multiInstance: false,
    defaultSize: { width: 480, height: 520 },
    minSize: { width: 320, height: 400 },
  },
  {
    id: 'notepad',
    name: 'Notepad',
    description: 'Markdown text editor',
    meta: ['editor', 'markdown', 'text', 'write'],
    icon: FileText,
    component: Notepad,
    multiInstance: true,
    defaultSize: { width: 600, height: 500 },
    minSize: { width: 400, height: 300 },
  },
  {
    id: 'settings',
    name: 'Settings',
    description: 'System settings and appearance',
    meta: ['config', 'appearance', 'background', 'wallpaper', 'theme'],
    icon: SettingsIcon,
    component: Settings,
    multiInstance: false,
    defaultSize: { width: 440, height: 500 },
    minSize: { width: 360, height: 400 },
  },
  {
    id: 'terminal',
    name: 'Terminal',
    description: 'A real shell on the machine',
    meta: ['shell', 'terminal', 'bash', 'console', 'command line'],
    icon: SquareTerminal,
    component: Terminal,
    multiInstance: true,
    defaultSize: { width: 700, height: 460 },
    minSize: { width: 400, height: 240 },
  },
  // SWARM:S2 — file manager entry (append only, do not reorder above)
  {
    id: 'file-manager',
    name: 'File Manager',
    description: 'Browse and manage files',
    meta: ['files', 'explorer', 'browser', 'folder', 'upload'],
    icon: FolderOpen,
    component: FileManager,
    multiInstance: true,
    defaultSize: { width: 680, height: 500 },
    minSize: { width: 480, height: 320 },
  },
  {
    id: 'system-monitor',
    name: 'System Monitor',
    description: 'Live CPU, memory, disk, and process stats',
    meta: ['cpu', 'ram', 'memory', 'disk', 'processes', 'htop', 'monitor', 'activity'],
    icon: Activity,
    component: SystemMonitor,
    multiInstance: false,
    defaultSize: { width: 560, height: 480 },
    minSize: { width: 420, height: 360 },
  },
]
