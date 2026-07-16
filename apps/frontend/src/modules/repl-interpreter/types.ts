export interface ReplConfig {
  id: number
  name: string
  command: string
  args: string
  cwd: string
  prompt_prefix: string
  created_at: string
}

export interface ReplEntry {
  command: string
  output: string
  isError: boolean
}

export interface ReplTabState {
  id: string           // unique tab identifier (not sessionId)
  sessionId: string
  config: ReplConfig
  history: ReplEntry[]
  isPending: boolean
}
