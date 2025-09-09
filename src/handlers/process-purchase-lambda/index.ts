import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  PutCommand,
  UpdateCommandInput,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Card, PurchaseRequest, User } from "./types";
import { config } from "./config";
import { v4 as uuidv4 } from "uuid";
import { Transaction } from "../save-transaction-lambda/types";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sqsClient = new SQSClient({});

const CARD_TABLE_NAME = config.dynamoDB.cardTableName;
const TRANSACTION_TABLE_NAME = config.dynamoDB.transactionTableName;
const USER_TABLE_NAME = config.dynamoDB.userTableName;
const NOTIFICATION_EMAIL_QUEUE_URL = config.sqs.notificationEmailQueueUrl;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({ message: "Request body is required" }),
      };
    }

    const requestBody = JSON.parse(event.body) as PurchaseRequest;
    console.log("🚀 ~ handler ~ requestBody:", requestBody);
    const { cardId, amount, merchant } = requestBody;

    if (!cardId || !merchant || amount <= 0) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({
          message: "UUID de tarjeta y monto válido son requeridos",
        }),
      };
    }

    console.log("🚀 ~ handler ~ cardId:", cardId);

    const queryCardParams = {
      TableName: CARD_TABLE_NAME,
      KeyConditionExpression: "#uuid = :uuid",
      ExpressionAttributeNames: {
        "#uuid": "uuid",
      },
      ExpressionAttributeValues: {
        ":uuid": cardId,
      },
    };

    const cardQueryResponse = await docClient.send(
      new QueryCommand(queryCardParams)
    );
    const card = cardQueryResponse.Items?.[0] as Card;
    console.log("🚀 ~ handler ~ card:", card);

    if (!card) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({ message: "Tarjeta no encontrada" }),
      };
    }

    if (card.status !== "ACTIVATED") {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({
          message: "La tarjeta no está activada",
        }),
      };
    }

    let approved = false;
    let newBalance = card.balance;

    if (card.type === "DEBIT") {
      if (card.balance >= amount) {
        approved = true;
        newBalance = card.balance - amount;
      } else {
        approved = false;
      }
    } else if (card.type === "CREDIT") {
      if (card.balance >= amount) {
        approved = true;
        newBalance = card.balance - amount;
      } else {
        approved = false;
      }
    }

    await checkAndActivateCard(cardId);

    console.log("🚀 ~ handler ~ card_id:", cardId);

    const transaction: Transaction = {
      uuid: uuidv4(),
      cardId,
      amount,
      merchant,
      type: "PURCHASE",
      createdAt: new Date().toISOString(),
    };

    const putTransactionParams = {
      TableName: TRANSACTION_TABLE_NAME,
      Item: transaction,
    };

    await docClient.send(new PutCommand(putTransactionParams));

    // Obtener el email del usuario y enviar notificación
    try {
      const userEmail = await getUserEmail(card.userId);
      if (userEmail) {
        await sendNotificationEmail(
          userEmail,
          transaction.createdAt,
          merchant,
          cardId,
          amount
        );
      } else {
        console.warn(`Could not find email for user ${card.userId}`);
      }
    } catch (error) {
      console.error("Error sending notification email:", error);
      // No fallar la transacción por error de notificación
    }

    if (approved) {
      const updateCardParams: UpdateCommandInput = {
        TableName: CARD_TABLE_NAME,
        Key: {
          uuid: cardId,
          createdAt: card.createdAt,
        },
        UpdateExpression: "SET balance = :newBalance",
        ExpressionAttributeValues: {
          ":newBalance": newBalance,
        },
        ReturnValues: "ALL_NEW" as const,
      };

      await docClient.send(new UpdateCommand(updateCardParams));
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
        transaction,
        approved,
        message: approved
          ? "Transacción aprobada"
          : "Transacción rechazada: fondos insuficientes o límite excedido",
      }),
    };
  } catch (error) {
    console.error("Error processing purchase:", JSON.stringify(error));

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
      body: JSON.stringify({
        message: "Error interno del servidor",
        error: String(error),
      }),
    };
  }
};

const checkAndActivateCard = async (cardId: string): Promise<void> => {
  try {
    const cardQueryParams = {
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

    const cardResult = await docClient.send(new QueryCommand(cardQueryParams));

    if (!cardResult.Items || cardResult.Items.length === 0) {
      console.error(`Card with ID ${cardId} not found`);
      return;
    }

    const card = cardResult.Items[0] as Card;

    if (card.type === "DEBIT" || card.status === "ACTIVATED") {
      return;
    }

    const transactionQueryParams = {
      TableName: TRANSACTION_TABLE_NAME,
      IndexName: "cardIdIndex",
      KeyConditionExpression: "cardId = :cardId",
      ExpressionAttributeValues: {
        ":cardId": cardId,
      },
    };

    const transactionQueryResponse = await docClient.send(
      new QueryCommand(transactionQueryParams)
    );

    const transactionCount = transactionQueryResponse.Items!.length;

    if (transactionCount >= 10) {
      console.log(
        `Activating card ${cardId} after ${transactionCount} transactions`
      );

      const updateParams = {
        TableName: CARD_TABLE_NAME,
        Key: {
          uuid: card.uuid,
          createdAt: card.createdAt,
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
      console.log(`Card ${cardId} has been activated`);
    } else {
      console.log(
        `Card ${cardId} has ${transactionCount} transactions, needs 10 to activate`
      );
    }
  } catch (error) {
    console.error("Error checking and activating card:", error);
  }
};

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

const sendNotificationEmail = async (
  email: string,
  date: string,
  merchant: string,
  cardId: string,
  amount: number
): Promise<void> => {
  try {
    const messageBody = {
      type: "TRANSACTION.PURCHASE",
      data: {
        email,
        date,
        merchant,
        cardId,
        amount,
      },
    };

    const sendMessageParams = {
      QueueUrl: NOTIFICATION_EMAIL_QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
    };

    await sqsClient.send(new SendMessageCommand(sendMessageParams));
    console.log("Notification email message sent to SQS successfully");
  } catch (error) {
    console.error("Error sending notification email message to SQS:", error);
  }
};
