import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      // Lead with the first problem so forms can show something actionable; schemas for
      // user-facing fields carry readable messages. Per-field details stay for API callers.
      res.status(400).json({
        error: result.error.issues[0]?.message ?? "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
