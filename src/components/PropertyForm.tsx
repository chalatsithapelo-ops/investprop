import { useState, useRef } from "react";
import { Building, DollarSign, MapPin, Home, Plus, Trash2, Upload, X, Image as ImageIcon } from "lucide-react";
import { useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

type BudgetItem = { category: string; amount: number; notes?: string };

type PropertyFormData = {
  title: string;
  description: string;
  propertyType: "flip" | "rental" | "development";
  price: number;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  bedrooms: number;
  bathrooms: number;
  squareFootage: number;
  imageUrl?: string;
  images?: string[];
  purchasePrice?: number;
  afterRepairValue?: number;
  renovationCost?: number;
  holdingCosts?: number;
  closingCosts?: number;
  monthlyRent?: number;
  operatingExpenses?: number;
  vacancyRate?: number;
  managementFee?: number;
  totalBudget?: number;
  totalUnits?: number;
  gdv?: number;
  fundingGoal?: number;
  minimumInvestment?: number;
  maximumInvestors?: number;
  expectedReturnRate?: number;
  budgetItems?: BudgetItem[];
};

type PropertyFormProps = {
  defaultValues?: Partial<PropertyFormData>;
  initialData?: Partial<PropertyFormData>;
  onSubmit: (data: PropertyFormData) => void | Promise<void>;
  isLoading?: boolean;
  isSubmitting?: boolean;
  mode?: "create" | "edit";
  defaultPropertyType?: string;
};

const inputClass =
  "w-full rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";

const labelClass = "text-sm font-medium text-gray-600";

const sectionClass = "rounded-xl border border-navy-800/50 bg-navy-900/50 p-6";

export function PropertyForm({ defaultValues, initialData, onSubmit, isLoading, isSubmitting, mode, defaultPropertyType }: PropertyFormProps) {
  const defaults = defaultValues ?? initialData;
  const [form, setForm] = useState<PropertyFormData>({
    title: defaults?.title ?? "",
    description: defaults?.description ?? "",
    propertyType: defaults?.propertyType ?? (defaultPropertyType as any) ?? "flip",
    price: defaults?.price ?? 0,
    address: defaults?.address ?? "",
    city: defaults?.city ?? "",
    state: defaults?.state ?? "",
    zipCode: defaults?.zipCode ?? "",
    bedrooms: defaults?.bedrooms ?? 0,
    bathrooms: defaults?.bathrooms ?? 0,
    squareFootage: defaults?.squareFootage ?? 0,
    imageUrl: defaults?.imageUrl ?? "",
    images: defaults?.images ?? [],
    purchasePrice: defaults?.purchasePrice,
    afterRepairValue: defaults?.afterRepairValue,
    renovationCost: defaults?.renovationCost,
    holdingCosts: defaults?.holdingCosts,
    closingCosts: defaults?.closingCosts,
    monthlyRent: defaults?.monthlyRent,
    operatingExpenses: defaults?.operatingExpenses,
    vacancyRate: defaults?.vacancyRate,
    managementFee: defaults?.managementFee,
    totalBudget: defaults?.totalBudget,
    totalUnits: defaults?.totalUnits,
    gdv: defaults?.gdv,
    fundingGoal: defaults?.fundingGoal,
    minimumInvestment: defaults?.minimumInvestment,
    maximumInvestors: defaults?.maximumInvestors ?? (defaults as any)?.maxInvestors,
    expectedReturnRate: defaults?.expectedReturnRate ?? (defaults as any)?.expectedReturns,
    budgetItems: defaults?.budgetItems ?? [],
  });

  function updateField<K extends keyof PropertyFormData>(key: K, value: PropertyFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleAddBudgetItem() {
    setForm((prev) => ({
      ...prev,
      budgetItems: [...(prev.budgetItems ?? []), { category: "", amount: 0, notes: "" }],
    }));
  }

  function handleRemoveBudgetItem(index: number) {
    setForm((prev) => ({
      ...prev,
      budgetItems: (prev.budgetItems ?? []).filter((_, i) => i !== index),
    }));
  }

  function handleBudgetItemChange(index: number, field: keyof BudgetItem, value: string | number) {
    setForm((prev) => ({
      ...prev,
      budgetItems: (prev.budgetItems ?? []).map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  const trpcClient = useTRPCClient();
  const authToken = useAuthStore((s) => s.token);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const additionalFilesRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingAdditional, setUploadingAdditional] = useState(false);

  async function handleFileUpload(file: File): Promise<string | null> {
    if (!authToken) {
      toast.error("You must be logged in to upload images");
      return null;
    }
    const reader = new FileReader();
    return new Promise((resolve) => {
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(",")[1];
          const result = await (trpcClient as any).uploadFile.mutate({
            authToken,
            fileName: file.name,
            fileType: file.type,
            fileBase64: base64,
          });
          resolve(result.publicUrl);
        } catch (err: any) {
          toast.error("Upload failed: " + (err?.message ?? "Unknown error"));
          resolve(null);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleMainImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await handleFileUpload(file);
    if (url) {
      updateField("imageUrl", url);
      toast.success("Image uploaded successfully");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAdditionalImagesSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingAdditional(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const url = await handleFileUpload(file);
      if (url) urls.push(url);
    }
    if (urls.length > 0) {
      setForm((prev) => ({
        ...prev,
        images: [...(prev.images ?? []), ...urls],
      }));
      toast.success(`${urls.length} image(s) uploaded`);
    }
    setUploadingAdditional(false);
    if (additionalFilesRef.current) additionalFilesRef.current.value = "";
  }

  function handleRemoveImage(index: number) {
    setForm((prev) => ({
      ...prev,
      images: (prev.images ?? []).filter((_, i) => i !== index),
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Section 1: Basic Info */}
      <div className={sectionClass}>
        <div className="mb-5 flex items-center gap-2">
          <Building className="h-5 w-5 text-gold-600" />
          <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Title</label>
            <input
              type="text"
              className={inputClass}
              placeholder="Property title"
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Description</label>
            <textarea
              className={`${inputClass} min-h-[100px] resize-y`}
              placeholder="Describe the property..."
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={4}
            />
          </div>
          <div>
            <label className={labelClass}>Property Type</label>
            <select
              className={inputClass}
              value={form.propertyType}
              onChange={(e) =>
                updateField("propertyType", e.target.value as PropertyFormData["propertyType"])
              }
            >
              <option value="flip">Flip</option>
              <option value="rental">Rental</option>
              <option value="development">Development</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Price (R)</label>
            <input
              type="number"
              className={inputClass}
              placeholder="0"
              value={form.price || ""}
              onChange={(e) => updateField("price", Number(e.target.value))}
              min={0}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Main Image</label>
            <div className="space-y-3">
              {form.imageUrl ? (
                <div className="relative inline-block">
                  <img src={form.imageUrl} alt="Main" className="h-32 w-48 rounded-lg border border-navy-700 object-cover" />
                  <button
                    type="button"
                    onClick={() => updateField("imageUrl", "")}
                    className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white shadow hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : null}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleMainImageSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-navy-600 bg-navy-800/30 px-4 py-3 text-sm text-gray-500 transition-colors hover:border-gold-500 hover:text-gold-600 disabled:opacity-50"
                >
                  {uploading ? (
                    <><div className="h-4 w-4 animate-spin rounded-full border-2 border-gold-500 border-r-transparent" /> Uploading...</>
                  ) : (
                    <><Upload className="h-4 w-4" /> {form.imageUrl ? "Replace Image" : "Upload Image"}</>
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Additional Images</label>
            <div className="space-y-3">
              {(form.images ?? []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(form.images ?? []).map((img, i) => (
                    <div key={i} className="group relative">
                      <img src={img} alt="" className="h-20 w-20 rounded-lg border border-navy-700 object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(i)}
                        className="absolute -right-1 -top-1 rounded-full bg-red-500 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <input
                  ref={additionalFilesRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleAdditionalImagesSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => additionalFilesRef.current?.click()}
                  disabled={uploadingAdditional}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-navy-600 bg-navy-800/30 px-4 py-3 text-sm text-gray-500 transition-colors hover:border-gold-500 hover:text-gold-600 disabled:opacity-50"
                >
                  {uploadingAdditional ? (
                    <><div className="h-4 w-4 animate-spin rounded-full border-2 border-gold-500 border-r-transparent" /> Uploading...</>
                  ) : (
                    <><Plus className="h-4 w-4" /> Add More Images</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Location */}
      <div className={sectionClass}>
        <div className="mb-5 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-gold-600" />
          <h2 className="text-lg font-semibold text-gray-900">Location</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Address</label>
            <input
              type="text"
              className={inputClass}
              placeholder="Street address"
              value={form.address}
              onChange={(e) => updateField("address", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>City</label>
            <input
              type="text"
              className={inputClass}
              placeholder="City"
              value={form.city}
              onChange={(e) => updateField("city", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>State / Province</label>
            <input
              type="text"
              className={inputClass}
              placeholder="State"
              value={form.state}
              onChange={(e) => updateField("state", e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>Zip / Postal Code</label>
            <input
              type="text"
              className={inputClass}
              placeholder="0000"
              value={form.zipCode}
              onChange={(e) => updateField("zipCode", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Section 3: Property Details */}
      <div className={sectionClass}>
        <div className="mb-5 flex items-center gap-2">
          <Home className="h-5 w-5 text-gold-600" />
          <h2 className="text-lg font-semibold text-gray-900">Property Details</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Bedrooms</label>
            <input
              type="number"
              className={inputClass}
              placeholder="0"
              value={form.bedrooms || ""}
              onChange={(e) => updateField("bedrooms", Number(e.target.value))}
              min={0}
            />
          </div>
          <div>
            <label className={labelClass}>Bathrooms</label>
            <input
              type="number"
              className={inputClass}
              placeholder="0"
              value={form.bathrooms || ""}
              onChange={(e) => updateField("bathrooms", Number(e.target.value))}
              min={0}
            />
          </div>
          <div>
            <label className={labelClass}>Square Footage</label>
            <input
              type="number"
              className={inputClass}
              placeholder="0"
              value={form.squareFootage || ""}
              onChange={(e) => updateField("squareFootage", Number(e.target.value))}
              min={0}
            />
          </div>
        </div>
      </div>

      {/* Section 4: Type-specific fields */}
      {form.propertyType === "flip" && (
        <div className={sectionClass}>
          <div className="mb-5 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-gold-600" />
            <h2 className="text-lg font-semibold text-gray-900">Flip Details</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Purchase Price (R)</label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={form.purchasePrice ?? ""}
                onChange={(e) => updateField("purchasePrice", Number(e.target.value))}
                min={0}
              />
            </div>
            <div>
              <label className={labelClass}>After Repair Value (R)</label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={form.afterRepairValue ?? ""}
                onChange={(e) => updateField("afterRepairValue", Number(e.target.value))}
                min={0}
              />
            </div>
            <div>
              <label className={labelClass}>Renovation Cost (R)</label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={form.renovationCost ?? ""}
                onChange={(e) => updateField("renovationCost", Number(e.target.value))}
                min={0}
              />
            </div>
            <div>
              <label className={labelClass}>Holding Costs (R)</label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={form.holdingCosts ?? ""}
                onChange={(e) => updateField("holdingCosts", Number(e.target.value))}
                min={0}
              />
            </div>
            <div>
              <label className={labelClass}>Closing Costs (R)</label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={form.closingCosts ?? ""}
                onChange={(e) => updateField("closingCosts", Number(e.target.value))}
                min={0}
              />
            </div>
          </div>
        </div>
      )}

      {form.propertyType === "rental" && (
        <div className={sectionClass}>
          <div className="mb-5 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-gold-600" />
            <h2 className="text-lg font-semibold text-gray-900">Rental Details</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Monthly Rent (R)</label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={form.monthlyRent ?? ""}
                onChange={(e) => updateField("monthlyRent", Number(e.target.value))}
                min={0}
              />
            </div>
            <div>
              <label className={labelClass}>Operating Expenses (R)</label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={form.operatingExpenses ?? ""}
                onChange={(e) => updateField("operatingExpenses", Number(e.target.value))}
                min={0}
              />
            </div>
            <div>
              <label className={labelClass}>Vacancy Rate (%)</label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={form.vacancyRate ?? ""}
                onChange={(e) => updateField("vacancyRate", Number(e.target.value))}
                min={0}
                max={100}
              />
            </div>
            <div>
              <label className={labelClass}>Management Fee (%)</label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={form.managementFee ?? ""}
                onChange={(e) => updateField("managementFee", Number(e.target.value))}
                min={0}
                max={100}
              />
            </div>
          </div>
        </div>
      )}

      {form.propertyType === "development" && (
        <div className={sectionClass}>
          <div className="mb-5 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-gold-600" />
            <h2 className="text-lg font-semibold text-gray-900">Development Details</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Total Budget (R)</label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={form.totalBudget ?? ""}
                onChange={(e) => updateField("totalBudget", Number(e.target.value))}
                min={0}
              />
            </div>
            <div>
              <label className={labelClass}>Total Units</label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={form.totalUnits ?? ""}
                onChange={(e) => updateField("totalUnits", Number(e.target.value))}
                min={0}
              />
            </div>
            <div>
              <label className={labelClass}>Gross Development Value (R)</label>
              <input
                type="number"
                className={inputClass}
                placeholder="0"
                value={form.gdv ?? ""}
                onChange={(e) => updateField("gdv", Number(e.target.value))}
                min={0}
              />
            </div>
          </div>
        </div>
      )}

      {/* Section 5: Funding Settings */}
      <div className={sectionClass}>
        <div className="mb-5 flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-gold-600" />
          <h2 className="text-lg font-semibold text-gray-900">Funding Settings</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Funding Goal (R)</label>
            <input
              type="number"
              className={inputClass}
              placeholder="0"
              value={form.fundingGoal ?? ""}
              onChange={(e) => updateField("fundingGoal", Number(e.target.value))}
              min={0}
            />
          </div>
          <div>
            <label className={labelClass}>Minimum Investment (R)</label>
            <input
              type="number"
              className={inputClass}
              placeholder="0"
              value={form.minimumInvestment ?? ""}
              onChange={(e) => updateField("minimumInvestment", Number(e.target.value))}
              min={0}
            />
          </div>
          <div>
            <label className={labelClass}>Maximum Investors</label>
            <input
              type="number"
              className={inputClass}
              placeholder="0"
              value={form.maximumInvestors ?? ""}
              onChange={(e) => updateField("maximumInvestors", Number(e.target.value))}
              min={0}
            />
          </div>
          <div>
            <label className={labelClass}>Expected Return Rate (%)</label>
            <input
              type="number"
              className={inputClass}
              placeholder="0"
              value={form.expectedReturnRate ?? ""}
              onChange={(e) => updateField("expectedReturnRate", Number(e.target.value))}
              min={0}
            />
          </div>
        </div>
      </div>

      {/* Section 6: Budget Items */}
      <div className={sectionClass}>
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-gold-600" />
            <h2 className="text-lg font-semibold text-gray-900">Budget Items</h2>
          </div>
          <button
            type="button"
            onClick={handleAddBudgetItem}
            className="flex items-center gap-1 rounded-lg bg-gold-50 px-3 py-1.5 text-sm font-medium text-gold-600 transition-colors hover:bg-gold-500/20"
          >
            <Plus className="h-4 w-4" />
            Add Item
          </button>
        </div>

        {(form.budgetItems ?? []).length === 0 && (
          <p className="text-center text-sm text-gray-500">
            No budget items yet. Click &ldquo;Add Item&rdquo; to get started.
          </p>
        )}

        <div className="space-y-3">
          {(form.budgetItems ?? []).map((item, index) => (
            <div
              key={index}
              className="flex items-start gap-3 rounded-lg border border-navy-700 bg-navy-800/30 p-4"
            >
              <div className="grid flex-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Category</label>
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="e.g. Materials"
                    value={item.category}
                    onChange={(e) => handleBudgetItemChange(index, "category", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Amount (R)</label>
                  <input
                    type="number"
                    className={inputClass}
                    placeholder="0"
                    value={item.amount || ""}
                    onChange={(e) => handleBudgetItemChange(index, "amount", Number(e.target.value))}
                    min={0}
                  />
                </div>
                <div>
                  <label className={labelClass}>Notes</label>
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="Optional notes"
                    value={item.notes ?? ""}
                    onChange={(e) => handleBudgetItemChange(index, "notes", e.target.value)}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveBudgetItem(index)}
                className="mt-6 rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Section 7: Submit */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading || isSubmitting}
          className="rounded-lg bg-gold-500 px-8 py-3 font-semibold text-white transition-colors hover:bg-gold-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {(isLoading || isSubmitting) ? "Saving..." : mode === "edit" ? "Update Property" : "Save Property"}
        </button>
      </div>
    </form>
  );
}
