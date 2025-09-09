import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {  CardActivation } from "./types";
import { config } from "./config";
import { Card, User } from "../process-purchase-lambda/types";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sqsClient = new SQSClient({});

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

const sendCardActivationNotification = async (
  email: string,
  date: string,
  type: "DEBIT" | "CREDIT",
  amount: number
): Promise<void> => {
  try {
    const messageBody = {
      type: "CARD.ACTIVATE",
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
    console.log("Card activation notification sent to SQS successfully");
  } catch (error) {
    console.error("Error sending card activation notification to SQS:", error);
  }
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    console.log("Event received:", JSON.stringify(event, null, 2));

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

    const requestBody = JSON.parse(event.body) as CardActivation;
    const { uuid } = requestBody;

    if (!uuid) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({ message: "UUID is required" }),
      };
    }

    const queryParams = {
      TableName: CARD_TABLE_NAME,
      KeyConditionExpression: "#pk = :uuid",
      ExpressionAttributeNames: {
        "#pk": "uuid",
      },
      ExpressionAttributeValues: {
        ":uuid": uuid,
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

    const updateParams = {
      TableName: CARD_TABLE_NAME,
      Key: {
        uuid: uuid,
        createdAt: card.createdAt,
      },
      UpdateExpression: "SET #status = :newStatus",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":newStatus": "ACTIVE",
      },
      ReturnValues: "ALL_NEW" as const,
    };

    const updateResult = await docClient.send(new UpdateCommand(updateParams));

    try {
      const userEmail = await getUserEmail(card.userId);
      if (userEmail) {
        await sendCardActivationNotification(
          userEmail,
          new Date().toISOString(),
          card.type,
          card.balance
        );
      } else {
        console.warn(`Could not find email for user ${card.userId}`);
      }
    } catch (error) {
      console.error("Error sending activation notification:", error);

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
        message: "Card activated successfully",
      }),
    };
  } catch (error) {
    console.error("Error activating card:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
      body: JSON.stringify({
        message: "Error activating card",
        error: String(error),
      }),
    };
  }
};
