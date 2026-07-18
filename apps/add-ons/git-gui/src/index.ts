import { lazy } from 'react'
import { GitBranch } from 'lucide-react'
import type { AddonManifest } from '@imbatranim/core'
import { APP_NAME } from './appName'

export const manifest: AddonManifest = {
  id: 'git-gui',
  name: APP_NAME,
  description: 'Stage, commit, diff, and browse the history of a git repository',
  meta: ['git', 'version control', 'commit', 'diff', 'stage', 'status', 'log', 'vcs'],
  icon: GitBranch,
  component: lazy(() => import('./GitGui').then((m) => ({ default: m.GitGui }))),
  // One repo at a time — a single window keeps the picked repo unambiguous.
  multiInstance: false,
  defaultSize: { width: 760, height: 560 },
  minSize: { width: 560, height: 400 },
}
