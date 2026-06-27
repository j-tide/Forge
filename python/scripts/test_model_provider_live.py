"""Explicit real Codex ModelProvider probe; no project path or shell tools."""

import asyncio
import json

from forge.codex_model_provider import CodexModelProvider
from forge.model_provider import ModelRequest


async def main() -> None:
    provider = CodexModelProvider()
    caps = await provider.probe()
    assert (caps.available and caps.structuredOutput and caps.textStreaming
            and caps.usageReporting), caps
    model_id = "gpt-6-luna" if "gpt-6-luna" in caps.modelIds else caps.modelIds[0]
    async with provider.session() as session:
        assert model_id in await session.models()
        generated = await session.generate(ModelRequest(
            modelId=model_id, prompt="Return a JSON object with ok=true. Do not use tools.",
            outputSchema={"type": "object", "properties": {"ok": {"type": "boolean"}},
                          "required": ["ok"], "additionalProperties": False},
            maxOutputBytes=2_000,
        ))
        assert generated.structured == {"ok": True} and generated.usage is not None
        deltas = [delta async for delta in session.stream_text(ModelRequest(
            modelId=model_id, prompt="Reply with one short sentence about Forge. Do not use tools.",
            maxOutputBytes=2_000,
        ))]
        assert deltas and all(delta.sequence == index + 1 for index, delta in enumerate(deltas))
        assert "".join(delta.text for delta in deltas).strip()
    print(json.dumps({"providerId": caps.providerId, "modelId": model_id,
                      "structured": True, "textEvents": len(deltas),
                      "usage": generated.usage.model_dump() if generated.usage else "unavailable",
                      "toolExecution": False}))


if __name__ == "__main__":
    asyncio.run(main())
