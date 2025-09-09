import { SQSEvent, SQSRecord } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { v4 as uuidv4 } from "uuid";
import { CardRequest, CardDefaults, User } from "./types";
import { config } from "./config";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sqsClient = new SQSClient({});

const CARD_TABLE_NAME = config.dynamoDB.cardTableName;
const USER_TABLE_NAME = config.dynamoDB.userTableName;
const NOTIFICATION_EMAIL_QUEUE_URL = config.sqs.notificationEmailQueueUrl;

const saveCardToDynamoDB = async (card: CardRequest): Promise<void> => {
  try {
    const params = {
      TableName: CARD_TABLE_NAME,
      Item: card,
    };

    await docClient.send(new PutCommand(params));
    console.log(`Card saved successfully: ${card.uuid}`);
  } catch (error) {
    console.error("Error saving card to DynamoDB:", error);

    if (config.sqs.errorQueueUrl) {
      try {
        await sqsClient.send(
          new SendMessageCommand({
            QueueUrl: config.sqs.errorQueueUrl,
            MessageBody: JSON.stringify({
              error: String(error),
              card: card,
              timestamp: new Date().toISOString(),
            }),
          })
        );
        console.log("Error sent to the error queue");
      } catch (sqsError) {
        console.error("Error sending to the error queue:", sqsError);
      }
    }

    throw error;
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

const sendCardCreationNotification = async (
  email: string,
  date: string,
  type: "DEBIT" | "CREDIT",
  amount: number
): Promise<void> => {
  try {
    const messageBody = {
      type: "CARD.CREATE",
      data: {
        email,
        date,
        type,
        amount,
      },
    };

    const sendMessageParams = {
      QueueUrl: NOTIFICATION_EMAIL_QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
    };

    await sqsClient.send(new SendMessageCommand(sendMessageParams));
    console.log("Card creation notification sent to SQS successfully");
  } catch (error) {
    console.error("Error sending card creation notification to SQS:", error);
  }
};

// Función para procesar cada registro de SQS
const processRecord = async (record: SQSRecord): Promise<void> => {
  try {
    const cardInput: CardRequest = JSON.parse(record.body);

    if (!cardInput.userId) {
      throw new Error("The userId is required to create the cards");
    }

    console.log(`Processing request for user: ${cardInput.userId}`);

    // Obtener el email del usuario una vez
    const userEmail = await getUserEmail(cardInput.userId);
    if (!userEmail) {
      console.warn(
        `Could not find email for user ${cardInput.userId}, skipping notifications`
      );
    }

    const cardDebit: CardRequest = {
      uuid: uuidv4(),
      userId: cardInput.userId,
      type: "DEBIT",
      status: "ACTIVATED",
      balance: 0,
      createdAt: new Date().toISOString(),
    };

    console.log(`Creating debit card: ${cardDebit.uuid}`);
    console.log(`Details: ${JSON.stringify(cardDebit, null, 2)}`);
    await saveCardToDynamoDB(cardDebit);
    console.log(`Debit card saved successfully`);

    // Enviar notificación para tarjeta débito
    if (userEmail) {
      try {
        await sendCardCreationNotification(
          userEmail,
          cardDebit.createdAt,
          cardDebit.type,
          cardDebit.balance
        );
      } catch (error) {
        console.error("Error sending debit card notification:", error);
        // No fallar el proceso por error de notificación
      }
    }

    const amount = CardDefaults.CREDIT.calculateAmount();

    const cardCredit: CardRequest = {
      uuid: uuidv4(),
      userId: cardInput.userId,
      type: "CREDIT",
      status: "PENDING",
      balance: amount,
      createdAt: new Date().toISOString(),
    };

    console.log(`Creating credit card: ${cardCredit.uuid}`);
    console.log(`Details: ${JSON.stringify(cardCredit, null, 2)}`);
    await saveCardToDynamoDB(cardCredit);
    console.log(`Credit card saved successfully`);

    // Enviar notificación para tarjeta crédito
    if (userEmail) {
      try {
        await sendCardCreationNotification(
          userEmail,
          cardCredit.createdAt,
          cardCredit.type,
          cardCredit.balance
        );
      } catch (error) {
        console.error("Error sending credit card notification:", error);
        // No fallar el proceso por error de notificación
      }
    }
  } catch (error) {
    console.error("Error processing record:", error);
    throw error;
  }
};

// Función handler principal
export const handler = async (event: SQSEvent): Promise<any> => {
  console.log("Evento recibido:", JSON.stringify(event, null, 2));

  try {
    // Procesar todos los registros en paralelo
    const processPromises = event.Records.map((record) =>
      processRecord(record)
    );
    await Promise.all(processPromises);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Processing successful" }),
    };
  } catch (error) {
    console.error("Error processing events:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error processing events",
        error: String(error),
      }),
    };
  }
};
