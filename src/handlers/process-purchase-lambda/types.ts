export interface PurchaseRequest {
  merchant: string;
  cardId: string;
  amount: number;
}

export interface Card {
  uuid: string;
  userId: string;
  type: "CREDIT" | "DEBIT";
  status: string;
  balance: number;
  createdAt: string;
}

export interface User {
  uuid: string;
  email: string;
  name?: string;
  createdAt: string;
}
