import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(auth);

export const GET = handler.GET;

export async function POST(req: Request) {
  try {
    return await handler.POST(req);
  } catch (e) {
    console.error("[Auth POST Error]", e);
    throw e;
  }
}
