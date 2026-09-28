import type { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { apiError, HTTP_STATUS_FOR_CODE } from "@reviewmind/contracts";

/**
 * Stand-in for "Use Supabase Auth with seeded demo accounts. The Node API
 * validates the bearer session with the provider and checks repository
 * membership for every request."
 *
 * For this offline prototype, the bearer token IS the seeded user id
 * (see seed.ts: demo-viewer / demo-contributor / demo-maintainer). Swapping
 * to real Supabase Auth means replacing `resolveUser` with a call to
 * supabase.auth.getUser(token) and loading the membership row from Postgres
 * instead of the in-memory `db.memberships` array — every route below is
 * already written against `req.user`, so nothing else changes.
 */
export interface AuthedRequest extends Request {
  user?: { id: string; role: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  const user = db.users.get(token);
  if (!user) {
    const err = apiError("FORBIDDEN", "Missing or invalid session. Use one of the seeded demo bearer tokens (see README).");
    return res.status(HTTP_STATUS_FOR_CODE.FORBIDDEN).json({ error: err });
  }
  req.user = { id: user.id, role: user.role };
  next();
}

export function requireRole(min: "viewer" | "contributor" | "maintainer") {
  const order = ["viewer", "contributor", "maintainer"];
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role ?? "viewer";
    if (order.indexOf(role) < order.indexOf(min)) {
      const err = apiError("FORBIDDEN", `This action requires the "${min}" role or higher.`);
      return res.status(HTTP_STATUS_FOR_CODE.FORBIDDEN).json({ error: err });
    }
    next();
  };
}
