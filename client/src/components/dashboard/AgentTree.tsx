import { motion } from "motion/react";

interface AgentNode {
  id: string;
  name: string;
  role: string;
  status: "running" | "idle";
  x: number;
  y: number;
  connections: string[];
}

const nodes: AgentNode[] = [
  { id: "orchestrator", name: "Orchestrator", role: "Planner", status: "running", x: 400, y: 200, connections: ["research", "builder", "analyzer"] },
  { id: "research", name: "Research", role: "Search & Fetch", status: "running", x: 200, y: 80, connections: ["web-search", "doc-fetch"] },
  { id: "builder", name: "Builder", role: "Code Gen", status: "idle", x: 400, y: 80, connections: ["code-gen", "code-review"] },
  { id: "analyzer", name: "Analyzer", role: "Data Process", status: "running", x: 600, y: 80, connections: ["process", "insights"] },
  { id: "web-search", name: "Web Search", role: "Tool", status: "idle", x: 100, y: 20, connections: [] },
  { id: "doc-fetch", name: "Doc Fetch", role: "Tool", status: "idle", x: 200, y: 20, connections: [] },
  { id: "code-gen", name: "Code Gen", role: "Tool", status: "idle", x: 350, y: 20, connections: [] },
  { id: "code-review", name: "Review", role: "Tool", status: "idle", x: 450, y: 20, connections: [] },
  { id: "process", name: "Process", role: "Tool", status: "running", x: 550, y: 20, connections: [] },
  { id: "insights", name: "Insights", role: "Tool", status: "idle", x: 650, y: 20, connections: [] },
];

export function AgentTree() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.4, ease: "easeOut" }}
      className="relative overflow-hidden rounded-sm border border-[rgba(255,255,255,0.07)] bg-[#0e0e0e] p-3 md:p-6"
    >
      <div className="relative z-10">
        <h3 className="font-mono mb-4 md:mb-6 text-xs font-bold tracking-[0.28em] uppercase text-[rgba(255,255,255,0.35)]">
          Agent Hierarchy
        </h3>
        <div className="h-48 md:h-72 overflow-hidden rounded-sm relative">
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 800 250"
            role="img"
            aria-labelledby="agent-tree-title"
            aria-describedby="agent-tree-desc"
            className="overflow-visible"
          >
            <title id="agent-tree-title">Agent Hierarchy</title>
            <desc id="agent-tree-desc">
              Orchestrator agent connected to Research, Builder, and Analyzer agents, each with tool sub-agents.
              {nodes.filter(n => n.status === "running").length} agents currently running.
            </desc>
            {nodes.map((node) =>
              node.connections.map((targetId) => {
                const target = nodes.find((n) => n.id === targetId);
                if (!target) return null;
                return (
                  <motion.line
                    key={`${node.id}-${targetId}`}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.5 }}
                    x1={node.x} y1={node.y}
                    x2={target.x} y2={target.y}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="1"
                  />
                );
              })
            )}

            {nodes.map((node, index) => {
              const isTool = node.role === "Tool";
              const isRunning = node.status === "running";

              return (
                <motion.g
                  key={node.id}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.7 + index * 0.05, duration: 0.3 }}
                  className="cursor-pointer"
                  role="img"
                  aria-label={`${node.name} — ${node.role} — ${node.status}`}
                >
                  <circle
                    cx={node.x} cy={node.y}
                    r={isTool ? 18 : 24}
                    fill={isRunning ? "rgba(181,255,24,0.08)" : "rgba(255,255,255,0.04)"}
                    stroke={isRunning ? "rgba(181,255,24,0.4)" : "rgba(255,255,255,0.1)"}
                    strokeWidth="1"
                  />

                  {isRunning && (
                    <circle
                      cx={node.x} cy={node.y}
                      r={isTool ? 18 : 24}
                      fill="none"
                      stroke="rgba(181,255,24,0.3)"
                      strokeWidth="1"
                      opacity="0.5"
                    >
                      <animate attributeName="r" from={isTool ? 18 : 24} to={isTool ? 28 : 34} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}

                  <text
                    x={node.x} y={node.y + 4}
                    textAnchor="middle"
                    fill={isRunning ? "#b5ff18" : "#e0e0e0"}
                    fontSize={isTool ? "9" : "11"}
                    fontFamily="Space Mono, monospace"
                    fontWeight="600"
                  >
                    {node.name}
                  </text>

                  <text
                    x={node.x} y={node.y + (isTool ? 32 : 40)}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.3)"
                    fontSize="8"
                    fontFamily="Space Mono, monospace"
                  >
                    [{node.role}]
                  </text>
                </motion.g>
              );
            })}

            <defs>
              <filter id="none" />
            </defs>
          </svg>

          <div
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255,255,255,1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)
              `,
              backgroundSize: "40px 40px",
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}
