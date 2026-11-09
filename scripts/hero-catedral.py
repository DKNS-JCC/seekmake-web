"""Revela la foto de la catedral para el hero de la portada.

    python scripts/hero-catedral.py <original.webp>

Saca hero-catedral-*.{avif,webp} y hero-catedral.jpg en public/images/, en 3:2
como el banner anterior: el original (1024x765) se ensancha estirando el fondo.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "public" / "images"
rng = np.random.default_rng(7)


def arr(im):
    return np.asarray(im, dtype=np.float32)


def img(a):
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8))


def luma(a):
    return a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)


def blur(a, r):
    return arr(img(a).filter(ImageFilter.GaussianBlur(r)))


def gargolas(a):
    """Las gárgolas de los arbotantes salen quemadas: manchas blancas sin
    detalle. Bajamos sus luces al tono de la piedra iluminada, sin borrarlas."""
    h, w, _ = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    m = np.zeros((h, w), np.float32)
    for cx, cy in [(419, 480), (475, 486), (530, 493), (587, 499), (644, 507), (707, 514)]:
        m = np.maximum(m, np.clip(1.6 - np.hypot((xx - cx) / 11, (yy - cy) / 8), 0, 1))
    m *= np.clip((luma(a) - 150) / 40, 0, 1)
    # Algo más en rojo que en azul: si no, al lado de la resina azulada quedan amarillentas.
    return a * (1 - np.array([0.34, 0.3, 0.24], np.float32) * m[..., None])


def revelado(a):
    # Suave a propósito: menos contraste, más luz y un punto de desenfoque, para
    # que la catedral acompañe al texto en vez de competir con él.
    media = a.mean(axis=(0, 1))
    a = media + (a - media) * 0.72
    a = 255 - (255 - a) * 0.88
    gris = luma(a)[..., None]
    a = gris + (a - gris) * 0.85
    a = a * 0.6 + blur(a, 0.8) * 0.4
    return np.clip(a, 0, 255)


def ampliar(a, izq, der, arr_, aba):
    """Amplía el lienzo estirando el fondo (un degradado liso) y suavizándolo,
    con grano parecido al original para que no se vea la costura."""
    h, w, _ = a.shape
    p = np.pad(a, ((arr_, aba), (izq, der), (0, 0)), mode="edge")
    liso = blur(p, 40)
    H, W, _ = p.shape
    yy, xx = np.mgrid[0:H, 0:W]
    # Distancia (px) de cada punto al rectángulo original: 0 dentro.
    dy = np.maximum(arr_ - yy, yy - (arr_ + h - 1)).clip(0)
    dx = np.maximum(izq - xx, xx - (izq + w - 1)).clip(0)
    d = np.hypot(dx, dy)
    m = np.clip(d / 60, 0, 1)[..., None]
    out = p * (1 - m) + liso * m
    # Un punto más oscuro hacia arriba: el cielo de estudio cae como en el original.
    out *= 1 - 0.05 * np.clip((arr_ - yy) / max(arr_, 1), 0, 1)[..., None]
    grano = rng.normal(0, 1.6, (H, W, 1)).astype(np.float32)
    out += grano * (d > 0)[..., None]
    return out


def guardar(a, nombre, anchos):
    base = img(a)
    for ancho in anchos:
        im = base if ancho == base.width else base.resize(
            (ancho, round(base.height * ancho / base.width)), Image.LANCZOS)
        im.save(OUT / f"{nombre}-{ancho}.avif", quality=62, speed=4)
        im.save(OUT / f"{nombre}-{ancho}.webp", quality=82, method=6)
        print(nombre, ancho, im.size)
    return base


def main(src):
    a = revelado(gargolas(arr(Image.open(src).convert("RGB"))))
    a = ampliar(a, izq=62, der=62, arr_=0, aba=0)  # 1148x765 = 3:2
    # JPEG solo como último recurso del <img>, para navegadores sin AVIF ni WebP.
    guardar(a, "hero-catedral", [768, 1148]).save(
        OUT / "hero-catedral.jpg", quality=84, optimize=True, progressive=True)


if __name__ == "__main__":
    main(sys.argv[1])
