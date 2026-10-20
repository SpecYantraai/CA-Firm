"""
AMS — Pluggable LLM Client
Supports: NVIDIA Nemotron (default), Anthropic, OpenAI
Switch provider via .env — no code changes needed.

NVIDIA Nemotron uses OpenAI-compatible API at:
https://integrate.api.nvidia.com/v1
"""

from __future__ import annotations
import os
import time
import json
import structlog
from abc import ABC, abstractmethod
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed; env vars must be set manually
logger = structlog.get_logger()


# ─────────────────────────────────────────────
# Base interface
# ─────────────────────────────────────────────

class BaseLLMProvider(ABC):
    @abstractmethod
    def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.1,
    ) -> str:
        pass


# ─────────────────────────────────────────────
# NVIDIA Nemotron provider (default)
# Uses OpenAI-compatible API
# ─────────────────────────────────────────────

class NvidiaProvider(BaseLLMProvider):
    BASE_URL = "https://integrate.api.nvidia.com/v1"

    def __init__(self, model: str = "nvidia/nemotron-3.5-lightning-30b-a3b", timeout: int = 60):
        from openai import OpenAI
        api_key = os.environ.get("NVIDIA_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "NVIDIA_API_KEY not set. Get your key at: "
                "https://build.nvidia.com/"
            )
        self.client = OpenAI(
            api_key=api_key,
            base_url=self.BASE_URL,
        )
        self.model = model
        logger.info("llm.provider.init", provider="nvidia", model=model)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=4, max=30),
        retry=retry_if_exception_type(Exception),
        before_sleep=lambda rs: logger.warning("llm.retry", attempt=rs.attempt_number),
    )
    def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 16384,
        temperature: float = 1.0,
    ) -> str:
        logger.info("llm.call.start", provider="nvidia", model=self.model)
        start = time.time()

        full_response = []
        completion = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            top_p=0.95,
            max_tokens=max_tokens,
            extra_body={
                "chat_template_kwargs": {"enable_thinking": False},
            },
            stream=True,
        )

        in_thinking = False
        for chunk in completion:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta

            # Track thinking block — skip it entirely
            reasoning = getattr(delta, "reasoning_content", None)
            if reasoning:
                in_thinking = True
                continue

            # Only collect final answer content
            if delta.content is not None:
                full_response.append(delta.content)

        elapsed = round(time.time() - start, 2)
        result = "".join(full_response).strip()
        logger.info("llm.call.complete", elapsed_seconds=elapsed, provider="nvidia")
        return result


# ─────────────────────────────────────────────
# Anthropic provider
# ─────────────────────────────────────────────

class AnthropicProvider(BaseLLMProvider):
    def __init__(self, model: str = "claude-sonnet-4-6", timeout: int = 60):
        import anthropic
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError("ANTHROPIC_API_KEY not set in environment")
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model
        self.timeout = timeout
        logger.info("llm.provider.init", provider="anthropic", model=model)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=4, max=30),
        retry=retry_if_exception_type(Exception),
        before_sleep=lambda rs: logger.warning("llm.retry", attempt=rs.attempt_number),
    )
    def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.1,
    ) -> str:
        logger.info("llm.call.start", provider="anthropic", model=self.model)
        start = time.time()
        response = self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        elapsed = round(time.time() - start, 2)
        logger.info("llm.call.complete", elapsed_seconds=elapsed, provider="anthropic")
        return response.content[0].text


# ─────────────────────────────────────────────
# OpenAI provider
# ─────────────────────────────────────────────

class OpenAIProvider(BaseLLMProvider):
    def __init__(self, model: str = "gpt-4o", timeout: int = 60):
        from openai import OpenAI
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise EnvironmentError("OPENAI_API_KEY not set in environment")
        self.client = OpenAI(api_key=api_key, timeout=timeout)
        self.model = model
        logger.info("llm.provider.init", provider="openai", model=model)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=4, max=30),
        retry=retry_if_exception_type(Exception),
        before_sleep=lambda rs: logger.warning("llm.retry", attempt=rs.attempt_number),
    )
    def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.1,
    ) -> str:
        logger.info("llm.call.start", provider="openai", model=self.model)
        start = time.time()
        response = self.client.chat.completions.create(
            model=self.model,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        elapsed = round(time.time() - start, 2)
        logger.info("llm.call.complete", elapsed_seconds=elapsed, provider="openai")
        return response.choices[0].message.content


# ─────────────────────────────────────────────
# LLM Client — single entry point for all agents
# ─────────────────────────────────────────────

# Available models per provider
PROVIDER_MODELS = {
    "nvidia": [
        "nvidia/nemotron-3.5-lightning-30b-a3b",
        "nvidia/llama-3.1-nemotron-70b-instruct",
        "nvidia/llama-3.1-nemotron-51b-instruct",
        "meta/llama-3.1-405b-instruct",
        "meta/llama-3.1-70b-instruct",
    ],
    "anthropic": [
        "claude-sonnet-4-6",
        "claude-opus-4",
        "claude-haiku-4-5-20251001",
    ],
    "openai": [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
    ],
}


class LLMClient:
    """
    All agents call this. Never instantiate a provider directly in agent code.
    Default provider: NVIDIA Nemotron.
    Switch via .env: LLM_PROVIDER=nvidia|anthropic|openai
    """

    def __init__(self):
        # Default to nvidia if not set
        provider = os.environ.get("LLM_PROVIDER", "nvidia").lower()

        default_models = {
            "nvidia": "nvidia/nemotron-3.5-lightning-30b-a3b",
            "anthropic": "claude-sonnet-4-6",
            "openai": "gpt-4o",
        }
        model = os.environ.get(
            "LLM_MODEL", default_models.get(provider, "nvidia/llama-3.1-nemotron-70b-instruct")
        )
        timeout = int(os.environ.get("LLM_TIMEOUT_SECONDS", "60"))

        if provider == "nvidia":
            self._provider = NvidiaProvider(model=model, timeout=timeout)
        elif provider == "anthropic":
            self._provider = AnthropicProvider(model=model, timeout=timeout)
        elif provider == "openai":
            self._provider = OpenAIProvider(model=model, timeout=timeout)
        else:
            raise ValueError(
                f"Unknown LLM provider: '{provider}'. "
                f"Valid options: nvidia, anthropic, openai"
            )

        self.provider_name = provider
        self.model_name = model
        logger.info("llm.client.ready", provider=provider, model=model)

    def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.1,
    ) -> str:
        return self._provider.complete(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 4096,
    ) -> dict | list:
        """Call LLM and parse JSON response. Strips markdown fences."""
        raw = self.complete(system_prompt, user_prompt, max_tokens, temperature=0.0)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            cleaned = "\n".join(lines[1:-1])
        return json.loads(cleaned)
