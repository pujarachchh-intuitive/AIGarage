// Colours for node types on the landing page. The helix and its legend share them.
export const TYPE_COLOR: Record<string, string> = {
  TSField: "#a1a1aa",
  Function: "#60a5fa",
  TSType: "#a78bfa",
  Component: "#34d399",
  Page: "#f472b6",
  Dataset: "#fbbf24",
  BusinessProcess: "#fb923c",
  Doc: "#e4e4e7",
  Constant: "#94a3b8",
};

export const typeColor = (type: string) => TYPE_COLOR[type] ?? "#a1a1aa";
