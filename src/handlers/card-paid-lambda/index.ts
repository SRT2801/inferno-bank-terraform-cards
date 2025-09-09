import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
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


    const cardId = event.pathParameters?.card_id;

    const requestBody = JSON.parse(event.body) as CardPayment;
    const { amount, merchant } = requestBody;

    if (!cardId) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({ message: "Card ID is required" }),
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

    if (!merchant) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({ message: "Merchant is required" }),
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

 
    if (card?.type !== "CREDIT") {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({
          message: "Solo se pueden realizar pagos a tarjetas de crédito",
        }),
      };
    }

 
    const currentBalance = Number(card?.balance || 0);
    const newBalance = currentBalance + Number(amount);


    if (card.limit && newBalance > card.limit) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({
          message: "El pago excede el límite de la tarjeta",
          currentBalance,
          paymentAmount: amount,
          maxAllowedPayment: card.limit - currentBalance,
        }),
      };
    }

    const updateParams = {
      TableName: CARD_TABLE_NAME,
      Key: {
        uuid: cardId,
        createdAt: card?.createdAt,
      },
      UpdateExpression: "SET balance = :newBalance",
      ExpressionAttributeValues: {
        ":newBalance": newBalance,
      },
      ReturnValues: "ALL_NEW" as const,
    };

    const updateResult = await docClient.send(new UpdateCommand(updateParams));

 
    const paymentTransaction = {
      uuid: uuidv4(),
      cardId: cardId,
      amount: Number(amount),
      description: `Pago a tarjeta de crédito via ${merchant}`,
      merchant: merchant,
      type: "CREDIT",
      transactionType: "PAYMENT",
      createdAt: new Date().toISOString(),
    };

    
    try {
      await docClient.send(
        new PutCommand({
          TableName: config.dynamoDB.transactionTableName,
          Item: paymentTransaction,
          ConditionExpression: "attribute_not_exists(uuid)",
        })
      );
    } catch (error) {
      console.error("Error al guardar la transacción de pago:", error);
      
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
        message: "Tarjeta de crédito pagada exitosamente",
        paymentAmount: amount,
        newBalance: newBalance,
        merchant: merchant,
        previousBalance: currentBalance,
        card: {
          ...updateResult.Attributes,
        },
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
