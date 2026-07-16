export type Todo = {
  id: number
  text: string
  completed: boolean | number // SQLite returns 0/1
  position: number
  created_at: string
  updated_at: string
}

export type Filter = 'all' | 'active' | 'completed'
