import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Bot, Settings, Trash2, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../../lib/api";

interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  tools: string[];
  memory_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const data = await trpc.query<Agent[]>("agent.list");
      setAgents(data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch agents";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this agent?")) {
      return;
    }

    setDeleting(id);
    try {
      await trpc.mutation("agent.delete", { id });
      setAgents(agents.filter((a) => a.id !== id));
      toast.success("Agent deleted");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete agent";
      setError(message);
      toast.error(message);
    } finally {
      setDeleting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#b5ff18]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono text-[#e0e0e0] text-balance">Agents</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Manage your AI agents
          </p>
        </div>
        <Link
          to="/agents/new"
          className="btn-cyber flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Agent
        </Link>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-md p-4 text-red-400 font-mono text-sm">
          {error}
        </div>
      )}

      {agents.length === 0 ? (
        <div className="text-center py-12">
          <Bot className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">No agents yet</h3>
          <p className="text-sm text-muted-foreground/70">
            Create your first AI agent to get started
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="card-cyber p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-[rgba(181,255,24,0.08)] flex items-center justify-center">
                    <Bot className="h-5 w-5 text-[#b5ff18]" />
                  </div>
                  <div>
                    <h3 className="font-medium text-[#e0e0e0]">{agent.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{agent.model}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    to={`/agents/${agent.id}/run`}
                    className="p-2 hover:bg-[rgba(181,255,24,0.08)] rounded-md transition-colors"
                    title="Run agent"
                  >
                    <Play className="h-4 w-4 text-green-400" />
                  </Link>
                  <Link
                    to={`/agents/${agent.id}`}
                    className="p-2 hover:bg-[rgba(181,255,24,0.08)] rounded-md transition-colors"
                    title="Settings"
                  >
                    <Settings className="h-4 w-4 text-muted-foreground" />
                  </Link>
                  <button
                    onClick={() => handleDelete(agent.id)}
                    disabled={deleting === agent.id}
                    className="p-2 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    {deleting === agent.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-red-400" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-red-400" />
                    )}
                  </button>
                </div>
              </div>
              
              <p className="text-sm text-muted-foreground line-clamp-2">
                {agent.description || "No description"}
              </p>
              
              <div className="flex items-center gap-2 text-xs text-muted-foreground/70 font-mono">
                <span>{agent.tools?.length || 0} tools</span>
                {agent.memory_enabled && (
                  <>
                    <span>•</span>
                    <span>Memory enabled</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
