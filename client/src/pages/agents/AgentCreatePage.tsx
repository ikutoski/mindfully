import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Bot } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../../lib/api";

const TOOLS = [
  { value: "read", label: "Read Files" },
  { value: "write", label: "Write Files" },
  { value: "edit", label: "Edit Files" },
  { value: "bash", label: "Shell Commands" },
];

interface Agent {
  id: string;
  name: string;
}

export function AgentCreatePage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTools, setSelectedTools] = useState<string[]>(["read", "write"]);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const agent = await trpc.mutation<Agent>("agent.create", {
        name,
        description,
        tools: selectedTools,
        memoryEnabled,
        systemPrompt: systemPrompt || undefined,
      });
      
      toast.success("Agent created successfully");
      navigate(`/agents/${agent.id}/run`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create agent";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTool = (tool: string) => {
    setSelectedTools((prev) =>
      prev.includes(tool)
        ? prev.filter((t) => t !== tool)
        : [...prev, tool]
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/agents"
          className="p-2 hover:bg-[rgba(255,255,255,0.05)] rounded-md transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold font-mono text-[#e0e0e0]">Create Agent</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            Configure your new AI agent
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-md p-4 text-red-400 font-mono text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card-cyber p-6 space-y-4">
          <h2 className="text-lg font-medium text-[rgba(255,255,255,0.8)] flex items-center gap-2">
            <Bot className="h-5 w-5 text-[#b5ff18]" />
            Basic Information
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-mono text-muted-foreground mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="input-cyber w-full"
                placeholder="My Agent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-mono text-muted-foreground mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="input-cyber w-full resize-none"
                placeholder="What does this agent do?"
              />
            </div>
          </div>
        </div>

        <div className="card-cyber p-6 space-y-4">
          <h2 className="text-lg font-medium text-[rgba(255,255,255,0.8)]">Tools</h2>
          
          <div className="grid grid-cols-2 gap-3">
            {TOOLS.map((tool) => (
              <label
                key={tool.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  selectedTools.includes(tool.value)
                    ? "border-[rgba(181,255,24,0.5)] bg-[rgba(181,255,24,0.08)]"
                    : "border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.16)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedTools.includes(tool.value)}
                  onChange={() => toggleTool(tool.value)}
                  className="sr-only"
                />
                <div
                  className={`h-4 w-4 rounded border flex items-center justify-center ${
                    selectedTools.includes(tool.value)
                      ? "bg-[#b5ff18] border-[rgba(181,255,24,0.5)]"
                      : "border-muted-foreground"
                  }`}
                >
                  {selectedTools.includes(tool.value) && (
                    <svg className="h-3 w-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm font-mono">{tool.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="card-cyber p-6 space-y-4">
          <h2 className="text-lg font-medium text-[rgba(255,255,255,0.8)]">Memory</h2>
          
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={memoryEnabled}
              onChange={(e) => setMemoryEnabled(e.target.checked)}
              className="sr-only"
            />
            <div
              className={`h-5 w-9 rounded-full transition-colors ${
                memoryEnabled ? "bg-[#b5ff18]" : "bg-muted"
              }`}
            >
              <div
                className={`h-4 w-4 rounded-full bg-white transition-transform mt-0.5 ${
                  memoryEnabled ? "translate-x-4 ml-0.5" : "translate-x-0.5"
                }`}
              />
            </div>
            <span className="text-sm font-mono">Enable persistent memory</span>
          </label>
        </div>

        <div className="card-cyber p-6 space-y-4">
          <h2 className="text-lg font-medium text-[rgba(255,255,255,0.8)]">System Prompt</h2>
          
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={6}
            className="input-cyber w-full resize-none font-mono text-sm"
            placeholder="You are a helpful AI assistant..."
          />
        </div>

        <div className="flex justify-end gap-3">
          <Link
            to="/agents"
            className="btn-cyber-outline"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isLoading}
            className="btn-cyber"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Agent"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
