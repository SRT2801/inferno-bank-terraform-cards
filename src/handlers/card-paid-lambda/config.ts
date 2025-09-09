export const config = {
  dynamoDB: {
    cardTableName: process.env.CARD_TABLE_NAME || "card-table",
    transactionTableName:
      process.env.TRANSACTION_TABLE_NAME || "transaction-table",
    userTableName: process.env.USER_TABLE_NAME || "users",
  },
  sqs: {
    notificationEmailQueueUrl:
      process.env.NOTIFICATION_EMAIL_QUEUE_URL ||
      "https://sqs.us-east-1.amazonaws.com/475009428045/notification-email-sqs",
  },
};
