import { useState } from 'react'
import { Folder, Link2, Plus, Trash2, Edit2, ExternalLink, X, Check } from 'lucide-react'
import { ScrollArea } from '../../shared/components/ui/ScrollArea'
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

  function handleSave() {
    onUpdate(link.id, { title, href })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 p-2 border border-outline-variant bg-surface-container-low mb-1">
        <input
          className="font-content text-[13px] bg-transparent border-b border-outline outline-none p-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
        />
        <input
          className="font-content text-[11px] bg-transparent border-b border-outline outline-none p-1 text-on-surface-variant"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          placeholder="URL"
        />
        <div className="flex justify-end gap-2 mt-1">
          <button onClick={() => setEditing(false)} className="p-1 hover:bg-surface-container-high">
            <X size={14} />
          </button>
          <button onClick={handleSave} className="p-1 bg-primary text-on-primary hover:bg-primary-container hover:text-on-primary-container">
            <Check size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-2 h-9 px-2 hover:bg-surface-container border-b border-outline-variant last:border-0 overflow-hidden">
      <Link2 size={14} className="shrink-0 text-on-surface-variant" />
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-content text-[13px] flex-1 truncate hover:text-primary transition-colors cursor-pointer"
      >
        {link.title}
      </a>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => setEditing(true)} className="p-1 hover:text-primary" title="Edit">
          <Edit2 size={13} />
        </button>
        <button onClick={() => onDelete(link.id)} className="p-1 hover:text-error" title="Delete">
          <Trash2 size={13} />
        </button>
        <a href={link.href} target="_blank" rel="noopener noreferrer" className="p-1 hover:text-primary" title="Open in new tab">
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
      <div className="flex items-center gap-2 h-8 px-2 border-b border-outline bg-surface-container-low group/hdr">
        <Folder size={14} className="text-secondary" />
        {editing ? (
          <input
            className="font-ui font-semibold text-[13px] bg-transparent outline-none flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleSaveGroup}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveGroup()}
            autoFocus
          />
        ) : (
          <span className="font-ui font-semibold text-[13px] flex-1 cursor-pointer" onClick={() => setEditing(true)}>
            {group.name}
          </span>
        )}
        <div className="flex items-center gap-1 opacity-0 group-hover/hdr:opacity-100 transition-opacity">
          <button onClick={() => setAddingLink(true)} className="p-1 hover:text-primary" title="Add Link">
            <Plus size={14} />
          </button>
          <button onClick={() => onDeleteGroup(group.id)} className="p-1 hover:text-error" title="Delete Group">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex flex-col">
        {group.links.map((link) => (
          <LinkRow key={link.id} link={link} onUpdate={onUpdateLink} onDelete={onDeleteLink} />
        ))}

        {addingLink && (
          <div className="flex flex-col gap-2 p-2 border border-primary bg-primary/5 my-1 mx-2">
            <input
              className="font-content text-[13px] bg-transparent border-b border-outline outline-none p-1"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Link Title"
              autoFocus
            />
            <input
              className="font-content text-[11px] bg-transparent border-b border-outline outline-none p-1"
              value={newHref}
              onChange={(e) => setNewHref(e.target.value)}
              placeholder="https://..."
            />
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={() => setAddingLink(false)} className="p-1 hover:bg-surface-container-high">
                <X size={14} />
              </button>
              <button onClick={handleAddLink} className="px-2 py-0.5 bg-primary text-on-primary text-[11px] hover:bg-primary-container hover:text-on-primary-container">
                Add
              </button>
            </div>
          </div>
        )}

        {!addingLink && group.links.length === 0 && (
          <div className="h-9 flex items-center justify-center font-ui text-[11px] text-on-surface-variant italic">
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
    return <div className="flex h-full items-center justify-center font-ui text-[13px]">Loading...</div>
  }

  return (
    <div className="flex h-full flex-col bg-surface-container-lowest">
      {/* Header / Actions */}
      <div className="flex h-9 items-center justify-between px-3 border-b border-outline-variant bg-surface-container-low">
        <span className="font-ui font-bold text-[11px] uppercase tracking-wider text-on-surface-variant">Groups</span>
        <button
          onClick={() => setAddingGroup(true)}
          className="flex items-center gap-1 px-2 py-0.5 border border-outline hover:bg-surface-container-high transition-colors text-[11px]"
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
          <div className="p-2 border border-primary bg-primary/5 mb-4">
            <input
              className="font-ui font-semibold text-[13px] bg-transparent outline-none w-full border-b border-primary p-1"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="New Group Name"
              onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => setAddingGroup(false)} className="p-1 hover:bg-surface-container-high text-[11px]">
                Cancel
              </button>
              <button onClick={handleAddGroup} className="px-2 py-0.5 bg-primary text-on-primary text-[11px] hover:bg-primary-container hover:text-on-primary-container">
                Create
              </button>
            </div>
          </div>
        )}

        {groups.length === 0 && !addingGroup && (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="font-ui text-[12px] text-on-surface-variant">No bookmarks yet</span>
            <button
              onClick={() => setAddingGroup(true)}
              className="text-primary hover:underline text-[12px]"
            >
              Create your first group
            </button>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
