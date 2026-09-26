// Demo graph for the ShopFlow sample repo (PRD section 15).
// It is used only when no backend is connected (NEXT_PUBLIC_API_URL unset).
// It holds the three traps from the PRD:
//   1. Alias chain: stg_orders renames cust_id to customer_key.
//   2. Dynamic SQL: export_job builds its query from a string (found by Bob).
//   3. Cross-language: Python API field -> TypeScript type -> React.

import { SHOPFLOW_LAYERS } from "@/lib/layers";
import type { EdgeRule, EdgeType, Graph, GraphEdge, GraphNode } from "@/lib/types";

type NodeInput = Omit<GraphNode, "pii" | "criticality" | "tested"> &
  Partial<Pick<GraphNode, "pii" | "criticality" | "tested">>;

const node = (n: NodeInput): GraphNode => ({
  pii: false,
  criticality: "medium",
  tested: true,
  ...n,
});

const nodes: GraphNode[] = [
  // Database
  node({ id: "db:table:orders", type: "Table", layer: "database", name: "orders", file: "db/schema.sql", line: 1, owner: "Data Platform", criticality: "high", tokens: ["orders", "cust_id", "amount"] }),
  node({ id: "db:column:orders.cust_id", type: "Column", layer: "database", name: "orders.cust_id", file: "db/schema.sql", line: 3, parent: "db:table:orders", owner: "Data Platform", criticality: "high" }),
  node({ id: "db:column:orders.amount", type: "Column", layer: "database", name: "orders.amount", file: "db/schema.sql", line: 4, parent: "db:table:orders", owner: "Data Platform", criticality: "high" }),
  node({ id: "db:table:customers", type: "Table", layer: "database", name: "customers", file: "db/schema.sql", line: 9, owner: "Data Platform", criticality: "high", tokens: ["customers", "email"] }),
  node({ id: "db:column:customers.id", type: "Column", layer: "database", name: "customers.id", file: "db/schema.sql", line: 10, parent: "db:table:customers", owner: "Data Platform" }),
  node({ id: "db:column:customers.email", type: "Column", layer: "database", name: "customers.email", file: "db/schema.sql", line: 11, parent: "db:table:customers", owner: "Data Platform", pii: true }),

  // Pipelines
  node({ id: "pipe:sqlmodel:stg_orders", type: "SQLModel", layer: "pipelines", name: "stg_orders", file: "transforms/stg_orders.sql", line: 1, owner: "Analytics", tokens: ["cust_id", "customer_key"] }),
  node({ id: "pipe:column:stg_orders.customer_key", type: "Column", layer: "pipelines", name: "stg_orders.customer_key", file: "transforms/stg_orders.sql", line: 3, parent: "pipe:sqlmodel:stg_orders", owner: "Analytics" }),
  node({ id: "pipe:sqlmodel:fct_revenue", type: "SQLModel", layer: "pipelines", name: "fct_revenue", file: "transforms/fct_revenue.sql", line: 1, owner: "Analytics", criticality: "high", tokens: ["customer_key", "amount"] }),
  node({ id: "pipe:sqlmodel:dim_customer", type: "SQLModel", layer: "pipelines", name: "dim_customer", file: "transforms/dim_customer.sql", line: 1, owner: "Analytics", pii: true, tested: false, tokens: ["cust_id", "email"] }),
  node({ id: "pipe:sparkjob:churn_job", type: "SparkJob", layer: "pipelines", name: "churn_job", file: "pipelines/churn_job.py", line: 12, owner: "Data Science", tokens: ["cust_id"] }),
  node({ id: "pipe:sparkjob:export_job", type: "SparkJob", layer: "pipelines", name: "export_job", file: "pipelines/export_job.py", line: 8, owner: "Finance Engineering", criticality: "high", tested: false, tokens: ["col"] }),

  // Backend
  node({ id: "be:orm:Order", type: "ORMModel", layer: "backend", name: "Order", file: "backend/models.py", line: 14, owner: "Orders Team", tokens: ["cust_id"] }),
  node({ id: "be:field:Order.cust_id", type: "Field", layer: "backend", name: "Order.cust_id", file: "backend/models.py", line: 17, parent: "be:orm:Order", owner: "Orders Team" }),
  node({ id: "be:schema:OrderOut", type: "Schema", layer: "backend", name: "OrderOut", file: "backend/schemas.py", line: 6, owner: "Orders Team", tokens: ["cust_id"] }),
  node({ id: "be:field:OrderOut.cust_id", type: "Field", layer: "backend", name: "OrderOut.cust_id", file: "backend/schemas.py", line: 8, parent: "be:schema:OrderOut", owner: "Orders Team" }),
  node({ id: "be:function:list_orders", type: "Function", layer: "backend", name: "list_orders", file: "backend/routes.py", line: 22, owner: "Orders Team", tokens: ["cust_id"] }),

  // API
  node({ id: "api:endpoint:get_orders", type: "Endpoint", layer: "api", name: "GET /api/orders", file: "backend/routes.py", line: 20, owner: "Orders Team", criticality: "high" }),
  node({ id: "api:endpoint:get_customer_orders", type: "Endpoint", layer: "api", name: "GET /api/customers/{id}/orders", file: "backend/routes.py", line: 31, owner: "Orders Team", tested: false }),

  // Frontend
  node({ id: "fe:tstype:Order", type: "TSType", layer: "frontend", name: "Order (TS)", file: "frontend/src/types.ts", line: 3, owner: "Web Team", tokens: ["cust_id"] }),
  node({ id: "fe:tsfield:Order.cust_id", type: "TSField", layer: "frontend", name: "Order.cust_id", file: "frontend/src/types.ts", line: 5, parent: "fe:tstype:Order", owner: "Web Team" }),
  node({ id: "fe:component:OrdersTable", type: "Component", layer: "frontend", name: "OrdersTable", file: "frontend/src/OrdersTable.tsx", line: 1, owner: "Web Team", tokens: ["cust_id"] }),
  node({ id: "fe:component:CustomerPage", type: "Component", layer: "frontend", name: "CustomerPage", file: "frontend/src/CustomerPage.tsx", line: 1, owner: "Web Team", tested: false, tokens: ["cust_id"] }),

  // Dashboards and exports
  node({ id: "dash:revenue", type: "Dashboard", layer: "dashboards", name: "Revenue dashboard", file: "dashboards/revenue.yaml", line: 1, owner: "Finance", criticality: "high", tokens: ["customer_key"] }),
  node({ id: "dash:churn", type: "Dashboard", layer: "dashboards", name: "Churn dashboard", file: "dashboards/churn.yaml", line: 1, owner: "Marketing", tokens: ["cust_id", "churn_score"] }),
  node({ id: "dash:finance_export", type: "Dashboard", layer: "dashboards", name: "Finance export (CSV)", file: "exports/finance_orders.yaml", line: 1, owner: "Finance", criticality: "high", tested: false }),

  // Business processes (read-only)
  node({ id: "biz:revenue_close", type: "BusinessProcess", layer: "business", name: "Monthly Revenue Close", file: "processes.yaml", line: 2, owner: "Finance", criticality: "high" }),
  node({ id: "biz:retention_review", type: "BusinessProcess", layer: "business", name: "Retention Review", file: "processes.yaml", line: 9, owner: "Marketing" }),

  // Tests and docs
  node({ id: "qa:test:test_routes", type: "Test", layer: "quality", name: "test_routes.py", file: "tests/test_routes.py", line: 1, owner: "Orders Team", tokens: ["cust_id"] }),
  node({ id: "qa:test:test_transforms", type: "Test", layer: "quality", name: "test_transforms.py", file: "tests/test_transforms.py", line: 1, owner: "Analytics", tokens: ["cust_id"] }),
  node({ id: "qa:test:orders_table", type: "Test", layer: "quality", name: "OrdersTable.test.tsx", file: "tests/OrdersTable.test.tsx", line: 1, owner: "Web Team", tokens: ["cust_id"] }),
  node({ id: "qa:doc:data_dictionary", type: "Doc", layer: "quality", name: "data_dictionary.pdf", file: "docs/data_dictionary.pdf", owner: "Data Platform", tokens: ["cust_id"] }),
  node({ id: "qa:doc:adr_003", type: "Doc", layer: "quality", name: "adr-003-customer-model.md", file: "docs/adr-003-customer-model.md", owner: "Data Platform", tokens: ["cust_id"] }),
  node({ id: "qa:doc:changelog", type: "Doc", layer: "quality", name: "CHANGELOG.md", file: "CHANGELOG.md", owner: "Data Platform", tokens: ["cust_id"] }),
];

