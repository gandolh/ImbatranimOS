import { api } from '../../../lib/axios'
import type { Filter, Todo } from '../types'

export async function fetchTodos(filter?: Filter): Promise<Todo[]> {
  const res = await api.get<Todo[]>('/todos', { params: filter ? { filter } : undefined })
  return res.data
}

export async function createTodo(text: string): Promise<Todo> {
  const res = await api.post<Todo>('/todos', { text })
  return res.data
}

export async function updateTodo(
  id: number,
  data: { text?: string; completed?: boolean },
): Promise<Todo> {
  const res = await api.patch<Todo>(`/todos/${id}`, data)
  return res.data
}

export async function reorderTodos(ids: number[]): Promise<void> {
  await api.patch('/todos/reorder', { ids })
}

export async function deleteTodo(id: number): Promise<void> {
  await api.delete(`/todos/${id}`)
}
