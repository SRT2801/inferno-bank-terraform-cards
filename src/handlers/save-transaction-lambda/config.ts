export const config = {
  dynamoDB: {
    transactionTableName:
      process.env.TRANSACTION_TABLE_NAME || "transaction-table",
    cardTableName: process.env.CARD_TABLE_NAME || "card-table",
  },
};
