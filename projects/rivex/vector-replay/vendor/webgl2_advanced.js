
var Rive = (() => {
  var _scriptName = typeof document != 'undefined' ? document.currentScript?.src : undefined;
  
  return (
function(moduleArg = {}) {
  var moduleRtn;

var l = moduleArg, aa, ba, ca = new Promise((a, b) => {
  aa = a;
  ba = b;
}), da = "object" == typeof window, ea = "function" == typeof importScripts;
function fa() {
  function a(g) {
    const k = d;
    c = b = 0;
    d = new Map();
    k.forEach(p => {
      try {
        p(g);
      } catch (m) {
        console.error(m);
      }
    });
    this.mb();
    e && e.Nb();
  }
  let b = 0, c = 0, d = new Map(), e = null, f = null;
  this.requestAnimationFrame = function(g) {
    b ||= requestAnimationFrame(a.bind(this));
    const k = ++c;
    d.set(k, g);
    return k;
  };
  this.cancelAnimationFrame = function(g) {
    d.delete(g);
    b && 0 == d.size && (cancelAnimationFrame(b), b = 0);
  };
  this.Lb = function(g) {
    f && (document.body.remove(f), f = null);
    g || (f = document.createElement("div"), f.style.backgroundColor = "black", f.style.position = "fixed", f.style.right = 0, f.style.top = 0, f.style.color = "white", f.style.padding = "4px", f.innerHTML = "RIVE FPS", g = function(k) {
      f.innerHTML = "RIVE FPS " + k.toFixed(1);
    }, document.body.appendChild(f));
    e = new function() {
      let k = 0, p = 0;
      this.Nb = function() {
        var m = performance.now();
        p ? (++k, m -= p, 1000 < m && (g(1000 * k / m), k = p = 0)) : (p = m, k = 0);
      };
    }();
  };
  this.mb = function() {
  };
}
function ha() {
  console.assert(!0);
  const a = new Map();
  let b = -Infinity;
  this.push = function(c) {
    c = c + 255 >> 8;
    a.has(c) && clearTimeout(a.get(c));
    a.set(c, setTimeout(function() {
      a.delete(c);
      0 == a.length ? b = -Infinity : c == b && (b = Math.max(...a.keys()), console.assert(b < c));
    }, 1000));
    b = Math.max(c, b);
    return b << 8;
  };
}
const ia = l.onRuntimeInitialized;
l.onRuntimeInitialized = function() {
  ia && ia();
  let a = l.decodeAudio;
  l.decodeAudio = function(f, g) {
    f = a(f);
    g(f);
  };
  let b = l.decodeFont;
  l.decodeFont = function(f, g) {
    f = b(f);
    g(f);
  };
  let c = l.setFallbackFontCb;
  l.setFallbackFontCallback = "function" === typeof c ? function(f) {
    c(f);
  } : function() {
    console.warn("Module.setFallbackFontCallback called, but text support is not enabled in this build.");
  };
  const d = l.FileAssetLoader;
  l.ptrToAsset = f => {
    let g = l.ptrToFileAsset(f);
    return g.isImage ? l.ptrToImageAsset(f) : g.isFont ? l.ptrToFontAsset(f) : g.isAudio ? l.ptrToAudioAsset(f) : g;
  };
  l.CustomFileAssetLoader = d.extend("CustomFileAssetLoader", {__construct:function({loadContents:f}) {
    this.__parent.__construct.call(this);
    this.Bb = f;
  }, loadContents:function(f, g) {
    f = l.ptrToAsset(f);
    return this.Bb(f, g);
  },});
  l.CDNFileAssetLoader = d.extend("CDNFileAssetLoader", {__construct:function() {
    this.__parent.__construct.call(this);
  }, loadContents:function(f) {
    let g = l.ptrToAsset(f);
    f = g.cdnUuid;
    if ("" === f) {
      return !1;
    }
    (function(k, p) {
      var m = new XMLHttpRequest();
      m.responseType = "arraybuffer";
      m.onreadystatechange = function() {
        4 == m.readyState && 200 == m.status && p(m);
      };
      m.open("GET", k, !0);
      m.send(null);
    })(g.cdnBaseUrl + "/" + f, k => {
      g.decode(new Uint8Array(k.response));
    });
    return !0;
  },});
  l.FallbackFileAssetLoader = d.extend("FallbackFileAssetLoader", {__construct:function() {
    this.__parent.__construct.call(this);
    this.ib = [];
  }, addLoader:function(f) {
    this.ib.push(f);
  }, loadContents:function(f, g) {
    for (let k of this.ib) {
      if (k.loadContents(f, g)) {
        return !0;
      }
    }
    return !1;
  },});
  let e = l.computeAlignment;
  l.computeAlignment = function(f, g, k, p, m = 1.0) {
    return e.call(this, f, g, k, p, m);
  };
};
const ja = l.onRuntimeInitialized;
l.onRuntimeInitialized = function() {
  function a(r) {
    this.G = r;
    this.Ab = r.getContext("2d");
    this.Eb = d;
    this.S = [];
    this.ja = 0;
    this.clear = function() {
      console.assert(0 == this.ja);
      this.S = [];
      e.delete(this);
    };
    this.save = function() {
      ++this.ja;
      this.S.push(d.save.bind(d));
    };
    this.restore = function() {
      0 < this.ja && (this.S.push(d.restore.bind(d)), --this.ja);
    };
    this.transform = function(u) {
      this.S.push(d.transform.bind(d, u));
    };
    this.align = function(u, z, A, C, H = 1.0) {
      this.S.push(d.align.bind(d, u, z, A, C, H));
    };
    this.flush = function() {
      console.assert(0 == this.ja);
      e.add(this);
      d.Ya || c();
    };
    this["delete"] = function() {
    };
  }
  function b(r, u = !1) {
    var z = {alpha:!0, depth:u, stencil:u, antialias:u, premultipliedAlpha:!0, preserveDrawingBuffer:0, powerPreference:"high-performance", failIfMajorPerformanceCaveat:0, enableExtensionsByDefault:!1, explicitSwapControl:0, renderViaOffscreenBackBuffer:0,};
    u = r.getContext("webgl2", z);
    if (!u) {
      return null;
    }
    z = ka(u, z);
    la(z);
    const A = f(r.width, r.height);
    A.La = z;
    A.G = r;
    A.Ma = r.width;
    A.Za = r.height;
    A.T = u;
    var C = A.delete;
    A.delete = function() {
      C.call(this);
      var H = this.La;
      q === w[H] && (q = null);
      "object" == typeof JSEvents && JSEvents.Qc(w[H].F.canvas);
      w[H] && w[H].F.canvas && (w[H].F.canvas.zb = void 0);
      this.La = this.G = this.Ma = this.T = w[H] = null;
    };
    return A;
  }
  function c() {
    if (d) {
      var r = d.Db, u = 0, z = 0, A = 0, C = Array(e.size), H = 0;
      for (var J of e) {
        J.ea = Math.min(J.G.width, r), J.da = Math.min(J.G.height, r), J.Ja = J.da * J.ea, u = Math.max(u, J.ea), z = Math.max(z, J.da), A += J.Ja, C[H++] = J;
      }
      e.clear();
      if (!(0 >= A)) {
        u = 1 << (0 >= u ? 0 : 32 - Math.clz32(u - 1));
        for (z = 1 << (0 >= z ? 0 : 32 - Math.clz32(z - 1)); z * u < A;) {
          u <= z ? u *= 2 : z *= 2;
        }
        u = Math.min(u, r);
        u = Math.min(z, r);
        C.sort((Z, ob) => ob.Ja - Z.Ja);
        A = new l.DynamicRectanizer(r);
        for (J = 0; J < C.length;) {
          A.reset(u, z);
          for (H = J; H < C.length; ++H) {
            var K = C[H], I = A.addRect(K.ea, K.da);
            if (0 > I) {
              console.assert(H > J);
              break;
            }
            K.pa = I & 65535;
            K.qa = I >> 16;
          }
          K = p.push(A.drawWidth());
          I = m.push(A.drawHeight());
          console.assert(K >= A.drawWidth());
          console.assert(I >= A.drawHeight());
          console.assert(K <= r);
          console.assert(I <= r);
          d.G.width != K && (d.G.width = K);
          d.G.height != I && (d.G.height = I);
          d.clear();
          for (K = J; K < H; ++K) {
            I = C[K];
            d.saveClipRect(I.pa, I.qa, I.pa + I.ea, I.qa + I.da);
            let Z = new l.Mat2D();
            Z.xx = I.ea / I.G.width;
            Z.yy = I.da / I.G.height;
            Z.xy = Z.yx = 0;
            Z.tx = I.pa;
            Z.ty = I.qa;
            d.transform(Z);
            for (const ob of I.S) {
              ob();
            }
            d.restoreClipRect();
            I.S = [];
          }
          for (d.flush(); J < H; ++J) {
            K = C[J], I = K.Ab, I.globalCompositeOperation = "copy", I.drawImage(d.G, K.pa, K.qa, K.ea, K.da, 0, 0, K.G.width, K.G.height);
          }
          J = H;
        }
      }
    }
  }
  ja && ja();
  let d = null;
  const e = new Set(), f = l.makeRenderer;
  l.makeRenderer = function(r, u) {
    if (!d) {
      function z(A) {
        var C = document.createElement("canvas");
        C.width = 1;
        C.height = 1;
        d = b(C, A);
        if (!d) {
          return null;
        }
        d.Ya = !!d.T.getExtension("WEBGL_shader_pixel_local_storage");
        d.Db = Math.min(d.T.getParameter(d.T.MAX_RENDERBUFFER_SIZE), d.T.getParameter(d.T.MAX_TEXTURE_SIZE));
        d.Ka = !d.Ya;
        if (A = d.T.getExtension("WEBGL_debug_renderer_info")) {
          C = d.T.getParameter(A.UNMASKED_RENDERER_WEBGL), d.T.getParameter(A.UNMASKED_VENDOR_WEBGL).includes("Google") && C.includes("ANGLE Metal Renderer") && (d.Ka = !1);
        }
        return d;
      }
      d = z(!0);
      if (!d) {
        throw "Unable to create WebGL context, your environment may not support WebGL. Try out @rive-app/canvas as an alternative.";
      }
      d.Ka || (d = z(!1));
    }
    return u ? new a(r) : b(r, d.Ka);
  };
  const g = l.Artboard.prototype["delete"];
  l.Artboard.prototype["delete"] = function() {
    this.Fb = !0;
    g.call(this);
  };
  const k = l.Artboard.prototype.draw;
  l.Artboard.prototype.draw = function(r) {
    r.S ? r.S.push(() => {
      this.Fb || k.call(this, r.Eb);
    }) : k.call(this, r);
  };
  const p = new ha(), m = new ha(), t = new fa();
  l.requestAnimationFrame = t.requestAnimationFrame.bind(t);
  l.cancelAnimationFrame = t.cancelAnimationFrame.bind(t);
  l.enableFPSCounter = t.Lb.bind(t);
  t.mb = c;
  l.resolveAnimationFrame = c;
  let v = l.load;
  l.load = function(r, u, z = !0) {
    const A = new l.FallbackFileAssetLoader();
    void 0 !== u && A.addLoader(u);
    z && (u = new l.CDNFileAssetLoader(), A.addLoader(u));
    return Promise.resolve(v(r, A));
  };
  const x = l.WebGL2Renderer.prototype.clear;
  l.WebGL2Renderer.prototype.clear = function() {
    la(this.La);
    const r = this.G;
    if (this.Ma != r.width || this.Za != r.height) {
      this.resize(r.width, r.height), this.Ma = r.width, this.Za = r.height;
    }
    x.call(this);
  };
  l.decodeImage = function(r, u) {
    r = l.decodeWebGL2Image(r);
    u(r);
  };
  let n = l.Renderer.prototype.align;
  l.Renderer.prototype.align = function(r, u, z, A, C = 1.0) {
    n.call(this, r, u, z, A, C);
  };
};
var ma = Object.assign({}, l), na = "./this.program", y = "", oa, pa;
if (da || ea) {
  ea ? y = self.location.href : "undefined" != typeof document && document.currentScript && (y = document.currentScript.src), _scriptName && (y = _scriptName), y.startsWith("blob:") ? y = "" : y = y.substr(0, y.replace(/[?#].*/, "").lastIndexOf("/") + 1), ea && (pa = a => {
    var b = new XMLHttpRequest();
    b.open("GET", a, !1);
    b.responseType = "arraybuffer";
    b.send(null);
    return new Uint8Array(b.response);
  }), oa = (a, b, c) => {
    if (qa(a)) {
      var d = new XMLHttpRequest();
      d.open("GET", a, !0);
      d.responseType = "arraybuffer";
      d.onload = () => {
        200 == d.status || 0 == d.status && d.response ? b(d.response) : c();
      };
      d.onerror = c;
      d.send(null);
    } else {
      fetch(a, {credentials:"same-origin"}).then(e => e.ok ? e.arrayBuffer() : Promise.reject(Error(e.status + " : " + e.url))).then(b, c);
    }
  };
}
var ra = l.print || console.log.bind(console), sa = l.printErr || console.error.bind(console);
Object.assign(l, ma);
ma = null;
l.thisProgram && (na = l.thisProgram);
var ta;
l.wasmBinary && (ta = l.wasmBinary);
var ua, va = !1, B, D, E, wa, F, G, xa, ya;
function za() {
  var a = ua.buffer;
  l.HEAP8 = B = new Int8Array(a);
  l.HEAP16 = E = new Int16Array(a);
  l.HEAPU8 = D = new Uint8Array(a);
  l.HEAPU16 = wa = new Uint16Array(a);
  l.HEAP32 = F = new Int32Array(a);
  l.HEAPU32 = G = new Uint32Array(a);
  l.HEAPF32 = xa = new Float32Array(a);
  l.HEAPF64 = ya = new Float64Array(a);
}
var Aa = [], Ba = [], Ca = [];
function Da() {
  var a = l.preRun.shift();
  Aa.unshift(a);
}
var Ea = 0, Fa = null, Ga = null;
function Ha(a) {
  l.onAbort?.(a);
  a = "Aborted(" + a + ")";
  sa(a);
  va = !0;
  a = new WebAssembly.RuntimeError(a + ". Build with -sASSERTIONS for more info.");
  ba(a);
  throw a;
}
var Ia = a => a.startsWith("data:application/octet-stream;base64,"), qa = a => a.startsWith("file://"), Ja;
function Ka(a) {
  if (a == Ja && ta) {
    return new Uint8Array(ta);
  }
  if (pa) {
    return pa(a);
  }
  throw "both async and sync fetching of the wasm failed";
}
function La(a) {
  return ta ? Promise.resolve().then(() => Ka(a)) : new Promise((b, c) => {
    oa(a, d => b(new Uint8Array(d)), () => {
      try {
        b(Ka(a));
      } catch (d) {
        c(d);
      }
    });
  });
}
function Ma(a, b, c) {
  return La(a).then(d => WebAssembly.instantiate(d, b)).then(c, d => {
    sa(`failed to asynchronously prepare wasm: ${d}`);
    Ha(d);
  });
}
function Na(a, b) {
  var c = Ja;
  return ta || "function" != typeof WebAssembly.instantiateStreaming || Ia(c) || qa(c) || "function" != typeof fetch ? Ma(c, a, b) : fetch(c, {credentials:"same-origin"}).then(d => WebAssembly.instantiateStreaming(d, a).then(b, function(e) {
    sa(`wasm streaming compile failed: ${e}`);
    sa("falling back to ArrayBuffer instantiation");
    return Ma(c, a, b);
  }));
}
var Oa, Pa, Ta = {569016:(a, b, c, d, e) => {
  if ("undefined" === typeof window || void 0 === (window.AudioContext || window.webkitAudioContext)) {
    return 0;
  }
  if ("undefined" === typeof window.h) {
    window.h = {Ea:0};
    window.h.I = {};
    window.h.I.Ba = a;
    window.h.I.capture = b;
    window.h.I.Pa = c;
    window.h.ha = {};
    window.h.ha.stopped = d;
    window.h.ha.ub = e;
    let f = window.h;
    f.C = [];
    f.mc = function(g) {
      for (var k = 0; k < f.C.length; ++k) {
        if (null == f.C[k]) {
          return f.C[k] = g, k;
        }
      }
      f.C.push(g);
      return f.C.length - 1;
    };
    f.yb = function(g) {
      for (f.C[g] = null; 0 < f.C.length;) {
        if (null == f.C[f.C.length - 1]) {
          f.C.pop();
        } else {
          break;
        }
      }
    };
    f.Tc = function(g) {
      for (var k = 0; k < f.C.length; ++k) {
        if (f.C[k] == g) {
          return f.yb(k);
        }
      }
    };
    f.sa = function(g) {
      return f.C[g];
    };
    f.Xa = ["touchend", "click"];
    f.unlock = function() {
      for (var g = 0; g < f.C.length; ++g) {
        var k = f.C[g];
        null != k && null != k.K && k.state === f.ha.ub && k.K.resume().then(() => {
          Qa(k.nb);
        }, p => {
          console.error("Failed to resume audiocontext", p);
        });
      }
      f.Xa.map(function(p) {
        document.removeEventListener(p, f.unlock, !0);
      });
    };
    f.Xa.map(function(g) {
      document.addEventListener(g, f.unlock, !0);
    });
  }
  window.h.Ea += 1;
  return 1;
}, 571194:() => {
  "undefined" !== typeof window.h && (window.h.Xa.map(function(a) {
    document.removeEventListener(a, window.h.unlock, !0);
  }), --window.h.Ea, 0 === window.h.Ea && delete window.h);
}, 571498:() => void 0 !== navigator.mediaDevices && void 0 !== navigator.mediaDevices.getUserMedia, 571602:() => {
  try {
    var a = new (window.AudioContext || window.webkitAudioContext)(), b = a.sampleRate;
    a.close();
    return b;
  } catch (c) {
    return 0;
  }
}, 571773:(a, b, c, d, e, f) => {
  if ("undefined" === typeof window.h) {
    return -1;
  }
  var g = {}, k = {};
  a == window.h.I.Ba && 0 != c && (k.sampleRate = c);
  g.K = new (window.AudioContext || window.webkitAudioContext)(k);
  g.K.suspend();
  g.state = window.h.ha.stopped;
  c = 0;
  a != window.h.I.Ba && (c = b);
  g.Y = g.K.createScriptProcessor(d, c, b);
  g.Y.onaudioprocess = function(p) {
    if (null == g.ta || 0 == g.ta.length) {
      g.ta = new Float32Array(xa.buffer, e, d * b);
    }
    if (a == window.h.I.capture || a == window.h.I.Pa) {
      for (var m = 0; m < b; m += 1) {
        for (var t = p.inputBuffer.getChannelData(m), v = g.ta, x = 0; x < d; x += 1) {
          v[x * b + m] = t[x];
        }
      }
      Ra(f, d, e);
    }
    if (a == window.h.I.Ba || a == window.h.I.Pa) {
      for (Sa(f, d, e), m = 0; m < p.outputBuffer.numberOfChannels; ++m) {
        for (t = p.outputBuffer.getChannelData(m), v = g.ta, x = 0; x < d; x += 1) {
          t[x] = v[x * b + m];
        }
      }
    } else {
      for (m = 0; m < p.outputBuffer.numberOfChannels; ++m) {
        p.outputBuffer.getChannelData(m).fill(0.0);
      }
    }
  };
  a != window.h.I.capture && a != window.h.I.Pa || navigator.mediaDevices.getUserMedia({audio:!0, video:!1}).then(function(p) {
    g.Fa = g.K.createMediaStreamSource(p);
    g.Fa.connect(g.Y);
    g.Y.connect(g.K.destination);
  }).catch(function(p) {
    console.log("Failed to get user media: " + p);
  });
  a == window.h.I.Ba && g.Y.connect(g.K.destination);
  g.nb = f;
  return window.h.mc(g);
}, 574650:a => window.h.sa(a).K.sampleRate, 574723:a => {
  a = window.h.sa(a);
  void 0 !== a.Y && (a.Y.onaudioprocess = function() {
  }, a.Y.disconnect(), a.Y = void 0);
  void 0 !== a.Fa && (a.Fa.disconnect(), a.Fa = void 0);
  a.K.close();
  a.K = void 0;
  a.nb = void 0;
}, 575123:a => {
  window.h.yb(a);
}, 575173:a => {
  a = window.h.sa(a);
  a.K.resume();
  a.state = window.h.ha.ub;
}, 575312:a => {
  a = window.h.sa(a);
  a.K.suspend();
  a.state = window.h.ha.stopped;
}}, Ua = a => {
  for (; 0 < a.length;) {
    a.shift()(l);
  }
};
function Va() {
  var a = F[+Wa >> 2];
  Wa += 4;
  return a;
}
var Xa = (a, b) => {
  for (var c = 0, d = a.length - 1; 0 <= d; d--) {
    var e = a[d];
    "." === e ? a.splice(d, 1) : ".." === e ? (a.splice(d, 1), c++) : c && (a.splice(d, 1), c--);
  }
  if (b) {
    for (; c; c--) {
      a.unshift("..");
    }
  }
  return a;
}, Ya = a => {
  var b = "/" === a.charAt(0), c = "/" === a.substr(-1);
  (a = Xa(a.split("/").filter(d => !!d), !b).join("/")) || b || (a = ".");
  a && c && (a += "/");
  return (b ? "/" : "") + a;
}, Za = a => {
  var b = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(a).slice(1);
  a = b[0];
  b = b[1];
  if (!a && !b) {
    return ".";
  }
  b &&= b.substr(0, b.length - 1);
  return a + b;
}, $a = a => {
  if ("/" === a) {
    return "/";
  }
  a = Ya(a);
  a = a.replace(/\/$/, "");
  var b = a.lastIndexOf("/");
  return -1 === b ? a : a.substr(b + 1);
}, ab = () => {
  if ("object" == typeof crypto && "function" == typeof crypto.getRandomValues) {
    return a => crypto.getRandomValues(a);
  }
  Ha("initRandomDevice");
}, bb = a => (bb = ab())(a), cb = (...a) => {
  for (var b = "", c = !1, d = a.length - 1; -1 <= d && !c; d--) {
    c = 0 <= d ? a[d] : "/";
    if ("string" != typeof c) {
      throw new TypeError("Arguments to path.resolve must be strings");
    }
    if (!c) {
      return "";
    }
    b = c + "/" + b;
    c = "/" === c.charAt(0);
  }
  b = Xa(b.split("/").filter(e => !!e), !c).join("/");
  return (c ? "/" : "") + b || ".";
}, db = "undefined" != typeof TextDecoder ? new TextDecoder("utf8") : void 0, L = (a, b, c) => {
  var d = b + c;
  for (c = b; a[c] && !(c >= d);) {
    ++c;
  }
  if (16 < c - b && a.buffer && db) {
    return db.decode(a.subarray(b, c));
  }
  for (d = ""; b < c;) {
    var e = a[b++];
    if (e & 128) {
      var f = a[b++] & 63;
      if (192 == (e & 224)) {
        d += String.fromCharCode((e & 31) << 6 | f);
      } else {
        var g = a[b++] & 63;
        e = 224 == (e & 240) ? (e & 15) << 12 | f << 6 | g : (e & 7) << 18 | f << 12 | g << 6 | a[b++] & 63;
        65536 > e ? d += String.fromCharCode(e) : (e -= 65536, d += String.fromCharCode(55296 | e >> 10, 56320 | e & 1023));
      }
    } else {
      d += String.fromCharCode(e);
    }
  }
  return d;
}, eb = [], fb = a => {
  for (var b = 0, c = 0; c < a.length; ++c) {
    var d = a.charCodeAt(c);
    127 >= d ? b++ : 2047 >= d ? b += 2 : 55296 <= d && 57343 >= d ? (b += 4, ++c) : b += 3;
  }
  return b;
}, gb = (a, b, c, d) => {
  if (!(0 < d)) {
    return 0;
  }
  var e = c;
  d = c + d - 1;
  for (var f = 0; f < a.length; ++f) {
    var g = a.charCodeAt(f);
    if (55296 <= g && 57343 >= g) {
      var k = a.charCodeAt(++f);
      g = 65536 + ((g & 1023) << 10) | k & 1023;
    }
    if (127 >= g) {
      if (c >= d) {
        break;
      }
      b[c++] = g;
    } else {
      if (2047 >= g) {
        if (c + 1 >= d) {
          break;
        }
        b[c++] = 192 | g >> 6;
      } else {
        if (65535 >= g) {
          if (c + 2 >= d) {
            break;
          }
          b[c++] = 224 | g >> 12;
        } else {
          if (c + 3 >= d) {
            break;
          }
          b[c++] = 240 | g >> 18;
          b[c++] = 128 | g >> 12 & 63;
        }
        b[c++] = 128 | g >> 6 & 63;
      }
      b[c++] = 128 | g & 63;
    }
  }
  b[c] = 0;
  return c - e;
};
function hb(a, b) {
  var c = Array(fb(a) + 1);
  a = gb(a, c, 0, c.length);
  b && (c.length = a);
  return c;
}
var ib = [];
function jb(a, b) {
  ib[a] = {input:[], H:[], V:b};
  kb(a, lb);
}
var lb = {open(a) {
  var b = ib[a.node.Da];
  if (!b) {
    throw new M(43);
  }
  a.s = b;
  a.seekable = !1;
}, close(a) {
  a.s.V.ra(a.s);
}, ra(a) {
  a.s.V.ra(a.s);
}, read(a, b, c, d) {
  if (!a.s || !a.s.V.hb) {
    throw new M(60);
  }
  for (var e = 0, f = 0; f < d; f++) {
    try {
      var g = a.s.V.hb(a.s);
    } catch (k) {
      throw new M(29);
    }
    if (void 0 === g && 0 === e) {
      throw new M(6);
    }
    if (null === g || void 0 === g) {
      break;
    }
    e++;
    b[c + f] = g;
  }
  e && (a.node.timestamp = Date.now());
  return e;
}, write(a, b, c, d) {
  if (!a.s || !a.s.V.Sa) {
    throw new M(60);
  }
  try {
    for (var e = 0; e < d; e++) {
      a.s.V.Sa(a.s, b[c + e]);
    }
  } catch (f) {
    throw new M(29);
  }
  d && (a.node.timestamp = Date.now());
  return e;
},}, mb = {hb() {
  a: {
    if (!eb.length) {
      var a = null;
      "undefined" != typeof window && "function" == typeof window.prompt && (a = window.prompt("Input: "), null !== a && (a += "\n"));
      if (!a) {
        a = null;
        break a;
      }
      eb = hb(a, !0);
    }
    a = eb.shift();
  }
  return a;
}, Sa(a, b) {
  null === b || 10 === b ? (ra(L(a.H, 0)), a.H = []) : 0 != b && a.H.push(b);
}, ra(a) {
  a.H && 0 < a.H.length && (ra(L(a.H, 0)), a.H = []);
}, Wb() {
  return {xc:25856, zc:5, wc:191, yc:35387, vc:[3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,]};
}, Xb() {
  return 0;
}, Yb() {
  return [24, 80];
},}, nb = {Sa(a, b) {
  null === b || 10 === b ? (sa(L(a.H, 0)), a.H = []) : 0 != b && a.H.push(b);
}, ra(a) {
  a.H && 0 < a.H.length && (sa(L(a.H, 0)), a.H = []);
},};
function pb(a, b) {
  var c = a.l ? a.l.length : 0;
  c >= b || (b = Math.max(b, c * (1048576 > c ? 2.0 : 1.125) >>> 0), 0 != c && (b = Math.max(b, 256)), c = a.l, a.l = new Uint8Array(b), 0 < a.v && a.l.set(c.subarray(0, a.v), 0));
}
var N = {N:null, U() {
  return N.createNode(null, "/", 16895, 0);
}, createNode(a, b, c, d) {
  if (24576 === (c & 61440) || 4096 === (c & 61440)) {
    throw new M(63);
  }
  N.N || (N.N = {dir:{node:{X:N.j.X, P:N.j.P, ka:N.j.ka, za:N.j.za, sb:N.j.sb, xb:N.j.xb, tb:N.j.tb, rb:N.j.rb, Ga:N.j.Ga}, stream:{aa:N.m.aa}}, file:{node:{X:N.j.X, P:N.j.P}, stream:{aa:N.m.aa, read:N.m.read, write:N.m.write, $a:N.m.$a, jb:N.m.jb, lb:N.m.lb}}, link:{node:{X:N.j.X, P:N.j.P, la:N.j.la}, stream:{}}, ab:{node:{X:N.j.X, P:N.j.P}, stream:qb}});
  c = rb(a, b, c, d);
  16384 === (c.mode & 61440) ? (c.j = N.N.dir.node, c.m = N.N.dir.stream, c.l = {}) : 32768 === (c.mode & 61440) ? (c.j = N.N.file.node, c.m = N.N.file.stream, c.v = 0, c.l = null) : 40960 === (c.mode & 61440) ? (c.j = N.N.link.node, c.m = N.N.link.stream) : 8192 === (c.mode & 61440) && (c.j = N.N.ab.node, c.m = N.N.ab.stream);
  c.timestamp = Date.now();
  a && (a.l[b] = c, a.timestamp = c.timestamp);
  return c;
}, Fc(a) {
  return a.l ? a.l.subarray ? a.l.subarray(0, a.v) : new Uint8Array(a.l) : new Uint8Array(0);
}, j:{X(a) {
  var b = {};
  b.Cc = 8192 === (a.mode & 61440) ? a.id : 1;
  b.Hc = a.id;
  b.mode = a.mode;
  b.Nc = 1;
  b.uid = 0;
  b.Gc = 0;
  b.Da = a.Da;
  16384 === (a.mode & 61440) ? b.size = 4096 : 32768 === (a.mode & 61440) ? b.size = a.v : 40960 === (a.mode & 61440) ? b.size = a.link.length : b.size = 0;
  b.tc = new Date(a.timestamp);
  b.Mc = new Date(a.timestamp);
  b.Ac = new Date(a.timestamp);
  b.Gb = 4096;
  b.uc = Math.ceil(b.size / b.Gb);
  return b;
}, P(a, b) {
  void 0 !== b.mode && (a.mode = b.mode);
  void 0 !== b.timestamp && (a.timestamp = b.timestamp);
  if (void 0 !== b.size && (b = b.size, a.v != b)) {
    if (0 == b) {
      a.l = null, a.v = 0;
    } else {
      var c = a.l;
      a.l = new Uint8Array(b);
      c && a.l.set(c.subarray(0, Math.min(b, a.v)));
      a.v = b;
    }
  }
}, ka() {
  throw sb[44];
}, za(a, b, c, d) {
  return N.createNode(a, b, c, d);
}, sb(a, b, c) {
  if (16384 === (a.mode & 61440)) {
    try {
      var d = tb(b, c);
    } catch (f) {
    }
    if (d) {
      for (var e in d.l) {
        throw new M(55);
      }
    }
  }
  delete a.parent.l[a.name];
  a.parent.timestamp = Date.now();
  a.name = c;
  b.l[c] = a;
  b.timestamp = a.parent.timestamp;
}, xb(a, b) {
  delete a.l[b];
  a.timestamp = Date.now();
}, tb(a, b) {
  var c = tb(a, b), d;
  for (d in c.l) {
    throw new M(55);
  }
  delete a.l[b];
  a.timestamp = Date.now();
}, rb(a) {
  var b = [".", ".."], c;
  for (c of Object.keys(a.l)) {
    b.push(c);
  }
  return b;
}, Ga(a, b, c) {
  a = N.createNode(a, b, 41471, 0);
  a.link = c;
  return a;
}, la(a) {
  if (40960 !== (a.mode & 61440)) {
    throw new M(28);
  }
  return a.link;
},}, m:{read(a, b, c, d, e) {
  var f = a.node.l;
  if (e >= a.node.v) {
    return 0;
  }
  a = Math.min(a.node.v - e, d);
  if (8 < a && f.subarray) {
    b.set(f.subarray(e, e + a), c);
  } else {
    for (d = 0; d < a; d++) {
      b[c + d] = f[e + d];
    }
  }
  return a;
}, write(a, b, c, d, e, f) {
  b.buffer === B.buffer && (f = !1);
  if (!d) {
    return 0;
  }
  a = a.node;
  a.timestamp = Date.now();
  if (b.subarray && (!a.l || a.l.subarray)) {
    if (f) {
      return a.l = b.subarray(c, c + d), a.v = d;
    }
    if (0 === a.v && 0 === e) {
      return a.l = b.slice(c, c + d), a.v = d;
    }
    if (e + d <= a.v) {
      return a.l.set(b.subarray(c, c + d), e), d;
    }
  }
  pb(a, e + d);
  if (a.l.subarray && b.subarray) {
    a.l.set(b.subarray(c, c + d), e);
  } else {
    for (f = 0; f < d; f++) {
      a.l[e + f] = b[c + f];
    }
  }
  a.v = Math.max(a.v, e + d);
  return d;
}, aa(a, b, c) {
  1 === c ? b += a.position : 2 === c && 32768 === (a.node.mode & 61440) && (b += a.node.v);
  if (0 > b) {
    throw new M(28);
  }
  return b;
}, $a(a, b, c) {
  pb(a.node, b + c);
  a.node.v = Math.max(a.node.v, b + c);
}, jb(a, b, c, d, e) {
  if (32768 !== (a.node.mode & 61440)) {
    throw new M(43);
  }
  a = a.node.l;
  if (e & 2 || a.buffer !== B.buffer) {
    if (0 < c || c + b < a.length) {
      a.subarray ? a = a.subarray(c, c + b) : a = Array.prototype.slice.call(a, c, c + b);
    }
    c = !0;
    Ha();
    b = void 0;
    if (!b) {
      throw new M(48);
    }
    B.set(a, b);
  } else {
    c = !1, b = a.byteOffset;
  }
  return {o:b, sc:c};
}, lb(a, b, c, d) {
  N.m.write(a, b, 0, d, c, !1);
  return 0;
},},}, ub = (a, b) => {
  var c = 0;
  a && (c |= 365);
  b && (c |= 146);
  return c;
}, vb = null, wb = {}, xb = [], yb = 1, zb = null, Ab = !0, M = class {
  constructor(a) {
    this.name = "ErrnoError";
    this.$ = a;
  }
}, sb = {}, Bb = class {
  constructor() {
    this.h = {};
    this.node = null;
  }
  get flags() {
    return this.h.flags;
  }
  set flags(a) {
    this.h.flags = a;
  }
  get position() {
    return this.h.position;
  }
  set position(a) {
    this.h.position = a;
  }
}, Cb = class {
  constructor(a, b, c, d) {
    a ||= this;
    this.parent = a;
    this.U = a.U;
    this.Aa = null;
    this.id = yb++;
    this.name = b;
    this.mode = c;
    this.j = {};
    this.m = {};
    this.Da = d;
  }
  get read() {
    return 365 === (this.mode & 365);
  }
  set read(a) {
    a ? this.mode |= 365 : this.mode &= -366;
  }
  get write() {
    return 146 === (this.mode & 146);
  }
  set write(a) {
    a ? this.mode |= 146 : this.mode &= -147;
  }
};
function Db(a, b = {}) {
  a = cb(a);
  if (!a) {
    return {path:"", node:null};
  }
  b = Object.assign({gb:!0, Ua:0}, b);
  if (8 < b.Ua) {
    throw new M(32);
  }
  a = a.split("/").filter(g => !!g);
  for (var c = vb, d = "/", e = 0; e < a.length; e++) {
    var f = e === a.length - 1;
    if (f && b.parent) {
      break;
    }
    c = tb(c, a[e]);
    d = Ya(d + "/" + a[e]);
    c.Aa && (!f || f && b.gb) && (c = c.Aa.root);
    if (!f || b.fb) {
      for (f = 0; 40960 === (c.mode & 61440);) {
        if (c = Eb(d), d = cb(Za(d), c), c = Db(d, {Ua:b.Ua + 1}).node, 40 < f++) {
          throw new M(32);
        }
      }
    }
  }
  return {path:d, node:c};
}
function Fb(a) {
  for (var b;;) {
    if (a === a.parent) {
      return a = a.U.kb, b ? "/" !== a[a.length - 1] ? `${a}/${b}` : a + b : a;
    }
    b = b ? `${a.name}/${b}` : a.name;
    a = a.parent;
  }
}
function Gb(a, b) {
  for (var c = 0, d = 0; d < b.length; d++) {
    c = (c << 5) - c + b.charCodeAt(d) | 0;
  }
  return (a + c >>> 0) % zb.length;
}
function tb(a, b) {
  var c = 16384 === (a.mode & 61440) ? (c = Hb(a, "x")) ? c : a.j.ka ? 0 : 2 : 54;
  if (c) {
    throw new M(c);
  }
  for (c = zb[Gb(a.id, b)]; c; c = c.ac) {
    var d = c.name;
    if (c.parent.id === a.id && d === b) {
      return c;
    }
  }
  return a.j.ka(a, b);
}
function rb(a, b, c, d) {
  a = new Cb(a, b, c, d);
  b = Gb(a.parent.id, a.name);
  a.ac = zb[b];
  return zb[b] = a;
}
function Ib(a) {
  var b = ["r", "w", "rw"][a & 3];
  a & 512 && (b += "w");
  return b;
}
function Hb(a, b) {
  if (Ab) {
    return 0;
  }
  if (!b.includes("r") || a.mode & 292) {
    if (b.includes("w") && !(a.mode & 146) || b.includes("x") && !(a.mode & 73)) {
      return 2;
    }
  } else {
    return 2;
  }
  return 0;
}
function Jb(a, b) {
  try {
    return tb(a, b), 20;
  } catch (c) {
  }
  return Hb(a, "wx");
}
function Kb(a) {
  a = xb[a];
  if (!a) {
    throw new M(8);
  }
  return a;
}
function Lb(a, b = -1) {
  a = Object.assign(new Bb(), a);
  if (-1 == b) {
    a: {
      for (b = 0; 4096 >= b; b++) {
        if (!xb[b]) {
          break a;
        }
      }
      throw new M(33);
    }
  }
  a.W = b;
  return xb[b] = a;
}
function Mb(a, b = -1) {
  a = Lb(a, b);
  a.m?.Ec?.(a);
  return a;
}
var qb = {open(a) {
  a.m = wb[a.node.Da].m;
  a.m.open?.(a);
}, aa() {
  throw new M(70);
},};
function kb(a, b) {
  wb[a] = {m:b};
}
function Nb(a, b) {
  var c = "/" === b;
  if (c && vb) {
    throw new M(10);
  }
  if (!c && b) {
    var d = Db(b, {gb:!1});
    b = d.path;
    d = d.node;
    if (d.Aa) {
      throw new M(10);
    }
    if (16384 !== (d.mode & 61440)) {
      throw new M(54);
    }
  }
  b = {type:a, Pc:{}, kb:b, Zb:[]};
  a = a.U(b);
  a.U = b;
  b.root = a;
  c ? vb = a : d && (d.Aa = b, d.U && d.U.Zb.push(b));
}
function Ob(a, b, c) {
  var d = Db(a, {parent:!0}).node;
  a = $a(a);
  if (!a || "." === a || ".." === a) {
    throw new M(28);
  }
  var e = Jb(d, a);
  if (e) {
    throw new M(e);
  }
  if (!d.j.za) {
    throw new M(63);
  }
  return d.j.za(d, a, b, c);
}
function Pb(a) {
  return Ob(a, 16895, 0);
}
function Qb(a, b, c) {
  "undefined" == typeof c && (c = b, b = 438);
  Ob(a, b | 8192, c);
}
function Rb(a, b) {
  if (!cb(a)) {
    throw new M(44);
  }
  var c = Db(b, {parent:!0}).node;
  if (!c) {
    throw new M(44);
  }
  b = $a(b);
  var d = Jb(c, b);
  if (d) {
    throw new M(d);
  }
  if (!c.j.Ga) {
    throw new M(63);
  }
  c.j.Ga(c, b, a);
}
function Eb(a) {
  a = Db(a).node;
  if (!a) {
    throw new M(44);
  }
  if (!a.j.la) {
    throw new M(28);
  }
  return cb(Fb(a.parent), a.j.la(a));
}
function Sb(a, b, c) {
  if ("" === a) {
    throw new M(44);
  }
  if ("string" == typeof b) {
    var d = {r:0, "r+":2, w:577, "w+":578, a:1089, "a+":1090,}[b];
    if ("undefined" == typeof d) {
      throw Error(`Unknown file open mode: ${b}`);
    }
    b = d;
  }
  c = b & 64 ? ("undefined" == typeof c ? 438 : c) & 4095 | 32768 : 0;
  if ("object" == typeof a) {
    var e = a;
  } else {
    a = Ya(a);
    try {
      e = Db(a, {fb:!(b & 131072)}).node;
    } catch (f) {
    }
  }
  d = !1;
  if (b & 64) {
    if (e) {
      if (b & 128) {
        throw new M(20);
      }
    } else {
      e = Ob(a, c, 0), d = !0;
    }
  }
  if (!e) {
    throw new M(44);
  }
  8192 === (e.mode & 61440) && (b &= -513);
  if (b & 65536 && 16384 !== (e.mode & 61440)) {
    throw new M(54);
  }
  if (!d && (c = e ? 40960 === (e.mode & 61440) ? 32 : 16384 === (e.mode & 61440) && ("r" !== Ib(b) || b & 512) ? 31 : Hb(e, Ib(b)) : 44)) {
    throw new M(c);
  }
  if (b & 512 && !d) {
    c = e;
    c = "string" == typeof c ? Db(c, {fb:!0}).node : c;
    if (!c.j.P) {
      throw new M(63);
    }
    if (16384 === (c.mode & 61440)) {
      throw new M(31);
    }
    if (32768 !== (c.mode & 61440)) {
      throw new M(28);
    }
    if (d = Hb(c, "w")) {
      throw new M(d);
    }
    c.j.P(c, {size:0, timestamp:Date.now()});
  }
  b &= -131713;
  e = Lb({node:e, path:Fb(e), flags:b, seekable:!0, position:0, m:e.m, nc:[], error:!1});
  e.m.open && e.m.open(e);
  !l.logReadFiles || b & 1 || (Tb ||= {}, a in Tb || (Tb[a] = 1));
  return e;
}
function Ub(a, b, c) {
  if (null === a.W) {
    throw new M(8);
  }
  if (!a.seekable || !a.m.aa) {
    throw new M(70);
  }
  if (0 != c && 1 != c && 2 != c) {
    throw new M(28);
  }
  a.position = a.m.aa(a, b, c);
  a.nc = [];
}
var Vb;
function Wb(a, b, c) {
  a = Ya("/dev/" + a);
  var d = ub(!!b, !!c);
  Xb ||= 64;
  var e = Xb++ << 8 | 0;
  kb(e, {open(f) {
    f.seekable = !1;
  }, close() {
    c?.buffer?.length && c(10);
  }, read(f, g, k, p) {
    for (var m = 0, t = 0; t < p; t++) {
      try {
        var v = b();
      } catch (x) {
        throw new M(29);
      }
      if (void 0 === v && 0 === m) {
        throw new M(6);
      }
      if (null === v || void 0 === v) {
        break;
      }
      m++;
      g[k + t] = v;
    }
    m && (f.node.timestamp = Date.now());
    return m;
  }, write(f, g, k, p) {
    for (var m = 0; m < p; m++) {
      try {
        c(g[k + m]);
      } catch (t) {
        throw new M(29);
      }
    }
    p && (f.node.timestamp = Date.now());
    return m;
  }});
  Qb(a, d, e);
}
var Xb, Yb = {}, Tb, Wa = void 0, Zb = (a, b) => Object.defineProperty(b, "name", {value:a}), $b = [], O = [], P, Q = a => {
  if (!a) {
    throw new P("Cannot use deleted val. handle = " + a);
  }
  return O[a];
}, ac = a => {
  switch(a) {
    case void 0:
      return 2;
    case null:
      return 4;
    case !0:
      return 6;
    case !1:
      return 8;
    default:
      const b = $b.pop() || O.length;
      O[b] = a;
      O[b + 1] = 1;
      return b;
  }
}, bc = a => {
  var b = Error, c = Zb(a, function(d) {
    this.name = a;
    this.message = d;
    d = Error(d).stack;
    void 0 !== d && (this.stack = this.toString() + "\n" + d.replace(/^Error(:[^\n]*)?\n/, ""));
  });
  c.prototype = Object.create(b.prototype);
  c.prototype.constructor = c;
  c.prototype.toString = function() {
    return void 0 === this.message ? this.name : `${this.name}: ${this.message}`;
  };
  return c;
}, cc, dc, R = a => {
  for (var b = ""; D[a];) {
    b += dc[D[a++]];
  }
  return b;
}, ec = [], fc = () => {
  for (; ec.length;) {
    var a = ec.pop();
    a.g.ga = !1;
    a["delete"]();
  }
}, gc, hc = {}, ic = (a, b) => {
  if (void 0 === b) {
    throw new P("ptr should not be undefined");
  }
  for (; a.B;) {
    b = a.na(b), a = a.B;
  }
  return b;
}, jc = {}, mc = a => {
  a = kc(a);
  var b = R(a);
  lc(a);
  return b;
}, nc = (a, b) => {
  var c = jc[a];
  if (void 0 === c) {
    throw a = `${b} has unknown type ${mc(a)}`, new P(a);
  }
  return c;
}, oc = () => {
}, pc = !1, qc = (a, b, c) => {
  if (b === c) {
    return a;
  }
  if (void 0 === c.B) {
    return null;
  }
  a = qc(a, b, c.B);
  return null === a ? null : c.Jb(a);
}, rc = {}, sc = (a, b) => {
  b = ic(a, b);
  return hc[b];
}, tc, vc = (a, b) => {
  if (!b.u || !b.o) {
    throw new tc("makeClassHandle requires ptr and ptrType");
  }
  if (!!b.J !== !!b.D) {
    throw new tc("Both smartPtrType and smartPtr must be specified");
  }
  b.count = {value:1};
  return uc(Object.create(a, {g:{value:b, writable:!0,},}));
}, uc = a => {
  if ("undefined" === typeof FinalizationRegistry) {
    return uc = b => b, a;
  }
  pc = new FinalizationRegistry(b => {
    b = b.g;
    --b.count.value;
    0 === b.count.value && (b.D ? b.J.O(b.D) : b.u.i.O(b.o));
  });
  uc = b => {
    var c = b.g;
    c.D && pc.register(b, {g:c}, b);
    return b;
  };
  oc = b => {
    pc.unregister(b);
  };
  return uc(a);
}, wc = {}, xc = a => {
  for (; a.length;) {
    var b = a.pop();
    a.pop()(b);
  }
};
function yc(a) {
  return this.fromWireType(G[a >> 2]);
}
var zc = {}, Ac = {}, T = (a, b, c) => {
  function d(k) {
    k = c(k);
    if (k.length !== a.length) {
      throw new tc("Mismatched type converter count");
    }
    for (var p = 0; p < a.length; ++p) {
      S(a[p], k[p]);
    }
  }
  a.forEach(function(k) {
    Ac[k] = b;
  });
  var e = Array(b.length), f = [], g = 0;
  b.forEach((k, p) => {
    jc.hasOwnProperty(k) ? e[p] = jc[k] : (f.push(k), zc.hasOwnProperty(k) || (zc[k] = []), zc[k].push(() => {
      e[p] = jc[k];
      ++g;
      g === f.length && d(e);
    }));
  });
  0 === f.length && d(e);
};
function Bc(a, b, c = {}) {
  var d = b.name;
  if (!a) {
    throw new P(`type "${d}" must have a positive integer typeid pointer`);
  }
  if (jc.hasOwnProperty(a)) {
    if (c.Tb) {
      return;
    }
    throw new P(`Cannot register type '${d}' twice`);
  }
  jc[a] = b;
  delete Ac[a];
  zc.hasOwnProperty(a) && (b = zc[a], delete zc[a], b.forEach(e => e()));
}
function S(a, b, c = {}) {
  if (!("argPackAdvance" in b)) {
    throw new TypeError("registerType registeredInstance requires argPackAdvance");
  }
  return Bc(a, b, c);
}
var Cc = a => {
  throw new P(a.g.u.i.name + " instance already deleted");
};
function Dc() {
}
var Ec = (a, b, c) => {
  if (void 0 === a[b].A) {
    var d = a[b];
    a[b] = function(...e) {
      if (!a[b].A.hasOwnProperty(e.length)) {
        throw new P(`Function '${c}' called with an invalid number of arguments (${e.length}) - expects one of (${a[b].A})!`);
      }
      return a[b].A[e.length].apply(this, e);
    };
    a[b].A = [];
    a[b].A[d.fa] = d;
  }
}, Fc = (a, b, c) => {
  if (l.hasOwnProperty(a)) {
    if (void 0 === c || void 0 !== l[a].A && void 0 !== l[a].A[c]) {
      throw new P(`Cannot register public name '${a}' twice`);
    }
    Ec(l, a, a);
    if (l.hasOwnProperty(c)) {
      throw new P(`Cannot register multiple overloads of a function with the same number of arguments (${c})!`);
    }
    l[a].A[c] = b;
  } else {
    l[a] = b, void 0 !== c && (l[a].Oc = c);
  }
}, Gc = a => {
  if (void 0 === a) {
    return "_unknown";
  }
  a = a.replace(/[^a-zA-Z0-9_]/g, "$");
  var b = a.charCodeAt(0);
  return 48 <= b && 57 >= b ? `_${a}` : a;
};
function Hc(a, b, c, d, e, f, g, k) {
  this.name = a;
  this.constructor = b;
  this.M = c;
  this.O = d;
  this.B = e;
  this.Ob = f;
  this.na = g;
  this.Jb = k;
  this.ob = [];
}
var Ic = (a, b, c) => {
  for (; b !== c;) {
    if (!b.na) {
      throw new P(`Expected null or instance of ${c.name}, got an instance of ${b.name}`);
    }
    a = b.na(a);
    b = b.B;
  }
  return a;
};
function Jc(a, b) {
  if (null === b) {
    if (this.Ra) {
      throw new P(`null is not a valid ${this.name}`);
    }
    return 0;
  }
  if (!b.g) {
    throw new P(`Cannot pass "${Kc(b)}" as a ${this.name}`);
  }
  if (!b.g.o) {
    throw new P(`Cannot pass deleted object as a pointer of type ${this.name}`);
  }
  return Ic(b.g.o, b.g.u.i, this.i);
}
function Lc(a, b) {
  if (null === b) {
    if (this.Ra) {
      throw new P(`null is not a valid ${this.name}`);
    }
    if (this.va) {
      var c = this.Ta();
      null !== a && a.push(this.O, c);
      return c;
    }
    return 0;
  }
  if (!b || !b.g) {
    throw new P(`Cannot pass "${Kc(b)}" as a ${this.name}`);
  }
  if (!b.g.o) {
    throw new P(`Cannot pass deleted object as a pointer of type ${this.name}`);
  }
  if (!this.ua && b.g.u.ua) {
    throw new P(`Cannot convert argument of type ${b.g.J ? b.g.J.name : b.g.u.name} to parameter type ${this.name}`);
  }
  c = Ic(b.g.o, b.g.u.i, this.i);
  if (this.va) {
    if (void 0 === b.g.D) {
      throw new P("Passing raw pointer to smart pointer is illegal");
    }
    switch(this.hc) {
      case 0:
        if (b.g.J === this) {
          c = b.g.D;
        } else {
          throw new P(`Cannot convert argument of type ${b.g.J ? b.g.J.name : b.g.u.name} to parameter type ${this.name}`);
        }
        break;
      case 1:
        c = b.g.D;
        break;
      case 2:
        if (b.g.J === this) {
          c = b.g.D;
        } else {
          var d = b.clone();
          c = this.cc(c, ac(() => d["delete"]()));
          null !== a && a.push(this.O, c);
        }
        break;
      default:
        throw new P("Unsupporting sharing policy");
    }
  }
  return c;
}
function Mc(a, b) {
  if (null === b) {
    if (this.Ra) {
      throw new P(`null is not a valid ${this.name}`);
    }
    return 0;
  }
  if (!b.g) {
    throw new P(`Cannot pass "${Kc(b)}" as a ${this.name}`);
  }
  if (!b.g.o) {
    throw new P(`Cannot pass deleted object as a pointer of type ${this.name}`);
  }
  if (b.g.u.ua) {
    throw new P(`Cannot convert argument of type ${b.g.u.name} to parameter type ${this.name}`);
  }
  return Ic(b.g.o, b.g.u.i, this.i);
}
function Nc(a, b, c, d, e, f, g, k, p, m, t) {
  this.name = a;
  this.i = b;
  this.Ra = c;
  this.ua = d;
  this.va = e;
  this.bc = f;
  this.hc = g;
  this.qb = k;
  this.Ta = p;
  this.cc = m;
  this.O = t;
  e || void 0 !== b.B ? this.toWireType = Lc : (this.toWireType = d ? Jc : Mc, this.L = null);
}
var Oc = (a, b, c) => {
  if (!l.hasOwnProperty(a)) {
    throw new tc("Replacing nonexistent public symbol");
  }
  void 0 !== l[a].A && void 0 !== c ? l[a].A[c] = b : (l[a] = b, l[a].fa = c);
}, Pc = [], Qc, Rc = a => {
  var b = Pc[a];
  b || (a >= Pc.length && (Pc.length = a + 1), Pc[a] = b = Qc.get(a));
  return b;
}, Sc = (a, b, c = []) => {
  a.includes("j") ? (a = a.replace(/p/g, "i"), b = (0,l["dynCall_" + a])(b, ...c)) : b = Rc(b)(...c);
  return b;
}, Tc = (a, b) => (...c) => Sc(a, b, c), U = (a, b) => {
  a = R(a);
  var c = a.includes("j") ? Tc(a, b) : Rc(b);
  if ("function" != typeof c) {
    throw new P(`unknown function pointer with signature ${a}: ${b}`);
  }
  return c;
}, Uc, Vc = (a, b) => {
  function c(f) {
    e[f] || jc[f] || (Ac[f] ? Ac[f].forEach(c) : (d.push(f), e[f] = !0));
  }
  var d = [], e = {};
  b.forEach(c);
  throw new Uc(`${a}: ` + d.map(mc).join([", "]));
};
function Wc(a) {
  for (var b = 1; b < a.length; ++b) {
    if (null !== a[b] && void 0 === a[b].L) {
      return !0;
    }
  }
  return !1;
}
function Xc(a, b, c, d, e) {
  var f = b.length;
  if (2 > f) {
    throw new P("argTypes array size mismatch! Must at least get return value and 'this' types!");
  }
  var g = null !== b[1] && null !== c, k = Wc(b), p = "void" !== b[0].name, m = f - 2, t = Array(m), v = [], x = [];
  return Zb(a, function(...n) {
    if (n.length !== m) {
      throw new P(`function ${a} called with ${n.length} arguments, expected ${m}`);
    }
    x.length = 0;
    v.length = g ? 2 : 1;
    v[0] = e;
    if (g) {
      var r = b[1].toWireType(x, this);
      v[1] = r;
    }
    for (var u = 0; u < m; ++u) {
      t[u] = b[u + 2].toWireType(x, n[u]), v.push(t[u]);
    }
    n = d(...v);
    if (k) {
      xc(x);
    } else {
      for (u = g ? 1 : 2; u < b.length; u++) {
        var z = 1 === u ? r : t[u - 2];
        null !== b[u].L && b[u].L(z);
      }
    }
    r = p ? b[0].fromWireType(n) : void 0;
    return r;
  });
}
var Yc = (a, b) => {
  for (var c = [], d = 0; d < a; d++) {
    c.push(G[b + 4 * d >> 2]);
  }
  return c;
}, Zc = a => {
  a = a.trim();
  const b = a.indexOf("(");
  return -1 !== b ? a.substr(0, b) : a;
}, $c = (a, b, c) => {
  if (!(a instanceof Object)) {
    throw new P(`${c} with invalid "this": ${a}`);
  }
  if (!(a instanceof b.i.constructor)) {
    throw new P(`${c} incompatible with "this" of type ${a.constructor.name}`);
  }
  if (!a.g.o) {
    throw new P(`cannot call emscripten binding method ${c} on deleted object`);
  }
  return Ic(a.g.o, a.g.u.i, b.i);
}, ad = a => {
  9 < a && 0 === --O[a + 1] && (O[a] = void 0, $b.push(a));
}, bd = {name:"emscripten::val", fromWireType:a => {
  var b = Q(a);
  ad(a);
  return b;
}, toWireType:(a, b) => ac(b), argPackAdvance:8, readValueFromPointer:yc, L:null,}, cd = (a, b, c) => {
  switch(b) {
    case 1:
      return c ? function(d) {
        return this.fromWireType(B[d]);
      } : function(d) {
        return this.fromWireType(D[d]);
      };
    case 2:
      return c ? function(d) {
        return this.fromWireType(E[d >> 1]);
      } : function(d) {
        return this.fromWireType(wa[d >> 1]);
      };
    case 4:
      return c ? function(d) {
        return this.fromWireType(F[d >> 2]);
      } : function(d) {
        return this.fromWireType(G[d >> 2]);
      };
    default:
      throw new TypeError(`invalid integer width (${b}): ${a}`);
  }
}, Kc = a => {
  if (null === a) {
    return "null";
  }
  var b = typeof a;
  return "object" === b || "array" === b || "function" === b ? a.toString() : "" + a;
}, dd = (a, b) => {
  switch(b) {
    case 4:
      return function(c) {
        return this.fromWireType(xa[c >> 2]);
      };
    case 8:
      return function(c) {
        return this.fromWireType(ya[c >> 3]);
      };
    default:
      throw new TypeError(`invalid float width (${b}): ${a}`);
  }
}, ed = (a, b, c) => {
  switch(b) {
    case 1:
      return c ? d => B[d] : d => D[d];
    case 2:
      return c ? d => E[d >> 1] : d => wa[d >> 1];
    case 4:
      return c ? d => F[d >> 2] : d => G[d >> 2];
    default:
      throw new TypeError(`invalid integer width (${b}): ${a}`);
  }
}, fd = "undefined" != typeof TextDecoder ? new TextDecoder("utf-16le") : void 0, gd = (a, b) => {
  var c = a >> 1;
  for (var d = c + b / 2; !(c >= d) && wa[c];) {
    ++c;
  }
  c <<= 1;
  if (32 < c - a && fd) {
    return fd.decode(D.subarray(a, c));
  }
  c = "";
  for (d = 0; !(d >= b / 2); ++d) {
    var e = E[a + 2 * d >> 1];
    if (0 == e) {
      break;
    }
    c += String.fromCharCode(e);
  }
  return c;
}, hd = (a, b, c) => {
  c ??= 2147483647;
  if (2 > c) {
    return 0;
  }
  c -= 2;
  var d = b;
  c = c < 2 * a.length ? c / 2 : a.length;
  for (var e = 0; e < c; ++e) {
    E[b >> 1] = a.charCodeAt(e), b += 2;
  }
  E[b >> 1] = 0;
  return b - d;
}, jd = a => 2 * a.length, kd = (a, b) => {
  for (var c = 0, d = ""; !(c >= b / 4);) {
    var e = F[a + 4 * c >> 2];
    if (0 == e) {
      break;
    }
    ++c;
    65536 <= e ? (e -= 65536, d += String.fromCharCode(55296 | e >> 10, 56320 | e & 1023)) : d += String.fromCharCode(e);
  }
  return d;
}, ld = (a, b, c) => {
  c ??= 2147483647;
  if (4 > c) {
    return 0;
  }
  var d = b;
  c = d + c - 4;
  for (var e = 0; e < a.length; ++e) {
    var f = a.charCodeAt(e);
    if (55296 <= f && 57343 >= f) {
      var g = a.charCodeAt(++e);
      f = 65536 + ((f & 1023) << 10) | g & 1023;
    }
    F[b >> 2] = f;
    b += 4;
    if (b + 4 > c) {
      break;
    }
  }
  F[b >> 2] = 0;
  return b - d;
}, md = a => {
  for (var b = 0, c = 0; c < a.length; ++c) {
    var d = a.charCodeAt(c);
    55296 <= d && 57343 >= d && ++c;
    b += 4;
  }
  return b;
}, nd = (a, b, c) => {
  var d = [];
  a = a.toWireType(d, c);
  d.length && (G[b >> 2] = ac(d));
  return a;
}, od = [], pd = {}, qd = a => {
  var b = pd[a];
  return void 0 === b ? R(a) : b;
}, rd = a => {
  var b = od.length;
  od.push(a);
  return b;
}, sd = (a, b) => {
  for (var c = Array(a), d = 0; d < a; ++d) {
    c[d] = nc(G[b + 4 * d >> 2], "parameter " + d);
  }
  return c;
}, td = Reflect.construct, ud = a => 0 === a % 4 && (0 !== a % 100 || 0 === a % 400), vd = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335], wd = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], xd = [], yd = a => {
  a.Dc = a.getExtension("WEBGL_draw_instanced_base_vertex_base_instance");
}, zd = a => {
  a.Lc = a.getExtension("WEBGL_multi_draw_instanced_base_vertex_base_instance");
}, Ad = a => {
  var b = "EXT_color_buffer_float EXT_conservative_depth EXT_disjoint_timer_query_webgl2 EXT_texture_norm16 NV_shader_noperspective_interpolation WEBGL_clip_cull_distance EXT_color_buffer_half_float EXT_depth_clamp EXT_float_blend EXT_texture_compression_bptc EXT_texture_compression_rgtc EXT_texture_filter_anisotropic KHR_parallel_shader_compile OES_texture_float_linear WEBGL_blend_func_extended WEBGL_compressed_texture_astc WEBGL_compressed_texture_etc WEBGL_compressed_texture_etc1 WEBGL_compressed_texture_s3tc WEBGL_compressed_texture_s3tc_srgb WEBGL_debug_renderer_info WEBGL_debug_shaders WEBGL_lose_context WEBGL_multi_draw".split(" ");
  return (a.getSupportedExtensions() || []).filter(c => b.includes(c));
}, Bd = 1, Cd = [], V = [], Dd = [], Ed = [], Fd = [], Gd = [], Hd = [], w = [], Id = {}, Jd = 4, Kd = 0, Ld = a => {
  for (var b = Bd++, c = a.length; c < b; c++) {
    a[c] = null;
  }
  return b;
}, Md = (a, b, c, d) => {
  for (var e = 0; e < a; e++) {
    var f = W[c](), g = f && Ld(d);
    f ? (f.name = g, d[g] = f) : X ||= 1282;
    F[b + 4 * e >> 2] = g;
  }
}, ka = (a, b) => {
  var c = Ld(w), d = {handle:c, attributes:b, version:b.Kc, F:a};
  a.canvas && (a.canvas.zb = d);
  w[c] = d;
  ("undefined" == typeof b.Kb || b.Kb) && Nd(d);
  return c;
}, la = a => {
  q = w[a];
  l.Bc = W = q?.F;
  return !(a && !W);
}, Nd = a => {
  a ||= q;
  if (!a.Ub) {
    a.Ub = !0;
    var b = a.F;
    yd(b);
    zd(b);
    2 <= a.version && (b.cb = b.getExtension("EXT_disjoint_timer_query_webgl2"));
    if (2 > a.version || !b.cb) {
      b.cb = b.getExtension("EXT_disjoint_timer_query");
    }
    b.$b = b.getExtension("WEBGL_multi_draw");
    Ad(b).forEach(c => {
      c.includes("lose_context") || c.includes("debug") || b.getExtension(c);
    });
  }
}, X, q, Od = {}, Qd = () => {
  if (!Pd) {
    var a = {USER:"web_user", LOGNAME:"web_user", PATH:"/", PWD:"/", HOME:"/home/web_user", LANG:("object" == typeof navigator && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8", _:na || "./this.program"}, b;
    for (b in Od) {
      void 0 === Od[b] ? delete a[b] : a[b] = Od[b];
    }
    var c = [];
    for (b in a) {
      c.push(`${b}=${a[b]}`);
    }
    Pd = c;
  }
  return Pd;
}, Pd, Rd = [];
function Sd() {
  var a = Ad(W);
  return a = a.concat(a.map(b => "GL_" + b));
}
var Td = (a, b) => {
  if (b) {
    var c = void 0;
    switch(a) {
      case 36346:
        c = 1;
        break;
      case 36344:
        return;
      case 34814:
      case 36345:
        c = 0;
        break;
      case 34466:
        var d = W.getParameter(34467);
        c = d ? d.length : 0;
        break;
      case 33309:
        if (2 > q.version) {
          X ||= 1282;
          return;
        }
        c = Sd().length;
        break;
      case 33307:
      case 33308:
        if (2 > q.version) {
          X ||= 1280;
          return;
        }
        c = 33307 == a ? 3 : 0;
    }
    if (void 0 === c) {
      switch(d = W.getParameter(a), typeof d) {
        case "number":
          c = d;
          break;
        case "boolean":
          c = d ? 1 : 0;
          break;
        case "string":
          X ||= 1280;
          return;
        case "object":
          if (null === d) {
            switch(a) {
              case 34964:
              case 35725:
              case 34965:
              case 36006:
              case 36007:
              case 32873:
              case 34229:
              case 36662:
              case 36663:
              case 35053:
              case 35055:
              case 36010:
              case 35097:
              case 35869:
              case 32874:
              case 36389:
              case 35983:
              case 35368:
              case 34068:
                c = 0;
                break;
              default:
                X ||= 1280;
                return;
            }
          } else {
            if (d instanceof Float32Array || d instanceof Uint32Array || d instanceof Int32Array || d instanceof Array) {
              for (a = 0; a < d.length; ++a) {
                F[b + 4 * a >> 2] = d[a];
              }
              return;
            }
            try {
              c = d.name | 0;
            } catch (e) {
              X ||= 1280;
              sa(`GL_INVALID_ENUM in glGet${0}v: Unknown object returned from WebGL getParameter(${a})! (error: ${e})`);
              return;
            }
          }
          break;
        default:
          X ||= 1280;
          sa(`GL_INVALID_ENUM in glGet${0}v: Native code calling glGet${0}v(${a}) and it returns ${d} of type ${typeof d}!`);
          return;
      }
    }
    F[b >> 2] = c;
  } else {
    X ||= 1281;
  }
}, Vd = a => {
  var b = fb(a) + 1, c = Ud(b);
  c && gb(a, D, c, b);
  return c;
}, Wd = a => "]" == a.slice(-1) && a.lastIndexOf("["), Xd = a => {
  a -= 5120;
  return 0 == a ? B : 1 == a ? D : 2 == a ? E : 4 == a ? F : 6 == a ? xa : 5 == a || 28922 == a || 28520 == a || 30779 == a || 30782 == a ? G : wa;
}, Yd = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], Zd = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], $d = (a, b, c, d) => {
  function e(n, r, u) {
    for (n = "number" == typeof n ? n.toString() : n || ""; n.length < r;) {
      n = u[0] + n;
    }
    return n;
  }
  function f(n, r) {
    return e(n, r, "0");
  }
  function g(n, r) {
    function u(A) {
      return 0 > A ? -1 : 0 < A ? 1 : 0;
    }
    var z;
    0 === (z = u(n.getFullYear() - r.getFullYear())) && 0 === (z = u(n.getMonth() - r.getMonth())) && (z = u(n.getDate() - r.getDate()));
    return z;
  }
  function k(n) {
    switch(n.getDay()) {
      case 0:
        return new Date(n.getFullYear() - 1, 11, 29);
      case 1:
        return n;
      case 2:
        return new Date(n.getFullYear(), 0, 3);
      case 3:
        return new Date(n.getFullYear(), 0, 2);
      case 4:
        return new Date(n.getFullYear(), 0, 1);
      case 5:
        return new Date(n.getFullYear() - 1, 11, 31);
      case 6:
        return new Date(n.getFullYear() - 1, 11, 30);
    }
  }
  function p(n) {
    var r = n.ba;
    for (n = new Date((new Date(n.ca + 1900, 0, 1)).getTime()); 0 < r;) {
      var u = n.getMonth(), z = (ud(n.getFullYear()) ? Yd : Zd)[u];
      if (r > z - n.getDate()) {
        r -= z - n.getDate() + 1, n.setDate(1), 11 > u ? n.setMonth(u + 1) : (n.setMonth(0), n.setFullYear(n.getFullYear() + 1));
      } else {
        n.setDate(n.getDate() + r);
        break;
      }
    }
    u = new Date(n.getFullYear() + 1, 0, 4);
    r = k(new Date(n.getFullYear(), 0, 4));
    u = k(u);
    return 0 >= g(r, n) ? 0 >= g(u, n) ? n.getFullYear() + 1 : n.getFullYear() : n.getFullYear() - 1;
  }
  var m = G[d + 40 >> 2];
  d = {kc:F[d >> 2], jc:F[d + 4 >> 2], Ha:F[d + 8 >> 2], Va:F[d + 12 >> 2], Ia:F[d + 16 >> 2], ca:F[d + 20 >> 2], R:F[d + 24 >> 2], ba:F[d + 28 >> 2], Sc:F[d + 32 >> 2], ic:F[d + 36 >> 2], lc:m ? m ? L(D, m) : "" : ""};
  c = c ? L(D, c) : "";
  m = {"%c":"%a %b %d %H:%M:%S %Y", "%D":"%m/%d/%y", "%F":"%Y-%m-%d", "%h":"%b", "%r":"%I:%M:%S %p", "%R":"%H:%M", "%T":"%H:%M:%S", "%x":"%m/%d/%y", "%X":"%H:%M:%S", "%Ec":"%c", "%EC":"%C", "%Ex":"%m/%d/%y", "%EX":"%H:%M:%S", "%Ey":"%y", "%EY":"%Y", "%Od":"%d", "%Oe":"%e", "%OH":"%H", "%OI":"%I", "%Om":"%m", "%OM":"%M", "%OS":"%S", "%Ou":"%u", "%OU":"%U", "%OV":"%V", "%Ow":"%w", "%OW":"%W", "%Oy":"%y",};
  for (var t in m) {
    c = c.replace(new RegExp(t, "g"), m[t]);
  }
  var v = "Sunday Monday Tuesday Wednesday Thursday Friday Saturday".split(" "), x = "January February March April May June July August September October November December".split(" ");
  m = {"%a":n => v[n.R].substring(0, 3), "%A":n => v[n.R], "%b":n => x[n.Ia].substring(0, 3), "%B":n => x[n.Ia], "%C":n => f((n.ca + 1900) / 100 | 0, 2), "%d":n => f(n.Va, 2), "%e":n => e(n.Va, 2, " "), "%g":n => p(n).toString().substring(2), "%G":p, "%H":n => f(n.Ha, 2), "%I":n => {
    n = n.Ha;
    0 == n ? n = 12 : 12 < n && (n -= 12);
    return f(n, 2);
  }, "%j":n => {
    for (var r = 0, u = 0; u <= n.Ia - 1; r += (ud(n.ca + 1900) ? Yd : Zd)[u++]) {
    }
    return f(n.Va + r, 3);
  }, "%m":n => f(n.Ia + 1, 2), "%M":n => f(n.jc, 2), "%n":() => "\n", "%p":n => 0 <= n.Ha && 12 > n.Ha ? "AM" : "PM", "%S":n => f(n.kc, 2), "%t":() => "\t", "%u":n => n.R || 7, "%U":n => f(Math.floor((n.ba + 7 - n.R) / 7), 2), "%V":n => {
    var r = Math.floor((n.ba + 7 - (n.R + 6) % 7) / 7);
    2 >= (n.R + 371 - n.ba - 2) % 7 && r++;
    if (r) {
      53 == r && (u = (n.R + 371 - n.ba) % 7, 4 == u || 3 == u && ud(n.ca) || (r = 1));
    } else {
      r = 52;
      var u = (n.R + 7 - n.ba - 1) % 7;
      (4 == u || 5 == u && ud(n.ca % 400 - 1)) && r++;
    }
    return f(r, 2);
  }, "%w":n => n.R, "%W":n => f(Math.floor((n.ba + 7 - (n.R + 6) % 7) / 7), 2), "%y":n => (n.ca + 1900).toString().substring(2), "%Y":n => n.ca + 1900, "%z":n => {
    n = n.ic;
    var r = 0 <= n;
    n = Math.abs(n) / 60;
    return (r ? "+" : "-") + String("0000" + (n / 60 * 100 + n % 60)).slice(-4);
  }, "%Z":n => n.lc, "%%":() => "%"};
  c = c.replace(/%%/g, "\x00\x00");
  for (t in m) {
    c.includes(t) && (c = c.replace(new RegExp(t, "g"), m[t](d)));
  }
  c = c.replace(/\0\0/g, "%");
  t = hb(c, !1);
  if (t.length > b) {
    return 0;
  }
  B.set(t, a);
  return t.length - 1;
};
[44].forEach(a => {
  sb[a] = new M(a);
  sb[a].stack = "<generic error, no stack>";
});
zb = Array(4096);
Nb(N, "/");
Pb("/tmp");
Pb("/home");
Pb("/home/web_user");
(function() {
  Pb("/dev");
  kb(259, {read:() => 0, write:(d, e, f, g) => g,});
  Qb("/dev/null", 259);
  jb(1280, mb);
  jb(1536, nb);
  Qb("/dev/tty", 1280);
  Qb("/dev/tty1", 1536);
  var a = new Uint8Array(1024), b = 0, c = () => {
    0 === b && (b = bb(a).byteLength);
    return a[--b];
  };
  Wb("random", c);
  Wb("urandom", c);
  Pb("/dev/shm");
  Pb("/dev/shm/tmp");
})();
(function() {
  Pb("/proc");
  var a = Pb("/proc/self");
  Pb("/proc/self/fd");
  Nb({U() {
    var b = rb(a, "fd", 16895, 73);
    b.j = {ka(c, d) {
      var e = Kb(+d);
      c = {parent:null, U:{kb:"fake"}, j:{la:() => e.path},};
      return c.parent = c;
    }};
    return b;
  }}, "/proc/self/fd");
})();
P = l.BindingError = class extends Error {
  constructor(a) {
    super(a);
    this.name = "BindingError";
  }
};
O.push(0, 1, void 0, 1, null, 1, !0, 1, !1, 1,);
l.count_emval_handles = () => O.length / 2 - 5 - $b.length;
cc = l.PureVirtualError = bc("PureVirtualError");
for (var ae = Array(256), be = 0; 256 > be; ++be) {
  ae[be] = String.fromCharCode(be);
}
dc = ae;
l.getInheritedInstanceCount = () => Object.keys(hc).length;
l.getLiveInheritedInstances = () => {
  var a = [], b;
  for (b in hc) {
    hc.hasOwnProperty(b) && a.push(hc[b]);
  }
  return a;
};
l.flushPendingDeletes = fc;
l.setDelayFunction = a => {
  gc = a;
  ec.length && gc && gc(fc);
};
tc = l.InternalError = class extends Error {
  constructor(a) {
    super(a);
    this.name = "InternalError";
  }
};
Object.assign(Dc.prototype, {isAliasOf:function(a) {
  if (!(this instanceof Dc && a instanceof Dc)) {
    return !1;
  }
  var b = this.g.u.i, c = this.g.o;
  a.g = a.g;
  var d = a.g.u.i;
  for (a = a.g.o; b.B;) {
    c = b.na(c), b = b.B;
  }
  for (; d.B;) {
    a = d.na(a), d = d.B;
  }
  return b === d && c === a;
}, clone:function() {
  this.g.o || Cc(this);
  if (this.g.ia) {
    return this.g.count.value += 1, this;
  }
  var a = uc, b = Object, c = b.create, d = Object.getPrototypeOf(this), e = this.g;
  a = a(c.call(b, d, {g:{value:{count:e.count, ga:e.ga, ia:e.ia, o:e.o, u:e.u, D:e.D, J:e.J,},}}));
  a.g.count.value += 1;
  a.g.ga = !1;
  return a;
}, ["delete"]() {
  this.g.o || Cc(this);
  if (this.g.ga && !this.g.ia) {
    throw new P("Object already scheduled for deletion");
  }
  oc(this);
  var a = this.g;
  --a.count.value;
  0 === a.count.value && (a.D ? a.J.O(a.D) : a.u.i.O(a.o));
  this.g.ia || (this.g.D = void 0, this.g.o = void 0);
}, isDeleted:function() {
  return !this.g.o;
}, deleteLater:function() {
  this.g.o || Cc(this);
  if (this.g.ga && !this.g.ia) {
    throw new P("Object already scheduled for deletion");
  }
  ec.push(this);
  1 === ec.length && gc && gc(fc);
  this.g.ga = !0;
  return this;
},});
Object.assign(Nc.prototype, {Pb(a) {
  this.qb && (a = this.qb(a));
  return a;
}, bb(a) {
  this.O?.(a);
}, argPackAdvance:8, readValueFromPointer:yc, fromWireType:function(a) {
  function b() {
    return this.va ? vc(this.i.M, {u:this.bc, o:c, J:this, D:a,}) : vc(this.i.M, {u:this, o:a,});
  }
  var c = this.Pb(a);
  if (!c) {
    return this.bb(a), null;
  }
  var d = sc(this.i, c);
  if (void 0 !== d) {
    if (0 === d.g.count.value) {
      return d.g.o = c, d.g.D = a, d.clone();
    }
    d = d.clone();
    this.bb(a);
    return d;
  }
  d = this.i.Ob(c);
  d = rc[d];
  if (!d) {
    return b.call(this);
  }
  d = this.ua ? d.Hb : d.pointerType;
  var e = qc(c, this.i, d.i);
  return null === e ? b.call(this) : this.va ? vc(d.i.M, {u:d, o:e, J:this, D:a,}) : vc(d.i.M, {u:d, o:e,});
},});
Uc = l.UnboundTypeError = bc("UnboundTypeError");
for (var W, ce = 0; 32 > ce; ++ce) {
  Rd.push(Array(ce));
}
var ee = {__syscall_fcntl64:function(a, b, c) {
  Wa = c;
  try {
    var d = Kb(a);
    switch(b) {
      case 0:
        var e = Va();
        if (0 > e) {
          break;
        }
        for (; xb[e];) {
          e++;
        }
        return Mb(d, e).W;
      case 1:
      case 2:
        return 0;
      case 3:
        return d.flags;
      case 4:
        return e = Va(), d.flags |= e, 0;
      case 12:
        return e = Va(), E[e + 0 >> 1] = 2, 0;
      case 13:
      case 14:
        return 0;
    }
    return -28;
  } catch (f) {
    if ("undefined" == typeof Yb || "ErrnoError" !== f.name) {
      throw f;
    }
    return -f.$;
  }
}, __syscall_ioctl:function(a, b, c) {
  Wa = c;
  try {
    var d = Kb(a);
    switch(b) {
      case 21509:
        return d.s ? 0 : -59;
      case 21505:
        if (!d.s) {
          return -59;
        }
        if (d.s.V.Wb) {
          a = [3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,];
          var e = Va();
          F[e >> 2] = 25856;
          F[e + 4 >> 2] = 5;
          F[e + 8 >> 2] = 191;
          F[e + 12 >> 2] = 35387;
          for (var f = 0; 32 > f; f++) {
            B[e + f + 17] = a[f] || 0;
          }
        }
        return 0;
      case 21510:
      case 21511:
      case 21512:
        return d.s ? 0 : -59;
      case 21506:
      case 21507:
      case 21508:
        if (!d.s) {
          return -59;
        }
        if (d.s.V.Xb) {
          for (e = Va(), a = [], f = 0; 32 > f; f++) {
            a.push(B[e + f + 17]);
          }
        }
        return 0;
      case 21519:
        if (!d.s) {
          return -59;
        }
        e = Va();
        return F[e >> 2] = 0;
      case 21520:
        return d.s ? -28 : -59;
      case 21531:
        e = Va();
        if (!d.m.Vb) {
          throw new M(59);
        }
        return d.m.Vb(d, b, e);
      case 21523:
        if (!d.s) {
          return -59;
        }
        d.s.V.Yb && (f = [24, 80], e = Va(), E[e >> 1] = f[0], E[e + 2 >> 1] = f[1]);
        return 0;
      case 21524:
        return d.s ? 0 : -59;
      case 21515:
        return d.s ? 0 : -59;
      default:
        return -28;
    }
  } catch (g) {
    if ("undefined" == typeof Yb || "ErrnoError" !== g.name) {
      throw g;
    }
    return -g.$;
  }
}, __syscall_openat:function(a, b, c, d) {
  Wa = d;
  try {
    b = b ? L(D, b) : "";
    var e = b;
    if ("/" === e.charAt(0)) {
      b = e;
    } else {
      var f = -100 === a ? "/" : Kb(a).path;
      if (0 == e.length) {
        throw new M(44);
      }
      b = Ya(f + "/" + e);
    }
    var g = d ? Va() : 0;
    return Sb(b, c, g).W;
  } catch (k) {
    if ("undefined" == typeof Yb || "ErrnoError" !== k.name) {
      throw k;
    }
    return -k.$;
  }
}, _abort_js:() => {
  Ha("");
}, _embind_create_inheriting_constructor:(a, b, c) => {
  a = R(a);
  b = nc(b, "wrapper");
  c = Q(c);
  var d = b.i, e = d.M, f = d.B.M, g = d.B.constructor;
  a = Zb(a, function(...k) {
    d.B.ob.forEach(function(p) {
      if (this[p] === f[p]) {
        throw new cc(`Pure virtual function ${p} must be implemented in JavaScript`);
      }
    }.bind(this));
    Object.defineProperty(this, "__parent", {value:e});
    this.__construct(...k);
  });
  e.__construct = function(...k) {
    if (this === e) {
      throw new P("Pass correct 'this' to __construct");
    }
    k = g.implement(this, ...k);
    oc(k);
    var p = k.g;
    k.notifyOnDestruction();
    p.ia = !0;
    Object.defineProperties(this, {g:{value:p}});
    uc(this);
    k = p.o;
    k = ic(d, k);
    if (hc.hasOwnProperty(k)) {
      throw new P(`Tried to register registered instance: ${k}`);
    }
    hc[k] = this;
  };
  e.__destruct = function() {
    if (this === e) {
      throw new P("Pass correct 'this' to __destruct");
    }
    oc(this);
    var k = this.g.o;
    k = ic(d, k);
    if (hc.hasOwnProperty(k)) {
      delete hc[k];
    } else {
      throw new P(`Tried to unregister unregistered instance: ${k}`);
    }
  };
  a.prototype = Object.create(e);
  Object.assign(a.prototype, c);
  return ac(a);
}, _embind_finalize_value_object:a => {
  var b = wc[a];
  delete wc[a];
  var c = b.Ta, d = b.O, e = b.eb, f = e.map(g => g.Sb).concat(e.map(g => g.ec));
  T([a], f, g => {
    var k = {};
    e.forEach((p, m) => {
      var t = g[m], v = p.Qb, x = p.Rb, n = g[m + e.length], r = p.dc, u = p.fc;
      k[p.Mb] = {read:z => t.fromWireType(v(x, z)), write:(z, A) => {
        var C = [];
        r(u, z, n.toWireType(C, A));
        xc(C);
      }};
    });
    return [{name:b.name, fromWireType:p => {
      var m = {}, t;
      for (t in k) {
        m[t] = k[t].read(p);
      }
      d(p);
      return m;
    }, toWireType:(p, m) => {
      for (var t in k) {
        if (!(t in m)) {
          throw new TypeError(`Missing field: "${t}"`);
        }
      }
      var v = c();
      for (t in k) {
        k[t].write(v, m[t]);
      }
      null !== p && p.push(d, v);
      return v;
    }, argPackAdvance:8, readValueFromPointer:yc, L:d,}];
  });
}, _embind_register_bigint:() => {
}, _embind_register_bool:(a, b, c, d) => {
  b = R(b);
  S(a, {name:b, fromWireType:function(e) {
    return !!e;
  }, toWireType:function(e, f) {
    return f ? c : d;
  }, argPackAdvance:8, readValueFromPointer:function(e) {
    return this.fromWireType(D[e]);
  }, L:null,});
}, _embind_register_class:(a, b, c, d, e, f, g, k, p, m, t, v, x) => {
  t = R(t);
  f = U(e, f);
  k &&= U(g, k);
  m &&= U(p, m);
  x = U(v, x);
  var n = Gc(t);
  Fc(n, function() {
    Vc(`Cannot construct ${t} due to unbound types`, [d]);
  });
  T([a, b, c], d ? [d] : [], r => {
    r = r[0];
    if (d) {
      var u = r.i;
      var z = u.M;
    } else {
      z = Dc.prototype;
    }
    r = Zb(t, function(...J) {
      if (Object.getPrototypeOf(this) !== A) {
        throw new P("Use 'new' to construct " + t);
      }
      if (void 0 === C.Z) {
        throw new P(t + " has no accessible constructor");
      }
      var K = C.Z[J.length];
      if (void 0 === K) {
        throw new P(`Tried to invoke ctor of ${t} with invalid number of parameters (${J.length}) - expected (${Object.keys(C.Z).toString()}) parameters instead!`);
      }
      return K.apply(this, J);
    });
    var A = Object.create(z, {constructor:{value:r},});
    r.prototype = A;
    var C = new Hc(t, r, A, x, u, f, k, m);
    if (C.B) {
      var H;
      (H = C.B).oa ?? (H.oa = []);
      C.B.oa.push(C);
    }
    u = new Nc(t, C, !0, !1, !1);
    H = new Nc(t + "*", C, !1, !1, !1);
    z = new Nc(t + " const*", C, !1, !0, !1);
    rc[a] = {pointerType:H, Hb:z};
    Oc(n, r);
    return [u, H, z];
  });
}, _embind_register_class_class_function:(a, b, c, d, e, f, g) => {
  var k = Yc(c, d);
  b = R(b);
  b = Zc(b);
  f = U(e, f);
  T([], [a], p => {
    function m() {
      Vc(`Cannot call ${t} due to unbound types`, k);
    }
    p = p[0];
    var t = `${p.name}.${b}`;
    b.startsWith("@@") && (b = Symbol[b.substring(2)]);
    var v = p.i.constructor;
    void 0 === v[b] ? (m.fa = c - 1, v[b] = m) : (Ec(v, b, t), v[b].A[c - 1] = m);
    T([], k, x => {
      x = Xc(t, [x[0], null].concat(x.slice(1)), null, f, g);
      void 0 === v[b].A ? (x.fa = c - 1, v[b] = x) : v[b].A[c - 1] = x;
      if (p.i.oa) {
        for (const n of p.i.oa) {
          n.constructor.hasOwnProperty(b) || (n.constructor[b] = x);
        }
      }
      return [];
    });
    return [];
  });
}, _embind_register_class_class_property:(a, b, c, d, e, f, g, k) => {
  b = R(b);
  f = U(e, f);
  T([], [a], p => {
    p = p[0];
    var m = `${p.name}.${b}`, t = {get() {
      Vc(`Cannot access ${m} due to unbound types`, [c]);
    }, enumerable:!0, configurable:!0};
    t.set = k ? () => {
      Vc(`Cannot access ${m} due to unbound types`, [c]);
    } : () => {
      throw new P(`${m} is a read-only property`);
    };
    Object.defineProperty(p.i.constructor, b, t);
    T([], [c], v => {
      v = v[0];
      var x = {get() {
        return v.fromWireType(f(d));
      }, enumerable:!0};
      k && (k = U(g, k), x.set = n => {
        var r = [];
        k(d, v.toWireType(r, n));
        xc(r);
      });
      Object.defineProperty(p.i.constructor, b, x);
      return [];
    });
    return [];
  });
}, _embind_register_class_constructor:(a, b, c, d, e, f) => {
  var g = Yc(b, c);
  e = U(d, e);
  T([], [a], k => {
    k = k[0];
    var p = `constructor ${k.name}`;
    void 0 === k.i.Z && (k.i.Z = []);
    if (void 0 !== k.i.Z[b - 1]) {
      throw new P(`Cannot register multiple constructors with identical number of parameters (${b - 1}) for class '${k.name}'! Overload resolution is currently only performed using the parameter count, not actual type info!`);
    }
    k.i.Z[b - 1] = () => {
      Vc(`Cannot construct ${k.name} due to unbound types`, g);
    };
    T([], g, m => {
      m.splice(1, 0, null);
      k.i.Z[b - 1] = Xc(p, m, null, e, f);
      return [];
    });
    return [];
  });
}, _embind_register_class_function:(a, b, c, d, e, f, g, k) => {
  var p = Yc(c, d);
  b = R(b);
  b = Zc(b);
  f = U(e, f);
  T([], [a], m => {
    function t() {
      Vc(`Cannot call ${v} due to unbound types`, p);
    }
    m = m[0];
    var v = `${m.name}.${b}`;
    b.startsWith("@@") && (b = Symbol[b.substring(2)]);
    k && m.i.ob.push(b);
    var x = m.i.M, n = x[b];
    void 0 === n || void 0 === n.A && n.className !== m.name && n.fa === c - 2 ? (t.fa = c - 2, t.className = m.name, x[b] = t) : (Ec(x, b, v), x[b].A[c - 2] = t);
    T([], p, r => {
      r = Xc(v, r, m, f, g);
      void 0 === x[b].A ? (r.fa = c - 2, x[b] = r) : x[b].A[c - 2] = r;
      return [];
    });
    return [];
  });
}, _embind_register_class_property:(a, b, c, d, e, f, g, k, p, m) => {
  b = R(b);
  e = U(d, e);
  T([], [a], t => {
    t = t[0];
    var v = `${t.name}.${b}`, x = {get() {
      Vc(`Cannot access ${v} due to unbound types`, [c, g]);
    }, enumerable:!0, configurable:!0};
    x.set = p ? () => Vc(`Cannot access ${v} due to unbound types`, [c, g]) : () => {
      throw new P(v + " is a read-only property");
    };
    Object.defineProperty(t.i.M, b, x);
    T([], p ? [c, g] : [c], n => {
      var r = n[0], u = {get() {
        var A = $c(this, t, v + " getter");
        return r.fromWireType(e(f, A));
      }, enumerable:!0};
      if (p) {
        p = U(k, p);
        var z = n[1];
        u.set = function(A) {
          var C = $c(this, t, v + " setter"), H = [];
          p(m, C, z.toWireType(H, A));
          xc(H);
        };
      }
      Object.defineProperty(t.i.M, b, u);
      return [];
    });
    return [];
  });
}, _embind_register_emval:a => S(a, bd), _embind_register_enum:(a, b, c, d) => {
  function e() {
  }
  b = R(b);
  e.values = {};
  S(a, {name:b, constructor:e, fromWireType:function(f) {
    return this.constructor.values[f];
  }, toWireType:(f, g) => g.value, argPackAdvance:8, readValueFromPointer:cd(b, c, d), L:null,});
  Fc(b, e);
}, _embind_register_enum_value:(a, b, c) => {
  var d = nc(a, "enum");
  b = R(b);
  a = d.constructor;
  d = Object.create(d.constructor.prototype, {value:{value:c}, constructor:{value:Zb(`${d.name}_${b}`, function() {
  })},});
  a.values[c] = d;
  a[b] = d;
}, _embind_register_float:(a, b, c) => {
  b = R(b);
  S(a, {name:b, fromWireType:d => d, toWireType:(d, e) => e, argPackAdvance:8, readValueFromPointer:dd(b, c), L:null,});
}, _embind_register_function:(a, b, c, d, e, f) => {
  var g = Yc(b, c);
  a = R(a);
  a = Zc(a);
  e = U(d, e);
  Fc(a, function() {
    Vc(`Cannot call ${a} due to unbound types`, g);
  }, b - 1);
  T([], g, k => {
    Oc(a, Xc(a, [k[0], null].concat(k.slice(1)), null, e, f), b - 1);
    return [];
  });
}, _embind_register_integer:(a, b, c, d, e) => {
  b = R(b);
  -1 === e && (e = 4294967295);
  e = k => k;
  if (0 === d) {
    var f = 32 - 8 * c;
    e = k => k << f >>> f;
  }
  var g = b.includes("unsigned") ? function(k, p) {
    return p >>> 0;
  } : function(k, p) {
    return p;
  };
  S(a, {name:b, fromWireType:e, toWireType:g, argPackAdvance:8, readValueFromPointer:ed(b, c, 0 !== d), L:null,});
}, _embind_register_memory_view:(a, b, c) => {
  function d(f) {
    return new e(B.buffer, G[f + 4 >> 2], G[f >> 2]);
  }
  var e = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array,][b];
  c = R(c);
  S(a, {name:c, fromWireType:d, argPackAdvance:8, readValueFromPointer:d,}, {Tb:!0,});
}, _embind_register_std_string:(a, b) => {
  b = R(b);
  var c = "std::string" === b;
  S(a, {name:b, fromWireType:function(d) {
    var e = G[d >> 2], f = d + 4;
    if (c) {
      for (var g = f, k = 0; k <= e; ++k) {
        var p = f + k;
        if (k == e || 0 == D[p]) {
          g = g ? L(D, g, p - g) : "";
          if (void 0 === m) {
            var m = g;
          } else {
            m += String.fromCharCode(0), m += g;
          }
          g = p + 1;
        }
      }
    } else {
      m = Array(e);
      for (k = 0; k < e; ++k) {
        m[k] = String.fromCharCode(D[f + k]);
      }
      m = m.join("");
    }
    lc(d);
    return m;
  }, toWireType:function(d, e) {
    e instanceof ArrayBuffer && (e = new Uint8Array(e));
    var f = "string" == typeof e;
    if (!(f || e instanceof Uint8Array || e instanceof Uint8ClampedArray || e instanceof Int8Array)) {
      throw new P("Cannot pass non-string to std::string");
    }
    var g = c && f ? fb(e) : e.length;
    var k = Ud(4 + g + 1), p = k + 4;
    G[k >> 2] = g;
    if (c && f) {
      gb(e, D, p, g + 1);
    } else {
      if (f) {
        for (f = 0; f < g; ++f) {
          var m = e.charCodeAt(f);
          if (255 < m) {
            throw lc(p), new P("String has UTF-16 code units that do not fit in 8 bits");
          }
          D[p + f] = m;
        }
      } else {
        for (f = 0; f < g; ++f) {
          D[p + f] = e[f];
        }
      }
    }
    null !== d && d.push(lc, k);
    return k;
  }, argPackAdvance:8, readValueFromPointer:yc, L(d) {
    lc(d);
  },});
}, _embind_register_std_wstring:(a, b, c) => {
  c = R(c);
  if (2 === b) {
    var d = gd;
    var e = hd;
    var f = jd;
    var g = k => wa[k >> 1];
  } else {
    4 === b && (d = kd, e = ld, f = md, g = k => G[k >> 2]);
  }
  S(a, {name:c, fromWireType:k => {
    for (var p = G[k >> 2], m, t = k + 4, v = 0; v <= p; ++v) {
      var x = k + 4 + v * b;
      if (v == p || 0 == g(x)) {
        t = d(t, x - t), void 0 === m ? m = t : (m += String.fromCharCode(0), m += t), t = x + b;
      }
    }
    lc(k);
    return m;
  }, toWireType:(k, p) => {
    if ("string" != typeof p) {
      throw new P(`Cannot pass non-string to C++ string type ${c}`);
    }
    var m = f(p), t = Ud(4 + m + b);
    G[t >> 2] = m / b;
    e(p, t + 4, m + b);
    null !== k && k.push(lc, t);
    return t;
  }, argPackAdvance:8, readValueFromPointer:yc, L(k) {
    lc(k);
  }});
}, _embind_register_value_object:(a, b, c, d, e, f) => {
  wc[a] = {name:R(b), Ta:U(c, d), O:U(e, f), eb:[],};
}, _embind_register_value_object_field:(a, b, c, d, e, f, g, k, p, m) => {
  wc[a].eb.push({Mb:R(b), Sb:c, Qb:U(d, e), Rb:f, ec:g, dc:U(k, p), fc:m,});
}, _embind_register_void:(a, b) => {
  b = R(b);
  S(a, {Ic:!0, name:b, argPackAdvance:0, fromWireType:() => {
  }, toWireType:() => {
  },});
}, _emscripten_get_now_is_monotonic:() => 1, _emscripten_memcpy_js:(a, b, c) => D.copyWithin(a, b, b + c), _emscripten_throw_longjmp:() => {
  throw Infinity;
}, _emval_as:(a, b, c) => {
  a = Q(a);
  b = nc(b, "emval::as");
  return nd(b, c, a);
}, _emval_call:(a, b, c, d) => {
  a = od[a];
  b = Q(b);
  return a(null, b, c, d);
}, _emval_call_method:(a, b, c, d, e) => {
  a = od[a];
  b = Q(b);
  c = qd(c);
  return a(b, b[c], d, e);
}, _emval_decref:ad, _emval_get_method_caller:(a, b, c) => {
  var d = sd(a, b), e = d.shift();
  a--;
  var f = Array(a);
  b = `methodCaller<(${d.map(g => g.name).join(", ")}) => ${e.name}>`;
  return rd(Zb(b, (g, k, p, m) => {
    for (var t = 0, v = 0; v < a; ++v) {
      f[v] = d[v].readValueFromPointer(m + t), t += d[v].argPackAdvance;
    }
    g = 1 === c ? td(k, f) : k.apply(g, f);
    return nd(e, p, g);
  }));
}, _emval_get_property:(a, b) => {
  a = Q(a);
  b = Q(b);
  return ac(a[b]);
}, _emval_incref:a => {
  9 < a && (O[a + 1] += 1);
}, _emval_new_array:() => ac([]), _emval_new_cstring:a => ac(qd(a)), _emval_new_object:() => ac({}), _emval_run_destructors:a => {
  var b = Q(a);
  xc(b);
  ad(a);
}, _emval_set_property:(a, b, c) => {
  a = Q(a);
  b = Q(b);
  c = Q(c);
  a[b] = c;
}, _emval_take_value:(a, b) => {
  a = nc(a, "_emval_take_value");
  a = a.readValueFromPointer(b);
  return ac(a);
}, _gmtime_js:function(a, b, c) {
  a = new Date(1000 * (b + 2097152 >>> 0 < 4194305 - !!a ? (a >>> 0) + 4294967296 * b : NaN));
  F[c >> 2] = a.getUTCSeconds();
  F[c + 4 >> 2] = a.getUTCMinutes();
  F[c + 8 >> 2] = a.getUTCHours();
  F[c + 12 >> 2] = a.getUTCDate();
  F[c + 16 >> 2] = a.getUTCMonth();
  F[c + 20 >> 2] = a.getUTCFullYear() - 1900;
  F[c + 24 >> 2] = a.getUTCDay();
  F[c + 28 >> 2] = (a.getTime() - Date.UTC(a.getUTCFullYear(), 0, 1, 0, 0, 0, 0)) / 864E5 | 0;
}, _localtime_js:function(a, b, c) {
  a = new Date(1000 * (b + 2097152 >>> 0 < 4194305 - !!a ? (a >>> 0) + 4294967296 * b : NaN));
  F[c >> 2] = a.getSeconds();
  F[c + 4 >> 2] = a.getMinutes();
  F[c + 8 >> 2] = a.getHours();
  F[c + 12 >> 2] = a.getDate();
  F[c + 16 >> 2] = a.getMonth();
  F[c + 20 >> 2] = a.getFullYear() - 1900;
  F[c + 24 >> 2] = a.getDay();
  F[c + 28 >> 2] = (ud(a.getFullYear()) ? vd : wd)[a.getMonth()] + a.getDate() - 1 | 0;
  F[c + 36 >> 2] = -(60 * a.getTimezoneOffset());
  b = (new Date(a.getFullYear(), 6, 1)).getTimezoneOffset();
  var d = (new Date(a.getFullYear(), 0, 1)).getTimezoneOffset();
  F[c + 32 >> 2] = (b != d && a.getTimezoneOffset() == Math.min(d, b)) | 0;
}, _tzset_js:(a, b, c, d) => {
  var e = (new Date()).getFullYear(), f = new Date(e, 0, 1), g = new Date(e, 6, 1);
  e = f.getTimezoneOffset();
  var k = g.getTimezoneOffset();
  G[a >> 2] = 60 * Math.max(e, k);
  F[b >> 2] = Number(e != k);
  a = p => p.toLocaleTimeString(void 0, {hour12:!1, timeZoneName:"short"}).split(" ")[1];
  f = a(f);
  g = a(g);
  k < e ? (gb(f, D, c, 17), gb(g, D, d, 17)) : (gb(f, D, d, 17), gb(g, D, c, 17));
}, beginPixelLocalStorageWEBGL:function(a, b, c) {
  (a = w[a].F.Ca) && a.beginPixelLocalStorageWEBGL(l.HEAPU32.subarray(c, c + b));
}, decode_image:function(a, b, c) {
  var d = l.images;
  d || (d = new Map(), l.images = d);
  var e = new Image();
  d.set(a, e);
  b = l.HEAP8.subarray(b, b + c);
  c = new Uint8Array(c);
  c.set(b);
  e.src = URL.createObjectURL(new Blob([c], {type:"image/png"}));
  e.onload = function() {
    l._setWebImage(a, e.width, e.height);
  };
}, delete_image:function(a) {
  var b = l.images;
  b && b.get(a) && b.delete(a);
}, emscripten_asm_const_int:(a, b, c) => {
  xd.length = 0;
  for (var d; d = D[b++];) {
    var e = 105 != d;
    e &= 112 != d;
    c += e && c % 8 ? 4 : 0;
    xd.push(112 == d ? G[c >> 2] : 105 == d ? F[c >> 2] : ya[c >> 3]);
    c += e ? 8 : 4;
  }
  return Ta[a](...xd);
}, emscripten_date_now:() => Date.now(), emscripten_get_now:() => performance.now(), emscripten_resize_heap:a => {
  var b = D.length;
  a >>>= 0;
  if (2147483648 < a) {
    return !1;
  }
  for (var c = 1; 4 >= c; c *= 2) {
    var d = b * (1 + 0.2 / c);
    d = Math.min(d, a + 100663296);
    var e = Math;
    d = Math.max(a, d);
    a: {
      e = (e.min.call(e, 2147483648, d + (65536 - d % 65536) % 65536) - ua.buffer.byteLength + 65535) / 65536;
      try {
        ua.grow(e);
        za();
        var f = 1;
        break a;
      } catch (g) {
      }
      f = void 0;
    }
    if (f) {
      return !0;
    }
  }
  return !1;
}, emscripten_webgl_enable_extension:(a, b) => {
  a = w[a];
  b = b ? L(D, b) : "";
  b.startsWith("GL_") && (b = b.substr(3));
  "WEBGL_draw_instanced_base_vertex_base_instance" == b && yd(W);
  "WEBGL_multi_draw_instanced_base_vertex_base_instance" == b && zd(W);
  "WEBGL_multi_draw" == b && (W.$b = W.getExtension("WEBGL_multi_draw"));
  return !!a.F.getExtension(b);
}, emscripten_webgl_get_current_context:() => q ? q.handle : 0, emscripten_webgl_make_context_current:a => la(a) ? 0 : -5, enable_WEBGL_provoking_vertex:function(a) {
  a = w[a].F;
  a.pb = a.getExtension("WEBGL_provoking_vertex");
  return !!a.pb;
}, enable_WEBGL_shader_pixel_local_storage_coherent:function(a) {
  a = w[a].F;
  const b = a.getExtension("WEBGL_shader_pixel_local_storage");
  return b && b.isCoherent() && 5 == b.framebufferTexturePixelLocalStorageWEBGL.length ? (a.Ca = b, !0) : !1;
}, endPixelLocalStorageWEBGL:function(a, b, c) {
  (a = w[a].F.Ca) && a.endPixelLocalStorageWEBGL(l.HEAPU32.subarray(c, c + b));
}, environ_get:(a, b) => {
  var c = 0;
  Qd().forEach((d, e) => {
    var f = b + c;
    e = G[a + 4 * e >> 2] = f;
    for (f = 0; f < d.length; ++f) {
      B[e++] = d.charCodeAt(f);
    }
    B[e] = 0;
    c += d.length + 1;
  });
  return 0;
}, environ_sizes_get:(a, b) => {
  var c = Qd();
  G[a >> 2] = c.length;
  var d = 0;
  c.forEach(e => d += e.length + 1);
  G[b >> 2] = d;
  return 0;
}, fd_close:function(a) {
  try {
    var b = Kb(a);
    if (null === b.W) {
      throw new M(8);
    }
    b.Qa && (b.Qa = null);
    try {
      b.m.close && b.m.close(b);
    } catch (c) {
      throw c;
    } finally {
      xb[b.W] = null;
    }
    b.W = null;
    return 0;
  } catch (c) {
    if ("undefined" == typeof Yb || "ErrnoError" !== c.name) {
      throw c;
    }
    return c.$;
  }
}, fd_read:function(a, b, c, d) {
  try {
    a: {
      var e = Kb(a);
      a = b;
      for (var f, g = b = 0; g < c; g++) {
        var k = G[a >> 2], p = G[a + 4 >> 2];
        a += 8;
        var m = e, t = f, v = B;
        if (0 > p || 0 > t) {
          throw new M(28);
        }
        if (null === m.W) {
          throw new M(8);
        }
        if (1 === (m.flags & 2097155)) {
          throw new M(8);
        }
        if (16384 === (m.node.mode & 61440)) {
          throw new M(31);
        }
        if (!m.m.read) {
          throw new M(28);
        }
        var x = "undefined" != typeof t;
        if (!x) {
          t = m.position;
        } else if (!m.seekable) {
          throw new M(70);
        }
        var n = m.m.read(m, v, k, p, t);
        x || (m.position += n);
        var r = n;
        if (0 > r) {
          var u = -1;
          break a;
        }
        b += r;
        if (r < p) {
          break;
        }
        "undefined" != typeof f && (f += r);
      }
      u = b;
    }
    G[d >> 2] = u;
    return 0;
  } catch (z) {
    if ("undefined" == typeof Yb || "ErrnoError" !== z.name) {
      throw z;
    }
    return z.$;
  }
}, fd_seek:function(a, b, c, d, e) {
  b = c + 2097152 >>> 0 < 4194305 - !!b ? (b >>> 0) + 4294967296 * c : NaN;
  try {
    if (isNaN(b)) {
      return 61;
    }
    var f = Kb(a);
    Ub(f, b, d);
    Pa = [f.position >>> 0, (Oa = f.position, 1.0 <= +Math.abs(Oa) ? 0.0 < Oa ? +Math.floor(Oa / 4294967296.0) >>> 0 : ~~+Math.ceil((Oa - +(~~Oa >>> 0)) / 4294967296.0) >>> 0 : 0)];
    F[e >> 2] = Pa[0];
    F[e + 4 >> 2] = Pa[1];
    f.Qa && 0 === b && 0 === d && (f.Qa = null);
    return 0;
  } catch (g) {
    if ("undefined" == typeof Yb || "ErrnoError" !== g.name) {
      throw g;
    }
    return g.$;
  }
}, fd_write:function(a, b, c, d) {
  try {
    a: {
      var e = Kb(a);
      a = b;
      for (var f, g = b = 0; g < c; g++) {
        var k = G[a >> 2], p = G[a + 4 >> 2];
        a += 8;
        var m = e, t = k, v = p, x = f, n = B;
        if (0 > v || 0 > x) {
          throw new M(28);
        }
        if (null === m.W) {
          throw new M(8);
        }
        if (0 === (m.flags & 2097155)) {
          throw new M(8);
        }
        if (16384 === (m.node.mode & 61440)) {
          throw new M(31);
        }
        if (!m.m.write) {
          throw new M(28);
        }
        m.seekable && m.flags & 1024 && Ub(m, 0, 2);
        var r = "undefined" != typeof x;
        if (!r) {
          x = m.position;
        } else if (!m.seekable) {
          throw new M(70);
        }
        var u = m.m.write(m, n, t, v, x, void 0);
        r || (m.position += u);
        var z = u;
        if (0 > z) {
          var A = -1;
          break a;
        }
        b += z;
        "undefined" != typeof f && (f += z);
      }
      A = b;
    }
    G[d >> 2] = A;
    return 0;
  } catch (C) {
    if ("undefined" == typeof Yb || "ErrnoError" !== C.name) {
      throw C;
    }
    return C.$;
  }
}, framebufferPixelLocalClearValuefvWEBGL:function(a, b, c, d, e, f) {
  (a = w[a].F.Ca) && a.framebufferPixelLocalClearValuefvWEBGL(b, [c, d, e, f]);
}, framebufferTexturePixelLocalStorageWEBGL:function(a, b, c, d, e, f) {
  (a = w[a].F.Ca) && a.framebufferTexturePixelLocalStorageWEBGL(b, Fd[c], d, e, f);
}, glActiveTexture:a => W.activeTexture(a), glAttachShader:(a, b) => {
  W.attachShader(V[a], Gd[b]);
}, glBindBuffer:(a, b) => {
  35051 == a ? W.Na = b : 35052 == a && (W.Oa = b);
  W.bindBuffer(a, Cd[b]);
}, glBindBufferRange:(a, b, c, d, e) => {
  W.bindBufferRange(a, b, Cd[c], d, e);
}, glBindFramebuffer:(a, b) => {
  W.bindFramebuffer(a, Dd[b]);
}, glBindRenderbuffer:(a, b) => {
  W.bindRenderbuffer(a, Ed[b]);
}, glBindTexture:(a, b) => {
  W.bindTexture(a, Fd[b]);
}, glBindVertexArray:a => {
  W.bindVertexArray(Hd[a]);
}, glBlendEquation:a => W.blendEquation(a), glBlendFunc:(a, b) => W.blendFunc(a, b), glBlitFramebuffer:(a, b, c, d, e, f, g, k, p, m) => W.blitFramebuffer(a, b, c, d, e, f, g, k, p, m), glBufferData:(a, b, c, d) => {
  c && b ? W.bufferData(a, D, d, c, b) : W.bufferData(a, b, d);
}, glBufferSubData:(a, b, c, d) => {
  c && W.bufferSubData(a, b, D, d, c);
}, glClear:a => W.clear(a), glClearBufferfv:(a, b, c) => {
  W.clearBufferfv(a, b, xa, c >> 2);
}, glClearBufferuiv:(a, b, c) => {
  W.clearBufferuiv(a, b, G, c >> 2);
}, glClearColor:(a, b, c, d) => W.clearColor(a, b, c, d), glClearDepthf:a => W.clearDepth(a), glClearStencil:a => W.clearStencil(a), glColorMask:(a, b, c, d) => {
  W.colorMask(!!a, !!b, !!c, !!d);
}, glCompileShader:a => {
  W.compileShader(Gd[a]);
}, glCreateProgram:() => {
  var a = Ld(V), b = W.createProgram();
  b.name = a;
  b.ya = b.wa = b.xa = 0;
  b.Wa = 1;
  V[a] = b;
  return a;
}, glCreateShader:a => {
  var b = Ld(Gd);
  Gd[b] = W.createShader(a);
  return b;
}, glCullFace:a => W.cullFace(a), glDeleteBuffers:(a, b) => {
  for (var c = 0; c < a; c++) {
    var d = F[b + 4 * c >> 2], e = Cd[d];
    e && (W.deleteBuffer(e), e.name = 0, Cd[d] = null, d == W.Na && (W.Na = 0), d == W.Oa && (W.Oa = 0));
  }
}, glDeleteFramebuffers:(a, b) => {
  for (var c = 0; c < a; ++c) {
    var d = F[b + 4 * c >> 2], e = Dd[d];
    e && (W.deleteFramebuffer(e), e.name = 0, Dd[d] = null);
  }
}, glDeleteProgram:a => {
  if (a) {
    var b = V[a];
    b ? (W.deleteProgram(b), b.name = 0, V[a] = null) : X ||= 1281;
  }
}, glDeleteRenderbuffers:(a, b) => {
  for (var c = 0; c < a; c++) {
    var d = F[b + 4 * c >> 2], e = Ed[d];
    e && (W.deleteRenderbuffer(e), e.name = 0, Ed[d] = null);
  }
}, glDeleteShader:a => {
  if (a) {
    var b = Gd[a];
    b ? (W.deleteShader(b), Gd[a] = null) : X ||= 1281;
  }
}, glDeleteTextures:(a, b) => {
  for (var c = 0; c < a; c++) {
    var d = F[b + 4 * c >> 2], e = Fd[d];
    e && (W.deleteTexture(e), e.name = 0, Fd[d] = null);
  }
}, glDeleteVertexArrays:(a, b) => {
  for (var c = 0; c < a; c++) {
    var d = F[b + 4 * c >> 2];
    W.deleteVertexArray(Hd[d]);
    Hd[d] = null;
  }
}, glDepthFunc:a => W.depthFunc(a), glDepthMask:a => {
  W.depthMask(!!a);
}, glDepthRangef:(a, b) => W.depthRange(a, b), glDisable:a => W.disable(a), glDrawArrays:(a, b, c) => {
  W.drawArrays(a, b, c);
}, glDrawArraysInstanced:(a, b, c, d) => {
  W.drawArraysInstanced(a, b, c, d);
}, glDrawBuffers:(a, b) => {
  for (var c = Rd[a], d = 0; d < a; d++) {
    c[d] = F[b + 4 * d >> 2];
  }
  W.drawBuffers(c);
}, glDrawElements:(a, b, c, d) => {
  W.drawElements(a, b, c, d);
}, glDrawElementsInstanced:(a, b, c, d, e) => {
  W.drawElementsInstanced(a, b, c, d, e);
}, glEnable:a => W.enable(a), glEnableVertexAttribArray:a => {
  W.enableVertexAttribArray(a);
}, glFlush:() => W.flush(), glFramebufferRenderbuffer:(a, b, c, d) => {
  W.framebufferRenderbuffer(a, b, c, Ed[d]);
}, glFramebufferTexture2D:(a, b, c, d, e) => {
  W.framebufferTexture2D(a, b, c, Fd[d], e);
}, glFrontFace:a => W.frontFace(a), glGenBuffers:(a, b) => {
  Md(a, b, "createBuffer", Cd);
}, glGenFramebuffers:(a, b) => {
  Md(a, b, "createFramebuffer", Dd);
}, glGenRenderbuffers:(a, b) => {
  Md(a, b, "createRenderbuffer", Ed);
}, glGenTextures:(a, b) => {
  Md(a, b, "createTexture", Fd);
}, glGenVertexArrays:(a, b) => {
  Md(a, b, "createVertexArray", Hd);
}, glGenerateMipmap:a => W.generateMipmap(a), glGetIntegerv:(a, b) => Td(a, b), glGetProgramiv:(a, b, c) => {
  if (c) {
    if (a >= Bd) {
      X ||= 1281;
    } else {
      if (a = V[a], 35716 == b) {
        a = W.getProgramInfoLog(a), null === a && (a = "(unknown error)"), F[c >> 2] = a.length + 1;
      } else if (35719 == b) {
        if (!a.ya) {
          for (b = 0; b < W.getProgramParameter(a, 35718); ++b) {
            a.ya = Math.max(a.ya, W.getActiveUniform(a, b).name.length + 1);
          }
        }
        F[c >> 2] = a.ya;
      } else if (35722 == b) {
        if (!a.wa) {
          for (b = 0; b < W.getProgramParameter(a, 35721); ++b) {
            a.wa = Math.max(a.wa, W.getActiveAttrib(a, b).name.length + 1);
          }
        }
        F[c >> 2] = a.wa;
      } else if (35381 == b) {
        if (!a.xa) {
          for (b = 0; b < W.getProgramParameter(a, 35382); ++b) {
            a.xa = Math.max(a.xa, W.getActiveUniformBlockName(a, b).length + 1);
          }
        }
        F[c >> 2] = a.xa;
      } else {
        F[c >> 2] = W.getProgramParameter(a, b);
      }
    }
  } else {
    X ||= 1281;
  }
}, glGetString:a => {
  var b = Id[a];
  if (!b) {
    switch(a) {
      case 7939:
        b = Vd(Sd().join(" "));
        break;
      case 7936:
      case 7937:
      case 37445:
      case 37446:
        (b = W.getParameter(a)) || (X ||= 1280);
        b = b ? Vd(b) : 0;
        break;
      case 7938:
        b = Vd(`OpenGL ES 3.0 (${W.getParameter(7938)})`);
        break;
      case 35724:
        b = W.getParameter(35724);
        var c = b.match(/^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/);
        null !== c && (3 == c[1].length && (c[1] += "0"), b = `OpenGL ES GLSL ES ${c[1]} (${b})`);
        b = Vd(b);
        break;
      default:
        X ||= 1280;
    }
    Id[a] = b;
  }
  return b;
}, glGetUniformBlockIndex:(a, b) => W.getUniformBlockIndex(V[a], b ? L(D, b) : ""), glGetUniformLocation:(a, b) => {
  b = b ? L(D, b) : "";
  if (a = V[a]) {
    var c = a, d = c.ma, e = c.wb, f;
    if (!d) {
      for (c.ma = d = {}, c.vb = {}, f = 0; f < W.getProgramParameter(c, 35718); ++f) {
        var g = W.getActiveUniform(c, f);
        var k = g.name;
        g = g.size;
        var p = Wd(k);
        p = 0 < p ? k.slice(0, p) : k;
        var m = c.Wa;
        c.Wa += g;
        e[p] = [g, m];
        for (k = 0; k < g; ++k) {
          d[m] = k, c.vb[m++] = p;
        }
      }
    }
    c = a.ma;
    d = 0;
    e = b;
    f = Wd(b);
    0 < f && (d = parseInt(b.slice(f + 1)) >>> 0, e = b.slice(0, f));
    if ((e = a.wb[e]) && d < e[0] && (d += e[1], c[d] = c[d] || W.getUniformLocation(a, b))) {
      return d;
    }
  } else {
    X ||= 1281;
  }
  return -1;
}, glInvalidateFramebuffer:(a, b, c) => {
  for (var d = Rd[b], e = 0; e < b; e++) {
    d[e] = F[c + 4 * e >> 2];
  }
  W.invalidateFramebuffer(a, d);
}, glLinkProgram:a => {
  a = V[a];
  W.linkProgram(a);
  a.ma = 0;
  a.wb = {};
}, glPixelStorei:(a, b) => {
  3317 == a ? Jd = b : 3314 == a && (Kd = b);
  W.pixelStorei(a, b);
}, glReadPixels:(a, b, c, d, e, f, g) => {
  if (W.Na) {
    W.readPixels(a, b, c, d, e, f, g);
  } else {
    var k = Xd(f);
    g >>>= 31 - Math.clz32(k.BYTES_PER_ELEMENT);
    W.readPixels(a, b, c, d, e, f, k, g);
  }
}, glRenderbufferStorageMultisample:(a, b, c, d, e) => W.renderbufferStorageMultisample(a, b, c, d, e), glScissor:(a, b, c, d) => W.scissor(a, b, c, d), glShaderSource:(a, b, c, d) => {
  for (var e = "", f = 0; f < b; ++f) {
    var g = (g = G[c + 4 * f >> 2]) ? L(D, g, d ? G[d + 4 * f >> 2] : void 0) : "";
    e += g;
  }
  W.shaderSource(Gd[a], e);
}, glStencilFunc:(a, b, c) => W.stencilFunc(a, b, c), glStencilFuncSeparate:(a, b, c, d) => W.stencilFuncSeparate(a, b, c, d), glStencilMask:a => W.stencilMask(a), glStencilOp:(a, b, c) => W.stencilOp(a, b, c), glStencilOpSeparate:(a, b, c, d) => W.stencilOpSeparate(a, b, c, d), glTexParameteri:(a, b, c) => W.texParameteri(a, b, c), glTexStorage2D:(a, b, c, d, e) => W.texStorage2D(a, b, c, d, e), glTexStorage3D:(a, b, c, d, e, f) => W.texStorage3D(a, b, c, d, e, f), glTexSubImage2D:(a, b, c, d, e, 
f, g, k, p) => {
  if (W.Oa) {
    W.texSubImage2D(a, b, c, d, e, f, g, k, p);
  } else {
    if (p) {
      var m = Xd(k);
      W.texSubImage2D(a, b, c, d, e, f, g, k, m, p >>> 31 - Math.clz32(m.BYTES_PER_ELEMENT));
    } else {
      if (p) {
        m = Xd(k);
        var t = f * ((Kd || e) * ({5:3, 6:4, 8:2, 29502:3, 29504:4, 26917:2, 26918:2, 29846:3, 29847:4}[g - 6402] || 1) * m.BYTES_PER_ELEMENT + Jd - 1 & -Jd);
        p = m.subarray(p >>> 31 - Math.clz32(m.BYTES_PER_ELEMENT), p + t >>> 31 - Math.clz32(m.BYTES_PER_ELEMENT));
      } else {
        p = null;
      }
      W.texSubImage2D(a, b, c, d, e, f, g, k, p);
    }
  }
}, glUniform1i:(a, b) => {
  var c = W, d = c.uniform1i;
  var e = W.Ib;
  if (e) {
    var f = e.ma[a];
    "number" == typeof f && (e.ma[a] = f = W.getUniformLocation(e, e.vb[a] + (0 < f ? `[${f}]` : "")));
    a = f;
  } else {
    X ||= 1282, a = void 0;
  }
  d.call(c, a, b);
}, glUniformBlockBinding:(a, b, c) => {
  a = V[a];
  W.uniformBlockBinding(a, b, c);
}, glUseProgram:a => {
  a = V[a];
  W.useProgram(a);
  W.Ib = a;
}, glVertexAttribDivisor:(a, b) => {
  W.vertexAttribDivisor(a, b);
}, glVertexAttribIPointer:(a, b, c, d, e) => {
  W.vertexAttribIPointer(a, b, c, d, e);
}, glVertexAttribPointer:(a, b, c, d, e, f) => {
  W.vertexAttribPointer(a, b, c, !!d, e, f);
}, glViewport:(a, b, c, d) => W.viewport(a, b, c, d), invoke_vii:de, isWindowsBrowser:function() {
  return -1 < navigator.platform.indexOf("Win");
}, provokingVertexWEBGL:function(a, b) {
  (a = w[a].F.pb) && a.provokingVertexWEBGL(b);
}, strftime:$d, strftime_l:(a, b, c, d) => $d(a, b, c, d), upload_image:function(a, b) {
  var c = l.images;
  c && (b = c.get(b)) && (a = w[a].F, a.pixelStorei(a.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !0), a.texImage2D(a.TEXTURE_2D, 0, a.RGBA, a.RGBA, a.UNSIGNED_BYTE, b), a.pixelStorei(a.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !1));
}, wasm_start_image_decode:function(a, b, c) {
  b = l.HEAP8.subarray(b, b + c);
  c = new Uint8Array(c);
  c.set(b);
  createImageBitmap(new Blob([c])).then(function(d) {
    var e = (new OffscreenCanvas(d.width, d.height)).getContext("2d");
    e.drawImage(d, 0, 0);
    e = e.getImageData(0, 0, d.width, d.height);
    var f = e.data.length, g = l.Cb(f);
    l.oc.set(e.data, g);
    l.qc(a, d.width, d.height, g, f);
  }).catch(function(d) {
    d = d.message || "decode failed";
    var e = l.Jc(d) + 1, f = l.Cb(e);
    l.Rc(d, f, e);
    l.rc(a, f);
    l.pc(f);
  });
}}, Y = function() {
  function a(c) {
    Y = c.exports;
    ua = Y.memory;
    za();
    Qc = Y.__indirect_function_table;
    Ba.unshift(Y.__wasm_call_ctors);
    Ea--;
    l.monitorRunDependencies?.(Ea);
    0 == Ea && (null !== Fa && (clearInterval(Fa), Fa = null), Ga && (c = Ga, Ga = null, c()));
    return Y;
  }
  var b = {env:ee, wasi_snapshot_preview1:ee,};
  Ea++;
  l.monitorRunDependencies?.(Ea);
  if (l.instantiateWasm) {
    try {
      return l.instantiateWasm(b, a);
    } catch (c) {
      sa(`Module.instantiateWasm callback failed with error: ${c}`), ba(c);
    }
  }
  Ja ||= Ia("webgl2_advanced.wasm") ? "webgl2_advanced.wasm" : l.locateFile ? l.locateFile("webgl2_advanced.wasm", y) : y + "webgl2_advanced.wasm";
  Na(b, function(c) {
    a(c.instance);
  }).catch(ba);
  return {};
}(), lc = a => (lc = Y.free)(a), Ud = a => (Ud = Y.malloc)(a);
l._setWebImage = (a, b, c) => (l._setWebImage = Y.setWebImage)(a, b, c);
var kc = a => (kc = Y.__getTypeName)(a);
l._wasm_image_decode_complete = (a, b, c, d, e) => (l._wasm_image_decode_complete = Y.wasm_image_decode_complete)(a, b, c, d, e);
l._wasm_image_decode_error = (a, b) => (l._wasm_image_decode_error = Y.wasm_image_decode_error)(a, b);
var Qa = l._ma_device__on_notification_unlocked = a => (Qa = l._ma_device__on_notification_unlocked = Y.ma_device__on_notification_unlocked)(a);
l._ma_malloc_emscripten = (a, b) => (l._ma_malloc_emscripten = Y.ma_malloc_emscripten)(a, b);
l._ma_free_emscripten = (a, b) => (l._ma_free_emscripten = Y.ma_free_emscripten)(a, b);
var Ra = l._ma_device_process_pcm_frames_capture__webaudio = (a, b, c) => (Ra = l._ma_device_process_pcm_frames_capture__webaudio = Y.ma_device_process_pcm_frames_capture__webaudio)(a, b, c), Sa = l._ma_device_process_pcm_frames_playback__webaudio = (a, b, c) => (Sa = l._ma_device_process_pcm_frames_playback__webaudio = Y.ma_device_process_pcm_frames_playback__webaudio)(a, b, c), fe = (a, b) => (fe = Y.setThrew)(a, b), ge = a => (ge = Y._emscripten_stack_restore)(a), he = () => (he = Y.emscripten_stack_get_current)();
l.dynCall_iiiji = (a, b, c, d, e, f) => (l.dynCall_iiiji = Y.dynCall_iiiji)(a, b, c, d, e, f);
l.dynCall_iij = (a, b, c, d) => (l.dynCall_iij = Y.dynCall_iij)(a, b, c, d);
l.dynCall_iiji = (a, b, c, d, e) => (l.dynCall_iiji = Y.dynCall_iiji)(a, b, c, d, e);
l.dynCall_jii = (a, b, c) => (l.dynCall_jii = Y.dynCall_jii)(a, b, c);
l.dynCall_vijj = (a, b, c, d, e, f) => (l.dynCall_vijj = Y.dynCall_vijj)(a, b, c, d, e, f);
l.dynCall_jiji = (a, b, c, d, e) => (l.dynCall_jiji = Y.dynCall_jiji)(a, b, c, d, e);
l.dynCall_viijii = (a, b, c, d, e, f, g) => (l.dynCall_viijii = Y.dynCall_viijii)(a, b, c, d, e, f, g);
l.dynCall_iiiiij = (a, b, c, d, e, f, g) => (l.dynCall_iiiiij = Y.dynCall_iiiiij)(a, b, c, d, e, f, g);
l.dynCall_iiiiijj = (a, b, c, d, e, f, g, k, p) => (l.dynCall_iiiiijj = Y.dynCall_iiiiijj)(a, b, c, d, e, f, g, k, p);
l.dynCall_iiiiiijj = (a, b, c, d, e, f, g, k, p, m) => (l.dynCall_iiiiiijj = Y.dynCall_iiiiiijj)(a, b, c, d, e, f, g, k, p, m);
function de(a, b, c) {
  var d = he();
  try {
    Rc(a)(b, c);
  } catch (e) {
    ge(d);
    if (e !== e + 0) {
      throw e;
    }
    fe(1, 0);
  }
}
var ie;
Ga = function je() {
  ie || ke();
  ie || (Ga = je);
};
function ke() {
  function a() {
    if (!ie && (ie = !0, l.calledRun = !0, !va)) {
      l.noFSInit || Vb || (Vb = !0, l.stdin = l.stdin, l.stdout = l.stdout, l.stderr = l.stderr, l.stdin ? Wb("stdin", l.stdin) : Rb("/dev/tty", "/dev/stdin"), l.stdout ? Wb("stdout", null, l.stdout) : Rb("/dev/tty", "/dev/stdout"), l.stderr ? Wb("stderr", null, l.stderr) : Rb("/dev/tty1", "/dev/stderr"), Sb("/dev/stdin", 0), Sb("/dev/stdout", 1), Sb("/dev/stderr", 1));
      Ab = !1;
      Ua(Ba);
      aa(l);
      if (l.onRuntimeInitialized) {
        l.onRuntimeInitialized();
      }
      if (l.postRun) {
        for ("function" == typeof l.postRun && (l.postRun = [l.postRun]); l.postRun.length;) {
          var b = l.postRun.shift();
          Ca.unshift(b);
        }
      }
      Ua(Ca);
    }
  }
  if (!(0 < Ea)) {
    if (l.preRun) {
      for ("function" == typeof l.preRun && (l.preRun = [l.preRun]); l.preRun.length;) {
        Da();
      }
    }
    Ua(Aa);
    0 < Ea || (l.setStatus ? (l.setStatus("Running..."), setTimeout(function() {
      setTimeout(function() {
        l.setStatus("");
      }, 1);
      a();
    }, 1)) : a());
  }
}
if (l.preInit) {
  for ("function" == typeof l.preInit && (l.preInit = [l.preInit]); 0 < l.preInit.length;) {
    l.preInit.pop()();
  }
}
ke();
moduleRtn = ca;



  return moduleRtn;
}
);
})();
export default Rive;
