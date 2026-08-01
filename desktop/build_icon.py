from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


output_dir = Path(__file__).parent / "assets"
output_dir.mkdir(exist_ok=True)

size = 512
image = Image.new("RGBA", (size, size), (255, 248, 238, 255))
pixels = image.load()

for y in range(size):
    for x in range(size):
        ratio = (x + y) / (2 * (size - 1))
        pixels[x, y] = (
            round(235 + 12 * ratio),
            round(132 + 41 * ratio),
            round(99 + 23 * ratio),
            255,
        )

draw = ImageDraw.Draw(image)
draw.rounded_rectangle(
    (32, 32, 480, 480),
    radius=116,
    outline=(255, 235, 207, 220),
    width=10,
)
draw.ellipse((360, 64, 432, 136), fill=(255, 219, 142, 220))

font = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 252)
box = draw.textbbox((0, 0), "量", font=font)
text_x = (size - (box[2] - box[0])) / 2 - box[0]
text_y = (size - (box[3] - box[1])) / 2 - box[1] - 8
draw.text((text_x, text_y), "量", font=font, fill=(255, 255, 250, 255))

image.save(output_dir / "icon.png")
image.save(
    output_dir / "icon.ico",
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
