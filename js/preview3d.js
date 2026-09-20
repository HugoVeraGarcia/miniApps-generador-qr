/* preview3d.js — Visor 3D con three.js, cargado solo cuando el usuario abre
 * el paso de objeto 3D. Si el navegador no trae WebGL, el módulo lo avisa y
 * la descarga del 3MF sigue funcionando igual.
 */

let THREE = null;

async function cargarThree() {
  if (!THREE) THREE = await import('./vendor/three.min.js');
  return THREE;
}

export function hayWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext
      && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

function geometriaDesdeMalla(T, malla) {
  const pos = new Float32Array(malla.tri.length * 9);
  let i = 0;
  for (const t of malla.tri) {
    for (const v of t) { pos[i++] = v[0]; pos[i++] = v[1]; pos[i++] = v[2]; }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export class Visor3D {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.listo = false;
    this._raf = null;
  }

  async iniciar() {
    if (this.listo) return true;
    if (!hayWebGL()) return false;
    const T = await cargarThree();

    const ancho = this.contenedor.clientWidth || 480;
    const alto = this.contenedor.clientHeight || 360;

    this.escena = new T.Scene();
    this.escena.background = new T.Color('#F1F5F9');

    this.camara = new T.PerspectiveCamera(38, ancho / alto, 0.1, 2000);
    this.renderizador = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderizador.setSize(ancho, alto);
    this.contenedor.replaceChildren(this.renderizador.domElement);

    this.escena.add(new T.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const dir = new T.DirectionalLight(0xffffff, 1.5);
    dir.position.set(60, -80, 140);
    this.escena.add(dir);
    const relleno = new T.DirectionalLight(0xffffff, 0.6);
    relleno.position.set(-80, 60, 60);
    this.escena.add(relleno);

    this.grupo = new T.Group();
    this.escena.add(this.grupo);

    this.controles = new T.OrbitControls(this.camara, this.renderizador.domElement);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.08;
    this.controles.enablePan = false;

    this._onResize = () => this.redimensionar();
    window.addEventListener('resize', this._onResize);

    const bucle = () => {
      this._raf = requestAnimationFrame(bucle);
      this.controles.update();
      this.renderizador.render(this.escena, this.camara);
    };
    bucle();

    this.listo = true;
    return true;
  }

  /** Sustituye la pieza mostrada. geo = salida de generarGeometria(). */
  async mostrar(geo, colorBase, colorCodigo) {
    const ok = await this.iniciar();
    if (!ok) return false;
    const T = THREE;

    for (const hijo of [...this.grupo.children]) {
      hijo.geometry.dispose();
      hijo.material.dispose();
      this.grupo.remove(hijo);
    }

    const partes = [
      [geo.base, colorBase, 0.85],
      [geo.codigo, colorCodigo, 0.6],
    ];
    for (const [malla, color, rugosidad] of partes) {
      if (!malla.numTriangulos) continue;
      const material = new T.MeshStandardMaterial({
        color: new T.Color(color), roughness: rugosidad, metalness: 0.02,
      });
      this.grupo.add(new T.Mesh(geometriaDesdeMalla(T, malla), material));
    }

    // Centra la pieza y encuadra la camara.
    const caja = new T.Box3().setFromObject(this.grupo);
    const centro = caja.getCenter(new T.Vector3());
    const tam = caja.getSize(new T.Vector3());
    this.grupo.position.sub(centro);

    const radio = Math.max(tam.x, tam.y, tam.z);
    const distancia = radio / (2 * Math.tan((this.camara.fov * Math.PI) / 360)) * 1.9;
    this.camara.position.set(distancia * 0.35, -distancia * 0.85, distancia * 0.55);
    this.camara.lookAt(0, 0, 0);
    this.camara.up.set(0, 0, 1);
    this.controles.target.set(0, 0, 0);
    this.controles.minDistance = radio * 0.6;
    this.controles.maxDistance = radio * 6;
    this.controles.update();
    return true;
  }

  /** Vista cenital: es como se ve al escanear. */
  vistaSuperior() {
    if (!this.listo) return;
    const d = this.camara.position.length();
    this.camara.position.set(0, 0, d);
    this.camara.up.set(0, 1, 0);
    this.controles.target.set(0, 0, 0);
    this.controles.update();
  }

  redimensionar() {
    if (!this.listo) return;
    const ancho = this.contenedor.clientWidth || 480;
    const alto = this.contenedor.clientHeight || 360;
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
    this.renderizador.setSize(ancho, alto);
  }

  destruir() {
    if (!this.listo) return;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    for (const hijo of [...this.grupo.children]) {
      hijo.geometry.dispose();
      hijo.material.dispose();
    }
    this.renderizador.dispose();
    this.contenedor.replaceChildren();
    this.listo = false;
  }
}
