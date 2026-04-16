/**
 * Enhanced Form Validation Utilities for Urban Deals Shop
 * Reusable validation schemas and helpers for common form patterns
 */

import { z } from "zod";

/**
 * Common validation patterns
 */
export const ValidationPatterns = {
  // Email validation
  email: z
    .string({ message: "Email is required" })
    .email({ message: "Invalid email format" })
    .toLowerCase()
    .trim(),

  // Password validation (min 8 chars, special char, number)
  password: z
    .string({ message: "Password is required" })
    .min(8, { message: "Password must be at least 8 characters" })
    .regex(/[A-Z]/, {
      message: "Password must contain at least one uppercase letter",
    })
    .regex(/[0-9]/, { message: "Password must contain at least one number" })
    .regex(/[!@#$%^&*]/, {
      message: "Password must contain at least one special character (!@#$%^&*)",
    }),

  // Name validation
  fullName: z
    .string({ message: "Full name is required" })
    .min(2, { message: "Name must be at least 2 characters" })
    .max(100, { message: "Name must be less than 100 characters" })
    .regex(/^[a-zA-Z\s'-]+$/, {
      message: "Name can only contain letters, spaces, hyphens, and apostrophes",
    }),

  // Username validation
  username: z
    .string({ message: "Username is required" })
    .min(3, { message: "Username must be at least 3 characters" })
    .max(20, { message: "Username must be less than 20 characters" })
    .regex(/^[a-zA-Z0-9_-]+$/, {
      message: "Username can only contain letters, numbers, underscores, and hyphens",
    }),

  // Phone number validation
  phoneNumber: z
    .string({ message: "Phone number is required" })
    .regex(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/, {
      message: "Invalid phone number format",
    }),

  // Product name validation
  productName: z
    .string({ message: "Product name is required" })
    .min(3, { message: "Product name must be at least 3 characters" })
    .max(255, { message: "Product name must be less than 255 characters" })
    .trim(),

  // Description validation
  description: z
    .string({ message: "Description is required" })
    .min(10, { message: "Description must be at least 10 characters" })
    .max(5000, { message: "Description must be less than 5000 characters" })
    .trim(),

  // Price validation
  price: z
    .number({ message: "Price must be a number" })
    .positive({ message: "Price must be greater than 0" })
    .max(999999, { message: "Price is too high" }),

  // URL validation
  url: z
    .string({ message: "URL is required" })
    .url({ message: "Invalid URL format" }),

  // Zip code validation
  zipCode: z
    .string({ message: "Zip code is required" })
    .regex(/^[0-9]{5}(?:-[0-9]{4})?$/, {
      message: "Invalid zip code format",
    }),
};

/**
 * Form response types
 */
export interface FormResponse<T = any> {
  status: "success" | "error";
  message: string;
  data?: T;
  errors?: Record<string, string[]>;
}

/**
 * Validate form data with Zod schema
 */
export function validateFormData<T extends z.ZodSchema>(
  schema: T,
  data: unknown,
): FormResponse<z.infer<T>> {
  const result = schema.safeParse(data);

  if (!result.success) {
    return {
      status: "error",
      message: "Validation failed",
      errors: result.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  return {
    status: "success",
    message: "Validation passed",
    data: result.data as z.infer<T>,
  };
}

/**
 * Async validator with debouncing for real-time validation
 */
export function createAsyncValidator<T>(
  validator: (value: T) => Promise<boolean>,
) {
  let timeoutId: NodeJS.Timeout;

  return async (value: T) => {
    return new Promise<boolean>((resolve) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        const isValid = await validator(value);
        resolve(isValid);
      }, 500); // 500ms debounce
    });
  };
}

/**
 * Field-level validation rules
 */
export const FieldValidators = {
  /**
   * Validate email uniqueness (requires async check)
   */
  emailUniqueness: createAsyncValidator(async (email: string) => {
    // This would typically check against database
    // Implementation depends on your DB setup
    return true; // Placeholder
  }),

  /**
   * Validate username uniqueness
   */
  usernameUniqueness: createAsyncValidator(async (username: string) => {
    // This would typically check against database
    // Implementation depends on your DB setup
    return true; // Placeholder
  }),

  /**
   * Validate product SKU uniqueness
   */
  skuUniqueness: createAsyncValidator(async (sku: string) => {
    // This would typically check against database
    // Implementation depends on your DB setup
    return true; // Placeholder
  }),
};

/**
 * Common form schemas
 */
export const FormSchemas = {
  /**
   * Login form schema
   */
  login: z.object({
    email: ValidationPatterns.email,
    password: z.string({ message: "Password is required" }).min(1),
  }),

  /**
   * Registration form schema
   */
  registration: z.object({
    fullName: ValidationPatterns.fullName,
    email: ValidationPatterns.email,
    password: ValidationPatterns.password,
    confirmPassword: z.string({ message: "Confirm password is required" }),
  }).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  }),

  /**
   * Profile update schema
   */
  profileUpdate: z.object({
    fullName: ValidationPatterns.fullName,
    email: ValidationPatterns.email,
    phoneNumber: ValidationPatterns.phoneNumber.optional(),
  }),

  /**
   * Product creation schema
   */
  productCreation: z.object({
    name: ValidationPatterns.productName,
    description: ValidationPatterns.description,
    price: ValidationPatterns.price,
    category: z.enum(["SHORTS", "PANTS", "T_SHIRT", "SHOES", "OTHER", "SUITS", "SHIRTS"]),
    size: z.enum(["XS", "S", "M", "L", "XL"]),
    image: z.any().optional(),
  }),

  /**
   * Contact form schema
   */
  contactForm: z.object({
    name: ValidationPatterns.fullName,
    email: ValidationPatterns.email,
    message: z
      .string({ message: "Message is required" })
      .min(10, { message: "Message must be at least 10 characters" })
      .max(1000, { message: "Message must be less than 1000 characters" }),
    subject: z
      .string({ message: "Subject is required" })
      .min(3, { message: "Subject must be at least 3 characters" })
      .max(100, { message: "Subject must be less than 100 characters" }),
  }),
};

/**
 * Sanitize form input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/javascript:/gi, "") // Remove javascript protocol
    .trim();
}

/**
 * Batch validate multiple fields
 */
export function validateMultipleFields(
  validators: Record<string, (value: any) => FormResponse>,
  data: Record<string, any>,
): Record<string, FormResponse> {
  const results: Record<string, FormResponse> = {};

  for (const [field, validator] of Object.entries(validators)) {
    results[field] = validator(data[field]);
  }

  return results;
}
