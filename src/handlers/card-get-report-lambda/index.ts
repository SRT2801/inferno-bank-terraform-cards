import fs from 'fs';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { config } from '../process-purchase-lambda/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { unparse } from 'papaparse';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const docClient = new DynamoDBClient({});
const s3Client = new S3Client({});
const bucketName = config.s3.bucketName;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const cardId = event.pathParameters?.card_id;

    const transactionQueryParams = {
      TableName: config.dynamoDB.transactionTableName,
      IndexName: 'cardIdIndex',
      KeyConditionExpression: 'cardId = :cardId',
      ExpressionAttributeValues: {
        ':cardId': cardId,
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
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        },
        body: JSON.stringify({
          message: 'Transactions were not found',
        }),
      };
    }

    const csv = unparse(transactions, {
      header: true,
      delimiter: ';',
    });
    console.log('🚀 ~ handler ~ csv:', csv);

    const key = 'report.csv';
    const filePath = `/tmp/${key}`;
    fs.writeFileSync(filePath, csv, 'utf-8');

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: csv,
    });

    await s3Client.send(command);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      },
      body: JSON.stringify(transactions),
    };
  } catch (error) {
    console.error('Error at get report');

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      },
      body: JSON.stringify({
        message: 'Internal server error',
        error: String(error),
      }),
    };
  }
};
