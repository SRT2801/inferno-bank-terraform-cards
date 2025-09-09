export interface CardActivation {
  uuid: string;
}

export interface Card {
  uuid: string;
  userId: string;
  type: "CREDIT" | "DEBIT";
  status: string;
  balance: number;
  createdAt: string;
  amount?: number;
}
