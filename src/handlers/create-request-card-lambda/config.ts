export const config = {
  dynamoDB: {
    cardTableName: process.env.CARD_TABLE_NAME || "card-table",
  },

  sqs: {
    errorQueueUrl: process.env.ERROR_QUEUE_URL,
  },
};
