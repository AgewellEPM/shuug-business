import { inspectionGet, inspectionPost } from "@/lib/auto-repair/inspection-http";
export const GET = () => inspectionGet(true);
export const POST = (request: Request) => inspectionPost(request, true);
