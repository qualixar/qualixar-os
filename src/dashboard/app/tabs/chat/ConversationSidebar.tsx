/**
 * Qualixar OS Phase 14 -- ConversationSidebar
 * Full conversation management: search, create, rename, clone, delete.
 * Competitive with ChatGPT sidebar and Mastra Studio.
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Plus, MessageSquare, MoreHorizontal, Pencil, GitBranch, Trash2, HelpCircle } from 'lucide-react';
import type { Conversation } from '../../store.js';

interface ConversationSidebarProps {
  readonly conversations: readonly Conversation[];
  readonly activeId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onCreate: () => void;
  readonly onRename: (id: string, title: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onClone: (id: string) => void;
}

export function ConversationSidebar({
  conversations, activeId, onSelect, onCreate, onRename, onDelete, onClone,
}: ConversationSidebarProps): React.ReactElement {
  const [filter, setFilter] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const base = conversations.filter((c) => c.id !== 'qos-help-builtin');
    if (!filter) return base;
    const l = filter.toLowerCase();
    return base.filter((c) => c.title.toLowerCase().includes(l));
  }, [conversations, filter]);

  // Close menu on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null); setConfirmDeleteId(null);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Auto-focus rename input
  useEffect(() => {
    if (renamingId && renameRef.current) { renameRef.current.focus(); renameRef.current.select(); }
  }, [renamingId]);

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) onRename(renamingId, renameValue.trim());
    setRenamingId(null); setRenameValue('');
  }, [renamingId, renameValue, onRename]);

  const cancelRename = useCallback(() => { setRenamingId(null); setRenameValue(''); }, []);

  const onRenameKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') cancelRename();
  }, [commitRename, cancelRename]);

  const badge = { padding: '1px 5px', borderRadius: 4, background: 'var(--bg-tertiary)', fontSize: 10, fontWeight: 500 } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%',
      borderRight: '1px solid var(--border-glass)', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--bg-secondary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Conversations</span>
          <button onClick={onCreate} style={{ display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--accent)',
            color: 'var(--text-on-accent, #fff)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={13} strokeWidth={2.5} /> New
          </button>
        </div>
        <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder="Search conversations..." style={{ width: '100%', padding: '6px 10px', borderRadius: 6,
          border: '1px solid var(--border-glass)', background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Pinned help entry */}
        <button
          onClick={() => onSelect('qos-help-builtin')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            textAlign: 'left', padding: '10px 12px', border: 'none', cursor: 'pointer',
            background: activeId === 'qos-help-builtin' ? 'var(--accent-soft)' : 'transparent',
            borderLeft: activeId === 'qos-help-builtin' ? '3px solid var(--accent)' : '3px solid transparent',
            borderBottom: '1px solid var(--border-glass)', fontFamily: 'inherit',
            color: 'var(--accent)', transition: 'background 150ms',
          }}
          onMouseEnter={(e) => {
            if (activeId !== 'qos-help-builtin') e.currentTarget.style.background = 'var(--bg-secondary)';
          }}
          onMouseLeave={(e) => {
            if (activeId !== 'qos-help-builtin') e.currentTarget.style.background = 'transparent';
          }}
        >
          <HelpCircle size={16} strokeWidth={2} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Qualixar OS Help</span>
        </button>

        {/* Enhanced empty state */}
        {conversations.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '40px 16px', color: 'var(--text-muted)', gap: 12 }}>
            <MessageSquare size={32} strokeWidth={1.5} style={{ opacity: 0.5 }} />
            <span style={{ fontSize: 13 }}>No conversations yet</span>
            <button onClick={onCreate} style={{ display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border-glass)',
              background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={13} strokeWidth={2.5} /> Start a conversation
            </button>
          </div>
        )}
        {filtered.length === 0 && conversations.length > 0 && (
          <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No matches</div>
        )}

        {filtered.map((conv) => {
          const active = conv.id === activeId;
          const isRenaming = renamingId === conv.id;
          const isMenuOpen = menuOpenId === conv.id;
          const model = (conv as unknown as Record<string, unknown>).model as string | undefined;
          const parentId = (conv as unknown as Record<string, unknown>).parentId as string | undefined;

          return (
            <div key={conv.id} style={{ position: 'relative',
              borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
              background: active ? 'var(--accent-soft)' : 'transparent' }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
              <button onClick={() => !isRenaming && onSelect(conv.id)} style={{ display: 'block', width: '100%',
                textAlign: 'left', padding: '10px 36px 10px 12px', border: 'none', cursor: 'pointer',
                background: 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontFamily: 'inherit' }}>
                {isRenaming ? (
                  <input ref={renameRef} value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={onRenameKey} onBlur={commitRename} onClick={(e) => e.stopPropagation()}
                    style={{ width: '100%', padding: '2px 4px', borderRadius: 4, border: '1px solid var(--accent)',
                    background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 13,
                    fontWeight: 600, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                ) : (
                  <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, marginBottom: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.title}</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
                  color: 'var(--text-muted)', marginTop: 2 }}>
                  <span>{conv.messageCount} msgs &middot; {formatRelative(conv.updatedAt)}</span>
                  {model && <span style={badge}>{model}</span>}
                  {parentId && (
                    <span style={{ ...badge, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <GitBranch size={9} /> Branch
                    </span>
                  )}
                </div>
              </button>

              {/* Hover-revealed more button */}
              <button onClick={(e) => { e.stopPropagation();
                setMenuOpenId(isMenuOpen ? null : conv.id); setConfirmDeleteId(null); }}
                className="conv-more-btn" style={{ position: 'absolute', top: 10, right: 8, padding: 4,
                border: 'none', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer',
                background: isMenuOpen ? 'var(--bg-tertiary)' : 'transparent',
                opacity: isMenuOpen ? 1 : 0, transition: 'opacity 150ms' }}>
                <MoreHorizontal size={14} />
              </button>

              {/* Context menu */}
              {isMenuOpen && (
                <div ref={menuRef} style={{ position: 'absolute', top: 30, right: 8, zIndex: 50,
                  minWidth: 140, padding: 4, borderRadius: 8, background: 'var(--bg-primary)',
                  border: '1px solid var(--border-glass)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                  <MItem icon={<Pencil size={13} />} label="Rename"
                    onClick={() => { setMenuOpenId(null); setRenamingId(conv.id); setRenameValue(conv.title); }} />
                  <MItem icon={<GitBranch size={13} />} label="Clone / Branch"
                    onClick={() => { setMenuOpenId(null); onClone(conv.id); }} />
                  <MItem icon={<Trash2 size={13} />} danger
                    label={confirmDeleteId === conv.id ? 'Confirm delete?' : 'Delete'}
                    onClick={() => { if (confirmDeleteId === conv.id) {
                      setMenuOpenId(null); setConfirmDeleteId(null); onDelete(conv.id);
                    } else { setConfirmDeleteId(conv.id); } }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`div:hover > .conv-more-btn { opacity: 1 !important; }`}</style>
    </div>
  );
}

function MItem({ icon, label, danger, onClick }: {
  readonly icon: React.ReactNode; readonly label: string;
  readonly danger?: boolean; readonly onClick: () => void;
}): React.ReactElement {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px',
        border: 'none', borderRadius: 4, cursor: 'pointer', background: 'transparent',
        fontFamily: 'inherit', fontSize: 12,
        color: danger ? 'var(--error, #ef4444)' : 'var(--text-secondary)' }}>
      {icon} {label}
    </button>
  );
}

function formatRelative(dateStr: string): string {
  try {
    const d = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(d / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return ''; }
}
