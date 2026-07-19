// Real auth on every inbound endpoint from day one — /trigger and
// /webhook/mcp check a shared secret header, /webhook/github verifies
// GitHub's HMAC webhook signature instead, since that's the mechanism
// GitHub itself provides.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "./logging.js";

export function sharedSecretAuth(expectedSecret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const provided = req.header("x-orchestrator-secret");
    if (!provided || !safeEqual(provided, expectedSecret)) {
      logger.warn("rejected unauthenticated request", { path: req.path });
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}

export function githubWebhookAuth(webhookSecret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.header("x-hub-signature-256");
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!signature || !rawBody) {
      logger.warn("rejected github webhook missing signature");
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const expected = "sha256=" + createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    if (!safeEqual(signature, expected)) {
      logger.warn("rejected github webhook bad signature");
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}

// Separate credential from sharedSecretAuth above — a browser-extension or
// other inspectable client's code/storage is readable by anyone who unpacks
// it, unlike a server-side env var, so it gets its own dedicated,
// narrowly-scoped key rather than reusing ORCHESTRATOR_SHARED_SECRET.
export function extensionAuth(expectedKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const provided = req.header("x-extension-api-key");
    if (!provided || !safeEqual(provided, expectedKey)) {
      logger.warn("rejected unauthenticated extension request", { path: req.path });
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}

/** Checks a commenter's GitHub login against the allowlist before honoring an @mention. */
export function isAllowedMentionAuthor(login: string, allowlist: readonly string[]): boolean {
  return allowlist.some((allowed) => allowed.toLowerCase() === login.toLowerCase());
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
