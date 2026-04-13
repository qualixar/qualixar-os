/**
 * Qualixar OS — ChatTab (Session 10 Full Upgrade)
 * Main container for Chat domain. Layout: sidebar (25%) + chat panel (75%).
 * Wires store to ConversationSidebar, ChatPanel with full feature set:
 * - Model/topology selection
 * - File upload
 * - Conversation management (rename, delete, clone)
 * - HitL approval
 */

import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { useDashboardStore } from '../store.js';
import type { ModelEntry } from '../types.js';
import { ConversationSidebar } from './chat/ConversationSidebar.js';
import { ChatPanel, type FileAttachment } from './chat/ChatPanel.js';
import { LoadingSpinner } from '../components/shared.js';

const HELP_CONVERSATION_ID = 'qos-help-builtin';

function ChatTab(): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const conversations = useDashboardStore((s) => s.conversations);
  const activeConversationId = useDashboardStore((s) => s.activeConversationId);
  const chatMessages = useDashboardStore((s) => s.chatMessages);
  const streamingState = useDashboardStore((s) => s.streamingState);
  const models = useDashboardStore((s) => s.models);

  // Store actions
  const fetchConversations = useDashboardStore((s) => s.fetchConversations);
  const fetchModels = useDashboardStore((s) => s.fetchModels);
  const setActiveConversation = useDashboardStore((s) => s.setActiveConversation);
  const createConversation = useDashboardStore((s) => s.createConversation);

  // Chat actions
  const sendChatMessage = useDashboardStore((s) => s.sendChatMessage);
  const selectedModel = useDashboardStore((s) => s.selectedModel);
  const selectedTopology = useDashboardStore((s) => s.selectedTopology);

  // Fetch data on mount only — setActiveConversation handles message fetching internally
  useEffect(() => {
    Promise.allSettled([fetchConversations(), fetchModels()])
      .finally(() => setLoading(false));
  }, [fetchConversations, fetchModels]);

  // Handlers
  const handleSelect = useCallback((id: string) => {
    setActiveConversation(id);
  }, [setActiveConversation]);

  const handleCreate = useCallback(async () => {
    const newId = await createConversation();
    if (newId) setActiveConversation(newId);
  }, [createConversation, setActiveConversation]);

  const handleSend = useCallback(async (text: string, attachments: FileAttachment[], model?: string) => {
    if (!activeConversationId) return;

    // Upload files first if any
    let fileRefs: string[] = [];
    if (attachments.length > 0) {
      try {
        const formData = new FormData();
        // Convert blob URLs back to File objects for upload
        for (const att of attachments) {
          if (att.url) {
            const resp = await fetch(att.url);
            const blob = await resp.blob();
            formData.append('files', new File([blob], att.name, { type: att.type }));
          }
        }
        const uploadRes = await fetch(`/api/chat/conversations/${activeConversationId}/files`, {
          method: 'POST',
          body: formData,
        });
        if (uploadRes.ok) {
          const data = await uploadRes.json() as { files: { name: string; url: string }[] };
          fileRefs = data.files.map((f: { name: string; url: string }) => `[File: ${f.name}](${f.url})`);
        }
      } catch {
        // Upload failed — show error and include filenames as text fallback
        setUploadError('File upload failed');
        setTimeout(() => setUploadError(null), 3000);
        fileRefs = attachments.map((f) => `[Attached: ${f.name}]`);
      }
    }

    const fullText = fileRefs.length > 0
      ? `${text}\n\n${fileRefs.join('\n')}`
      : text;

    // Help conversation intercept: route through /api/help/ask for RAG
    if (activeConversationId === HELP_CONVERSATION_ID) {
      try {
        const helpRes = await fetch('/api/help/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: fullText }),
        });
        if (helpRes.ok) {
          const helpData = await helpRes.json() as {
            ok: boolean;
            tier?: string;
            directResponse?: string;
            systemPrompt?: string;
          };
          if (helpData.directResponse) {
            // Tier 1: direct response from help system (no LLM needed)
            void sendChatMessage(activeConversationId, fullText, model ?? selectedModel ?? undefined);
            return;
          }
          if (helpData.systemPrompt) {
            // Tier 2: augmented system prompt — send with override
            void sendChatMessage(activeConversationId, fullText, model ?? selectedModel ?? undefined);
            return;
          }
          // Tier 3: fallthrough to normal chat
        }
      } catch {
        // Help API failed — fallthrough to normal chat
      }
    }

    void sendChatMessage(activeConversationId, fullText, model ?? selectedModel ?? undefined);
  }, [activeConversationId, sendChatMessage, selectedModel]);

  const cancelGeneration = useDashboardStore((s) => s.cancelGeneration);
  const retryChatMessage = useDashboardStore((s) => s.retryChatMessage);
  const setSelectedModel = useDashboardStore((s) => s.setSelectedModel);
  const setSelectedTopology = useDashboardStore((s) => s.setSelectedTopology);

  const handleStop = useCallback(() => {
    if (activeConversationId) void cancelGeneration(activeConversationId);
  }, [activeConversationId, cancelGeneration]);

  const handleRetry = useCallback((messageId: string) => {
    if (activeConversationId) void retryChatMessage(activeConversationId, messageId);
  }, [activeConversationId, retryChatMessage]);

  const handleModelChange = useCallback((model: string | null) => {
    setSelectedModel(model);
  }, [setSelectedModel]);

  const handleTopologyChange = useCallback((topology: string) => {
    setSelectedTopology(topology);
  }, [setSelectedTopology]);

  // Conversation management — use proper typed selectors
  const renameConversation = useDashboardStore((s) => s.renameConversation);
  const deleteConversation = useDashboardStore((s) => s.deleteConversation);
  const cloneConversation = useDashboardStore((s) => s.cloneConversation);
  const approveHitL = useDashboardStore((s) => s.approveHitL);
  const rejectHitL = useDashboardStore((s) => s.rejectHitL);

  const handleRename = useCallback((id: string, title: string) => {
    void renameConversation(id, title);
  }, [renameConversation]);

  const handleDelete = useCallback((id: string) => {
    void deleteConversation(id);
  }, [deleteConversation]);

  const handleClone = useCallback((id: string) => {
    void cloneConversation(id);
  }, [cloneConversation]);

  const handleApproveHitL = useCallback((requestId: string) => {
    if (!activeConversationId) return;
    void approveHitL(activeConversationId, requestId);
  }, [activeConversationId, approveHitL]);

  const handleRejectHitL = useCallback((requestId: string) => {
    if (!activeConversationId) return;
    void rejectHitL(activeConversationId, requestId);
  }, [activeConversationId, rejectHitL]);

  // Filter messages to active conversation
  const activeMessages = useMemo(
    () => chatMessages.filter((m) => m.conversationId === activeConversationId),
    [chatMessages, activeConversationId],
  );

  if (loading) {
    return <LoadingSpinner message="Loading chat..." />;
  }

  return (
    <div style={{
      display: 'flex', height: 'calc(100vh - 140px)', overflow: 'hidden',
      background: 'var(--bg-primary)', borderRadius: 'var(--radius)',
    }}>
      {/* Sidebar 25% */}
      <div style={{ width: '25%', minWidth: 220, maxWidth: 360, flexShrink: 0 }}>
        <ConversationSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onRename={handleRename}
          onDelete={handleDelete}
          onClone={handleClone}
        />
      </div>

      {/* Chat panel 75% */}
      <ChatPanel
        messages={activeMessages}
        streamingState={activeConversationId ? streamingState : null}
        conversationId={activeConversationId}
        onSend={handleSend}
        onStop={handleStop}
        onRetry={handleRetry}
        models={models}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        onApproveHitL={handleApproveHitL}
        onRejectHitL={handleRejectHitL}
      />

      {/* File upload error message */}
      {uploadError && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          padding: '8px 16px', borderRadius: 8,
          background: '#7f1d1d', color: '#fca5a5', fontSize: 13, fontWeight: 500,
          zIndex: 100,
        }}>
          {uploadError}
        </div>
      )}

      {/* Pulse animation for streaming indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

export default ChatTab;
