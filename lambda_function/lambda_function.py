import io
import json
import logging
import os
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from PIL import Image, UnidentifiedImageError

LOG = logging.getLogger()
LOG.setLevel(logging.INFO)

MAX_LADO = int(os.environ.get("LOMAX_MAX_LADO", "300"))
MAX_BYTES = int(os.environ.get("LOMAX_MAX_BYTES", str(5 * 1024 * 1024)))
FORMATOS_PERMITIDOS = {"JPEG", "PNG"}
ES_JPEG = "JPEG"

BUCKET_ORIGEN = os.environ.get("LOMAX_BUCKET_ORIGENALES", "lomax-originales")
BUCKET_MINIATURAS = os.environ.get("LOMAX_BUCKET_MINIATURAS", "lomax-miniaturas")
TABLA_ATRIBUTOS = os.environ.get("LOMAX_TABLA_ATRIBUTOS", "productos_atributos")

ENDPOINT = os.environ.get("AWS_ENDPOINT_URL")

CONFIG = Config(
    s3={"addressing_style": "path"},
    retries={"max_attempts": 3, "mode": "standard"},
)

s3 = boto3.client("s3", endpoint_url=ENDPOINT, config=CONFIG)
ddb = boto3.client("dynamodb", endpoint_url=ENDPOINT, config=CONFIG)


def _s(valor):
    return {"S": str(valor)}


def _n(valor):
    return {"N": str(valor)}


def _ahora():
    return datetime.now(timezone.utc).isoformat()


def _respuesta(codigo, ok, estado, producto_id, original, miniatura_key, detalle, dimensiones=None):
    cuerpo = {
        "statusCode": codigo,
        "ok": ok,
        "producto_id": producto_id,
        "estado_procesamiento": estado,
        "origen": original,
        "miniatura_key": miniatura_key,
        "bucket_miniaturas": BUCKET_MINIATURAS,
        "detalle": detalle,
        "procesado_en": _ahora(),
    }
    if dimensiones is not None:
        cuerpo["dimensiones"] = dimensiones
    return cuerpo


def _marcar_error(ddb, producto_id, original, miniatura_key, motivo):
    motivo = str(motivo)[:500]
    LOG.error("producto_id=%s ERROR: %s", producto_id, motivo)
    ddb.update_item(
        TableName=TABLA_ATRIBUTOS,
        Key={"producto_id": _n(producto_id)},
        UpdateExpression=(
            "SET estado_procesamiento = :estado, error_motivo = :motivo, "
            "imagen_original_key = :original, actualizado_en = :ahora "
            "REMOVE miniatura_key"
        ),
        ExpressionAttributeValues={
            ":estado": _s("ERROR"),
            ":motivo": _s(motivo),
            ":original": _s(original["clave"]),
            ":ahora": _s(_ahora()),
        },
    )
    return _respuesta(
        422, False, "ERROR", producto_id, original, miniatura_key,
        "No se genero miniatura: " + motivo,
    )


