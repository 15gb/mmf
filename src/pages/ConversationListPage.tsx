import { useNavigate } from "react-router-dom";
import { ArrowLeft, MessageSquarePlus, Trash2, MessageCircle } from "lucide-react";
import { useConversations, useSettings } from "@/lib/store";
import { toast } from "sonner";

const ConversationListPage = () => {
  const navigate = useNavigate();
  const { conversations, deleteConversation } = useConversations();
  const { setSettings } = useSettings();

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={() => navigate("/")} className="p-2 -ml-2 rounded-lg text-foreground active:opacity-70">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold text-foreground">저장된 대화</h1>
        <button
          onClick={() => navigate("/?new=1")}
          className="p-2 rounded-lg text-primary active:opacity-70"
          title="새 대화"
        >
          <MessageSquarePlus size={20} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <MessageCircle size={40} className="opacity-40" />
            <p className="text-sm">저장된 대화가 없습니다</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className="flex items-center gap-3 px-4 py-3 active:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/?load=${conv.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{conv.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {conv.messages.length}개 메시지 · {formatDate(conv.updatedAt)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                    toast.success("대화가 삭제되었습니다");
                  }}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationListPage;
