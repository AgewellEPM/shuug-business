export type MfaKind = "owner" | "employee" | "customer" | "secure-customer";
export type MfaAudience = "staff" | "customer" | "secure-customer";
export interface MfaSubject { kind: MfaKind; id: string }
export interface MfaChallenge {
  challengeToken: string;
  enrollmentRequired: boolean;
  expiresAt: string;
}
export class MfaChallengeError extends Error {
  readonly status = 428;
  constructor(readonly challenge: MfaChallenge) {
    super(challenge.enrollmentRequired ? "Set up your authenticator to finish signing in." : "Enter your authenticator or recovery code to finish signing in.");
    this.name = "MfaChallengeError";
  }
}
export class MfaError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = "MfaError"; }
}
