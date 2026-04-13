"""Claude Managed Agents API types — frozen dataclasses for the managed adapter.

All API endpoints are [ASSUMED -- R-1] and may change after research verification.
See LLD-ANGLE-2-MANAGED-AGENTS-ADAPTER.md Section 11 (Research Protocol).

TYPE CHANGES NEEDED (documented here, applied by Angle 3):
  - src/types/common.ts: Add 'claude-managed' to ProviderConfigSchema.type enum
  - src/types/events.ts: Add 5 new event types:
      'managed:session_timeout', 'managed:session_reconnecting',
      'managed:session_failed', 'managed:session_limit',
      'managed:stream_incomplete'

Copyright (c) 2026 Varun Pratap Bhardwaj
Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


# ---------------------------------------------------------------------------
# Endpoint Configuration (Endpoint-Agnostic Design)
# All paths are [ASSUMED -- R-1]. If research reveals different paths,
# update ONLY these defaults -- no algorithm changes needed.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ClaudeManagedEndpoints:
    """Configurable API paths -- all [ASSUMED -- R-1]."""

    create_agent: str = "/v1/agents"
    create_session: str = "/v1/agents/{agent_id}/sessions"
    send_message: str = "/v1/agents/sessions/{session_id}/messages"
    cancel_session: str = "/v1/agents/sessions/{session_id}/cancel"


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ClaudeManagedCredential:
    """A scoped credential injected into the managed agent sandbox.

    Attributes:
        name: Credential name visible inside the sandbox.
        value_env: Environment variable name holding the actual value.
                   The value itself is NEVER stored here.
        scope: Visibility scope -- 'session', 'tool', or 'environment'.
    """

    name: str
    value_env: str
    scope: str = "session"


@dataclass(frozen=True)
class ClaudeManagedEnvironment:
    """Environment configuration for a managed agent session.

    Attributes:
        sandbox: Whether to run in a sandboxed container (default True).
        timeout_hours: Max session duration in hours (default 1.0).
        credentials: Tuple of credentials to inject into the sandbox.
    """

    sandbox: bool = True
    timeout_hours: float = 1.0
    credentials: tuple[ClaudeManagedCredential, ...] = ()


@dataclass(frozen=True)
class ClaudeManagedConfig:
    """Configuration for connecting to Claude Managed Agents API.

    Attributes:
        api_key_env: Name of the env var holding the API key (NEVER the key).
        base_url: Anthropic API base URL (must be HTTPS).
        api_version: API version header value.
        default_environment: Default sandbox environment settings.
        max_concurrent_sessions: Max simultaneous managed sessions.
        session_hour_rate_usd: Cost per session-hour [ASSUMED -- R-4].
        billing_granularity: How session-hours are rounded [ASSUMED -- R-4].
        endpoints: Configurable API paths [ASSUMED -- R-1].
    """

    api_key_env: str = "ANTHROPIC_API_KEY"
    base_url: str = "https://api.anthropic.com"
    api_version: str = "2025-01-01"
    default_environment: ClaudeManagedEnvironment = field(
        default_factory=ClaudeManagedEnvironment
    )
    max_concurrent_sessions: int = 5
    session_hour_rate_usd: float = 0.08
    billing_granularity: str = "proportional"  # "ceil" | "floor" | "proportional"
    endpoints: ClaudeManagedEndpoints = field(
        default_factory=ClaudeManagedEndpoints
    )


# ---------------------------------------------------------------------------
# SSE Event Types
# ---------------------------------------------------------------------------

class EventType(Enum):
    """SSE event types from Claude Managed Agents API.

    Note: tool_use is delivered via content_block_start (type='tool_use') +
    content_block_delta (type='input_json_delta'), NOT as a standalone event.
    If Managed Agents API introduces a dedicated tool_use event [ASSUMED -- R-2],
    add it here after R-2 verification.
    """

    MESSAGE_START = "message_start"
    CONTENT_BLOCK_START = "content_block_start"
    CONTENT_BLOCK_DELTA = "content_block_delta"
    CONTENT_BLOCK_STOP = "content_block_stop"
    MESSAGE_DELTA = "message_delta"
    MESSAGE_STOP = "message_stop"
    ERROR = "error"
    PING = "ping"


@dataclass(frozen=True)
class ClaudeManagedEvent:
    """A single SSE event from a managed agent session."""

    type: EventType
    data: dict
    event_id: str | None = None
    timestamp_ms: int = 0


# ---------------------------------------------------------------------------
# Session State
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SessionUsage:
    """Token usage for a single message in a session."""

    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0


@dataclass
class ClaudeManagedSession:
    """Tracks the state of an active managed agent session.

    Note: This is intentionally NOT frozen -- status and events are mutable
    during the session lifecycle. All other types remain frozen.
    """

    session_id: str
    agent_id: str
    started_at: float  # monotonic time
    status: str = "active"  # "active" | "completed" | "failed" | "cancelled"
    events: list[ClaudeManagedEvent] = field(default_factory=list)
    total_usage: SessionUsage = field(default_factory=SessionUsage)
    model: str = ""


@dataclass(frozen=True)
class SessionCost:
    """Breakdown of costs for a managed agent session."""

    session_hour_usd: float = 0.0
    token_usd: float = 0.0
    total_usd: float = 0.0


# ---------------------------------------------------------------------------
# Error Types
# ---------------------------------------------------------------------------

class ClaudeManagedError(Exception):
    """Base error for Claude Managed Agents adapter."""


class ClaudeManagedAPIError(ClaudeManagedError):
    """HTTP API error from Claude Managed Agents.

    Attributes:
        status_code: HTTP status code.
        message: Error message from API.
    """

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(f"HTTP {status_code}: {message}")


class ClaudeManagedAuthError(ClaudeManagedError):
    """Authentication error -- API key missing or invalid."""


class ClaudeManagedLimitError(ClaudeManagedError):
    """Concurrent session limit reached."""


class ClaudeManagedStreamError(ClaudeManagedError):
    """SSE stream error -- disconnect, incomplete, or parse failure."""
