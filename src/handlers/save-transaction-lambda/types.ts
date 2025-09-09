export interface Transaction {
  uuid: string;
  cardId: string;
  amount: number;
  merchant: string;
  type: "SAVING" | "PAYMENT_BALANCE" | "PURCHASE";
  createdAt: string;
}

