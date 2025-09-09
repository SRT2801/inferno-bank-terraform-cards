export interface CardPayment {
  uuid?: string;
  amount: number;
  merchant: string;
}

export interface Card {
  uuid: string;
  user_id: string;
  type: "CREDIT" | "DEBIT";
  status: string;
  balance: number;
  createdAt: string;
  limit?: number;
  amount?: number;
}
