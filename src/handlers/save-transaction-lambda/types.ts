export interface Transaction {
  uuid: string;
  cardId: string;
  amount: number;
  merchant: string;
  type: 'SAVING' | 'PAYMENT_BALANCE' | 'PURCHASE';
  createdAt: string;
}

export interface Card {
  uuid: string;
  user_id: string;
  type: 'CREDIT' | 'DEBIT';
  status: 'ACTIVATED' | 'PENDING';
  balance: number;
  createdAt: string;
}
