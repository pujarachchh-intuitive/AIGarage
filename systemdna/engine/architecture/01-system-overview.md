# Architecture Diagram 1 — System Overview

How the agent engine connects to the existing frontend and Bob IDE.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DEVELOPER WORKSTATION                              │
│                                                                             │
│   Bob IDE ──────────────────────────────────────────────────────────────►  │
│   (Change Planner mode)          MCP tools via HTTPS                        │
│                                                                             │
│   Browser ──────────────────────────────────────────────────────────────►  │
│   systemdna/web  (Next.js, NO CHANGES)                                      │
│   • Agent City map                                                          │
│   • Trace timeline                                                          │
│   • Agents table                                                            │
│   • Governance panel                                                        │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ NEXT_PUBLIC_API_URL=http://<ec2>:8080
                                │
                    ┌───────────▼──────────────────────────────────┐
                    │           AWS EC2  t3.xlarge                 │
                    │           Ubuntu 22.04  Docker Compose       │
                    │                                              │
                    │  ┌──────────────┐   ┌────────────────────┐  │
                    │  │ FastAPI :8080 │   │  FastMCP  :3000    │  │
                    │  │  REST + WS   │   │  7 MCP tools       │  │
                    │  └──────┬───────┘   └────────────────────┘  │
                    │         │                                    │
                    │  ┌──────▼───────────────────────────────┐   │
                    │  │        LangGraph Pipeline             │   │
                    │  │    (Redis checkpoint — resumable)     │   │
                    │  │                                       │   │
                    │  │  scan_node → enrich_node →            │   │
                    │  │  orchestrate_node                     │   │
                    │  └──────┬───────────────────────────────┘   │
                    │         │                                    │
                    │  ┌──────▼──────┐ ┌────────┐ ┌──────────┐   │
                    │  │   Neo4j :7687│ │Chroma  │ │ Redis    │   │
                    │  │  knowledge  │ │:8000   │ │ :6379    │   │
                    │  │   graph     │ │vector  │ │checkpoint│   │
                    │  └─────────────┘ └────────┘ └──────────┘   │
                    │                                              │
                    │  Bob Shell workers  +  AG2 Fixer agents     │
                    │  hooks/permit_check.py                       │
                    │  hooks/report.py                             │
                    └──────────────────────────────────────────────┘
```

## Key principle

The frontend (`systemdna/web/`) is **never modified**.
It switches from demo mode to live mode automatically when `NEXT_PUBLIC_API_URL` is set.
All agent activity reaches the UI through `WS /ws` as `RunEvent` JSON messages.
