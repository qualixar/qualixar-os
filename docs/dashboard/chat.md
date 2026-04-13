---
title: "Chat Tab"
description: "Interactive conversation interface with streaming responses and tool calling"
category: "dashboard"
tags: ["chat", "conversation", "streaming", "dashboard"]
last_updated: "2026-04-05"
---

# Chat Tab

The Chat tab provides an interactive conversation interface for working with your configured LLM models. It supports streaming responses, tool calling, conversation history, and multi-model switching.

## Features

- **Streaming responses** — tokens appear as they are generated
- **Tool calling** — agents can invoke tools during conversation
- **Conversation management** — create, list, and switch between conversations
- **Stop generation** — cancel a running response mid-stream
- **Retry** — regenerate the last response with one click
- **Model selection** — switch models per conversation

## Creating a Conversation

Click **New Conversation** or use the API:

```bash
curl -X POST http://localhost:3000/api/chat/conversations \
  -H "Content-Type: application/json" \
  -d '{"name": "Project Planning", "model": "claude-sonnet-4-6"}'
```

## Sending Messages

Type in the input box and press Enter. The response streams in real-time.

Via API:

```bash
curl -X POST http://localhost:3000/api/chat/conversations/<id>/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Explain the map-reduce topology"}'
```

## Conversation List

The left sidebar shows all conversations. Each entry displays:
- Conversation name
- Last message preview
- Timestamp
- Model used

## Tool Calling

When an agent decides to use a tool during conversation, the Chat tab shows:
1. The tool being called and its parameters
2. The tool's output
3. The agent's response incorporating the tool result

This makes tool usage transparent and debuggable.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Escape` | Stop generation |
| `Ctrl+R` | Retry last response |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/conversations` | Create conversation |
| GET | `/api/chat/conversations` | List conversations |
| POST | `/api/chat/conversations/:id/messages` | Send message |
| GET | `/api/chat/conversations/:id` | Get conversation with history |

## Related

- [Agents Tab](agents.md) — Configure agents that power chat
- [Tools Tab](tools.md) — Manage tools available to chat agents
- [Models](../providers/overview.md) — Configure available models
