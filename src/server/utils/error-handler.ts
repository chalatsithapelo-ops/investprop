import { TRPCError } from "@trpc/server";

export class AppError extends TRPCError {
  constructor(
    code: "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_SERVER_ERROR" | "TOO_MANY_REQUESTS",
    message: string,
    public userMessage?: string,
    public details?: any
  ) {
    super({ code, message });
    this.name = "AppError";
    this.userMessage = userMessage || message;
  }
}

export const errorMessages = {
  // Authentication errors
  INVALID_CREDENTIALS: "Invalid email or password",
  UNAUTHORIZED: "You must be logged in to perform this action",
  FORBIDDEN: "You do not have permission to perform this action",
  EMAIL_ALREADY_EXISTS: "An account with this email already exists",
  EMAIL_NOT_VERIFIED: "Please verify your email before continuing",

  // Token errors
  INVALID_TOKEN: "Invalid or expired token",
  TOKEN_EXPIRED: "Your session has expired. Please login again",

  // Resource errors
  NOT_FOUND: "The requested resource was not found",
  ALREADY_EXISTS: "This resource already exists",

  // Validation errors
  INVALID_INPUT: "Invalid input provided",
  MISSING_REQUIRED_FIELD: "Required field is missing",

  // Rate limiting
  TOO_MANY_REQUESTS: "Too many requests. Please try again later",

  // Server errors
  INTERNAL_ERROR: "An unexpected error occurred. Please try again later",
  DATABASE_ERROR: "Database operation failed",

  // Business logic errors
  INSUFFICIENT_FUNDS: "Insufficient funds for this operation",
  PROPERTY_NOT_AVAILABLE: "This property is no longer available",
  FUNDING_CLOSED: "Funding for this property has closed",
};

export function handleTRPCError(error: unknown): TRPCError {
  // Log error for debugging
  console.error("TRPC Error:", error);

  // If it's already a TRPCError, return it
  if (error instanceof TRPCError) {
    return error;
  }

  // Handle Prisma errors
  if (error && typeof error === "object" && "code" in error) {
    const prismaError = error as any;

    switch (prismaError.code) {
      case "P2002": // Unique constraint violation
        return new TRPCError({
          code: "CONFLICT",
          message: errorMessages.ALREADY_EXISTS,
        });

      case "P2025": // Record not found
        return new TRPCError({
          code: "NOT_FOUND",
          message: errorMessages.NOT_FOUND,
        });

      case "P2003": // Foreign key constraint violation
        return new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot perform this operation due to related records",
        });

      default:
        return new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: errorMessages.DATABASE_ERROR,
        });
    }
  }

  // Handle validation errors
  if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: errorMessages.INVALID_INPUT,
    });
  }

  // Default error
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: errorMessages.INTERNAL_ERROR,
  });
}

export function logError(error: unknown, context?: any) {
  const timestamp = new Date().toISOString();
  const errorDetails = {
    timestamp,
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : error,
    context,
  };

  console.error("[Error Log]", JSON.stringify(errorDetails, null, 2));

  // In production, you would send this to a logging service like Sentry, LogRocket, etc.
}
