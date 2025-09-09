export interface CardRequest {
  uuid: string;
  userId: string;
  type: "DEBIT" | "CREDIT";
  status: "ACTIVATED" | "PENDING";
  balance: number;
  createdAt: string;
}

export interface User {
  uuid: string;
  email: string;
  name?: string;
  createdAt: string;
}

export const CardDefaults = {
  DEBIT: {
    status: "ACTIVATED" as const,
    balance: 0,
  },
  CREDIT: {
    status: "PENDING" as const,
    balance: 1000,
    calculateAmount: (): number => {
      const score = Math.floor(Math.random() * 101);
      const amount = 100 + (score / 100) * (10000000 - 100);
      return Math.round(amount * 100) / 100;
    },
  },
};
