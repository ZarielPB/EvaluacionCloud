import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { config } from './config.js';
import { desdeErrorAws } from './errors.js';

// FLOCI no resuelve DNS con comodines: sin addressing_style path,
// el SDK intentaria bucket.lomax-floci:4566 y fallaria.
const comun = {
  region: config.aws.region,
  endpoint: config.aws.endpoint,
};

export const s3 = new S3Client({ ...comun, forcePathStyle: true });

const ddb = new DynamoDBClient(comun);
export const dynamo = DynamoDBDocumentClient.from(ddb, {
  marshallOptions: { removeUndefinedValues: true },
});

export const lambda = new LambdaClient(comun);

export async function invocarMiniatura(productoId, bucket, clave) {
  const payload = Buffer.from(
    JSON.stringify({ producto_id: Number(productoId), bucket, clave }),
  );

  let respuesta;
  try {
    respuesta = await lambda.send(
      new InvokeCommand({
        FunctionName: config.lambda.funcion,
        InvocationType: 'RequestResponse',
        Payload: payload,
      }),
    );
  } catch (error) {
    // Lambda inalcanzable o timeout de invocacion: es un fallo del servicio
    // dependiente, no un error del usuario. Se propaga como ApiError.
    throw desdeErrorAws(error, 'lambda');
  }

  let cuerpo = {};
  if (respuesta.Payload) {
    const texto = Buffer.from(respuesta.Payload).toString('utf8');
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      cuerpo = { detalle_crudo: texto };
    }
  }

  return {
    statusCode: respuesta.StatusCode ?? 0,
    functionError: respuesta.FunctionError ?? null,
    cuerpo,
  };
}

