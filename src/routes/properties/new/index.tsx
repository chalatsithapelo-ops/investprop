import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { useQuery, useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, Save, Trash2, FileText, ShieldAlert } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { PropertyForm } from "~/components/PropertyForm";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

const MANAGER_ROLES = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER", "OWNER"];

const propertyNewSearchSchema = z.object({
  type: fallback(z.enum(["flip", "rental", "development"]), "flip").default("flip"),
});

export const Route = createFileRoute("/properties/new/")({
  validateSearch: zodValidator(propertyNewSearchSchema),
  component: NewPropertyPage,
});

function NewPropertyPage() {
  const navigate = useNavigate();
  const { type } = Route.useSearch();
  const trpc = useTRPC();
  const authToken = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager = MANAGER_ROLES.includes(user?.role ?? "");

  if (!user || !authToken) return null;

  if (!isManager) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 text-red-600" size={48} />
          <h1 className="text-2xl font-bold text-gray-900">Access Restricted</h1>
          <p className="mt-2 text-gray-500">Only managers and property owners can create new properties.</p>
          <button onClick={() => navigate({ to: "/dashboard" })} className="mt-6 rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600">Back to Dashboard</button>
        </div>
      </div>
    );
  }
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [currentFormData, setCurrentFormData] = useState<any>(null);
  const [draftData, setDraftData] = useState<any | null>(null);
  const [generateAiImageIfMissing, setGenerateAiImageIfMissing] = useState(false);

  const draftStorageKey = `property-investment:draft:new:${type}`;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (!raw) {
        setDraftData(null);
        return;
      }

      const parsed = JSON.parse(raw);
      setDraftData(parsed?.data ?? null);
    } catch {
      setDraftData(null);
    }
  }, [draftStorageKey]);

  const sanitizeForJson = (value: any): any => {
    if (typeof value === "number" && Number.isNaN(value)) {
      return undefined;
    }

    if (Array.isArray(value)) {
      const mapped = value
        .map((v) => sanitizeForJson(v))
        .filter((v) => v !== undefined);
      return mapped;
    }

    if (value && typeof value === "object") {
      const out: Record<string, any> = {};
      for (const [key, v] of Object.entries(value)) {
        const sanitized = sanitizeForJson(v);
        if (sanitized !== undefined) {
          out[key] = sanitized;
        }
      }
      return out;
    }

    return value;
  };

  const createMutation = useMutation(
    trpc.createProperty.mutationOptions({
      onSuccess: (data) => {
        // Clear draft after successful creation
        try {
          window.localStorage.removeItem(draftStorageKey);
        } catch {
          // ignore
        }

        // Navigate to the newly created property
        navigate({ to: "/properties/$propertyId", params: { propertyId: String(data.propertyId) } });
      },
    })
  );

  const generateImageMutation = useMutation(
    trpc.generatePropertyImage.mutationOptions()
  );

  // Fetch templates for the current property type
  const templatesQuery = useQuery({
    ...trpc.getTemplates.queryOptions({
      authToken: authToken || "",
      propertyType: type,
    }),
    enabled: !!authToken,
  });

  const createTemplateMutation = useMutation(
    trpc.createTemplate.mutationOptions({
      onSuccess: () => {
        toast.success("Template saved successfully!");
        setShowSaveTemplateDialog(false);
        setTemplateName("");
        templatesQuery.refetch();
      },
      onError: (error) => {
        toast.error(`Failed to save template: ${error.message}`);
      },
    })
  );

  const deleteTemplateMutation = useMutation(
    trpc.deleteTemplate.mutationOptions({
      onSuccess: () => {
        toast.success("Template deleted successfully!");
        setSelectedTemplateId(null);
        templatesQuery.refetch();
      },
      onError: (error) => {
        toast.error(`Failed to delete template: ${error.message}`);
      },
    })
  );

  const handleTemplateSelect = (templateId: number | null) => {
    setSelectedTemplateId(templateId);
    if (templateId !== null) {
      // Avoid mixing template + draft in the same session
      setDraftData(null);
    }
  };

  const handleSaveDraft = () => {
    try {
      const dataToSave = sanitizeForJson(currentFormData ?? { propertyType: type });
      window.localStorage.setItem(
        draftStorageKey,
        JSON.stringify({ updatedAt: new Date().toISOString(), data: dataToSave })
      );
      toast.success("Draft saved on this device.");
    } catch {
      toast.error("Failed to save draft.");
    }
  };

  const handleClearDraft = () => {
    try {
      window.localStorage.removeItem(draftStorageKey);
      setDraftData(null);
      toast.success("Draft cleared.");
    } catch {
      toast.error("Failed to clear draft.");
    }
  };

  const handleSaveAsTemplate = () => {
    if (!authToken) {
      toast.error("You must be logged in to save templates");
      return;
    }
    setShowSaveTemplateDialog(true);
  };

  const handleConfirmSaveTemplate = () => {
    if (!authToken || !currentFormData) {
      return;
    }

    if (!templateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }

    createTemplateMutation.mutate({
      authToken,
      name: templateName,
      propertyType: type,
      configuration: sanitizeForJson(currentFormData),
    });
  };

  const handleDeleteTemplate = (templateId: number) => {
    if (!authToken) {
      return;
    }

    if (confirm("Are you sure you want to delete this template?")) {
      deleteTemplateMutation.mutate({
        authToken,
        templateId,
      });
    }
  };

  const selectedTemplate = templatesQuery.data?.templates.find(
    (t) => t.id === selectedTemplateId
  );

  const initialData = selectedTemplate
    ? { ...selectedTemplate.configuration, propertyType: type }
    : draftData
      ? { ...draftData, propertyType: type }
      : undefined;

  const handleSubmit = async (formData: any) => {
    // Store form data for template saving
    setCurrentFormData(formData);

    if (!authToken) {
      toast.error("You must be logged in to create properties");
      return;
    }

    try {
      let finalImageUrl = formData.imageUrl;

      if (!finalImageUrl && Array.isArray(formData.imageUrls) && formData.imageUrls.length > 0) {
        finalImageUrl = formData.imageUrls[0];
      }

      // If no image URL is provided, optionally generate one using AI
      if (!finalImageUrl && generateAiImageIfMissing) {
        setIsGeneratingImage(true);
        toast.loading("Generating AI image for your property...", { id: "generating-image" });

        try {
          const imageResult = await generateImageMutation.mutateAsync({
            authToken,
            title: formData.title,
            description: formData.description,
          });

          finalImageUrl = imageResult.imageUrl;
          toast.success("AI image generated successfully!", { id: "generating-image" });
        } catch (error) {
          // Non-blocking: allow property creation without an image
          toast.error(
            "AI image generation failed. Continuing without an image.",
            { id: "generating-image" }
          );
        } finally {
          setIsGeneratingImage(false);
        }
      }

      // Now create the property with the final image URL
      toast.promise(
        createMutation.mutateAsync({
          authToken,
          ...formData,
          imageUrl: finalImageUrl,
        }),
        {
          loading: "Creating property...",
          success: "Property created successfully!",
          error: (err) => `Failed to create property: ${err.message}`,
        }
      );
    } catch (error) {
      console.error("Error in handleSubmit:", error);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate({ to: "/dashboard" })}
            className="mb-4 flex items-center space-x-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="h-5 w-5" />
            <span>Back to Dashboard</span>
          </button>
          <h1 className="text-3xl font-bold text-gray-900">
            Add New Property
          </h1>
          <p className="mt-2 text-gray-500">
            Fill in the details below to add a new property to your portfolio
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={generateAiImageIfMissing}
                onChange={(e) => setGenerateAiImageIfMissing(e.target.checked)}
                className="h-4 w-4 rounded border-navy-700 text-gold-600 focus:ring-gold-500"
              />
              Generate AI image if none uploaded
            </label>
            <span className="text-xs text-gray-500">
              If unchecked, the property can be created without an image.
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveDraft}
              className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-slate-800">
              Save Draft
            </button>
            <button
              type="button"
              onClick={handleClearDraft}
              className="rounded-lg border border-navy-700 border-navy-800/50 bg-navy-900/50">
              Clear Draft
            </button>
            <span className="text-xs text-gray-500">
              Drafts are saved locally on this device.
            </span>
          </div>
        </div>

        {/* Template Selection */}
        {authToken && (
          <div className="mb-6 rounded-lg border-navy-800/50 bg-navy-900/50">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Property Templates
              </h2>
              <button
                type="button"
                onClick={handleSaveAsTemplate}
                className="flex items-center space-x-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700">
                <Save className="h-4 w-4" />
                <span>Save as Template</span>
              </button>
            </div>

            {templatesQuery.isLoading ? (
              <p className="text-gray-500">Loading templates...</p>
            ) : templatesQuery.data?.templates.length === 0 ? (
              <p className="text-gray-500">
                No templates saved yet. Fill out the form below and click "Save as Template" to create your first template.
              </p>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-600">
                  Select a template to pre-fill the form:
                </label>
                <div className="grid gap-2">
                  {templatesQuery.data?.templates.map((template) => (
                    <div
                      key={template.id}
                      className={`flex items-center justify-between rounded-lg border-2 p-3 transition-colors ${
                        selectedTemplateId === template.id
                          ? "border-gold-500 bg-navy-800/30"
                          : "border-navy-800/50 hover:border-navy-700"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleTemplateSelect(template.id)}
                        className="flex flex-1 items-center space-x-3 text-left"
                      >                        <FileText className="h-5 w-5 text-gray-500" />
                        <div>
                          <p className="font-medium text-gray-900">
                            {template.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            Created {new Date(template.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="ml-2 rounded p-2 text-red-600 hover:bg-red-50"
                        title="Delete template"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                {selectedTemplateId && (
                  <button
                    type="button"
                    onClick={() => handleTemplateSelect(null)}
                    className="mt-2 text-sm text-gold-600 hover:text-gold-500">
                    Clear selection
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Save Template Dialog */}
        {showSaveTemplateDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-md rounded-lg border-navy-800/50 bg-navy-900/50">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                Save as Template
              </h3>
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-600">
                  Template Name
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full rounded-md border border-navy-700 px-3 py-2 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 border-navy-700 bg-navy-800/50"
                  placeholder="e.g., Downtown Flip Standard"
                  autoFocus
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveTemplateDialog(false);
                    setTemplateName("");
                  }}
                  className="rounded-lg border border-navy-700 px-4 py-2 font-medium text-gray-600 transition-colors hover:bg-navy-800/30">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSaveTemplate}
                  disabled={createTemplateMutation.isPending}
                  className="rounded-lg bg-gold-500 px-4 py-2 font-medium text-white transition-colors hover:bg-gold-600 disabled:bg-gray-400">
                  {createTemplateMutation.isPending ? "Saving..." : "Save Template"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <PropertyForm
          mode="create"
          defaultPropertyType={type}
          initialData={initialData}
          onSubmit={handleSubmit}
          isSubmitting={createMutation.isPending || isGeneratingImage}
          onFormDataChange={(data) => setCurrentFormData(sanitizeForJson(data))}
        />
      </div>
    </div>
  );
}
