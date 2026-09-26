// The change kinds SystemDNA can analyse and fix, and which components each
// applies to. Shared by the New change form, the impact engine and the agents.

import type { ChangeKind, ChangeRequest, GraphNode, NodeType } from "@/lib/types";

export interface KindDef {
  id: ChangeKind;
  label: string;
  /** Label of the main input, or null when the kind needs none. */
  input: { label: string; placeholder: string } | null;
  /** Node types this kind applies to. */
  types: NodeType[];
}

/** Components a change can start from. */
export const CHANGEABLE: NodeType[] = ["TSField", "Column", "Field", "Table", "TSType", "Function", "Constant", "Dataset", "Component"];

export const KINDS: KindDef[] = [
  { id: "rename", label: "Rename", input: { label: "New name", placeholder: "customer_id" }, types: CHANGEABLE },
  { id: "type_change", label: "Change type", input: { label: "New type", placeholder: "string | null" }, types: ["TSField", "Column", "Field", "Constant"] },
  { id: "signature", label: "Signature", input: { label: "New signature", placeholder: "formatCurrency(cents: number, currency: string): string" }, types: ["Function"] },
  { id: "delete", label: "Delete", input: null, types: CHANGEABLE },
  { id: "custom", label: "Describe", input: null, types: CHANGEABLE },
];

export function kindsFor(type: NodeType | undefined): KindDef[] {
  return KINDS.filter((k) => type && k.types.includes(type));
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Last part of a node name: "orders.cust_id" -> "cust_id", "getUsers()" -> "getUsers". */
export function symbolName(node: Pick<GraphNode, "name">): string {
  return node.name.replace(/\(\)$/, "").split(".").pop() ?? node.name;
}

/** Why the request is not ready, or null. */
export function validateChange(node: GraphNode | undefined, kind: ChangeKind, to: string, description: string): string | null {
  if (!node) return "Pick a component.";
  if (!kindsFor(node.type).some((k) => k.id === kind)) return "This change does not apply to that component.";
  switch (kind) {
    case "rename":
      if (!to) return "Enter the new name.";
      if (!IDENTIFIER.test(to)) return "Use letters, numbers and underscores. Start with a letter.";
      if (to === symbolName(node)) return "The new name is the same as the old one.";
      return null;
    case "type_change":
      return to.trim() ? null : "Enter the new type.";
    case "signature":
      return to.trim() ? null : "Enter the new signature.";
    case "delete":
      return null;
    case "custom":
      return description.trim().length >= 8 ? null : "Describe the change in a sentence.";
  }
}

/** A short title for lists and PRs. */
export function changeTitle(node: Pick<GraphNode, "name">, req: Pick<ChangeRequest, "change" | "to" | "description">): string {
  const n = node.name;
  switch (req.change) {
    case "rename":
      return `Rename ${n} to ${req.to}`;
    case "type_change":
      return `Change the type of ${n} to ${req.to}`;
    case "signature":
      return `Change the signature of ${n}`;
    case "delete":
      return `Delete ${n}`;
    case "custom": {
      const d = (req.description ?? "").trim();
      return `Change ${n}: ${d.length > 60 ? `${d.slice(0, 57)}…` : d}`;
    }
  }
}

/** One sentence for agents: what changes, exactly. */
export function changeSentence(node: Pick<GraphNode, "name" | "type" | "file" | "line">, req: ChangeRequest): string {
  const where = `${node.type} \`${node.name}\` (${node.file}${node.line ? `:${node.line}` : ""})`;
  const extra = req.description?.trim() && req.change !== "custom" ? ` Extra instructions: ${req.description.trim()}` : "";
  switch (req.change) {
    case "rename":
      return `Rename the ${where} to \`${req.to}\`.${extra}`;
    case "type_change":
      return `Change the type of the ${where} to \`${req.to}\`.${extra}`;
    case "signature":
      return `Change the signature of the ${where} to \`${req.to}\`.${extra}`;
    case "delete":
      return `Delete the ${where}. Code that uses it must stop using it.${extra}`;
    case "custom":
      return `Change the ${where}: ${req.description?.trim()}`;
  }
}
