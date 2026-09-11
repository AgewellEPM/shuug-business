import type { ReservationStatus } from "./reservations";
export const reservationTransitions: Record<ReservationStatus, ReservationStatus[]> = { requested: ["confirmed", "waiting", "seated", "cancelled", "no-show"], confirmed: ["waiting", "seated", "cancelled", "no-show"], waiting: ["seated", "cancelled", "no-show"], seated: ["completed"], completed: [], cancelled: [], "no-show": [] };