let edgeCount = 0;
const edge = (
  from: string,
  to: string,
  type: EdgeType,
  rule: EdgeRule,
  evidence: string,
  opts: Partial<Pick<GraphEdge, "source" | "confidence">> = {},
): GraphEdge => ({
  id: `e${++edgeCount}`,
  from,
  to,
  type,
  rule,
  evidence,
  source: opts.source ?? "parser",
  confidence: opts.confidence ?? "high",
});

const edges: GraphEdge[] = [
  // The hero column fans out into every layer.
  edge("db:column:orders.cust_id", "be:field:Order.cust_id", "MAPS_TO", "rename_ref", "backend/models.py:17"),
  edge("db:column:orders.cust_id", "pipe:column:stg_orders.customer_key", "DERIVES_FROM", "keep_alias", "transforms/stg_orders.sql:3"),
  edge("db:column:orders.cust_id", "pipe:sparkjob:churn_job", "READS", "rename_ref", "pipelines/churn_job.py:12"),
  edge("db:column:orders.cust_id", "pipe:sparkjob:export_job", "READS", "rename_ref", "pipelines/export_job.py:8 (f-string query)", { source: "bob", confidence: "medium" }),
  edge("db:column:orders.cust_id", "pipe:sqlmodel:dim_customer", "READS", "rename_ref", "transforms/dim_customer.sql:7"),
  edge("db:column:orders.cust_id", "qa:doc:data_dictionary", "DOCUMENTS", "update_doc", "docs/data_dictionary.pdf p.3", { source: "bob", confidence: "medium" }),
  edge("db:column:orders.cust_id", "qa:doc:adr_003", "DOCUMENTS", "update_doc", "docs/adr-003-customer-model.md:14"),

  // Alias chain: everything after customer_key is protected.
  edge("pipe:column:stg_orders.customer_key", "pipe:sqlmodel:fct_revenue", "READS", "rename_ref", "transforms/fct_revenue.sql:5"),
  edge("pipe:sqlmodel:stg_orders", "qa:test:test_transforms", "TESTS", "update_doc", "tests/test_transforms.py:9"),
  edge("pipe:sqlmodel:fct_revenue", "dash:revenue", "READS", "rename_ref", "dashboards/revenue.yaml:4"),
  edge("dash:revenue", "biz:revenue_close", "SUPPORTS", "rename_ref", "processes.yaml:3"),

  // Dynamic SQL export feeds Finance.
  edge("pipe:sparkjob:export_job", "dash:finance_export", "WRITES", "rename_ref", "exports/finance_orders.yaml:6", { source: "bob", confidence: "medium" }),
  edge("dash:finance_export", "biz:revenue_close", "SUPPORTS", "rename_ref", "processes.yaml:4"),

  // Churn path to Marketing.
  edge("pipe:sparkjob:churn_job", "dash:churn", "WRITES", "rename_ref", "dashboards/churn.yaml:3"),
  edge("dash:churn", "biz:retention_review", "SUPPORTS", "rename_ref", "processes.yaml:10"),

  // Backend -> API -> Frontend.
  edge("be:field:Order.cust_id", "be:field:OrderOut.cust_id", "SERIALIZES", "rename_ref", "backend/schemas.py:8"),
  edge("be:field:Order.cust_id", "be:function:list_orders", "READS", "rename_ref", "backend/routes.py:25"),
  edge("be:field:OrderOut.cust_id", "api:endpoint:get_orders", "RETURNS", "rename_ref", "backend/routes.py:20"),
  edge("be:field:OrderOut.cust_id", "api:endpoint:get_customer_orders", "RETURNS", "rename_ref", "backend/routes.py:31"),
  edge("be:function:list_orders", "api:endpoint:get_customer_orders", "CALLS", "rename_ref", "backend/routes.py:33"),
  edge("api:endpoint:get_orders", "fe:tsfield:Order.cust_id", "TYPED_AS", "rename_ref", "frontend/src/types.ts:5"),
  edge("api:endpoint:get_orders", "qa:test:test_routes", "TESTS", "update_doc", "tests/test_routes.py:18"),
  edge("fe:tsfield:Order.cust_id", "fe:component:OrdersTable", "READS", "rename_ref", "frontend/src/OrdersTable.tsx:27"),
  edge("fe:tsfield:Order.cust_id", "fe:component:CustomerPage", "READS", "rename_ref", "frontend/src/CustomerPage.tsx:41"),
  edge("api:endpoint:get_customer_orders", "fe:component:CustomerPage", "CONSUMES", "rename_ref", "frontend/src/CustomerPage.tsx:12"),
  edge("fe:component:OrdersTable", "qa:test:orders_table", "TESTS", "update_doc", "tests/OrdersTable.test.tsx:6"),

  // Other links that the rename does not touch.
  edge("db:column:orders.amount", "pipe:sqlmodel:fct_revenue", "READS", "rename_ref", "transforms/fct_revenue.sql:6"),
  edge("db:column:customers.id", "pipe:sqlmodel:dim_customer", "READS", "rename_ref", "transforms/dim_customer.sql:4"),
  edge("db:column:customers.email", "pipe:sqlmodel:dim_customer", "READS", "rename_ref", "transforms/dim_customer.sql:5"),
  edge("pipe:sqlmodel:dim_customer", "dash:churn", "READS", "rename_ref", "dashboards/churn.yaml:5"),
];

export const shopflowGraph: Graph = {
  repo: "samples/shopflow",
  scannedAt: "2026-09-26T09:00:00Z",
  layers: SHOPFLOW_LAYERS,
  nodes,
  edges,
};
