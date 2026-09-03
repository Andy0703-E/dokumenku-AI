export type PlanId = "pro" | "pro-max";

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  credits: number;
  priceFormatted: string;
};

export const PLANS: Plan[] = [
  { id: "pro", name: "Pro Studio", price: 20_000, credits: 100, priceFormatted: "Rp 20.000" },
  { id: "pro-max", name: "Pro Max", price: 75_000, credits: 500, priceFormatted: "Rp 75.000" },
];

export function getPlanById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
