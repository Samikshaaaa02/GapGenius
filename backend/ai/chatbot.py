"""AI chatbot handler — revenue management Q&A using the configured LLM."""
from typing import List
from models import ChatMessage
from ai.llm_client import plain_completion
from config import settings

SYSTEM_PROMPT = """You are GapGenius Copilot, an AI assistant specialising in hotel revenue
management and fragmented availability optimisation.

You help property managers and revenue managers:
- Understand orphan gaps, shoulder nights, and channel fragmentation
- Interpret fragmentation heatmaps and KPI data
- Get specific, actionable advice to recover lost revenue
- Understand min-LOS rules, BAR, RevPAR, ADR, and OTA channel strategy

Tone: Direct, expert, concise. Use revenue management terminology naturally.
Format: Short paragraphs or bullet points. No fluff. Max 200 words per response."""


def build_context_block(context: dict | None) -> str:
    if not context:
        return ""
    parts = []
    if context.get("total_leakage"):
        parts.append(f"Current estimated leakage: ${context['total_leakage']:,}")
    if context.get("orphan_count"):
        parts.append(f"Orphan gap cells: {context['orphan_count']}")
    if context.get("property_name"):
        parts.append(f"Property: {context['property_name']}")
    if context.get("usable_capacity_pct"):
        parts.append(f"Usable capacity: {context['usable_capacity_pct']:.1f}%")
    return "\n".join(parts)


def chat(
    message: str,
    history: List[ChatMessage],
    context: dict | None = None,
) -> str:
    """
    Process a user message and return the assistant reply.
    Context dict may include: total_leakage, orphan_count, property_name, usable_capacity_pct.
    """
    system = SYSTEM_PROMPT
    context_block = build_context_block(context)
    if context_block:
        system += f"\n\nCURRENT DASHBOARD CONTEXT:\n{context_block}"

    # Build messages list (history + new message)
    messages = [{"role": m.role, "content": m.content} for m in history[-10:]]
    messages.append({"role": "user", "content": message})

    return plain_completion(
        system_prompt=system,
        messages=messages,
        max_tokens=400,
    )


def get_provider_info() -> dict:
    return {
        "provider": settings.llm_provider,
        "model": settings.active_model,
    }
