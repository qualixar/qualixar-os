"""Claude Managed Agents adapter -- lifecycle adapter for Qualixar OS.

NEW adapter category (managed adapter): create agent -> create session ->
stream SSE events -> cleanup. Does NOT wrap QosClient.

All API endpoints are [ASSUMED -- R-1]. Adapter is endpoint-agnostic.

TYPE CHANGES NEEDED (applied by Angle 3):
  - src/types/common.ts: Add 'claude-managed' to ProviderConfigSchema.type enum
  - src/types/events.ts: Add 5 managed: event types (see claude_managed_types.py)

Copyright (c) 2026 Varun Pratap Bhardwaj | Qualixar OS | FSL-1.1-ALv2
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Callable

import httpx

from .claude_managed_sse import SSEParser
from .claude_managed_types import (
    ClaudeManagedAPIError,
    ClaudeManagedAuthError,
    ClaudeManagedConfig,
    ClaudeManagedEnvironment,
    ClaudeManagedEvent,
    ClaudeManagedLimitError,
    ClaudeManagedSession,
    ClaudeManagedStreamError,
    EventType,
    SessionCost,
    SessionUsage,
)
from .client import TaskResult

logger = logging.getLogger("qualixar-os.managed")

# C-03 FIX: Suppress httpx debug logging to prevent credential leakage
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MAX_RETRIES = 3
_RETRY_BASE_SECONDS = 1.0
_RETRY_MAX_SECONDS = 30.0
_MAX_TIMEOUT_HOURS = 24.0  # H-06 FIX: Upper bound for session timeout
_MAX_EVENTS_PER_SESSION = 10_000  # M-06 FIX: Cap event list growth

# Default token pricing for claude-sonnet-4-6 [ASSUMED -- R-4]
_DEFAULT_COST_PER_INPUT_TOKEN = 0.000003
_DEFAULT_COST_PER_OUTPUT_TOKEN = 0.000015

# C-04 FIX: Patterns for credential-like values in error responses
_CREDENTIAL_PATTERNS = re.compile(
    r"(sk-[a-zA-Z0-9]{10,}|"           # Anthropic API keys
    r"[A-Za-z0-9+/]{40,}={0,2}|"       # Base64-encoded secrets
    r"Bearer\s+\S{10,}|"               # Bearer tokens
    r'"value"\s*:\s*"[^"]{8,}")',       # Credential value fields in JSON
    re.IGNORECASE,
)


def _sanitize_error(raw_text: str) -> str:
    """C-04 FIX: Strip credential-like values and truncate error bodies."""
    return _CREDENTIAL_PATTERNS.sub("[REDACTED]", raw_text[:500])


# ---------------------------------------------------------------------------
# Session Cost Accumulator
# ---------------------------------------------------------------------------

class SessionCostAccumulator:
    """Tracks session-hour + token costs. Billing: proportional/ceil/floor [ASSUMED -- R-4]."""

    def __init__(
        self,
        session_hour_rate_usd: float,
        billing_granularity: str,
        cost_per_input_token: float = _DEFAULT_COST_PER_INPUT_TOKEN,
        cost_per_output_token: float = _DEFAULT_COST_PER_OUTPUT_TOKEN,
    ) -> None:
        self._session_hour_rate = session_hour_rate_usd
        self._billing_granularity = billing_granularity
        self._cost_per_input = cost_per_input_token
        self._cost_per_output = cost_per_output_token
        # session_id -> (input_tokens, output_tokens)
        self._token_usage: dict[str, tuple[int, int]] = {}

    def record_tokens(self, session_id: str, input_tokens: int, output_tokens: int) -> None:
        prev_in, prev_out = self._token_usage.get(session_id, (0, 0))
        self._token_usage[session_id] = (prev_in + input_tokens, prev_out + output_tokens)

    def get_token_cost(self, session_id: str) -> float:
        in_tok, out_tok = self._token_usage.get(session_id, (0, 0))
        return (in_tok * self._cost_per_input) + (out_tok * self._cost_per_output)

    def get_session_hour_cost(self, session_id: str, elapsed_seconds: float) -> float:
        elapsed_hours = elapsed_seconds / 3600.0
        if self._billing_granularity == "ceil":
            billed_hours = math.ceil(elapsed_hours) if elapsed_hours > 0 else 0.0
        elif self._billing_granularity == "floor":
            billed_hours = math.floor(elapsed_hours)
        else:
            billed_hours = elapsed_hours
        return billed_hours * self._session_hour_rate

    def clear(self, session_id: str) -> None:
        self._token_usage.pop(session_id, None)


# ---------------------------------------------------------------------------
# Agent Config (input to create_agent) -- M-02 FIX: Frozen dataclass
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class AgentConfig:
    """Config for creating a managed agent (model, instructions, tools, max_tokens)."""

    model: str
    system_prompt: str = ""
    tools: tuple[dict[str, Any], ...] = ()
    max_tokens: int = 4096


# ---------------------------------------------------------------------------
# Claude Managed Adapter
# ---------------------------------------------------------------------------

class ClaudeManagedAdapter:
    """Lifecycle adapter for Claude Managed Agents API.

    Usage::

        async with ClaudeManagedAdapter(config) as adapter:
            agent_id = await adapter.create_agent(agent_config)
            session_id = await adapter.create_session(agent_id)
            result = await adapter.execute_task(session_id, prompt)
    """

    def __init__(
        self,
        config: ClaudeManagedConfig | None = None,
        *,
        event_callback: Callable[[str, dict[str, Any]], None] | None = None,
        budget_remaining_usd: float | None = None,
    ) -> None:
        self.config = config or ClaudeManagedConfig()

        # HR-6: HTTPS only
        if not self.config.base_url.startswith("https://"):
            raise ValueError(
                f"base_url must use HTTPS, got: {self.config.base_url}"
            )

        # HR-1: Resolve API key from env var (NEVER log/store the key)
        api_key = os.environ.get(self.config.api_key_env)
        if not api_key:
            raise ValueError(
                f"API key environment variable '{self.config.api_key_env}' is not set"
            )

        # Create managed HTTP client (separate from QosClient)
        self._client = httpx.AsyncClient(
            base_url=self.config.base_url,
            headers={
                "x-api-key": api_key,
                "anthropic-version": self.config.api_version,
                "content-type": "application/json",
            },
            timeout=httpx.Timeout(connect=10.0, read=None),  # SSE = no read timeout
        )

        # Session tracking (HR-5: no global state)
        self._active_sessions: dict[str, ClaudeManagedSession] = {}
        self._session_timers: dict[str, asyncio.Task[None]] = {}

        # Cost tracking (HR-4: both session-hour AND token costs)
        self._cost_accumulator = SessionCostAccumulator(
            session_hour_rate_usd=self.config.session_hour_rate_usd,
            billing_granularity=self.config.billing_granularity,
        )

        # Event callback for Qualixar OS EventBus integration
        self._event_callback = event_callback

        # Budget tracking
        self._budget_remaining_usd = budget_remaining_usd

    # -- Context Manager ---------------------------------------------------

    async def __aenter__(self) -> ClaudeManagedAdapter:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: Any,
    ) -> None:
        await self.close()

    # -- Agent Creation (Step 2) -------------------------------------------

    async def create_agent(self, agent_config: AgentConfig) -> str:
        """Create a managed agent and return its ID."""
        body = {
            "model": agent_config.model,
            "instructions": agent_config.system_prompt,
            "tools": list(agent_config.tools),
            "max_tokens": agent_config.max_tokens,
            "metadata": {"source": "qualixar-os", "version": "2.0.0"},
        }

        # POST to create_agent endpoint [ASSUMED -- R-1]
        resp = await self._post_with_retry(
            self.config.endpoints.create_agent, body
        )
        data = resp.json()
        agent_id: str = data.get("id", "")

        if not agent_id:
            raise ClaudeManagedAPIError(
                resp.status_code, "Agent creation response missing 'id'"
            )

        logger.info("Created managed agent: %s", agent_id)
        return agent_id

    # -- Session Creation (Step 3) -----------------------------------------

    async def create_session(
        self, agent_id: str, env_config: ClaudeManagedEnvironment | None = None,
    ) -> str:
        """Create a session for a managed agent and return session ID."""
        # HR-7: Enforce concurrent session limit
        if len(self._active_sessions) >= self.config.max_concurrent_sessions:
            self._emit_event("managed:session_limit", {
                "agent_id": agent_id,
                "active_count": len(self._active_sessions),
                "max": self.config.max_concurrent_sessions,
            })
            raise ClaudeManagedLimitError("Max concurrent sessions reached")

        # Merge environment configs (explicit overrides defaults)
        merged = self._merge_environment(env_config)

        # Warn if sandbox disabled (Section 10.3)
        if not merged.sandbox:
            logger.warning(
                "Sandbox disabled for agent %s -- running without isolation",
                agent_id,
            )

        # C-03 FIX: Resolve credential values from env vars without logging values
        resolved_creds = []
        for cred in merged.credentials:
            cred_value = os.environ.get(cred.value_env)
            if cred_value is None:
                logger.warning(
                    "Credential env var not set, skipping credential: %s",
                    cred.name,
                )
                continue
            resolved_creds.append({
                "name": cred.name,
                "value": cred_value,
                "scope": cred.scope,
            })
            # Log credential NAMES (not values or env var names) per Section 10.2
            logger.info("Injecting credential: %s (scope: %s)", cred.name, cred.scope)

        body = {
            "sandbox": merged.sandbox,
            "timeout_hours": merged.timeout_hours,
            "credentials": resolved_creds,
        }

        # POST to create_session endpoint [ASSUMED -- R-1]
        path = self.config.endpoints.create_session.format(agent_id=agent_id)
        resp = await self._post_with_retry(path, body)
        data = resp.json()
        session_id: str = data.get("id", "")

        if not session_id:
            self._emit_event("managed:session_failed", {
                "agent_id": agent_id,
                "reason": "Response missing 'id'",
            })
            raise ClaudeManagedAPIError(
                resp.status_code, "Session creation response missing 'id'"
            )

        # Track session
        self._active_sessions[session_id] = ClaudeManagedSession(
            session_id=session_id,
            agent_id=agent_id,
            started_at=time.monotonic(),
            status="active",
        )

        # H-06 FIX: Cap timeout_hours to prevent unbounded background tasks
        capped_timeout_hours = min(merged.timeout_hours, _MAX_TIMEOUT_HOURS)
        timeout_secs = capped_timeout_hours * 3600
        self._session_timers[session_id] = asyncio.create_task(
            self._session_timeout_watcher(session_id, timeout_secs)
        )

        self._emit_event("agent:started", {
            "agent_id": agent_id,
            "session_id": session_id,
        })

        logger.info("Created managed session: %s (agent: %s)", session_id, agent_id)
        return session_id

    # -- Task Execution (Step 4) -------------------------------------------

    async def execute_task(
        self, session_id: str, prompt: str, task_type: str = "custom",
    ) -> TaskResult:
        """Execute a task within a managed session. Returns TaskResult."""
        if session_id not in self._active_sessions:
            raise ValueError(f"Session '{session_id}' is not active")

        session = self._active_sessions[session_id]
        start_time = time.monotonic()

        # Build prompt with type prefix
        full_prompt = prompt
        if task_type != "custom":
            full_prompt = f"[{task_type.upper()}] {prompt}"

        body = {"role": "user", "content": full_prompt}

        # POST to send_message endpoint [ASSUMED -- R-1]
        path = self.config.endpoints.send_message.format(
            session_id=session_id
        )

        try:
            # Stream SSE response
            output = await self._stream_response(session_id, path, body)

            # Map to TaskResult
            return self._map_to_task_result(
                session_id=session_id,
                output=output,
                events=list(session.events),
                start_time=start_time,
            )
        except Exception:
            # HR-2: Session cleanup MUST happen even on error
            await self.cleanup_session(session_id)
            raise

    # -- SSE Stream Consumption (Step 5) -----------------------------------

    async def _stream_response(
        self, session_id: str, path: str, body: dict[str, Any],
    ) -> str:
        """Send message and consume SSE event stream. Returns text output."""
        session = self._active_sessions[session_id]
        parser = SSEParser()
        output_parts: list[str] = []
        tool_results: list[dict[str, Any]] = []
        current_tool: dict[str, Any] | None = None
        current_tool_input_json = ""

        try:
            async with self._client.stream(
                "POST", path, json=body
            ) as response:
                if response.status_code >= 400:
                    error_body = await response.aread()
                    # C-04 FIX: Sanitize error response before propagating
                    raw_error = error_body.decode("utf-8", errors="replace")
                    raise ClaudeManagedAPIError(
                        response.status_code,
                        _sanitize_error(raw_error),
                    )

                # M-05 FIX: Validate Content-Type header for SSE stream
                content_type = response.headers.get("content-type", "")
                if "text/event-stream" not in content_type:
                    raise ClaudeManagedStreamError(
                        f"Expected Content-Type 'text/event-stream', "
                        f"got: {content_type[:100]}"
                    )

                async for raw_line in response.aiter_lines():
                    event = parser.parse_line(raw_line)
                    if event is None:
                        continue

                    # M-06 FIX: Cap event list growth
                    if len(session.events) < _MAX_EVENTS_PER_SESSION:
                        session.events.append(event)

                    # Handle each event type per LLD Step 5
                    if event.type == EventType.MESSAGE_START:
                        model = event.data.get("message", {}).get("model", "")
                        session.model = model

                    elif event.type == EventType.CONTENT_BLOCK_START:
                        block = event.data.get("content_block", {})
                        if block.get("type") == "tool_use":
                            current_tool = {
                                "id": block.get("id", ""),
                                "name": block.get("name", ""),
                            }
                            current_tool_input_json = ""

                    elif event.type == EventType.CONTENT_BLOCK_DELTA:
                        delta = event.data.get("delta", {})
                        delta_type = delta.get("type", "")
                        if delta_type == "text_delta":
                            text = delta.get("text", "")
                            output_parts.append(text)
                            self._emit_event("managed:text_delta", {
                                "session_id": session_id,
                                "partial_content": text,
                            })
                        elif delta_type == "input_json_delta":
                            # Accumulate tool input JSON [ASSUMED -- R-2]
                            current_tool_input_json += delta.get(
                                "partial_json", ""
                            )

                    elif event.type == EventType.CONTENT_BLOCK_STOP:
                        if current_tool is not None:
                            try:
                                parsed_input = json.loads(
                                    current_tool_input_json
                                ) if current_tool_input_json else {}
                            except json.JSONDecodeError:
                                parsed_input = {
                                    "raw": current_tool_input_json
                                }
                            tool_results.append({
                                **current_tool,
                                "input": parsed_input,
                            })
                            current_tool = None
                            current_tool_input_json = ""

                    elif event.type == EventType.MESSAGE_DELTA:
                        usage = event.data.get("usage", {})
                        in_tokens = usage.get("input_tokens", 0)
                        out_tokens = usage.get("output_tokens", 0)
                        if in_tokens or out_tokens:
                            self._cost_accumulator.record_tokens(
                                session_id, in_tokens, out_tokens
                            )
                            # Update session usage (immutable replacement)
                            prev = session.total_usage
                            session.total_usage = SessionUsage(
                                input_tokens=prev.input_tokens + in_tokens,
                                output_tokens=prev.output_tokens + out_tokens,
                                cache_creation_input_tokens=(
                                    prev.cache_creation_input_tokens
                                    + usage.get("cache_creation_input_tokens", 0)
                                ),
                                cache_read_input_tokens=(
                                    prev.cache_read_input_tokens
                                    + usage.get("cache_read_input_tokens", 0)
                                ),
                            )

                    elif event.type == EventType.MESSAGE_STOP:
                        session.status = "completed"
                        self._emit_event("agent:completed", {
                            "session_id": session_id,
                            "model": session.model,
                        })

                    elif event.type == EventType.ERROR:
                        error_msg = event.data.get("error", {}).get(
                            "message", "Unknown stream error"
                        )
                        session.status = "failed"
                        self._emit_event("task:failed", {
                            "session_id": session_id,
                            "error": _sanitize_error(error_msg),
                        })
                        raise ClaudeManagedStreamError(
                            _sanitize_error(error_msg)
                        )

                    # PING and unknown types are silently ignored

        except httpx.HTTPError as exc:
            self._emit_event("managed:session_reconnecting", {
                "session_id": session_id,
                "error": str(exc),
            })
            raise ClaudeManagedStreamError(
                f"Network error during SSE stream: {exc}"
            ) from exc

        # Check for incomplete stream (E-12)
        if session.status != "completed":
            self._emit_event("managed:stream_incomplete", {
                "session_id": session_id,
                "events_count": len(session.events),
            })
            session.status = "failed"

        return "".join(output_parts)

    # -- Result Mapping (Step 6) -------------------------------------------

    def _map_to_task_result(
        self, session_id: str, output: str,
        events: list[ClaudeManagedEvent], start_time: float,
    ) -> TaskResult:
        """Map SSE results to Python TaskResult. Rich cost via get_session_cost()."""
        session = self._active_sessions.get(session_id)
        if session is None:
            status = "failed"
        elif any(e.type == EventType.ERROR for e in events):
            status = "failed"
        elif session.status == "completed":
            status = "completed"
        else:
            status = "failed"

        # Calculate cost
        elapsed = time.monotonic() - start_time
        cost = self._calculate_session_cost(session_id, elapsed)
        total_cost = cost.total_usd

        # Track budget
        if self._budget_remaining_usd is not None:
            self._budget_remaining_usd = max(
                0.0, self._budget_remaining_usd - total_cost
            )

        duration_ms = int(elapsed * 1000)

        return TaskResult(
            task_id=session_id,
            status=status,
            output=output,
            cost_usd=total_cost,
            duration_ms=duration_ms,
            metadata={
                "provider": "claude-managed",
                "session_id": session_id,
                "events_count": len(events),
                "model": session.model if session else "",
                "session_hour_usd": cost.session_hour_usd,
                "token_usd": cost.token_usd,
            },
        )

    # -- Session Cleanup (Step 7) ------------------------------------------

    async def cleanup_session(self, session_id: str) -> None:
        """Clean up a managed session (idempotent, best-effort cancel)."""
        if session_id not in self._active_sessions:
            return  # Idempotent

        # Cancel timeout timer
        timer = self._session_timers.pop(session_id, None)
        if timer is not None and not timer.done():
            timer.cancel()

        try:
            # POST to cancel endpoint [ASSUMED -- R-1]
            path = self.config.endpoints.cancel_session.format(
                session_id=session_id
            )
            await self._client.post(path)
            logger.info("Cleaned up session: %s", session_id)
        except httpx.HTTPError as exc:
            # Cleanup is best-effort
            logger.warning(
                "Failed to cancel session %s (best-effort): %s",
                session_id,
                exc,
            )
        finally:
            # Always remove from tracking
            self._cost_accumulator.clear(session_id)
            self._active_sessions.pop(session_id, None)

    # -- Resource Cleanup (Step 8) -----------------------------------------

    async def close(self) -> None:
        """Clean up all sessions and close the HTTP client."""
        # Clean up all active sessions
        session_ids = list(self._active_sessions.keys())
        for sid in session_ids:
            await self.cleanup_session(sid)

        # Close HTTP client
        await self._client.aclose()
        logger.info("Claude Managed adapter closed")

    # -- Public Queries ----------------------------------------------------

    def get_session_cost(self, session_id: str) -> SessionCost:
        """Get current cost breakdown for a session."""
        session = self._active_sessions.get(session_id)
        if session is None:
            return SessionCost()

        elapsed = time.monotonic() - session.started_at
        return self._calculate_session_cost(session_id, elapsed)

    def get_active_sessions(self) -> list[str]:
        """Return list of active session IDs."""
        return list(self._active_sessions.keys())

    def get_budget_remaining(self) -> float:
        """Return remaining budget in USD. Infinity if no budget set."""
        if self._budget_remaining_usd is None:
            return float("inf")
        return self._budget_remaining_usd

    # -- Internal Helpers --------------------------------------------------

    async def _post_with_retry(
        self, path: str, body: dict[str, Any],
    ) -> httpx.Response:
        """POST with exponential backoff retry on 5xx/429. 4xx raises immediately."""
        last_error: Exception | None = None

        for attempt in range(_MAX_RETRIES):
            try:
                resp = await self._client.post(path, json=body)

                if resp.status_code == 401:
                    # M-02 security FIX: Remove env var name from error message
                    raise ClaudeManagedAuthError(
                        "API key invalid or expired"
                    )

                if resp.status_code == 429:
                    # H-05 FIX: Cap Retry-After to prevent DoS amplification
                    raw_retry = float(
                        resp.headers.get("retry-after", _RETRY_BASE_SECONDS)
                    )
                    retry_after = min(raw_retry, _RETRY_MAX_SECONDS)
                    self._emit_event("model:call_retrying", {
                        "reason": "rate_limited",
                        "retry_after": retry_after,
                        "attempt": attempt + 1,
                    })
                    logger.warning(
                        "Rate limited (429), retrying after %.1fs",
                        retry_after,
                    )
                    await asyncio.sleep(retry_after)
                    continue

                if resp.status_code >= 500:
                    delay = min(
                        _RETRY_BASE_SECONDS * (2 ** attempt),
                        _RETRY_MAX_SECONDS,
                    )
                    logger.warning(
                        "Server error %d on %s, retrying in %.1fs (attempt %d/%d)",
                        resp.status_code,
                        path,
                        delay,
                        attempt + 1,
                        _MAX_RETRIES,
                    )
                    # C-04 FIX: Sanitize error text before storing
                    last_error = ClaudeManagedAPIError(
                        resp.status_code, _sanitize_error(resp.text)
                    )
                    await asyncio.sleep(delay)
                    continue

                if resp.status_code >= 400:
                    # C-04 FIX: Sanitize error response before propagating
                    raise ClaudeManagedAPIError(
                        resp.status_code, _sanitize_error(resp.text)
                    )

                return resp

            except httpx.HTTPError as exc:
                delay = min(
                    _RETRY_BASE_SECONDS * (2 ** attempt),
                    _RETRY_MAX_SECONDS,
                )
                logger.warning(
                    "Network error on %s, retrying in %.1fs: %s",
                    path,
                    delay,
                    exc,
                )
                last_error = exc
                await asyncio.sleep(delay)

        # All retries exhausted
        if isinstance(last_error, ClaudeManagedAPIError):
            raise last_error
        raise ClaudeManagedAPIError(
            500,
            f"All {_MAX_RETRIES} retries failed: {last_error}",
        )

    def _merge_environment(
        self,
        override: ClaudeManagedEnvironment | None,
    ) -> ClaudeManagedEnvironment:
        """Merge override environment with defaults (override wins)."""
        if override is None:
            return self.config.default_environment

        defaults = self.config.default_environment
        return ClaudeManagedEnvironment(
            sandbox=override.sandbox,
            timeout_hours=override.timeout_hours or defaults.timeout_hours,
            credentials=override.credentials or defaults.credentials,
        )

    def _calculate_session_cost(
        self, session_id: str, elapsed_seconds: float
    ) -> SessionCost:
        """Calculate cost breakdown for a session."""
        session_hour_usd = self._cost_accumulator.get_session_hour_cost(
            session_id, elapsed_seconds
        )
        token_usd = self._cost_accumulator.get_token_cost(session_id)
        return SessionCost(
            session_hour_usd=session_hour_usd,
            token_usd=token_usd,
            total_usd=session_hour_usd + token_usd,
        )

    async def _session_timeout_watcher(
        self, session_id: str, timeout_seconds: float
    ) -> None:
        """Background task that auto-cleans a session after timeout."""
        try:
            await asyncio.sleep(timeout_seconds)
            if session_id in self._active_sessions:
                self._emit_event("managed:session_timeout", {
                    "session_id": session_id,
                    "timeout_hours": timeout_seconds / 3600,
                })
                logger.warning(
                    "Session %s timed out after %.1f hours",
                    session_id,
                    timeout_seconds / 3600,
                )
                await self.cleanup_session(session_id)
        except asyncio.CancelledError:
            pass  # Timer cancelled -- session cleaned up normally

    def _emit_event(self, event_type: str, payload: dict[str, Any]) -> None:
        """Emit a Qualixar OS event via the callback if registered."""
        if self._event_callback is not None:
            try:
                self._event_callback(event_type, payload)
            except Exception:
                logger.debug(
                    "Event callback error for %s (non-fatal)", event_type,
                    exc_info=True,
                )


# ---------------------------------------------------------------------------
# Factory Function
# ---------------------------------------------------------------------------

def create_managed_adapter(
    config: ClaudeManagedConfig | None = None,
    *,
    event_callback: Callable[[str, dict[str, Any]], None] | None = None,
    budget_remaining_usd: float | None = None,
) -> ClaudeManagedAdapter:
    """Factory: create a ClaudeManagedAdapter ready for async context manager use."""
    return ClaudeManagedAdapter(
        config=config, event_callback=event_callback,
        budget_remaining_usd=budget_remaining_usd,
    )
