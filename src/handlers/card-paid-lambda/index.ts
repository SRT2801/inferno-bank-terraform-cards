import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { Card, CardPayment } from "./types";
import { config } from "./config";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CARD_TABLE_NAME = config.dynamoDB.cardTableName;

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

    const requestBody = JSON.parse(event.body) as CardPayment;
    const { uuid, amount } = requestBody;

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

    if (!amount || isNaN(Number(amount))) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({ message: "Valid amount is required" }),
      };
    }

    const getParams = {
      TableName: CARD_TABLE_NAME,
      Key: {
        uuid: uuid,
     
      },
    };

   
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

    const card = queryResult.Items[0];
    const currentBalance = Number(card?.balance || 0);
    const newBalance = currentBalance - Number(amount);

    if (newBalance < 0 && card?.type === "DEBIT") {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({ message: "Insufficient funds" }),
      };
    }


    const updateParams = {
      TableName: CARD_TABLE_NAME,
      Key: {
        uuid: uuid,
        createdAt: card?.createdAt,
      },
      UpdateExpression: "SET balance = :newBalance",
      ExpressionAttributeValues: {
        ":newBalance": newBalance,
      },
      ReturnValues: "ALL_NEW" as const,
    };

    const updateResult = await docClient.send(new UpdateCommand(updateParams));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
      body: JSON.stringify({
        message: "Card paid successfully",
        card: updateResult.Attributes,
      }),
    };
  } catch (error) {
    console.error("Error processing card payment:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
      body: JSON.stringify({
        message: "Error processing payment",
        error: String(error),
      }),
    };
  }
};
