export interface CardRequest {
  uuid: string;
  user_id: string;
  type: "DEBIT" | "CREDIT";
  status: "ACTIVATED" | "PENDING";
  balance: number;
  createdAt: string;
  amount?: number;
}

export interface CardRequestInput {
  user_id: string;
  type: "DEBIT" | "CREDIT";
  status?: "ACTIVATED" | "PENDING";
  balance?: number;
  createdAt?: string;
  score?: number;
}

export const CardDefaults = {
  DEBIT: {
    status: "ACTIVATED" as const,
    balance: 0,
  },
  CREDIT: {
    status: "PENDING" as const,
    balance: 1000,
    calculateAmount: (score: number): number => {
      const amount = 100 + (score / 100) * (10000000 - 100);
      return Math.round(amount * 100) / 100;
    },

    getRandomScore: (): number => {
      return Math.floor(Math.random() * 101);
    },
  },
};
