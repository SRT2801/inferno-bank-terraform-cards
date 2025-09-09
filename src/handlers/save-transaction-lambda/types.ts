export interface Transaction {
  uuid: string;
  cardId: string;
  amount: number;
  description: string;
  type: "DEBIT" | "CREDIT";
  transactionType?: "DEPOSIT" | "WITHDRAW"; // Tipo de transacción: depósito o retiro
  createdAt: string;
}

export interface Card {
  uuid: string;
  user_id: string;
  type: "CREDIT" | "DEBIT";
  status: string;
  balance: number;
  limit?: number;
  createdAt: string;
}
