import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Send, Mail, Bell } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/admin/announcements/")({
  component: AnnouncementsAdminPage,
});

type Audience =
  | "ALL"
  | "INVESTORS"
  | "PROPERTY_OWNERS"
  | "INVESTORS_AND_OWNERS"
  | "DEVELOPMENT_TEAM";

const AUDIENCE_OPTIONS: { value: Audience; label: string; description: string }[] = [
  { value: "INVESTORS_AND_OWNERS", label: "Investors & Property Owners", description: "Everyone with money or property in the platform" },
  { value: "INVESTORS", label: "Investors only", description: "All investor accounts" },
  { value: "PROPERTY_OWNERS", label: "Property Owners only", description: "All property-owner accounts" },
  { value: "DEVELOPMENT_TEAM", label: "Development Team", description: "Dev managers, project managers and contractors" },
  { value: "ALL", label: "Everyone", description: "All users on the platform" },
];

function AnnouncementsAdminPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<Audience>("INVESTORS_AND_OWNERS");
  const [sendEmail, setSendEmail] = useState(true);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
    else if (!["DEVELOPMENT_MANAGER", "ADMIN"].includes(user.role)) {
      navigate({ to: "/dashboard" });
    }
  }, [user, authToken, hasHydrated]);

  const broadcastMut = useMutation(
    trpc.broadcastAnnouncement.mutationOptions({
      onSuccess: (res) => {
        toast.success(
          `Sent to ${res.recipientCount} recipient(s)` +
            (sendEmail ? ` · ${res.emailsSent} email(s) delivered` : ""),
        );
        setTitle("");
        setMessage("");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const handleSend = () => {
    if (title.trim().length < 3) {
      toast.error("Title must be at least 3 characters");
      return;
    }
    if (message.trim().length < 10) {
      toast.error("Message must be at least 10 characters");
      return;
    }
    broadcastMut.mutate({
      authToken: authToken ?? "",
      title: title.trim(),
      message: message.trim(),
      audience,
      sendEmail,
    });
  };

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <Send className="text-indigo-600" size={32} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
            <p className="text-sm text-gray-600">
              Broadcast an update to your audience via in-app notification and email
            </p>
          </div>
        </div>

        <div className="space-y-6 rounded-lg bg-white p-6 shadow">
          <div>
            <label htmlFor="title" className="mb-1 block text-sm font-medium text-gray-700">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              placeholder="e.g. New funding round now open"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="message" className="mb-1 block text-sm font-medium text-gray-700">
              Message
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={5000}
              rows={8}
              placeholder="Write your announcement here…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500">{message.length}/5000 characters</p>
          </div>

          <div>
            <label htmlFor="audience" className="mb-1 block text-sm font-medium text-gray-700">
              Audience
            </label>
            <select
              id="audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {AUDIENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {AUDIENCE_OPTIONS.find((o) => o.value === audience)?.description}
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-md bg-gray-50 p-3">
            <input
              id="sendEmail"
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="sendEmail" className="flex items-center gap-2 text-sm text-gray-700">
              <Mail size={16} className="text-gray-500" />
              Also send as email (in-app notification is always created)
            </label>
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <span className="flex items-center gap-2 text-xs text-gray-500">
              <Bell size={14} />
              Recipients will see this in their notification bell instantly.
            </span>
            <button
              type="button"
              onClick={handleSend}
              disabled={broadcastMut.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={16} />
              {broadcastMut.isPending ? "Sending…" : "Send announcement"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
