"""
Unified multi-LLM client.
Provider is selected by LLM_PROVIDER in .env.
Supports: claude | openai | gemini | minimax
"""
from __future__ import annotations

from typing import Any, Type, TypeVar
from pydantic import BaseModel

from config import settings

T = TypeVar("T", bound=BaseModel)


def _get_instructor_client():
    """Return an instructor-patched client for the active provider."""
    import instructor

    provider = settings.llm_provider.lower()

    if provider == "claude":
        import anthropic
        raw = anthropic.Anthropic(api_key=settings.active_api_key, timeout=30.0, max_retries=1)
        return instructor.from_anthropic(raw), "anthropic"

    if provider == "openai":
        import openai
        raw = openai.OpenAI(api_key=settings.active_api_key)
        return instructor.from_openai(raw), "openai"

    if provider == "gemini":
        import google.generativeai as genai
        genai.configure(api_key=settings.active_api_key)
        raw = genai.GenerativeModel(model_name=settings.active_model)
        return instructor.from_gemini(raw, mode=instructor.Mode.GEMINI_JSON), "gemini"

    if provider == "minimax":
        import openai
        headers = {}
        if settings.minimax_group_id:
            headers["MM-GroupId"] = settings.minimax_group_id
        raw = openai.OpenAI(
            api_key=settings.active_api_key,
            base_url="https://api.minimaxi.chat/v1",
            default_headers=headers,
            timeout=60.0,
            max_retries=1,
        )
        return instructor.from_openai(raw), "openai"

    raise ValueError(f"Unsupported LLM provider: {provider}")


def structured_completion(
    response_model: Type[T],
    system_prompt: str,
    user_message: str,
    max_tokens: int = 2000,
) -> T:
    """
    Call the configured LLM and return a validated Pydantic instance.
    Instructor handles retries + JSON coercion automatically.
    """
    import time
    client, client_type = _get_instructor_client()
    model = settings.active_model
    print(f"[GG:llm] structured_completion — provider={settings.llm_provider!r} model={model!r} client_type={client_type!r}")
    t0 = time.time()

    if client_type == "gemini":
        combined = f"{system_prompt}\n\n{user_message}"
        result = client.chat.completions.create(
            response_model=response_model,
            messages=[{"role": "user", "content": combined}],
        )
        print(f"[GG:llm] gemini responded in {time.time()-t0:.1f}s")
        return result

    if client_type == "anthropic":
        result = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
            response_model=response_model,
        )
        print(f"[GG:llm] anthropic responded in {time.time()-t0:.1f}s — result type: {type(result).__name__}")
        return result

    # openai-compatible (openai + minimax)
    print(f"[GG:llm] sending to openai-compat endpoint...")
    try:
        result = client.chat.completions.create(
            model=model,
            max_tokens=max_tokens,
            response_model=response_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        )
        print(f"[GG:llm] openai-compat responded in {time.time()-t0:.1f}s — result: {str(result)[:300]}")
        return result
    except Exception as e:
        print(f"[GG:llm] openai-compat ERROR after {time.time()-t0:.1f}s: {type(e).__name__}: {e}")
        raise


import re as _re

def _strip_think_tags(text: str) -> str:
    """Remove <think>...</think> reasoning blocks that some models (MiniMax, DeepSeek) emit."""
    return _re.sub(r"<think>.*?</think>", "", text, flags=_re.DOTALL).strip()


def plain_completion(
    system_prompt: str,
    messages: list[dict],
    max_tokens: int = 1000,
) -> str:
    """
    Call the configured LLM and return a plain string response.
    Used by the chatbot endpoint where structured output isn't needed.
    """
    provider = settings.llm_provider.lower()
    model = settings.active_model

    if provider == "claude":
        import anthropic
        client = anthropic.Anthropic(api_key=settings.active_api_key)
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=messages,
        )
        return _strip_think_tags(response.content[0].text)

    if provider == "openai":
        import openai
        client = openai.OpenAI(api_key=settings.active_api_key)
        all_messages = [{"role": "system", "content": system_prompt}] + messages
        response = client.chat.completions.create(
            model=model, max_tokens=max_tokens, messages=all_messages
        )
        return _strip_think_tags(response.choices[0].message.content or "")

    if provider == "gemini":
        import google.generativeai as genai
        genai.configure(api_key=settings.active_api_key)
        gemini_model = genai.GenerativeModel(
            model_name=model,
            system_instruction=system_prompt,
        )
        history = []
        for msg in messages[:-1]:
            history.append({
                "role": "user" if msg["role"] == "user" else "model",
                "parts": [msg["content"]],
            })
        chat = gemini_model.start_chat(history=history)
        response = chat.send_message(messages[-1]["content"])
        return _strip_think_tags(response.text)

    if provider == "minimax":
        import openai
        headers = {}
        if settings.minimax_group_id:
            headers["MM-GroupId"] = settings.minimax_group_id
        client = openai.OpenAI(
            api_key=settings.active_api_key,
            base_url="https://api.minimaxi.chat/v1",
            default_headers=headers,
            timeout=60.0,
        )
        all_messages = [{"role": "system", "content": system_prompt}] + messages
        response = client.chat.completions.create(
            model=model, max_tokens=max_tokens, messages=all_messages
        )
        return _strip_think_tags(response.choices[0].message.content or "")

    raise ValueError(f"Unsupported LLM provider: {provider}")
