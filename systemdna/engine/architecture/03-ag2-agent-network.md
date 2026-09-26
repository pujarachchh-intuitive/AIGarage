# Architecture Diagram 3 — AG2 Agent Network

All AG2 agents, their GroupChat patterns, tools, and how they connect to the
LangGraph pipeline and the WebSocket event stream.

```
LangGraph enrich_node
        │
        ▼
CartographerOrchestrator.enrich(graph_store, event_emitter)
        │
        ├── asyncio.gather([
        │     CartographerGroupChat("database"),
        │     CartographerGroupChat("pipelines"),
        │     CartographerGroupChat("backend"),
        │     CartographerGroupChat("api"),
        │     CartographerGroupChat("frontend"),
        │     CartographerGroupChat("dashboards"),
        │     CartographerGroupChat("quality"),
        │   ])
        │
        │   Each CartographerGroupChat:
        │   ┌──────────────────────────────────────────────────────┐
        │   │  AG2 GroupChat (max_round=5)                         │
        │   │                                                      │
        │   │  CartographerAgent (AssistantAgent, Gemini)          │
        │   │  System prompt:                                      │
        │   │    "You are Cartographer for the {layer} layer.      │
        │   │     Find dependency edges the parser missed.         │
        │   │     Return JSON only:                                │
        │   │     [{from, to, type, rule, evidence, confidence}]   │
        │   │     Evidence MUST be file:line. Reject any edge      │
        │   │     without evidence."                               │
        │   │                                                      │
        │   │  UserProxyAgent (driver, human_input_mode=NEVER)     │
        │   │                                                      │
        │   │  speaker_selection_method = "auto"                   │
        │   └──────────────────────────────────────────────────────┘
        │
        │   Validator: rejects edges without "file:line" evidence
        │   Merger: GraphStore.add_edges(valid_edges)
        │   RunEvents: agent_started → (tool_call per turn) → done
        │
        └── DocUnderstandingOrchestrator.enrich(graph_store, doc_paths)
              │
              │   LangChain PyPDFLoader(data_dictionary.pdf)
              │   LangChain UnstructuredMarkdownLoader(adr-*.md)
              │
              └── AG2 AssistantAgent (Gemini)
                  Returns JSON patches:
                  [{node_id, owner, pii, criticality, business_meaning}]
                  Applied to Neo4j nodes


LangGraph orchestrate_node
        │
        ▼
Orchestrator.run_change()
        │
        ├─ For each wave:
        │   ├─ Primary: bob -p workers (Bob Shell)
        │   │   Bob hooks emit RunEvents → POST /events → WS → UI
        │   │
        │   └─ Fallback (if bob unavailable):
        │       For each FixUnit in wave:
        │       ┌──────────────────────────────────────────────────┐
        │       │  FixerAgent (AssistantAgent, Gemini)             │
        │       │  System prompt: change + node + evidence +       │
        │       │  edge rule + upstream change + permit            │
        │       │                                                  │
        │       │  LangChain tools:                                │
        │       │    @tool read_file(path) → str                   │
        │       │    @tool write_file(path, content) → None        │
        │       │    @tool run_verify(node) → dict                 │
        │       │                                                  │
        │       │  Every tool call:                                │
        │       │    emit tool_call RunEvent → POST /events → WS   │
        │       │  Write to non-allowed file:                      │
        │       │    emit blocked RunEvent → raise PermitViolation │
        │       │                                                  │
        │       │  UserProxyAgent (max_round=12, max_cost=2)       │
        │       └──────────────────────────────────────────────────┘
        │
        └─ After last wave:
            ┌──────────────────────────────────────────────────────┐
            │  InspectorAgent (AssistantAgent, Gemini, READ-ONLY)  │
            │  System prompt:                                      │
            │    "Review the diff against the impact report.       │
            │     Return JSON:                                     │
            │     {verdict: approved|needs_revision,               │
            │      issues: int, details: [str]}"                   │
            │                                                      │
            │  LangChain tool: @tool read_file(path) → str only    │
            │  Emits: agent_started → done → inspector RunEvent    │
            └──────────────────────────────────────────────────────┘
```

## AG2 LLM config (used everywhere)

```python
# agents/llm_config.py
LLM_CONFIG = {
    "model": "gemini-1.5-pro",
    "api_key": os.getenv("GEMINI_API_KEY"),
    "api_type": "google",
}

# LangChain equivalent
llm = ChatGoogleGenerativeAI(
    model="gemini-1.5-pro",
    google_api_key=os.getenv("GEMINI_API_KEY"),
)
```

## watsonx.ai integration (via LangChain)

WatsonX API key is used as an alternative/supplementary LLM for high-cost
enrichment tasks where Gemini token budget is tight.

```python
# agents/llm_config.py — watsonx fallback
from langchain_ibm import WatsonxLLM

WATSONX_LLM = WatsonxLLM(
    model_id="ibm/granite-34b-code-instruct",
    url="https://us-south.ml.cloud.ibm.com",
    apikey=os.getenv("WATSONX_API_KEY"),
    project_id=os.getenv("WATSONX_PROJECT_ID"),
    params={"max_new_tokens": 2048, "temperature": 0.1},
)

# Usage: DocUnderstanding and Inspector use WatsonX (cheaper for read-only analysis)
# Fixer and Cartographer use Gemini (better for code generation)
```
