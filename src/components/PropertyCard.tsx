import { Link } from "@tanstack/react-router";
import { Building, MapPin, TrendingUp } from "lucide-react";
import { RiskBadge } from "./RiskBadge";
import { AIMatchBadge } from "./AIMatchBadge";

type PropertyCardProps = {
  property: {
    id: number;
    title: string;
    imageUrl?: string;
    city?: string;
    state?: string;
    price?: number;
    propertyType?: string;
    status?: string;
    investmentStatus?: string;
    fundingGoal?: number;
    currentFunding?: number;
    expectedROI?: number;
    riskRating?: string;
  };
};

export function PropertyCard({ property }: PropertyCardProps) {
  const statusColors: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-600",
    PENDING: "bg-gold-50 text-gold-600",
    SOLD: "bg-purple-50 text-purple-600",
    COMPLETED: "bg-blue-50 text-blue-600",
    UNDER_RENOVATION: "bg-amber-50 text-amber-600",
    PLANNING: "bg-gray-100 text-gray-500",
  };

  const fundingPercentage = property.fundingGoal
    ? Math.min(((property.currentFunding ?? 0) / property.fundingGoal) * 100, 100)
    : 0;

  return (
    <Link
      to="/properties/$propertyId"
      params={{ propertyId: String(property.id) }}
      className="group block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-gold-300 hover:shadow-md"
    >
      <div className="relative h-48 overflow-hidden bg-gray-100">
        {property.imageUrl ? (
          <img
            src={property.imageUrl}
            alt={property.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Building className="h-16 w-16 text-gray-600" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        {property.status && (
          <span
            className={`absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-bold ${statusColors[property.status] ?? "bg-gray-100 text-gray-500"}`}
          >
            {property.status.replace(/_/g, " ")}
          </span>
        )}
        {property.riskRating && (
          <span className="absolute top-3 left-3">
            <RiskBadge rating={property.riskRating as any} />
          </span>
        )}
        <span className="absolute bottom-3 left-3">
          <AIMatchBadge propertyId={property.id} compact />
        </span>
      </div>
      <div className="p-5">
        <h3 className="mb-1 text-lg font-bold text-gray-900 line-clamp-1">
          {property.title}
        </h3>
        {(property.city || property.state) && (
          <p className="mb-3 flex items-center text-sm text-gray-500">
            <MapPin className="mr-1 h-3.5 w-3.5" />
            {[property.city, property.state].filter(Boolean).join(", ")}
          </p>
        )}
        {property.price != null && (
          <p className="mb-2 text-xl font-bold text-gold-600">
            R{property.price.toLocaleString()}
          </p>
        )}
        <div className="flex items-center justify-between text-sm text-gray-500">
          {property.propertyType && (
            <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
              {property.propertyType}
            </span>
          )}
          {property.expectedROI != null && (
            <span className="flex items-center text-emerald-600">
              <TrendingUp className="mr-1 h-3.5 w-3.5" />
              {property.expectedROI.toFixed(1)}% ROI
            </span>
          )}
        </div>
        {property.fundingGoal && property.fundingGoal > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-gray-500">
              <span>Funding</span>
              <span>{fundingPercentage.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-600 transition-all"
                style={{ width: `${fundingPercentage}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
