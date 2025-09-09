import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { Card, PurchaseRequest, Transaction } from "./types";
import { config } from "./config";
import { v4 as uuidv4 } from "uuid";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CARD_TABLE_NAME = config.dynamoDB.cardTableName;
const TRANSACTION_TABLE_NAME = config.dynamoDB.transactionTableName;

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

    const requestBody = JSON.parse(event.body) as PurchaseRequest;
    const { uuid, amount, description, merchantName } = requestBody;

    if (!uuid || !amount || amount <= 0) {
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

 
    const getCardParams = {
      TableName: CARD_TABLE_NAME,
      Key: {
        uuid: uuid,
      },
    };

    const cardResponse = await docClient.send(new GetCommand(getCardParams));
    const card = cardResponse.Item as Card;

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
     
      const creditLimit = card.amount || 0;
     
      if (card.balance + amount <= creditLimit) {
        approved = true;
        newBalance = card.balance + amount;
      } else {
        
        approved = false;
      }
    }

  
    const transaction: Transaction = {
      id: uuidv4(),
      card_id: uuid,
      amount: amount,
      description: description || "Compra",
      merchantName: merchantName || "Comercio",
      timestamp: new Date().toISOString(),
      status: approved ? "APPROVED" : "REJECTED",
      type: "PURCHASE",
    };

  
    const putTransactionParams = {
      TableName: TRANSACTION_TABLE_NAME,
      Item: transaction,
    };

    await docClient.send(new PutCommand(putTransactionParams));

   
    if (approved) {
      const updateCardParams = {
        TableName: CARD_TABLE_NAME,
        Key: {
          uuid: uuid,
        },
        UpdateExpression: "set balance = :balance",
        ExpressionAttributeValues: {
          ":balance": newBalance,
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
    console.error("Error processing purchase:", error);
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
