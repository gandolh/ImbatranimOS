import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient } from '../../../lib/queryClient'
import {
  createTodo,
  deleteTodo,
  fetchTodos,
  reorderTodos,
  updateTodo,
} from '../api/todosApi'
import type { Filter, Todo } from '../types'

const todosKey = (filter: Filter) => ['todos', filter] as const

export function useTodosQuery(filter: Filter) {
  return useQuery({
    queryKey: todosKey(filter),
    queryFn: () => fetchTodos(filter === 'all' ? undefined : filter),
  })
}

export function useCreateTodoMutation() {
  return useMutation({
    mutationFn: (text: string) => createTodo(text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })
}

export function useUpdateTodoMutation() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { text?: string; completed?: boolean } }) =>
      updateTodo(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] })
      const snapshots = queryClient.getQueriesData<Todo[]>({ queryKey: ['todos'] })
      queryClient.setQueriesData<Todo[]>({ queryKey: ['todos'] }, (old) =>
        old?.map((t) =>
          t.id === id
            ? {
                ...t,
                ...(data.text !== undefined ? { text: data.text } : {}),
                ...(data.completed !== undefined ? { completed: data.completed ? 1 : 0 } : {}),
              }
            : t,
        ),
      )
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })
}

export function useDeleteTodoMutation() {
  return useMutation({
    mutationFn: (id: number) => deleteTodo(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] })
      const snapshots = queryClient.getQueriesData<Todo[]>({ queryKey: ['todos'] })
      queryClient.setQueriesData<Todo[]>({ queryKey: ['todos'] }, (old) =>
        old?.filter((t) => t.id !== id),
      )
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })
}

export function useReorderTodosMutation() {
  return useMutation({
    mutationFn: (ids: number[]) => reorderTodos(ids),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })
}
