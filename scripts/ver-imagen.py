import struct
import sys


def dimensiones(ruta):
    with open(ruta, "rb") as archivo:
        datos = archivo.read()

    if datos[:8] == b"\x89PNG\r\n\x1a\n":
        ancho, alto = struct.unpack(">II", datos[16:24])
        return "PNG", ancho, alto

    if datos[:2] == b"\xff\xd8":
        i = 2
        while i < len(datos) - 9:
            if datos[i] != 0xFF:
                i += 1
                continue
            marcador = datos[i + 1]
            if marcador == 0xD8 or 0xD0 <= marcador <= 0xD7:
                i += 2
                continue
            if marcador == 0xD9:
                break
            longitud = struct.unpack(">H", datos[i + 2:i + 4])[0]
            if 0xC0 <= marcador <= 0xCF and marcador not in (0xC4, 0xC8, 0xCC):
                alto, ancho = struct.unpack(">HH", datos[i + 5:i + 9])
                return "JPEG", ancho, alto
            i += 2 + longitud
        return "JPEG", None, None

    return "NO ES UNA IMAGEN", None, None


for ruta in sys.argv[1:]:
    tipo, ancho, alto = dimensiones(ruta)
    if ancho is None:
        print("%-52s %s" % (ruta, tipo))
    else:
        print("%-52s %-5s %d x %d" % (ruta, tipo, ancho, alto))
