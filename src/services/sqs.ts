import { ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

export const sqsService = () => {
  const sqsClient = new SQSClient({});

  consume: async (queueUrl: string) => {
    try {
      const result = await sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20,
        })
      );
      console.log(
        `Message received from SQS: ${JSON.stringify(result.Messages)}`
      );

      for (const message of result.Messages || []) {
        console.log(`Processing message: ${JSON.stringify(message)}`);
        return message;
      }
    } catch (error) {
      console.error("Error receiving message from SQS:", error);
    }
  };
};
