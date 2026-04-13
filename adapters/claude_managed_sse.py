"""SSE (Server-Sent Events) parser for Claude Managed Agents streaming.

Parses raw SSE lines into ClaudeManagedEvent objects. Follows the W3C SSE
specification with Anthropic-specific event type handling.

All event formats are [ASSUMED -- R-2] and may change after research verification.

Copyright (c) 2026 Varun Pratap Bhardwaj
Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
"""

from __future__ import annotations

import json
import logging
import time

from .claude_managed_types import ClaudeManagedEvent, EventType

logger = logging.getLogger("qualixar-os.managed.sse")


class SSEParser:
    """Line-by-line SSE parser for Claude Managed Agents event streams.

    Usage:
        parser = SSEParser()
        for raw_line in stream:
            event = parser.parse_line(raw_line)
            if event is not None:
                # Process complete event
                handle(event)
    """

    def __init__(self) -> None:
        self._event_type: str = ""
        self._data_buffer: list[str] = []
        self._event_id: str | None = None

    def parse_line(self, line: str) -> ClaudeManagedEvent | None:
        """Parse a single SSE line and return a complete event or None.

        Args:
            line: A single line from the SSE stream (may include trailing newline).

        Returns:
            A ClaudeManagedEvent if the line completes an event, None otherwise.
            Empty lines signal event completion per the W3C SSE spec.
        """
        line = line.rstrip("\n").rstrip("\r")

        # Empty line = event boundary -- dispatch buffered event
        if not line:
            return self._dispatch()

        # Comment lines (start with ':') are ignored per SSE spec
        if line.startswith(":"):
            return None

        # Parse field:value
        if ":" in line:
            field, _, value = line.partition(":")
            # SSE spec: strip single leading space from value
            if value.startswith(" "):
                value = value[1:]
        else:
            field = line
            value = ""

        if field == "event":
            self._event_type = value
        elif field == "data":
            self._data_buffer.append(value)
        elif field == "id":
            self._event_id = value
        # "retry" and unknown fields are ignored

        return None

    def _dispatch(self) -> ClaudeManagedEvent | None:
        """Dispatch the buffered event and reset state."""
        if not self._data_buffer:
            # No data accumulated -- skip
            self._reset()
            return None

        raw_data = "\n".join(self._data_buffer)

        # Determine event type
        event_type_str = self._event_type or "message"
        try:
            data = json.loads(raw_data)
        except json.JSONDecodeError:
            logger.warning("Failed to parse SSE data as JSON: %.100s...", raw_data)
            self._reset()
            return None

        # Map string event type to EventType enum
        # The actual event type is in data.type for Anthropic streams
        resolved_type_str = data.get("type", event_type_str)
        try:
            event_type = EventType(resolved_type_str)
        except ValueError:
            logger.debug("Unknown SSE event type: %s", resolved_type_str)
            # Return with a best-effort mapping -- use the raw type string
            # in data for consumers to inspect
            event_type = EventType.PING  # Fallback to safe no-op type

        event = ClaudeManagedEvent(
            type=event_type,
            data=data,
            event_id=self._event_id,
            timestamp_ms=int(time.time() * 1000),
        )

        self._reset()
        return event

    def _reset(self) -> None:
        """Reset parser state for the next event."""
        self._event_type = ""
        self._data_buffer = []
        self._event_id = None
