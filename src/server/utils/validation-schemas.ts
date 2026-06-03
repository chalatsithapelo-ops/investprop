import { z } from "zod";

// User validation schemas
export const userEmailSchema = z.string().email("Invalid email address");

export const userPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

export const userNameSchema = z
  .string()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name cannot exceed 100 characters");

export const userRoleSchema = z.enum([
  "INVESTOR",
  "DEVELOPMENT_MANAGER",
  "PROJECT_MANAGER",
  "PROPERTY_OWNER",
  "CONTRACTOR",
]);

// Property validation schemas
export const propertyTitleSchema = z
  .string()
  .min(5, "Title must be at least 5 characters")
  .max(200, "Title cannot exceed 200 characters");

export const propertyDescriptionSchema = z
  .string()
  .min(20, "Description must be at least 20 characters")
  .max(5000, "Description cannot exceed 5000 characters");

export const propertyAddressSchema = z
  .string()
  .min(5, "Address must be at least 5 characters")
  .max(200, "Address cannot exceed 200 characters");

export const propertyCitySchema = z
  .string()
  .min(2, "City must be at least 2 characters")
  .max(100, "City cannot exceed 100 characters");

export const propertyStateSchema = z
  .string()
  .min(2, "State must be at least 2 characters")
  .max(100, "State cannot exceed 100 characters");

export const propertyZipCodeSchema = z
  .string()
  .regex(/^\d{4,10}$/, "Invalid zip code format");

export const propertyPriceSchema = z
  .number()
  .positive("Price must be positive")
  .max(1000000000, "Price cannot exceed 1 billion");

export const propertyBedroomsSchema = z
  .number()
  .int()
  .min(0, "Bedrooms cannot be negative")
  .max(50, "Bedrooms cannot exceed 50");

export const propertyBathroomsSchema = z
  .number()
  .int()
  .min(0, "Bathrooms cannot be negative")
  .max(50, "Bathrooms cannot exceed 50");

export const propertySquareMetersSchema = z
  .number()
  .int()
  .positive("Square meters must be positive")
  .max(100000, "Square meters cannot exceed 100,000");

// Financial validation schemas
export const monetaryAmountSchema = z
  .number()
  .min(0, "Amount cannot be negative")
  .max(1000000000, "Amount cannot exceed 1 billion");

export const percentageSchema = z
  .number()
  .min(0, "Percentage cannot be negative")
  .max(100, "Percentage cannot exceed 100");

export const roiSchema = z
  .number()
  .min(-100, "ROI cannot be less than -100%")
  .max(10000, "ROI cannot exceed 10000%");

// Investment validation schemas
export const contributionAmountSchema = z
  .number()
  .positive("Contribution must be positive")
  .max(100000000, "Contribution cannot exceed 100 million");

export const returnRateSchema = z
  .number()
  .min(0, "Return rate cannot be negative")
  .max(1000, "Return rate cannot exceed 1000%");

// File upload validation
export const imageFileSchema = z.object({
  name: z.string(),
  size: z.number().max(10 * 1024 * 1024, "File size cannot exceed 10MB"),
  type: z.enum(["image/jpeg", "image/png", "image/webp"], {
    errorMap: () => ({ message: "Only JPEG, PNG, and WebP images are allowed" }),
  }),
});

export const documentFileSchema = z.object({
  name: z.string(),
  size: z.number().max(50 * 1024 * 1024, "File size cannot exceed 50MB"),
  type: z.enum(["application/pdf", "image/jpeg", "image/png"], {
    errorMap: () => ({ message: "Only PDF, JPEG, and PNG files are allowed" }),
  }),
});

// Token validation
export const tokenSchema = z.string().min(32, "Invalid token");

// Pagination validation
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

// Date validation
export const futureDateSchema = z.coerce.date().refine(
  (date) => date > new Date(),
  { message: "Date must be in the future" }
);

export const pastDateSchema = z.coerce.date().refine(
  (date) => date < new Date(),
  { message: "Date must be in the past" }
);

// IP Address validation
export const ipAddressSchema = z.string().ip({ version: "v4" }).or(z.string().ip({ version: "v6" }));

// Phone number validation (international format)
export const phoneNumberSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format")
  .optional();

// URL validation
export const urlSchema = z.string().url("Invalid URL format");
