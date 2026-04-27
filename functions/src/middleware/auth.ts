import { Request, Response, NextFunction } from "express";
import { auth } from "../config/firebase";
import * as functions from "firebase-functions";

/**
 * Represents an authenticated user extracted from Firebase ID token custom claims.
 */
export interface AuthenticatedUser {
  uid: string;
  role: string;
  ngo_id: string;
  email?: string;
}

/**
 * Middleware factory that validates Firebase ID tokens and enforces role-based access.
 *
 * - Extracts Bearer token from the Authorization header
 * - Verifies the token via firebase-admin auth.verifyIdToken()
 * - Extracts `role` and `ngo_id` from decoded token custom claims
 * - Checks if the user's role is in the allowed roles list
 * - Returns 401 for missing/invalid tokens
 * - Returns 403 if role is not in the allowed list
 * - Attaches decoded user info to `res.locals.user`
 */
export function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid Authorization header" });
      return;
    }

    const token = authHeader.split("Bearer ")[1];

    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const role = (decodedToken.role as string) || "";
    const ngo_id = (decodedToken.ngo_id as string) || "";

    if (!roles.includes(role)) {
      functions.logger.warn("Unauthorized access attempt", {
        actor: decodedToken.uid,
        role,
        requiredRoles: roles,
        action: req.method,
        resource: req.originalUrl,
      });
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    const user: AuthenticatedUser = {
      uid: decodedToken.uid,
      role,
      ngo_id,
      email: decodedToken.email,
    };

    res.locals.user = user;
    next();
  };
}

/**
 * Middleware that validates the authenticated user's `ngo_id` matches the
 * target resource's `ngo_id` from the request body or params.
 *
 * - Super admins bypass the tenant check.
 * - Returns 403 if there is a mismatch.
 * - Logs unauthorized attempts.
 *
 * Must be used after `requireRole()` so that `res.locals.user` is populated.
 */
export function requireTenantMatch() {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user as AuthenticatedUser | undefined;
    if (!user) {
      res.status(401).json({ error: "User not authenticated" });
      return;
    }

    // Super admins bypass tenant check
    if (user.role === "super_admin") {
      next();
      return;
    }

    const targetNgoId =
      req.body?.ngo_id ?? req.params?.ngo_id;

    if (targetNgoId && targetNgoId !== user.ngo_id) {
      functions.logger.warn("Tenant mismatch attempt", {
        actor: user.uid,
        role: user.role,
        userNgoId: user.ngo_id,
        targetNgoId,
        action: req.method,
        resource: req.originalUrl,
      });
      res.status(403).json({ error: "Tenant mismatch" });
      return;
    }

    next();
  };
}
