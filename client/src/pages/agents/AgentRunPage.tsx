import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Play, Square, Bot, Terminal, X } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { trpc } from "../../lib/api";

interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  tools: string[];
}

interface Execution {
  id: string;
  status: string;
  input: string;
  output: Record<string, unknown>;
  error?: string;
}

export function AgentRunPage() {
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState<Array<{ type: string; content: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchAgent = useCallback(async () => {
    if (!id) return;
    try {
      const data = await trpc.query<Agent>("agent.byId", { id });
      setAgent(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch agent";
      setError(message);
      toast.error(message);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchAgent();
    }
    return () => {
      cancelledRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [id, fetchAgent]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleRun = async () => {
    if (!input.trim() || isRunning) return;

    cancelledRef.current = false;
    setIsRunning(true);
    setError(null);
    setOutput([{ type: "user", content: input }]);

    try {
      const execution = await trpc.mutation<{ id: string }>("execution.run", {
        agentId: id,
        input,
      });
      
      if (cancelledRef.current) {
        setIsRunning(false);
        return;
      }
      
      setOutput((prev) => [...prev, { type: "system", content: `Started execution: ${execution.id}` }]);
      
      pollExecution(execution.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to run agent";
      setError(message);
      toast.error(message);
      setIsRunning(false);
    }
  };

  const pollExecution = async (executionId: string) => {
    let attempts = 0;
    const maxAttempts = 60;
    
    const poll = async () => {
      if (cancelledRef.current) {
        return;
      }
      
      try {
        const execution = await trpc.query<Execution>("execution.status", { id: executionId });
        
        if (cancelledRef.current) {
          return;
        }
        
        if (execution.status === "running") {
          setOutput((prev) => [...prev, { type: "thinking", content: "..." }]);
        } else if (execution.status === "completed") {
          setIsRunning(false);
          const outputText = typeof execution.output === "string" 
            ? execution.output 
            : JSON.stringify(execution.output, null, 2);
          setOutput((prev) => [
            ...prev.filter((o) => o.type !== "thinking"),
            { type: "assistant", content: outputText || "No output" }
          ]);
          return;
        } else if (execution.status === "failed") {
          setIsRunning(false);
          setOutput((prev) => [
            ...prev.filter((o) => o.type !== "thinking"),
            { type: "error", content: execution.error || "Execution failed" }
          ]);
          return;
        }
        
        if (execution.status === "running" && attempts < maxAttempts) {
          attempts++;
          timeoutRef.current = setTimeout(poll, 2000);
        }
      } catch (err) {
        if (cancelledRef.current) {
          return;
        }
        setIsRunning(false);
        const message = err instanceof Error ? err.message : "Failed to check execution status";
        setError(message);
        toast.error(message);
      }
    };
    
    poll();
  };

  const handleStop = () => {
    cancelledRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsRunning(false);
    setOutput((prev) => [
      ...prev.filter((o) => o.type !== "thinking"),
      { type: "system", content: "Execution stopped by user" }
    ]);
  };

  const clearOutput = () => {
    setOutput([]);
    setInput("");
  };

  if (!agent && !error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#b5ff18]" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Link
            to="/agents"
            className="p-2 hover:bg-[rgba(255,255,255,0.05)] rounded-md transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold font-mono text-[#e0e0e0]">
              {agent?.name || "Agent"}
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              {agent?.model} • {agent?.tools?.join(", ")}
            </p>
          </div>
        </div>
        
        {isRunning && (
          <button
            onClick={handleStop}
            className="btn-cyber-outline flex items-center gap-2 text-red-400"
          >
            <Square className="h-4 w-4" />
            Stop
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-md p-4 text-red-400 font-mono text-sm mb-4">
          {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
        <div className="card-cyber p-4 flex flex-col min-h-0">
          <h2 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Input
          </h2>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isRunning}
            className="flex-1 input-cyber resize-none font-mono text-sm"
            placeholder="What would you like the agent to do?"
          />
          <div className="mt-4 flex justify-between">
            <button
              onClick={clearOutput}
              className="btn-cyber-outline text-xs"
            >
              Clear
            </button>
            <button
              onClick={handleRun}
              disabled={isRunning || !input.trim()}
              className="btn-cyber flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run
                </>
              )}
            </button>
          </div>
        </div>

        <div className="card-cyber p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Output
            </h2>
            <button
              onClick={clearOutput}
              className="p-1 hover:bg-[rgba(255,255,255,0.05)] rounded transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div
            ref={outputRef}
            className="flex-1 overflow-y-auto space-y-3 font-mono text-sm"
          >
            {output.length === 0 ? (
              <div className="text-muted-foreground/50 text-center py-8">
                Run the agent to see output here
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {output.map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.25, 0, 0, 1] }}
                    className={`p-3 rounded-lg ${
                      item.type === "user"
                        ? "bg-[rgba(181,255,24,0.06)] border border-[rgba(181,255,24,0.2)]"
                        : item.type === "assistant"
                        ? "bg-green-500/10 border border-green-500/20 text-green-400"
                        : item.type === "thinking"
                        ? "text-muted-foreground/70 italic"
                        : item.type === "error"
                        ? "bg-red-500/10 border border-red-500/20 text-red-400"
                        : "bg-muted/30"
                    }`}
                  >
                    <div className="text-xs uppercase opacity-60 mb-1">
                      {item.type}
                    </div>
                    <pre className="whitespace-pre-wrap break-words">{item.content}</pre>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
