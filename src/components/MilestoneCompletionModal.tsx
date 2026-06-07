import { useState } from "react";
import { X, Camera, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useTRPCClient } from "~/trpc/react";
import toast from "react-hot-toast";

type Props = {
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
  milestoneId: number;
  milestoneName: string;
  authToken: string;
};

/**
 * Modal that pops up when a manager marks a milestone "complete".
 * Strongly nudges them to attach 1-6 progress photos and a short note
 * before the completion is recorded, because investors get auto-notified
 * and photos materially build trust. They can still complete without
 * photos via the secondary action.
 */
export function MilestoneCompletionModal({
  open,
  onClose,
  onCompleted,
  milestoneId,
  milestoneName,
  authToken,
}: Props) {
  const trpcClient = useTRPCClient();
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const uploadOne = async (file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUri = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const fileBase64 = dataUri.includes(",") ? dataUri.split(",")[1] ?? "" : dataUri;
      const result = await trpcClient.uploadFile.mutate({
        authToken,
        fileName: file.name,
        fileType: file.type,
        fileBase64,
      });
      setPhotos((prev) => [...prev, result.publicUrl]);
    } catch (e: any) {
      toast.error(e.message ?? "Photo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 6 - photos.length);
    for (const f of arr) await uploadOne(f);
  };

  const completeWithPhotos = async () => {
    if (photos.length === 0) {
      toast.error("Add at least one photo, or use 'complete without photos'");
      return;
    }
    if (!note.trim()) {
      toast.error("Please add a short note describing the work done");
      return;
    }
    setSubmitting(true);
    try {
      // 1. Record progress submission (notifies investors with photos)
      await trpcClient.createProgressSubmission.mutate({
        authToken,
        milestoneId,
        description: note,
        imageUrls: photos,
      });
      // 2. Mark milestone complete
      await trpcClient.updateMilestone.mutate({
        authToken,
        milestoneId,
        status: "COMPLETED",
        actualCompletionDate: new Date().toISOString(),
      });
      toast.success("Milestone completed with proof photos — investors notified");
      onCompleted();
      onClose();
      setPhotos([]);
      setNote("");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to complete milestone");
    } finally {
      setSubmitting(false);
    }
  };

  const completeWithoutPhotos = async () => {
    setSubmitting(true);
    try {
      await trpcClient.updateMilestone.mutate({
        authToken,
        milestoneId,
        status: "COMPLETED",
        actualCompletionDate: new Date().toISOString(),
      });
      toast("Milestone completed — consider adding photos later for investor trust", { icon: "⚠️" });
      onCompleted();
      onClose();
      setPhotos([]);
      setNote("");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to complete milestone");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="border-b border-gray-100 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-emerald-50 p-2.5">
              <CheckCircle2 className="text-emerald-600" size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900">Mark complete: {milestoneName}</h3>
              <p className="mt-1 text-sm text-gray-600">
                Investors are notified the moment you mark this complete. Adding 1-6 site photos and a short note
                <strong className="text-gray-900"> materially improves trust</strong> and triggers our AI photo-verification.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Photo upload */}
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <Camera size={16} />
              Proof photos ({photos.length}/6)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((url, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200">
                  <img src={url} alt={`Proof ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                    className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition group-hover:opacity-100"
                    aria-label="Remove photo"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {photos.length < 6 && (
                <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 transition hover:border-gold-400 hover:bg-gold-50">
                  {uploading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <Camera size={20} />
                      <span className="text-xs">Add photo</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
                    disabled={uploading || photos.length >= 6}
                  />
                </label>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">Mobile? Use your camera to upload directly. Photos are scanned by AI for credibility.</p>
          </div>

          {/* Note */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Short description (1-2 sentences)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              placeholder="e.g. Foundation slab poured and cured to 30 MPa. Engineer signed off on rebar layout."
              maxLength={500}
            />
          </div>

          {/* Warning if no photos */}
          {photos.length === 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="mt-0.5 flex-shrink-0 text-amber-600" size={16} />
              <p className="text-xs text-amber-800">
                No photos? Investors may flag this as low-confidence progress.
                You can still complete without photos, but expect questions.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={completeWithoutPhotos}
            disabled={submitting}
            className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Complete without photos
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={completeWithPhotos}
              disabled={submitting || uploading || photos.length === 0 || !note.trim()}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              Complete with proof
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
