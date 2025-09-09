import { SQSEvent, SQSRecord } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';
import { CardRequest, CardDefaults } from './types';
import { config } from './config';

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
    console.error('Error saving card to DynamoDB:', error);

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
        console.log('Error sent to the error queue');
      } catch (sqsError) {
        console.error('Error sending to the error queue:', sqsError);
      }
    }

    throw error;
  }
};

// Función para procesar cada registro de SQS
const processRecord = async (record: SQSRecord): Promise<void> => {
  try {
    const cardInput: CardRequest = JSON.parse(record.body);

    if (!cardInput.userId) {
      throw new Error('The userId is required to create the cards');
    }

    console.log(`Processing request for user: ${cardInput.userId}`);

    const cardDebit: CardRequest = {
      uuid: uuidv4(),
      userId: cardInput.userId,
      type: 'DEBIT',
      status: 'ACTIVATED',
      balance: 0,
      createdAt: new Date().toISOString(),
    };

    console.log(`Creating debit card: ${cardDebit.uuid}`);
    console.log(`Details: ${JSON.stringify(cardDebit, null, 2)}`);
    await saveCardToDynamoDB(cardDebit);
    console.log(`Debit card saved successfully`);

    const amount = CardDefaults.CREDIT.calculateAmount();

    const cardCredit: CardRequest = {
      uuid: uuidv4(),
      userId: cardInput.userId,
      type: 'CREDIT',
      status: 'PENDING',
      balance: amount,
      createdAt: new Date().toISOString(),
    };

    console.log(`Creating credit card: ${cardCredit.uuid}`);
    console.log(`Details: ${JSON.stringify(cardCredit, null, 2)}`);
    await saveCardToDynamoDB(cardCredit);
    console.log(`Credit card saved successfully`);
  } catch (error) {
    console.error('Error processing record:', error);
    throw error;
  }
};

// Función handler principal
export const handler = async (event: SQSEvent): Promise<any> => {
  console.log('Evento recibido:', JSON.stringify(event, null, 2));

  try {
    // Procesar todos los registros en paralelo
    const processPromises = event.Records.map((record) =>
      processRecord(record)
    );
    await Promise.all(processPromises);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Processing successful' }),
    };
  } catch (error) {
    console.error('Error processing events:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error processing events',
        error: String(error),
      }),
    };
  }
};
