import { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, code: err.code, fields: err.fields });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
