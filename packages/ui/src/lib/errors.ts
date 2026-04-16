/**
 * Centralized Error Handling Utility for Urban Deals Shop
 * Provides consistent error handling across the application
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "BAD_REQUEST"
  | "SERVICE_UNAVAILABLE";

export interface AppError {
  code: ErrorCode;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
  timestamp?: Date;
}

/**
 * Maps error codes to HTTP status codes
 */
const errorCodeToStatusCode: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * Create a standardized app error
 */
export function createError(
  code: ErrorCode,
  message: string,
  details?: Record<string, any>,
): AppError {
  return {
    code,
    message,
    statusCode: errorCodeToStatusCode[code],
    details,
    timestamp: new Date(),
  };
}

/**
 * Handle errors in server actions with proper typing
 */
export function handleServerActionError(
  error: unknown,
): { status: "error"; message: string; code: ErrorCode } {
  console.error("[Server Action Error]", error);

  if (error instanceof Error) {
    // Handle validation errors
    if (error.message.includes("validation")) {
      return {
        status: "error",
        message: error.message,
        code: "VALIDATION_ERROR",
      };
    }

    // Handle not found errors
    if (error.message.includes("not found")) {
      return {
        status: "error",
        message: error.message,
        code: "NOT_FOUND",
      };
    }

    return {
      status: "error",
      message: error.message || "An unexpected error occurred",
      code: "INTERNAL_ERROR",
    };
  }

  return {
    status: "error",
    message: "An unexpected error occurred",
    code: "INTERNAL_ERROR",
  };
}

/**
 * Format error response for API routes
 */
export function formatApiErrorResponse(appError: AppError) {
  return {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
    },
    timestamp: appError.timestamp,
  };
}

/**
 * Validate API request with error handling
 */
export async function validateApiRequest<T>(
  schema: { safeParse: (data: any) => { success: boolean; error?: any; data?: T } },
  data: any,
): Promise<{ success: true; data: T } | { success: false; error: AppError }> {
  const result = schema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      error: createError(
        "VALIDATION_ERROR",
        "Request validation failed",
        result.error?.flatten?.().fieldErrors || result.error,
      ),
    };
  }

  return {
    success: true,
    data: result.data!,
  };
}

/**
 * Safe database operation wrapper
 */
export async function safeDatabaseOperation<T>(
  operation: () => Promise<T>,
  operationName: string = "Database operation",
): Promise<{ success: true; data: T } | { success: false; error: AppError }> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    console.error(`[${operationName}] Error:`, error);

    if (error instanceof Error) {
      // Handle Prisma errors
      if (error.message.includes("Unique constraint failed")) {
        return {
          success: false,
          error: createError(
            "CONFLICT",
            "This record already exists",
            { originalError: error.message },
          ),
        };
      }

      if (error.message.includes("Foreign key constraint")) {
        return {
          success: false,
          error: createError(
            "BAD_REQUEST",
            "Invalid reference to related record",
            { originalError: error.message },
          ),
        };
      }
    }

    return {
      success: false,
      error: createError(
        "INTERNAL_ERROR",
        `${operationName} failed`,
        { originalMessage: error instanceof Error ? error.message : "Unknown error" },
      ),
    };
  }
}
