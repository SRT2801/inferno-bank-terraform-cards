export interface CardPayment {
  uuid?: string;
  amount: number;
  merchant: string;
}

export interface Card {
  uuid: string;
  userId: string;
  type: "CREDIT" | "DEBIT";
  status: string;
  balance: number;
  createdAt: string;
  limit?: number;
  amount?: number;
}
