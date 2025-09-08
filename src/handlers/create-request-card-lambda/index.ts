import { SQSEvent, SQSRecord } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { v4 as uuidv4 } from "uuid";
import { CardRequest, CardRequestInput, CardDefaults } from "./types";
import { config } from "./config";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const sqsClient = new SQSClient({});



const saveCardToDynamoDB = async (card: CardRequest): Promise<void> => {
  try {
    const params = {
      TableName: config.dynamoDB.cardTableName,
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

// Función para procesar cada registro de SQS
const processRecord = async (record: SQSRecord): Promise<void> => {
  try {

    const cardInput: CardRequestInput = JSON.parse(record.body);

    if (!cardInput.user_id || !cardInput.type) {
      throw new Error(
        "Required fields are missing from the card request (user_id, type)"
      );
    }

    let amount: number | undefined;

    if (cardInput.type === "DEBIT") {
      const cardRequest: CardRequest = {
        uuid: uuidv4(),
        user_id: cardInput.user_id,
        type: cardInput.type,
        status: cardInput.status || CardDefaults.DEBIT.status,
        balance:
          cardInput.balance !== undefined
            ? cardInput.balance
            : CardDefaults.DEBIT.balance,
        createdAt: cardInput.createdAt || new Date().toISOString(),
      };

      console.log(`Creating new DEBIT card: ${cardRequest.uuid}`);
      console.log(
        `Card details: ${JSON.stringify(cardRequest, null, 2)}`
      );

  
      await saveCardToDynamoDB(cardRequest);
    } else {
      // Para tarjetas de crédito
      const score = cardInput.score || CardDefaults.CREDIT.getRandomScore();
      amount = CardDefaults.CREDIT.calculateAmount(score);

      const cardRequest: CardRequest = {
        uuid: uuidv4(),
        user_id: cardInput.user_id,
        type: cardInput.type,
        status: cardInput.status || CardDefaults.CREDIT.status,
        balance:
          cardInput.balance !== undefined
            ? cardInput.balance
            : CardDefaults.CREDIT.balance,
        createdAt: cardInput.createdAt || new Date().toISOString(),
        amount: amount,
      };

      console.log(
        `Creating new CREDIT card: ${cardRequest.uuid}`
      );
      console.log(
        `Card details: ${JSON.stringify(cardRequest, null, 2)}`
      );

      await saveCardToDynamoDB(cardRequest);
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
