import { motion } from "motion/react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const data = [
  { time: "00:00", tasks: 12, agents: 3 },
  { time: "04:00", tasks: 8, agents: 2 },
  { time: "08:00", tasks: 45, agents: 8 },
  { time: "12:00", tasks: 89, agents: 12 },
  { time: "16:00", tasks: 67, agents: 10 },
  { time: "20:00", tasks: 34, agents: 6 },
  { time: "24:00", tasks: 18, agents: 4 },
];

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="bg-[#0e0e0e] border border-[rgba(255,255,255,0.07)] px-2.5 py-2 shadow-xl shadow-black/50 font-mono space-y-1.5"
      style={{ minWidth: 140, borderRadius: 2 }}
    >
      <div className="text-[9px] uppercase tracking-[0.18em] text-[rgba(255,255,255,0.3)] pb-0.5 border-b border-[rgba(255,255,255,0.06)]">{label}</div>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center gap-1.5 text-xs">
          <span className="text-[#b5ff18] leading-none">$</span>
          <span className="text-[rgba(255,255,255,0.45)] capitalize">{item.name}</span>
          <span className="ml-auto pl-4 tabular-nums text-[#e0e0e0]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ActivityChart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.4, ease: "easeOut" }}
      className="relative overflow-hidden rounded-sm border border-[rgba(255,255,255,0.07)] bg-[#0e0e0e] p-3 md:p-6"
    >
      <div className="relative z-10">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="font-mono text-xs font-bold tracking-[0.28em] uppercase text-[rgba(255,255,255,0.35)]">
            Activity
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#b5ff18]" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
                Tasks
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[rgb(74,222,128)]" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
                Agents
              </span>
            </div>
          </div>
        </div>

        <div className="h-48 md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#b5ff18" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#b5ff18" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAgents" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgb(74,222,128)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="rgb(74,222,128)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "Space Mono" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              />
              <YAxis
                tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "Space Mono" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="tasks"
                stroke="#b5ff18"
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#colorTasks)"
                name="Tasks"
                dot={false}
                activeDot={{ r: 4, fill: "#b5ff18", stroke: "#0e0e0e", strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="agents"
                stroke="rgb(74,222,128)"
                strokeWidth={1.5}
                fillOpacity={1}
                fill="url(#colorAgents)"
                name="Active Agents"
                dot={false}
                activeDot={{ r: 4, fill: "rgb(74,222,128)", stroke: "#0e0e0e", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
}
