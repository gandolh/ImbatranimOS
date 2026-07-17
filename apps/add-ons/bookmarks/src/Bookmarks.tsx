import { useState } from 'react'
import { Folder, Link2, Plus, Trash2, Edit2, ExternalLink, X, Check } from 'lucide-react'
import { ScrollArea } from '@imbatranim/core'
import {
  useBookmarkGroupsQuery,
  useCreateGroupMutation,
  useCreateLinkMutation,
  useDeleteGroupMutation,
  useDeleteLinkMutation,
  useUpdateGroupMutation,
  useUpdateLinkMutation,
} from './queries/bookmarksQueries'
import type { BookmarkGroup, BookmarkLink } from './types'

// ---------------------------------------------------------------------------
// LinkRow
// ---------------------------------------------------------------------------
function LinkRow({
  link,
  onUpdate,
  onDelete,
}: {
  link: BookmarkLink
  onUpdate: (id: number, data: { title?: string; href?: string }) => void
  onDelete: (id: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(link.title)
  const [href, setHref] = useState(link.href)

  // Resync the edit buffers when the row is bound to a different link — state
  // adjustment during render, not an effect (mirrors StickyNotes' prevId sync).
  // Guarding on id means an in-progress edit isn't clobbered on every refetch.
  const [prevLinkId, setPrevLinkId] = useState(link.id)
  if (link.id !== prevLinkId) {
    setPrevLinkId(link.id)
    setTitle(link.title)
    setHref(link.href)
  }

  function handleSave() {
    onUpdate(link.id, { title, href })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="border-outline-variant bg-surface-container-low mb-1 flex flex-col gap-2 border p-2">
        <input
          className="font-content border-outline border-b bg-transparent p-1 text-[13px] outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
        />
        <input
          className="font-content border-outline text-on-surface-variant border-b bg-transparent p-1 text-[11px] outline-none"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          placeholder="URL"
        />
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={() => setEditing(false)} className="hover:bg-surface-container-high p-1">
            <X size={14} />
          </button>
          <button
            onClick={handleSave}
            className="bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container p-1"
          >
            <Check size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group hover:bg-surface-container border-outline-variant flex h-9 items-center gap-2 overflow-hidden border-b px-2 last:border-0">
      <Link2 size={14} className="text-on-surface-variant shrink-0" />
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-content hover:text-primary flex-1 cursor-pointer truncate text-[13px] transition-colors"
      >
        {link.title}
      </a>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button onClick={() => setEditing(true)} className="hover:text-primary p-1" title="Edit">
          <Edit2 size={13} />
        </button>
        <button onClick={() => onDelete(link.id)} className="hover:text-error p-1" title="Delete">
          <Trash2 size={13} />
        </button>
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary p-1"
          title="Open in new tab"
        >
          <ExternalLink size={13} />
        </a>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GroupSection
// ---------------------------------------------------------------------------
function GroupSection({
  group,
  onUpdateGroup,
  onDeleteGroup,
  onCreateLink,
  onUpdateLink,
  onDeleteLink,
}: {
  group: BookmarkGroup
  onUpdateGroup: (id: number, data: { name?: string }) => void
  onDeleteGroup: (id: number) => void
  onCreateLink: (groupId: number, data: { title: string; href: string }) => void
  onUpdateLink: (id: number, data: { title?: string; href?: string }) => void
  onDeleteLink: (id: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [addingLink, setAddingLink] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newHref, setNewHref] = useState('')

  // Resync the name buffer when bound to a different group — state adjustment
  // during render, not an effect (mirrors StickyNotes' prevId sync). Guarding
  // on id means an in-progress rename isn't clobbered on every refetch.
  const [prevGroupId, setPrevGroupId] = useState(group.id)
  if (group.id !== prevGroupId) {
    setPrevGroupId(group.id)
    setName(group.name)
  }

  function handleSaveGroup() {
    onUpdateGroup(group.id, { name })
    setEditing(false)
  }

  function handleAddLink() {
    if (!newTitle || !newHref) return
    onCreateLink(group.id, { title: newTitle, href: newHref })
    setNewTitle('')
    setNewHref('')
    setAddingLink(false)
  }

  return (
    <div className="mb-4">
      <div className="border-outline bg-surface-container-low group/hdr flex h-8 items-center gap-2 border-b px-2">
        <Folder size={14} className="text-secondary" />
        {editing ? (
          <input
            className="font-ui flex-1 bg-transparent text-[13px] font-semibold outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSaveGroup}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveGroup()}
            autoFocus
          />
        ) : (
          <span
            className="font-ui flex-1 cursor-pointer text-[13px] font-semibold"
            onClick={() => setEditing(true)}
          >
            {group.name}
          </span>
        )}
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/hdr:opacity-100">
          <button
            onClick={() => setAddingLink(true)}
            className="hover:text-primary p-1"
            title="Add Link"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => onDeleteGroup(group.id)}
            className="hover:text-error p-1"
            title="Delete Group"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex flex-col">
        {group.links.map((link) => (
          <LinkRow key={link.id} link={link} onUpdate={onUpdateLink} onDelete={onDeleteLink} />
        ))}

        {addingLink && (
          <div className="border-primary bg-primary/5 mx-2 my-1 flex flex-col gap-2 border p-2">
            <input
              className="font-content border-outline border-b bg-transparent p-1 text-[13px] outline-none"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Link Title"
              autoFocus
            />
            <input
              className="font-content border-outline border-b bg-transparent p-1 text-[11px] outline-none"
              value={newHref}
              onChange={(e) => setNewHref(e.target.value)}
              placeholder="https://..."
            />
            <div className="mt-1 flex justify-end gap-2">
              <button
                onClick={() => setAddingLink(false)}
                className="hover:bg-surface-container-high p-1"
              >
                <X size={14} />
              </button>
              <button
                onClick={handleAddLink}
                className="bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container px-2 py-0.5 text-[11px]"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {!addingLink && group.links.length === 0 && (
          <div className="font-ui text-on-surface-variant flex h-9 items-center justify-center text-[11px] italic">
            No links in this group
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bookmarks (root export)
// ---------------------------------------------------------------------------
export function Bookmarks({ windowId: _windowId }: { windowId: string }) {
  const { data: groups = [], isLoading } = useBookmarkGroupsQuery()
  const createGroup = useCreateGroupMutation()
  const updateGroup = useUpdateGroupMutation()
  const deleteGroup = useDeleteGroupMutation()
  const createLink = useCreateLinkMutation()
  const updateLink = useUpdateLinkMutation()
  const deleteLink = useDeleteLinkMutation()

  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  function handleAddGroup() {
    if (!newGroupName.trim()) return
    createGroup.mutate({ name: newGroupName.trim() })
    setNewGroupName('')
    setAddingGroup(false)
  }

  if (isLoading) {
    return (
      <div className="font-ui flex h-full items-center justify-center text-[13px]">Loading...</div>
    )
  }

  return (
    <div className="bg-surface-container-lowest flex h-full flex-col">
      {/* Header / Actions */}
      <div className="border-outline-variant bg-surface-container-low flex h-9 items-center justify-between border-b px-3">
        <span className="font-ui text-on-surface-variant text-[11px] font-bold tracking-wider uppercase">
          Groups
        </span>
        <button
          onClick={() => setAddingGroup(true)}
          className="border-outline hover:bg-surface-container-high flex items-center gap-1 border px-2 py-0.5 text-[11px] transition-colors"
        >
          <Plus size={12} />
          New Group
        </button>
      </div>

      <ScrollArea className="flex-1 p-2">
        {groups.map((group) => (
          <GroupSection
            key={group.id}
            group={group}
            onUpdateGroup={(id, data) => updateGroup.mutate({ id, data })}
            onDeleteGroup={(id) => {
              if (confirm('Delete group and all its links?')) {
                deleteGroup.mutate(id)
              }
            }}
            onCreateLink={(groupId, data) => createLink.mutate({ group_id: groupId, ...data })}
            onUpdateLink={(id, data) => updateLink.mutate({ id, data })}
            onDeleteLink={(id) => deleteLink.mutate(id)}
          />
        ))}

        {addingGroup && (
          <div className="border-primary bg-primary/5 mb-4 border p-2">
            <input
              className="font-ui border-primary w-full border-b bg-transparent p-1 text-[13px] font-semibold outline-none"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="New Group Name"
              onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
              autoFocus
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={() => setAddingGroup(false)}
                className="hover:bg-surface-container-high p-1 text-[11px]"
              >
                Cancel
              </button>
              <button
                onClick={handleAddGroup}
                className="bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container px-2 py-0.5 text-[11px]"
              >
                Create
              </button>
            </div>
          </div>
        )}

        {groups.length === 0 && !addingGroup && (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <span className="font-ui text-on-surface-variant text-[12px]">No bookmarks yet</span>
            <button
              onClick={() => setAddingGroup(true)}
              className="text-primary text-[12px] hover:underline"
            >
              Create your first group
            </button>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
