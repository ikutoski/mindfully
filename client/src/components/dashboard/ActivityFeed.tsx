import { motion } from "motion/react";
import { CheckCircle2, Clock, XCircle, PlayCircle } from "lucide-react";

interface Activity {
  id: string;
  agent: string;
  task: string;
  status: "completed" | "running" | "failed" | "pending";
  time: string;
}

const activities: Activity[] = [
  { id: "1", agent: "Research", task: "Search for AI trends 2026", status: "completed", time: "2m ago" },
  { id: "2", agent: "Builder", task: "Generate React component", status: "running", time: "now" },
  { id: "3", agent: "Analyzer", task: "Process dataset", status: "completed", time: "5m ago" },
  { id: "4", agent: "Research", task: "Fetch documentation", status: "failed", time: "10m ago" },
  { id: "5", agent: "Planner", task: "Create task queue", status: "pending", time: "12m ago" },
  { id: "6", agent: "Builder", task: "Review code changes", status: "completed", time: "15m ago" },
  { id: "7", agent: "Analyzer", task: "Generate insights", status: "completed", time: "20m ago" },
];

const statusConfig = {
  completed: {
    icon: CheckCircle2,
    color: "text-[rgb(74,222,128)]",
    bg: "bg-[rgba(74,222,128,0.08)]",
    border: "border-[rgba(74,222,128,0.15)]",
  },
  running: {
    icon: PlayCircle,
    color: "text-[#b5ff18]",
    bg: "bg-[rgba(181,255,24,0.08)]",
    border: "border-[rgba(181,255,24,0.15)]",
  },
  failed: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-[rgba(239,68,68,0.08)]",
    border: "border-[rgba(239,68,68,0.15)]",
  },
  pending: {
    icon: Clock,
    color: "text-[rgba(255,255,255,0.35)]",
    bg: "bg-[rgba(255,255,255,0.04)]",
    border: "border-[rgba(255,255,255,0.07)]",
  },
};

export function ActivityFeed() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.4, ease: "easeOut" }}
      className="feed-card"
    >
      <div className="feed-card-glow" />
      <div className="feed-card-border" />

      <div className="relative z-10">
        <h3 className="feed-card-title">
          Activity Log
        </h3>
        <div className="feed-list">
          {activities.map((activity, index) => {
            const Icon = statusConfig[activity.status].icon;
            const config = statusConfig[activity.status];

            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + index * 0.05, duration: 0.3 }}
                className="feed-item"
              >
                <div className={`feed-item-icon ${config.bg} border ${config.border}`}>
                  <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                </div>
                <div className="feed-item-content">
                  <p className="feed-item-task">{activity.task}</p>
                  <p className="feed-item-agent">{activity.agent}</p>
                </div>
                <span className="feed-item-time">{activity.time}</span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
