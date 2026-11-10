# Saca de un proyecto .3mf de Orca/Anycubic un STL por cada objeto colocado
# (con sus transformaciones), para pasarlo por el estimador de la web.
#   extraer_piezas.py proyecto.3mf carpeta_salida
import os, re, struct, sys, zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"}
P = "{http://schemas.microsoft.com/3dmanufacturing/production/2015/06}"

def matriz(t):
    v = [float(x) for x in (t or "1 0 0 0 1 0 0 0 1 0 0 0").split()]
    return v

def aplicar(v, pts):
    return [(x * v[0] + y * v[3] + z * v[6] + v[9], x * v[1] + y * v[4] + z * v[7] + v[10], x * v[2] + y * v[5] + z * v[8] + v[11]) for x, y, z in pts]

def main(src, dst):
    z = zipfile.ZipFile(src)
    cache = {}
    def objetos(path):
        if path not in cache:
            root = ET.fromstring(z.read(path.lstrip("/")))
            d = {}
            for o in root.iterfind(".//m:object", NS):
                mesh = o.find("m:mesh", NS)
                if mesh is not None:
                    vs = [(float(v.get("x")), float(v.get("y")), float(v.get("z"))) for v in mesh.iterfind("m:vertices/m:vertex", NS)]
                    ts = [(int(t.get("v1")), int(t.get("v2")), int(t.get("v3"))) for t in mesh.iterfind("m:triangles/m:triangle", NS)]
                    d[o.get("id")] = ("mesh", vs, ts)
                else:
                    d[o.get("id")] = ("comp", [(c.get(P + "path") or path, c.get("objectid"), matriz(c.get("transform"))) for c in o.iterfind("m:components/m:component", NS)])
            cache[path] = d
        return cache[path]
    # partes que no son pieza (modificadores, volúmenes negativos): se saltan
    ms = z.read("Metadata/model_settings.config").decode("utf8", "replace") if "Metadata/model_settings.config" in z.namelist() else ""
    subt = {}
    for oid, cuerpo in re.findall(r'<object id="(\d+)">(.*?)</object>', ms, re.S):
        subt[oid] = re.findall(r'<part id="\d+" subtype="(\w+)"', cuerpo)
    main_path = "/3D/3dmodel.model"
    root = ET.fromstring(z.read(main_path.lstrip("/")))
    os.makedirs(dst, exist_ok=True)
    k = 0
    for it in root.iterfind("m:build/m:item", NS):
        if it.get("printable") == "0":
            continue
        oid = it.get("objectid")
        tris = []
        def recoger(path, oid, pila, top):
            o = objetos(path).get(oid)
            if o is None: return
            if o[0] == "mesh":
                pts = o[1]
                for m in pila: pts = aplicar(m, pts)
                tris.extend((pts[a], pts[b], pts[c]) for a, b, c in o[2])
            else:
                for n, (p, cid, m) in enumerate(o[1]):
                    if top and n < len(subt.get(oid, [])) and subt[oid][n] != "normal_part":
                        continue
                    recoger(p, cid, [m] + pila, False)
        recoger(main_path, oid, [matriz(it.get("transform"))], True)
        if not tris: continue
        k += 1
        with open(os.path.join(dst, "%03d.stl" % k), "wb") as f:
            f.write(b"\0" * 80 + struct.pack("<I", len(tris)))
            for a, b, c in tris:
                f.write(struct.pack("<12fH", 0, 0, 0, *a, *b, *c, 0))
    print(os.path.basename(src), "->", k, "piezas")

main(sys.argv[1], sys.argv[2])
