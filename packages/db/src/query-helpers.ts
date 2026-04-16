/**
 * Type-Safe Database Query Wrappers for Urban Deals Shop
 * Provides safe, consistent database operations with error handling
 */

import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";

/**
 * Database operation result type
 */
export interface DbResult<T> {
  success: boolean;
  data?: T;
  error?: DbError;
}

/**
 * Database error type
 */
export interface DbError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

/**
 * Safe database operation wrapper
 */
export async function safeDbOperation<T>(
  operation: () => Promise<T>,
  operationName: string = "Database operation",
): Promise<DbResult<T>> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    const dbError = handlePrismaError(error, operationName);
    return { success: false, error: dbError };
  }
}

/**
 * Handle Prisma specific errors
 */
export function handlePrismaError(
  error: unknown,
  operationName: string = "Database operation",
): DbError {
  console.error(`[${operationName}] Error:`, error);

  if (error instanceof PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return {
          code: "UNIQUE_CONSTRAINT",
          message: "A record with this value already exists",
          details: { field: error.meta?.target },
        };

      case "P2025":
        return {
          code: "NOT_FOUND",
          message: "Record not found",
          details: error.meta,
        };

      case "P2003":
        return {
          code: "FOREIGN_KEY_CONSTRAINT",
          message: "Invalid reference to related record",
          details: error.meta,
        };

      case "P2014":
        return {
          code: "REQUIRED_RELATION_VIOLATION",
          message: "Cannot delete record due to related data",
          details: error.meta,
        };

      case "P2016":
        return {
          code: "QUERY_INTERPRETATION_ERROR",
          message: "Invalid query",
          details: error.meta,
        };

      default:
        return {
          code: error.code,
          message: error.message,
          details: error.meta,
        };
    }
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL_ERROR",
      message: error.message || "An unexpected database error occurred",
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "An unexpected database error occurred",
  };
}

/**
 * Find a single record with error handling
 */
export async function findOne<T>(
  findFn: () => Promise<T | null>,
  entityName: string = "Record",
): Promise<DbResult<T>> {
  return safeDbOperation(
    async () => {
      const result = await findFn();
      if (!result) {
        throw new Error(`${entityName} not found`);
      }
      return result;
    },
    `Find ${entityName}`,
  );
}

/**
 * Find many records with error handling
 */
export async function findMany<T>(
  findFn: () => Promise<T[]>,
  entityName: string = "Records",
): Promise<DbResult<T[]>> {
  return safeDbOperation(
    async () => {
      const results = await findFn();
      return results || [];
    },
    `Find Multiple ${entityName}`,
  );
}

/**
 * Create a new record with error handling
 */
export async function createOne<T>(
  createFn: () => Promise<T>,
  entityName: string = "Record",
): Promise<DbResult<T>> {
  return safeDbOperation(
    async () => {
      return await createFn();
    },
    `Create ${entityName}`,
  );
}

/**
 * Update a record with error handling
 */
export async function updateOne<T>(
  updateFn: () => Promise<T>,
  entityName: string = "Record",
): Promise<DbResult<T>> {
  return safeDbOperation(
    async () => {
      return await updateFn();
    },
    `Update ${entityName}`,
  );
}

/**
 * Delete a record with error handling
 */
export async function deleteOne(
  deleteFn: () => Promise<any>,
  entityName: string = "Record",
): Promise<DbResult<{ id: string }>> {
  return safeDbOperation(
    async () => {
      const result = await deleteFn();
      return { id: result.id };
    },
    `Delete ${entityName}`,
  );
}

/**
 * Transaction wrapper for multiple operations
 */
export async function withTransaction<T>(
  operation: () => Promise<T>,
  operationName: string = "Transaction",
): Promise<DbResult<T>> {
  return safeDbOperation(
    async () => {
      return await operation();
    },
    operationName,
  );
}

/**
 * Paginated query result
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Paginated query with error handling
 */
export async function findPaginated<T>(
  countFn: () => Promise<number>,
  findFn: (skip: number, take: number) => Promise<T[]>,
  page: number = 1,
  pageSize: number = 10,
  entityName: string = "Records",
): Promise<DbResult<PaginatedResult<T>>> {
  return safeDbOperation(
    async () => {
      if (page < 1) throw new Error("Page must be greater than 0");
      if (pageSize < 1 || pageSize > 100)
        throw new Error("Page size must be between 1 and 100");

      const skip = (page - 1) * pageSize;
      const [total, data] = await Promise.all([
        countFn(),
        findFn(skip, pageSize),
      ]);

      return {
        data,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    },
    `Paginated Find ${entityName}`,
  );
}

/**
 * Batch operations with error recovery
 */
export async function batchOperation<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  stopOnError: boolean = false,
): Promise<{
  successful: R[];
  failed: Array<{ item: T; error: DbError }>;
}> {
  const successful: R[] = [];
  const failed: Array<{ item: T; error: DbError }> = [];

  for (const item of items) {
    try {
      const result = await operation(item);
      successful.push(result);
    } catch (error) {
      const dbError = handlePrismaError(error, "Batch operation");
      failed.push({ item, error: dbError });

      if (stopOnError) {
        break;
      }
    }
  }

  return { successful, failed };
}

/**
 * Helper to check if result is successful and typed
 */
export function isSuccessful<T>(result: DbResult<T>): result is DbResult<T> & { data: T } {
  return result.success && result.data !== undefined;
}

/**
 * Helper to check if result failed
 */
export function isFailed<T>(result: DbResult<T>): result is DbResult<T> & { error: DbError } {
  return !result.success && result.error !== undefined;
}
