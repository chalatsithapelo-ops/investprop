import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Sparkles, Loader2, Trash2 } from "lucide-react";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

type Props = { propertyId: number };

export function AICopilotChat({ propertyId }: Props) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const historyQ = useQuery({
    ...trpc.propertyChatHistory.queryOptions({ authToken: token ?? "", propertyId }),
    enabled: !!token,
    refetchOnWindowFocus: false,
  });

  const chatMut = useMutation(
    trpc.chatAboutProperty.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.propertyChatHistory.queryKey({ authToken: token ?? "", propertyId }) });
      },
    })
  );

  const clearMut = useMutation(
    trpc.clearPropertyChat.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.propertyChatHistory.queryKey({ authToken: token ?? "", propertyId }) });
      },
    })
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [historyQ.data, chatMut.isPending]);

  if (!token) return null;

  const messages = historyQ.data ?? [];
  const onSend = () => {
    const q = input.trim();
    if (!q || chatMut.isPending) return;
    setInput("");
    chatMut.mutate({ authToken: token, propertyId, message: q });
  };

  return (
    <div className="flex h-[520px] flex-col rounded-2xl border border-violet-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-violet-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <h3 className="text-sm font-semibold text-slate-800">Ask AI about this deal</h3>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => clearMut.mutate({ authToken: token, propertyId })}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600"
            title="Clear chat"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !chatMut.isPending && (
          <div className="rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-900">
            <p className="font-medium">Hi — I'm grounded on this deal's docs, financials, milestones and comparables.</p>
            <p className="mt-1 text-xs text-violet-700">
              Try: "Explain the expected IRR", "What are the main risks?", "How does the price compare to similar properties in this city?"
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[85%]" : "mr-auto max-w-[90%]"}>
            <div
              className={
                m.role === "user"
                  ? "rounded-2xl rounded-tr-sm bg-violet-600 px-3 py-2 text-sm text-white"
                  : "rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap"
              }
            >
              {m.content}
            </div>
          </div>
        ))}
        {chatMut.isPending && (
          <div className="mr-auto max-w-[60%] rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm text-slate-500">
            <Loader2 className="inline h-3 w-3 animate-spin" /> Thinking…
          </div>
        )}
        {chatMut.isError && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {chatMut.error.message || "Something went wrong. Please try again."}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        className="flex items-center gap-2 border-t border-slate-100 px-3 py-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this deal…"
          className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm outline-none focus:border-violet-400"
          disabled={chatMut.isPending}
        />
        <button
          type="submit"
          disabled={!input.trim() || chatMut.isPending}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white disabled:bg-slate-300"
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      <p className="px-4 pb-2 text-[10px] text-slate-400">
        Research only — not financial advice. Treat AI answers as a starting point, then check the source documents.
      </p>
    </div>
  );
}
