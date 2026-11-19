import os
import urllib.request

ILLUSTRATIVE = [
    ("hero-network-rack.jpg",
     "https://images.unsplash.com/photo-1695668548342-c0c1ad479aee?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"),
    ("fiber-patch-panel.jpg",
     "https://images.pexels.com/photos/2420212/pexels-photo-2420212.jpeg?auto=compress&cs=tinysrgb&w=1200"),
    ("structured-cabling.jpg",
     "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"),
    ("switch-ports.jpg",
     "https://images.unsplash.com/flagged/photo-1579274216947-86eaa4b00475?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"),
    ("sdr-spectrum-lab.jpg",
     "https://images.unsplash.com/photo-1581092160607-ee22621dd758?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"),
    ("news-cisco-packet-tracer.jpg",
     "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"),
    ("news-rural-telecom.jpg",
     "https://images.unsplash.com/photo-1516110833967-0b5716ca1387?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"),
    ("news-scientific-conference.jpg",
     "https://images.unsplash.com/photo-1511578314322-379afb476865?crop=entropy&cs=srgb&fm=jpg&w=1200&q=80"),
]

media_dir = os.environ.get("MEDIA_DIR", "/opt/tnl/media")
target_dir = os.path.join(media_dir, "illustrative")
os.makedirs(target_dir, exist_ok=True)

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

for filename, url in ILLUSTRATIVE:
    path = os.path.join(target_dir, filename)
    print(f"Downloading {filename}...")
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp, open(path, "wb") as f:
            f.write(resp.read())
        print(f"  OK -> {path} ({os.path.getsize(path)} bytes)")
    except Exception as e:
        print(f"  ERR -> {e}")

print("Done downloading illustrative media.")
