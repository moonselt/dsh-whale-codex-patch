from PIL import Image
from pathlib import Path
root=Path(__file__).resolve().parent
source=Image.open(root/'gpt-dragon.png').convert('RGBA')
assert source.size==(768,768)
# Align the eyes (roughly x=390,y=480) with the original whale's eye placement.
# A modest 13% zoom enlarges the face while retaining transparent corners.
zoom=1.13
cx,cy=390,480
side=768/zoom
box=(round(cx-cx/zoom),round(cy-cy/zoom),round(cx-cx/zoom+side),round(cy-cy/zoom+side))
assert box[2]-box[0]==box[3]-box[1] and all(0<=v<=768 for v in box)
result=source.crop(box).resize((768,768),Image.Resampling.LANCZOS)
result.save(root/'gpt-dragon-face.png',optimize=True)
print('cropped',box,'to',result.size)
