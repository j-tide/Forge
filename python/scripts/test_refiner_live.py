"""Explicit live Codex P1 refiner probe; not part of offline pytest."""

import asyncio
import json
from uuid import uuid4

from forge.codex_refiner import CodexReadOnlyRefiner


async def main() -> None:
    project_id, draft_id, message_id = (str(uuid4()) for _ in range(3))
    result = await CodexReadOnlyRefiner().refine(
        project_id, draft_id, message_id,
        "Add a feature: validate numeric inputs in add(a,b) and include an automated test.",
        "Small TypeScript fixture; no project path or source code supplied.",
    )
    intent, contract, error = result
    assert error is None, error
    assert intent == "new_task" and contract is not None
    assert contract.taskId == draft_id and contract.projectId == project_id
    assert contract.acceptance and contract.sourceRefs == [f"message:{message_id}"]
    print(json.dumps({
        "intent": intent, "type": contract.type,
        "acceptanceCount": len(contract.acceptance),
        "openQuestionCount": len(contract.openQuestions),
    }))


if __name__ == "__main__":
    asyncio.run(main())
