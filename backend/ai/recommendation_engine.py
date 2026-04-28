"""Generate structured revenue recommendations using the configured LLM + Instructor."""
from typing import List
from pydantic import BaseModel

from models import OrphanGap, RebundleOpportunity, AIRecommendation, CapacityScore
from ai.llm_client import structured_completion

SYSTEM_PROMPT = """You are a senior hotel revenue manager with 15 years of experience
optimising inventory for luxury and mid-scale properties. You speak concisely and
directly to other revenue managers.

You are given a fragmentation analysis of a hotel's availability calendar.
Your job is to turn the data into 3-6 specific, actionable recommendations.

IMPORTANT RULES:
- Use proper revenue management terminology (min-LOS, BAR, CTA, channel mix, RevPAR, ADR)
- Each recommendation must have a specific action (not vague advice)
- Estimated revenue lift must be realistic (based on the data provided)
- Prioritise by urgency: near-term gaps in premium rooms first
- Be direct. Revenue managers don't want fluff.
- Always include the rationale BEFORE the action"""


class RecommendationSet(BaseModel):
    recommendations: List[AIRecommendation]
    executive_summary: str


def generate_recommendations(
    gaps: List[OrphanGap],
    opportunities: List[RebundleOpportunity],
    score_before: CapacityScore,
    hotel_name: str,
) -> RecommendationSet:
    critical_gaps = [g for g in gaps if g.severity_label in ("Critical", "High")]
    total_lost = score_before.estimated_lost_revenue

    gap_summary = "\n".join(
        f"- GAP {g.gap_id}: Room {g.room_id} ({g.room_category}), "
        f"{g.gap_length_nights} night(s), {g.start_date} to {g.end_date}, "
        f"${g.estimated_lost_revenue:.0f} lost, severity: {g.severity_label}"
        for g in critical_gaps[:15]
    )

    opp_summary = "\n".join(
        f"- OPP {o.opportunity_id}: {o.proposed_action}, "
        f"est. recovery: ${o.estimated_revenue_recovery:.0f}, confidence: {o.confidence:.0%}"
        for o in opportunities[:10]
    )

    user_message = f"""Hotel: {hotel_name}
Analysis window: {score_before.total_room_nights} total room-nights

CURRENT FRAGMENTATION:
- Usable capacity: {score_before.usable_capacity_pct:.1f}%
- Orphan gap nights: {score_before.orphan_gap_nights}
- Fragmentation rate: {score_before.fragmentation_rate:.1f}%
- Total estimated lost revenue: ${total_lost:,.0f}

TOP ORPHAN GAPS (by severity):
{gap_summary}

REBUNDLE OPPORTUNITIES IDENTIFIED:
{opp_summary}

Generate 4-6 specific revenue management recommendations to recover this lost capacity.
Each recommendation must have a concrete action a revenue manager can implement today."""

    import time
    print(f"[GG:reco] calling LLM — provider={__import__('config').settings.llm_provider!r}  model={__import__('config').settings.active_model!r}  key_prefix={__import__('config').settings.active_api_key[:12]!r}")
    t0 = time.time()
    result = structured_completion(
        response_model=RecommendationSet,
        system_prompt=SYSTEM_PROMPT,
        user_message=user_message,
        max_tokens=2000,
    )
    print(f"[GG:reco] LLM responded in {time.time()-t0:.1f}s — {len(result.recommendations)} recs")
    return result
