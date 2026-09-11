export interface VinDecode {
  provider: "NHTSA vPIC"; vin: string; requestedYear: number | null; decodedAt: string;
  make: string; model: string; year: number | null; manufacturer: string; bodyClass: string; cylinders: string; displacementLitres: string; fuel: string;
  errorCodes: string[]; message: string; canApply: boolean;
}
export interface VinReviewEvidence { id: string; requestId: string; requestHash: string; reviewedAt: string; reviewedBy: string; actorId: string; result: VinDecode; appliedValues: Record<string, string | number | boolean>; previousValues: Record<string, string | number | boolean> | null }
export interface VinLookupReview { result: VinDecode; proof: string | null; target: { id: string; values: Record<string, string | number | boolean> } | null }
