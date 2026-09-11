import { inspectionGet, inspectionPost } from "@/lib/auto-repair/inspection-http";
export const GET = () => inspectionGet(false);
export const POST = (request: Request) => inspectionPost(request, false);
