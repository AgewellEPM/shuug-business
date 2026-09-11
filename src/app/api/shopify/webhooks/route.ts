import { webhookHandler } from "@/lib/shopify-backend/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = webhookHandler;
