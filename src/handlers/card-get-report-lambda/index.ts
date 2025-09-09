import fs from "fs";
import { QueryCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { config } from "./config";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { unparse } from "papaparse";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {  Card } from "./types";
import { User } from "../process-purchase-lambda/types";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({});
const sqsClient = new SQSClient({});

const CARD_TABLE_NAME = config.dynamoDB.cardTableName;
const TRANSACTION_TABLE_NAME = config.dynamoDB.transactionTableName;
const USER_TABLE_NAME = config.dynamoDB.userTableName;
const NOTIFICATION_EMAIL_QUEUE_URL = config.sqs.notificationEmailQueueUrl;
const bucketName = config.s3.bucketName;

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

const sendReportNotification = async (
  email: string,
  date: string,
  url: string
): Promise<void> => {
  try {
    const messageBody = {
      type: "REPORT.ACTIVITY",
      data: {
        email,
        date,
        url,
      },
    };

    const sendMessageParams = {
      QueueUrl: NOTIFICATION_EMAIL_QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
    };

    await sqsClient.send(new SendMessageCommand(sendMessageParams));
    console.log("Report notification sent to SQS successfully");
  } catch (error) {
    console.error("Error sending report notification to SQS:", error);
  }
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const cardId = event.pathParameters?.card_id;

    if (!cardId) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({
          message: "Card ID is required",
        }),
      };
    }

    // Obtener información de la tarjeta para conseguir el userId
    const cardQueryParams = {
      TableName: CARD_TABLE_NAME,
      KeyConditionExpression: "#uuid = :cardId",
      ExpressionAttributeNames: {
        "#uuid": "uuid",
      },
      ExpressionAttributeValues: {
        ":cardId": cardId,
      },
      Limit: 1,
    };

    const cardQueryResponse = await docClient.send(
      new QueryCommand(cardQueryParams)
    );

    if (!cardQueryResponse.Items || cardQueryResponse.Items.length === 0) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({
          message: "Card not found",
        }),
      };
    }

    const card = cardQueryResponse.Items[0] as Card;

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

    const transactions = transactionQueryResponse.Items;

    if (!transactions) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({
          message: "Transactions were not found",
        }),
      };
    }

    const csv = unparse(transactions, {
      header: true,
      delimiter: ";",
    });
    console.log("🚀 ~ handler ~ csv:", csv);

    const key = "report.csv";
    const filePath = `/tmp/${key}`;
    fs.writeFileSync(filePath, csv, "utf-8");

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: csv,
    });

    await s3Client.send(command);

    // Construir la URL del archivo en S3
    const s3Url = `https://s3.amazonaws.com/${bucketName}/${key}`;

    // Obtener el email del usuario y enviar notificación
    try {
      const userEmail = await getUserEmail(card.userId);
      if (userEmail) {
        await sendReportNotification(
          userEmail,
          new Date().toISOString(),
          s3Url
        );
      } else {
        console.warn(`Could not find email for user ${card.userId}`);
      }
    } catch (error) {
      console.error("Error sending report notification:", error);
      // No fallar la operación por error de notificación
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
      body: JSON.stringify(transactions),
    };
  } catch (error) {
    console.error("Error at get report");

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
      body: JSON.stringify({
        message: "Internal server error",
        error: String(error),
      }),
    };
  }
};
