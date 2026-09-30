import struct
import sys
import zlib

ANCHO = 1200
ALTO = 800


def crear_png(ancho, alto, ruta):
    filas = bytearray()
    radio = (min(ancho, alto) * 0.22) ** 2
    for y in range(alto):
        filas.append(0)
        for x in range(ancho):
            dx = x - ancho * 0.25
            dy = y - alto * 0.5
            if dx * dx + dy * dy < radio:
                filas += bytes((255, 214, 0))
            elif x < ancho // 12:
                filas += bytes((255, 255, 255))
            else:
                filas += bytes((30 + x * 180 // ancho, 90, 200 - y * 120 // alto))

    def chunk(tipo, datos):
        crc = zlib.crc32(tipo + datos) & 0xFFFFFFFF
        return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", crc)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(filas), 9))
    png += chunk(b"IEND", b"")
    with open(ruta, "wb") as archivo:
        archivo.write(png)
    print("PNG creado: %s  %dx%d  %d bytes" % (ruta, ancho, alto, len(png)))


if __name__ == "__main__":
    ruta = sys.argv[1] if len(sys.argv) > 1 else "scripts/pruebas/original-1200x800.png"
    crear_png(ANCHO, ALTO, ruta)
