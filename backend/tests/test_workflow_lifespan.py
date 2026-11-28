"""Worker failure must not prevent Redis/Mongo shutdown cleanup."""

import asyncio
from unittest.mock import AsyncMock, Mock

import pytest

import server


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [RuntimeError("worker stopped"), asyncio.CancelledError()])
async def test_failed_workflow_always_closes_resources(monkeypatch, failure):
    started = asyncio.Event()

    async def failed_worker(stop):
        started.set()
        raise failure

    close_limiter = AsyncMock()
    close_client = Mock()
    monkeypatch.setenv("WORKFLOW_WORKER_ENABLED", "1")
    monkeypatch.setattr(server, "ensure_indexes", AsyncMock())
    monkeypatch.setattr(server, "run_workflow_worker", failed_worker)
    monkeypatch.setattr(server, "close_rate_limiter", close_limiter)
    monkeypatch.setattr(server.client, "close", close_client)
    async with server.lifespan(server.app):
        await asyncio.wait_for(started.wait(), 2)
    close_limiter.assert_awaited_once()
    close_client.assert_called_once()
