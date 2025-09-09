export const config = {
  dynamoDB: {
    cardTableName: process.env.CARD_TABLE_NAME || "card-table",
    transactionTableName:
      process.env.TRANSACTION_TABLE_NAME || "transaction-table",
  },
};
