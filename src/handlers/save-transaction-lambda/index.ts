import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { Transaction, Card } from './types';
import { config } from './config';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TRANSACTION_TABLE_NAME = config.dynamoDB.transactionTableName;
const CARD_TABLE_NAME = config.dynamoDB.cardTableName;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const cardId = event.pathParameters?.card_id;
    const requestBody = JSON.parse(event.body!);
    const { merchant, amount } = requestBody;

    if (!cardId || !amount || !merchant) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        },
        body: JSON.stringify({
          message: 'CardId, Amount an Merchant are mandatory',
        }),
      };
    }

    const queryParams = {
      TableName: CARD_TABLE_NAME,
      KeyConditionExpression: '#pk = :cardId',
      ExpressionAttributeNames: {
        '#pk': 'uuid',
      },
      ExpressionAttributeValues: {
        ':cardId': cardId,
      },
      Limit: 1,
    };

    const queryResult = await docClient.send(new QueryCommand(queryParams));

    if (!queryResult.Items || queryResult.Items.length === 0) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        },
        body: JSON.stringify({ message: 'Card not found' }),
      };
    }

    const card = queryResult.Items[0] as Card;
    const numAmount = Number(amount);
    const cardType = card.type;

    if (cardType === 'DEBIT') {
      const newBalance = card.balance + numAmount;
      await updateCardBalance(card, newBalance);
    } else if (cardType === 'CREDIT') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        },
        body: JSON.stringify({
          message: 'Credit cards are now allowed to be saving',
        }),
      };
    }

    const transaction: Transaction = {
      uuid: uuidv4(),
      merchant,
      cardId,
      amount: numAmount,
      type: 'SAVING',
      createdAt: new Date().toISOString(),
    };

    const putParams = {
      TableName: TRANSACTION_TABLE_NAME,
      Item: transaction,
    };

    await docClient.send(new PutCommand(putParams));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      },
      body: JSON.stringify({
        message: 'Saving with success!',
        transaction,
        newBalance: amount,
      }),
    };
  } catch (error) {
    console.error('Error saving transaction:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      },
      body: JSON.stringify({
        message: 'Error saving transaction',
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
    UpdateExpression: 'SET balance = :newBalance',
    ExpressionAttributeValues: {
      ':newBalance': newBalance,
    },
  };

  await docClient.send(new UpdateCommand(updateParams));
}
