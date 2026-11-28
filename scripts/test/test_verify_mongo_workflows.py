"""Harness safety tests, separate from backend conftest and its database mocks.

python -B -m unittest discover -s scripts/test -p test_verify_mongo_workflows.py
The optional failure-cleanup test uses a real disposable Mongo only with the same
explicit TNL_INTEGRATION_MONGO_URL opt-in as the integration script.
"""

import contextlib
import io
import json
import multiprocessing
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import verify_mongo_workflows as harness


def stalled_process(connection):
    connection.send({"event": "ready", "pid": os.getpid()})
    multiprocessing.Event().wait(20)
    connection.close()


class SafetyTests(unittest.TestCase):
    def test_missing_opt_in_never_uses_backend_environment(self):
        with self.assertRaises(harness.SafetyError):
            harness.configuration({"MONGO_URL": "mongodb://production.invalid", "DB_NAME": "production"})

    def test_only_local_disposable_targets_are_accepted(self):
        for uri in (
            "mongodb://127.0.0.1:27017", "mongodb://localhost:27017/",
            "mongodb://[::1]:27017/", "mongodb://mongo:27017", "mongodb://mongodb:27017",
        ):
            with self.subTest(uri=uri):
                self.assertEqual(harness.validate_uri(uri), uri)
        for uri in (
            "mongodb://100.111.32.102:27017", "mongodb://production.invalid:27017",
            "mongodb+srv://production.invalid", "mongodb://127.0.0.1,production.invalid/",
            "mongodb://127.0.0.1:27017,127.0.0.1:27018/", "mongodb://127.0.0.1/#fragment",
        ):
            with self.subTest(uri=uri), self.assertRaises(harness.SafetyError):
                harness.validate_uri(uri)

    def test_caller_selected_nonintegration_databases_are_refused(self):
        for database in ("admin", "local", "tnl", "%74nl", "tnl_integration_", "tnl_integration_bad"):
            with self.subTest(database=database), self.assertRaises(harness.SafetyError):
                harness.validate_uri("mongodb://127.0.0.1/" + database)
        with self.assertRaises(harness.SafetyError):
            harness.configuration({
                "TNL_INTEGRATION_MONGO_URL": "mongodb://127.0.0.1/",
                "TNL_INTEGRATION_DB_NAME": "production",
            })

    def test_generated_database_is_fresh_and_does_not_reuse_uri_database(self):
        supplied = harness.DB_PREFIX + "a" * 32
        environment = {"TNL_INTEGRATION_MONGO_URL": "mongodb://127.0.0.1/" + supplied}
        first = harness.configuration(environment)
        second = harness.configuration(environment)
        self.assertRegex(first.database, harness.DB_PATTERN)
        self.assertNotEqual(first.database, supplied)
        self.assertNotEqual(first.database, second.database)
        self.assertNotEqual(first.owner, second.owner)

    def test_client_has_bounds_and_cannot_discover_remote_replica_members(self):
        config = harness.configuration({"TNL_INTEGRATION_MONGO_URL": "mongodb://127.0.0.1/"})
        with patch("motor.motor_asyncio.AsyncIOMotorClient") as factory:
            harness.mongo_client(config)
        options = factory.call_args.kwargs
        self.assertTrue(options["directConnection"])
        self.assertFalse(options["retryWrites"])
        for option in ("serverSelectionTimeoutMS", "connectTimeoutMS", "socketTimeoutMS", "waitQueueTimeoutMS", "timeoutMS"):
            self.assertGreater(options[option], 0)
            self.assertLessEqual(options[option], 7000)
        self.assertEqual(options["w"], 1)

    def test_config_representation_never_contains_credentials_or_owner(self):
        config = harness.Config("mongodb://fixture:never-echo-this@127.0.0.1/", harness.DB_PREFIX + "c" * 32, "owner-secret")
        self.assertNotIn("never-echo-this", repr(config))
        self.assertNotIn("owner-secret", repr(config))

    def test_refusal_output_does_not_echo_uri_credentials(self):
        output = io.StringIO()
        with patch.dict(os.environ, {"TNL_INTEGRATION_MONGO_URL": "mongodb://fixture:never-echo-this@127.0.0.1/production"}, clear=True), patch.object(
            harness.sys, "argv", ["verify_mongo_workflows.py"]
        ), contextlib.redirect_stdout(output):
            code = harness.main()
        self.assertEqual(code, 2)
        result = json.loads(output.getvalue())
        self.assertFalse(result["ok"])
        self.assertNotIn("never-echo-this", output.getvalue())
        self.assertNotIn("mongodb://", output.getvalue())


class CleanupGuardTests(unittest.IsolatedAsyncioTestCase):
    def fixture(self, token="owner", name=None):
        config = harness.Config("mongodb://127.0.0.1/", name or harness.DB_PREFIX + "b" * 32, "owner")
        database = MagicMock()
        database.integration_guard.find_one = AsyncMock(return_value={"token": token})
        database.list_collection_names = AsyncMock(return_value=[])
        client = MagicMock()
        client.__getitem__.return_value = database
        client.drop_database = AsyncMock()
        return config, client

    async def test_drop_requires_this_runs_owner_marker(self):
        config, client = self.fixture(token="someone-else")
        with self.assertRaises(harness.SafetyError):
            await harness.cleanup_database(client, config)
        client.drop_database.assert_not_awaited()

    async def test_nonintegration_database_can_never_be_dropped(self):
        config, client = self.fixture(name="production")
        with self.assertRaises(harness.SafetyError):
            await harness.cleanup_database(client, config)
        client.drop_database.assert_not_awaited()

    async def test_only_exact_generated_database_is_dropped(self):
        config, client = self.fixture()
        self.assertTrue(await harness.cleanup_database(client, config))
        client.drop_database.assert_awaited_once_with(config.database)


class WorkerSupervisionTests(unittest.IsolatedAsyncioTestCase):
    async def test_stalled_os_process_times_out_and_is_reaped(self):
        context = multiprocessing.get_context("spawn")
        receiver, sender = context.Pipe(duplex=False)
        process = context.Process(target=stalled_process, args=(sender,), daemon=True)
        process.start()
        sender.close()
        process_id = process.pid
        workers = [(process, receiver)]
        try:
            await harness.messages(workers, "ready", seconds=10)
            with self.assertRaisesRegex(harness.VerificationError, "process_phase_timeout"):
                await harness.messages(workers, "result", seconds=0.05)
        finally:
            harness.stop_workers(workers)
        self.assertNotIn(process_id, {child.pid for child in multiprocessing.active_children()})


@unittest.skipUnless(os.environ.get("TNL_INTEGRATION_MONGO_URL"), "requires explicit disposable real Mongo opt-in")
class RealCleanupFailureTest(unittest.IsolatedAsyncioTestCase):
    async def test_real_temporary_database_is_cleaned_after_injected_failure(self):
        config = harness.configuration()
        report = {}
        with patch.object(harness, "backend_modules", side_effect=harness.VerificationError("injected_failure")):
            with self.assertRaises(harness.VerificationError):
                await harness.coordinate(config, report)
        self.assertTrue(report["cleanup_completed"])
        client = harness.mongo_client(config)
        try:
            self.assertEqual(await client[config.database].list_collection_names(), [])
        finally:
            client.close()


if __name__ == "__main__":
    unittest.main()
