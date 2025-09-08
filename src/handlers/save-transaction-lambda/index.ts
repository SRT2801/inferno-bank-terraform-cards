import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { Transaction, Card } from "./types";
import { config } from "./config";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TRANSACTION_TABLE_NAME = config.dynamoDB.transactionTableName;
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

    const requestBody = JSON.parse(event.body);
    const { cardId, amount, description, type } = requestBody;

    if (!cardId || !amount || !type) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: JSON.stringify({
          message: "CardId, amount, and type are required",
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

    if (type === "DEBIT") {
      if (card.balance < numAmount) {
        return {
          statusCode: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          },
          body: JSON.stringify({
            message: "Insufficient funds",
            balance: card.balance,
            amount: numAmount,
          }),
        };
      }

      const newBalance = card.balance - numAmount;
      await updateCardBalance(card, newBalance);
    } else if (type === "CREDIT") {
      const currentUsed = card.limit ? card.limit - card.balance : 0;
      const newUsed = currentUsed + numAmount;

      if (card.limit && newUsed > card.limit) {
        return {
          statusCode: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          },
          body: JSON.stringify({
            message: "Credit limit exceeded",
            currentUsed,
            limit: card.limit,
            amountExceeded: newUsed - card.limit,
          }),
        };
      }

      const newBalance = card.balance - numAmount;
      await updateCardBalance(card, newBalance);
    }

    const transaction: Transaction = {
      uuid: uuidv4(),
      cardId,
      amount: numAmount,
      description: description || "",
      type,
      createdAt: new Date().toISOString(),
    };

    const putParams = {
      TableName: TRANSACTION_TABLE_NAME,
      Item: transaction,
    };

    await docClient.send(new PutCommand(putParams));

    
    await checkAndActivateCard(cardId);

    return {
      statusCode: 201,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      },
      body: JSON.stringify({
        message: "Transaction saved successfully",
        transaction,
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

/**
 * Verifica si una tarjeta ha alcanzado 10 transacciones y la activa si es necesario
 * @param cardId ID de la tarjeta
 */
async function checkAndActivateCard(cardId: string): Promise<void> {
  try {
    // 1. Consultar la tarjeta para obtener su estado actual
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

    // Si la tarjeta ya está activada, no hacemos nada
    if (card.status === "ACTIVATED") {
      return;
    }

    // 2. Contar las transacciones de esta tarjeta
    const transactionQueryParams = {
      TableName: TRANSACTION_TABLE_NAME,
      IndexName: "cardId-index", // Necesitaremos crear este índice en DynamoDB
      KeyConditionExpression: "cardId = :cardId",
      ExpressionAttributeValues: {
        ":cardId": cardId,
      },
    };

    // Como no tenemos el GSI, vamos a usar un enfoque alternativo para contar transacciones
    // Consultar todas las transacciones y filtrar por cardId en el lado del cliente
    const transactionScanParams = {
      TableName: TRANSACTION_TABLE_NAME,
      FilterExpression: "cardId = :cardId",
      ExpressionAttributeValues: {
        ":cardId": cardId,
      },
    };

    // Escanear la tabla (esto es menos eficiente que usar un GSI, pero funciona para nuestro caso)
    const scanResult = await docClient.send(
      new ScanCommand(transactionScanParams)
    );
    const transactionCount = scanResult.Items ? scanResult.Items.length : 0;

    // Si el número de transacciones es 10 o más, activamos la tarjeta
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
}
