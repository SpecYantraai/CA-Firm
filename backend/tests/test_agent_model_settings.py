import json
import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import test_risk_agent as helpers
from app.api.v1.endpoints import agent_settings
from app.models.models import AppSetting
from app.services import agent_model_settings
from app.services.risk_agent import call_agent
from agent_bridge import worker


class AgentModelSettingsTests(unittest.TestCase):
    def setUp(self):
        helpers.AgentIntegrationTests.setUp(self)
        self.api.app.include_router(agent_settings.router, prefix="/api/v1")
        self.actor = self.admin
        self.endpoint = "/api/v1/settings/ai-agents"
        self.payload = {"enabled": True, "provider": "openai-compatible", "model": "local-audit-model",
                        "base_url": "http://127.0.0.1:9000/v1/chat/completions", "timeout_seconds": 45,
                        "api_key": "test-only-private-model-key"}

    tearDown = helpers.AgentIntegrationTests.tearDown

    def test_admin_only_encryption_and_runtime_configuration(self):
        self.actor = self.client_user
        self.assertEqual(self.api.get(self.endpoint).status_code, 403)
        self.assertEqual(self.api.put(self.endpoint, json=self.payload).status_code, 403)
        self.actor = self.admin
        response = self.api.put(self.endpoint, json=self.payload)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["base_url"], "http://127.0.0.1:9000/v1")
        self.assertTrue(response.json()["key_stored"])
        self.assertNotIn(self.payload["api_key"], response.text)
        self.assertNotIn("api_key_encrypted", response.json())
        with self.Session() as db:
            stored = db.get(AppSetting, agent_model_settings.SETTING_KEY).value
            self.assertNotIn(self.payload["api_key"], stored)
            self.assertEqual(agent_model_settings.runtime_settings(json.loads(stored))["api_key"], self.payload["api_key"])
        active = call_agent("configuration")
        self.assertEqual(active["configuration_source"], "admin")
        self.assertEqual(active["configured_provider"], "openai-compatible")
        self.assertEqual(active["model"], "local-audit-model")
        self.assertEqual(active["base_url"], "http://127.0.0.1:9000/v1")
        self.assertTrue(active["key_configured"])
        self.assertNotIn(self.payload["api_key"], json.dumps(active))

    def test_keep_clear_and_disable(self):
        self.api.put(self.endpoint, json=self.payload)
        update = {**self.payload, "api_key": None, "model": "replacement-model"}
        self.assertEqual(self.api.put(self.endpoint, json=update).status_code, 200)
        with self.Session() as db:
            config = agent_model_settings.runtime_settings(agent_model_settings.stored_settings(db))
            self.assertEqual(config["api_key"], self.payload["api_key"])
        cleared = self.api.put(self.endpoint, json={**update, "clear_api_key": True})
        self.assertFalse(cleared.json()["key_stored"])
        self.assertFalse(call_agent("configuration")["key_configured"])
        disabled = self.api.put(self.endpoint, json={**update, "enabled": False})
        self.assertEqual(disabled.status_code, 200)
        self.assertEqual(call_agent("configuration")["configuration_source"], "server")

    def test_endpoint_validation_and_nonpersisting_connection_test(self):
        for value in ("file:///tmp/model", "https://user:password@example.test/v1", "https://example.test/v1?api_key=secret"):
            result = self.api.put(self.endpoint, json={**self.payload, "base_url": value})
            self.assertEqual(result.status_code, 422)
        with patch.object(agent_settings, "call_agent", return_value={"connected": True, "model_listed": True}) as transport:
            response = self.api.post(self.endpoint + "/test", json=self.payload)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(transport.call_args.kwargs["model_configuration"]["base_url"], "http://127.0.0.1:9000/v1")
            self.assertEqual(transport.call_args.kwargs["model_configuration"]["api_key"], self.payload["api_key"])
        with self.Session() as db:
            self.assertIsNone(db.get(AppSetting, agent_model_settings.SETTING_KEY))

    def test_worker_applies_configuration_to_original_agent_client(self):
        config = {**self.payload, "base_url": "http://127.0.0.1:9000/v1"}
        request = {"operation": "run", "model_configuration": config, "data": {"engagement_id": "eng-a"}}
        with patch.dict(os.environ), patch("llm.client.LLMClient") as factory, patch("agents.risk_assessment_agent.RiskAssessmentAgent") as agent:
            agent.return_value.run.return_value = {"status": "complete"}
            result = worker.dispatch(request)
            agent.assert_called_once_with(llm_client=factory.return_value)
            self.assertEqual(factory.return_value._provider.client.base_url, config["base_url"])
            self.assertEqual(os.environ["LLM_PROVIDER"], "openai")
            self.assertEqual(os.environ["LLM_MODEL"], config["model"])
            self.assertEqual(os.environ["OPENAI_API_KEY"], config["api_key"])
            self.assertEqual(factory.return_value._provider.client.timeout, 45)
            self.assertEqual(result, {"status": "complete"})
        with patch.dict(os.environ), patch("llm.client.LLMClient") as factory:
            instance = factory.return_value
            instance.model_name = "local-audit-model"
            instance._provider.client.with_options.return_value.models.list.return_value.data = [SimpleNamespace(id="local-audit-model")]
            result = worker.dispatch({**request, "operation": "test_connection"})
            self.assertEqual(result, {"connected": True, "model_listed": True})
            instance._provider.client.with_options.return_value.models.list.side_effect = RuntimeError(config["api_key"])
            with self.assertRaises(RuntimeError) as failure:
                worker.dispatch({**request, "operation": "test_connection"})
            self.assertNotIn(config["api_key"], str(failure.exception))


if __name__ == "__main__":
    unittest.main()