def lambda_handler(event, context):
    request_id = getattr(context, "aws_request_id", "local")
    LOG.info("request_id=%s evento=%s", request_id, json.dumps(event, default=str))

    producto_id = event.get("producto_id")
    bucket = event.get("bucket") or BUCKET_ORIGEN
    clave = event.get("clave")
    original = {"bucket": bucket, "clave": clave}

    if producto_id is None or not clave:
        LOG.error("Evento incompleto: %s", json.dumps(event, default=str))
        return _respuesta(
            400, False, "ERROR", producto_id, original, None,
            "El evento requiere producto_id y clave",
        )

    miniatura_key = "miniaturas/%s.jpg" % producto_id

    try:
        objeto = s3.get_object(Bucket=bucket, Key=clave)
    except ClientError as error:
        codigo = error.response.get("Error", {}).get("Code", "")
        if codigo in ("NoSuchKey", "404", "NotFound"):
            return _marcar_error(
                ddb, producto_id, original, miniatura_key,
                "El original %s no existe en el bucket %s" % (clave, bucket),
            )
        raise

    cuerpo = objeto["Body"].read()
    largo_bytes = len(cuerpo)
    content_type = objeto.get("ContentType", "")

    if largo_bytes == 0:
        return _marcar_error(ddb, producto_id, original, miniatura_key,
                             "El original esta vacio")
    if largo_bytes > MAX_BYTES:
        return _marcar_error(
            ddb, producto_id, original, miniatura_key,
            "El original pesa %d bytes y supera el maximo de %d" % (largo_bytes, MAX_BYTES),
        )

    try:
        with Image.open(io.BytesIO(cuerpo)) as prueba:
            formato = (prueba.format or "").upper()
            if formato not in FORMATOS_PERMITIDOS:
                raise UnidentifiedImageError(
                    "formato %r no permitido (solo JPEG o PNG)" % formato
                )
            prueba.verify()

        with Image.open(io.BytesIO(cuerpo)) as imagen:
            imagen.load()
            ancho_original, alto_original = imagen.size

            imagen.thumbnail((MAX_LADO, MAX_LADO), Image.Resampling.LANCZOS)

            if imagen.mode != ES_JPEG and imagen.mode != "L":
                imagen = imagen.convert("RGB")

            salida = io.BytesIO()
            imagen.save(salida, format=ES_JPEG, quality=85, optimize=True)
            ancho_miniatura, alto_miniatura = imagen.size
    except (UnidentifiedImageError, OSError, ValueError) as error:
        return _marcar_error(
            ddb, producto_id, original, miniatura_key,
            "El contenido no es una imagen valida: %s" % error,
        )

    bytes_miniatura = salida.getvalue()

    s3.put_object(
        Bucket=BUCKET_MINIATURAS,
        Key=miniatura_key,
        Body=bytes_miniatura,
        ContentType="image/jpeg",
        CacheControl="max-age=86400",
    )

    ddb.update_item(
        TableName=TABLA_ATRIBUTOS,
        Key={"producto_id": _n(producto_id)},
        UpdateExpression=(
            "SET estado_procesamiento = :estado, miniatura_key = :miniatura, "
            "imagen_original_key = :original, bucket_original = :bucket_original, "
            "bucket_miniatura = :bucket_miniatura, formato_original = :formato, "
            "original_ancho = :original_ancho, original_alto = :original_alto, "
            "miniatura_ancho = :miniatura_ancho, miniatura_alto = :miniatura_alto, "
            "miniatura_bytes = :miniatura_bytes, actualizado_en = :ahora "
            "REMOVE error_motivo"
        ),
        ExpressionAttributeValues={
            ":estado": _s("LISTA"),
            ":miniatura": _s(miniatura_key),
            ":original": _s(clave),
            ":bucket_original": _s(bucket),
            ":bucket_miniatura": _s(BUCKET_MINIATURAS),
            ":formato": _s(content_type or "desconocido"),
            ":original_ancho": _n(ancho_original),
            ":original_alto": _n(alto_original),
            ":miniatura_ancho": _n(ancho_miniatura),
            ":miniatura_alto": _n(alto_miniatura),
            ":miniatura_bytes": _n(len(bytes_miniatura)),
            ":ahora": _s(_ahora()),
        },
    )

    LOG.info(
        "producto_id=%s LISTA miniatura=%s %sx%s (bytes %d)",
        producto_id, miniatura_key, ancho_miniatura, alto_miniatura, len(bytes_miniatura),
    )

    return _respuesta(
        200, True, "LISTA", producto_id, original, miniatura_key,
        "Miniatura generada y registrada",
        {
            "original": {"ancho": ancho_original, "alto": alto_original, "bytes": largo_bytes},
            "miniatura": {"ancho": ancho_miniatura, "alto": alto_miniatura,
                          "bytes": len(bytes_miniatura)},
            "lado_maximo": MAX_LADO,
        },
    )
