from PIL import Image, ImageDraw, ImageFont

def create_icon(size, filename):
    # Dark blue background (var(--bg-primary))
    img = Image.new('RGB', (size, size), color='#0f172a')
    d = ImageDraw.Draw(img)
    
    # Try to load a font that supports emoji, or just draw a simple shape
    # Since drawing emoji in PIL is notoriously hard without specific fonts,
    # we'll draw a cool abstract "G" or a simple lighting bolt path.
    
    # Drawing a stylized lighting bolt
    # Scale points based on size
    w, h = size, size
    points = [
        (w*0.55, h*0.1),
        (w*0.25, h*0.55),
        (w*0.5, h*0.55),
        (w*0.45, h*0.9),
        (w*0.75, h*0.45),
        (w*0.5, h*0.45),
        (w*0.55, h*0.1)
    ]
    
    # Draw polygon
    d.polygon(points, fill='#6366f1') # Indigo accent
    
    img.save(filename)
    print(f"Created {filename}")

create_icon(192, "frontend/public/pwa-192x192.png")
create_icon(512, "frontend/public/pwa-512x512.png")
create_icon(180, "frontend/public/apple-touch-icon.png")
create_icon(64, "frontend/public/favicon.png")
