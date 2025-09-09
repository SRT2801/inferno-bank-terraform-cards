import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { v4 as uuidv4 } from "uuid";
import { Transaction } from "./types";
import { config } from "./config";
import { Card, User } from "../process-purchase-lambda/types";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sqsClient = new SQSClient({});

const TRANSACTION_TABLE_NAME = config.dynamoDB.transactionTableName;
const CARD_TABLE_NAME = config.dynamoDB.cardTableName;
const USER_TABLE_NAME = config.dynamoDB.userTableName;
const NOTIFICATION_EMAIL_QUEUE_URL = config.sqs.notificationEmailQueueUrl;

const getUserEmail = async (userId: string): Promise<string | null> => {
  try {
    const userQueryParams = {
      TableName: USER_TABLE_NAME,
      KeyConditionExpression: "#uuid = :userId",
      ExpressionAttributeNames: {
        "#uuid": "uuid",
      },
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    };

    const userQueryResponse = await docClient.send(
      new QueryCommand(userQueryParams)
    );
    const user = userQueryResponse.Items?.[0] as User;

    if (!user) {
      console.error(`User with ID ${userId} not found`);
      return null;
    }

    return user.email;
  } catch (error) {
    console.error("Error getting user email:", error);
    return null;
  }
};

const sendSaveTransactionNotification = async (
  email: string,
  date: string,
  merchant: string,
  amount: number
): Promise<void> => {
  try {
    const messageBody = {
      type: "TRANSACTION.SAVE",
      data: {
        email,
        date,
        merchant,
        amount,
      },
    };

    const sendMessageParams = {
      QueueUrl: NOTIFICATION_EMAIL_QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
    };

    await sqsClient.send(new SendMessageCommand(sendMessageParams));
    console.log("Save transaction notification sent to SQS successfully");
  } catch (error) {
    console.error("Error sending save transaction notification to SQS:", error);
  }
};

const checkAndActivateCreditCard = async (userId: string): Promise<void> => {
  try {
 
    const userCardsQueryParams = {
      TableName: CARD_TABLE_NAME,
      IndexName: "userIdIndex", 
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
    };

    const userCardsResult = await docClient.send(
      new QueryCommand(userCardsQueryParams)
    );

    if (!userCardsResult.Items || userCardsResult.Items.length === 0) {
      console.log(`No cards found for user ${userId}`);
      return;
    }

    const userCards = userCardsResult.Items as Card[];
    const debitCard = userCards.find((card) => card.type === "DEBIT");
    const creditCard = userCards.find((card) => card.type === "CREDIT");

    if (!debitCard || !creditCard) {
      console.log(`User ${userId} doesn't have both debit and credit cards`);
      return;
    }

   
    if (creditCard.status === "ACTIVATED") {
      return;
    }

   
    const transactionQueryParams = {
      TableName: TRANSACTION_TABLE_NAME,
      IndexName: "cardIdIndex",
      KeyConditionExpression: "cardId = :cardId",
      ExpressionAttributeValues: {
        ":cardId": debitCard.uuid,
      },
    };

    const transactionQueryResponse = await docClient.send(
      new QueryCommand(transactionQueryParams)
    );

    const transactionCount = transactionQueryResponse.Items!.length;

    if (transactionCount >= 10) {
      console.log(
        `Activating credit card ${creditCard.uuid} after user completed ${transactionCount} debit transactions`
      );

      const updateParams = {
        TableName: CARD_TABLE_NAME,
        Key: {
          uuid: creditCard.uuid,
          createdAt: creditCard.createdAt,
        },
        UpdateExpression: "SET #status = :status",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":status": "ACTIVATED",
        },
      };

      await docClient.send(new UpdateCommand(updateParams));
      console.log(`Credit card ${creditCard.uuid} has been activated`);
    } else {
      console.log(
        `User has ${transactionCount} debit transactions, needs 10 to activate credit card`
      );
    }
  } catch (error) {
    console.error("Error checking and activating credit card:", error);
  }
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const cardId = event.pathParameters?.card_id;
    const requestBody = JSON.parse(event.body!);
    const { merchant, amount } = requestBody;

    if (!cardId || !amount || !merchant) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({
          message: "CardId, Amount an Merchant are mandatory",
        }),
      };
    }

    const queryParams = {
      TableName: CARD_TABLE_NAME,
      KeyConditionExpression: "#pk = :cardId",
      ExpressionAttributeNames: {
        "#pk": "uuid",
      },
      ExpressionAttributeValues: {
        ":cardId": cardId,
      },
      Limit: 1,
    };

    const queryResult = await docClient.send(new QueryCommand(queryParams));

    if (!queryResult.Items || queryResult.Items.length === 0) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({ message: "Card not found" }),
      };
    }

    const card = queryResult.Items[0] as Card;
    const numAmount = Number(amount);
    const cardType = card.type;

    if (cardType === "DEBIT") {
      const newBalance = card.balance + numAmount;
      await updateCardBalance(card, newBalance);
    } else if (cardType === "CREDIT") {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({
          message: "Credit cards are now allowed to be saving",
        }),
      };
    }

    const transaction: Transaction = {
      uuid: uuidv4(),
      merchant,
      cardId,
      amount: numAmount,
      type: "SAVING",
      createdAt: new Date().toISOString(),
    };

    const putParams = {
      TableName: TRANSACTION_TABLE_NAME,
      Item: transaction,
    };

    await docClient.send(new PutCommand(putParams));


    try {
      await checkAndActivateCreditCard(card.userId);
    } catch (error) {
      console.error("Error checking credit card activation:", error);
     
    }

    try {
      const userEmail = await getUserEmail(card.userId);
      if (userEmail) {
        await sendSaveTransactionNotification(
          userEmail,
          transaction.createdAt,
          merchant,
          numAmount
        );
      } else {
        console.warn(`Could not find email for user ${card.userId}`);
      }
    } catch (error) {
      console.error("Error sending save transaction notification:", error);

    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
      body: JSON.stringify({
        message: "Saving with success!",
        transaction,
        newBalance: amount,
      }),
    };
  } catch (error) {
    console.error("Error saving transaction:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
      body: JSON.stringify({
        message: "Error saving transaction",
        error: String(error),
      }),
    };
  }
};

async function updateCardBalance(
  card: Card,
  newBalance: number
): Promise<void> {
  const updateParams = {
    TableName: CARD_TABLE_NAME,
    Key: {
      uuid: card.uuid,
      createdAt: card.createdAt,
    },
    UpdateExpression: "SET balance = :newBalance",
    ExpressionAttributeValues: {
      ":newBalance": newBalance,
    },
  };

  await docClient.send(new UpdateCommand(updateParams));
}
