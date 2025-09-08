export interface CardPayment {
  uuid: string;
  amount: number;
}

export interface Card {
  uuid: string;
  user_id: string;
  type: "CREDIT" | "DEBIT";
  status: string;
  balance: number;
  createdAt: string;
  amount?: number;
}
