export const config = {
  dynamoDB: {
    cardTableName: process.env.CARD_TABLE_NAME || "card-table",
  },
};
