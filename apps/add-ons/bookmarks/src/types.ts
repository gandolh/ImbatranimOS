export type BookmarkLink = {
  id: number
  group_id: number
  title: string
  href: string
  icon?: string
}

export type BookmarkGroup = {
  id: number
  name: string
  icon?: string
  links: BookmarkLink[]
}
