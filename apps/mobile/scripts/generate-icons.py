"""Genera los íconos y splash nativos (Android/iOS) desde assets/icon-only.png.

Uso (necesita Pillow):  python3 apps/mobile/scripts/generate-icons.py
Vuelve a correrlo si cambia el logo. Fondo blanco, símbolo centrado.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = Image.open(ROOT / 'assets' / 'icon-only.png').convert('RGB')
# El símbolo ocupa el centro del PNG fuente; lo recortamos al cuadro útil.
BOX = SRC.convert('L').point(lambda v: 255 if v < 235 else 0).getbbox()
SYMBOL = SRC.crop(BOX)
WHITE = (255, 255, 255)
RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
IOS = ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets'


def canvas(w, h, frac, mode='RGB'):
    img = Image.new(mode, (w, h), WHITE if mode == 'RGB' else (255, 255, 255, 0))
    side = int(min(w, h) * frac)
    scale = side / max(SYMBOL.size)
    sym = SYMBOL.resize((int(SYMBOL.width * scale), int(SYMBOL.height * scale)), Image.LANCZOS)
    img.paste(sym, ((w - sym.width) // 2, (h - sym.height) // 2))
    return img


DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, d in DENSITIES.items():
    folder = RES / f'mipmap-{name}'
    legacy = int(48 * d)
    canvas(legacy, legacy, 0.80).save(folder / 'ic_launcher.png', optimize=True)
    rnd = canvas(legacy, legacy, 0.66)
    mask = Image.new('L', rnd.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, legacy - 1, legacy - 1), fill=255)
    out = Image.new('RGBA', rnd.size, (0, 0, 0, 0))
    out.paste(rnd, (0, 0), mask)
    out.save(folder / 'ic_launcher_round.png', optimize=True)
    # Adaptativo: lienzo de 108dp, zona segura central de 66dp (~61%).
    fg = int(108 * d)
    canvas(fg, fg, 0.56).save(folder / 'ic_launcher_foreground.png', optimize=True)

for path in RES.glob('drawable*/splash.png'):
    w, h = Image.open(path).size
    canvas(w, h, 0.30).save(path, optimize=True)

canvas(1024, 1024, 0.78).save(IOS / 'AppIcon.appiconset' / 'AppIcon-512@2x.png', optimize=True)
for path in (IOS / 'Splash.imageset').glob('*.png'):
    canvas(2732, 2732, 0.18).save(path, optimize=True)
print('Íconos y splash generados.')
