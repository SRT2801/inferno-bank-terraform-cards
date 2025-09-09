export interface PurchaseRequest {
  uuid: string;
  amount: number;
  description: string;
  merchantName: string;
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

export interface Transaction {
  id: string;
  card_id: string;
  amount: number;
  description: string;
  merchantName: string;
  timestamp: string;
  status: "APPROVED" | "REJECTED";
  type: "PURCHASE";
}
