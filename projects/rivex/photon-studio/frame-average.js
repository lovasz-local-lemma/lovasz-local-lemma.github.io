// Average independent, already-normalized photon passes before tone mapping.
// Only the current transport batch is retained on the CPU. Two 32-bit float
// images hold the running mean, so a longer observation does not grow geometry.
export function makeFrameAverage(gl) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, `#version 300 es
    out vec2 uv;
    void main(){vec2 p=vec2(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.);uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`],
    [gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    in vec2 uv; uniform sampler2D previousMean, batch;
    uniform float weight; out vec4 color;
    void main(){vec3 current=texture(batch,uv).rgb;
      vec3 mean=weight==1.?current:mix(texture(previousMean,uv).rgb,current,weight);
      color=vec4(mean,1.);}`]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader); gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  const vao = gl.createVertexArray();
  const targets = Array.from({length: 2}, () => {
    const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const parameter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.NEAREST);
    for (const parameter of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.CLAMP_TO_EDGE);
    return {texture, framebuffer};
  });
  const uniform = name => gl.getUniformLocation(program, name);
  let width = 0, height = 0, count = 0, front = 0, key = '', revision = -1;
  function reset() { count = 0; revision = -1; key = ''; }
  return {
    get count() { return count; },
    get texture() { return targets[front].texture; },
    reset,
    add(texture, W, H, viewKey, sampleRevision) {
      if (width !== W || height !== H) {
        width = W; height = H; reset();
        for (const target of targets) {
          gl.bindTexture(gl.TEXTURE_2D, target.texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, null);
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error('Photon mean framebuffer incomplete.');
        }
      }
      if (key !== viewKey) { reset(); key = viewKey; }
      if (revision === sampleRevision) return targets[front].texture;
      const back = 1 - front;
      gl.bindFramebuffer(gl.FRAMEBUFFER, targets[back].framebuffer);
      gl.viewport(0, 0, W, H); gl.disable(gl.BLEND);
      gl.useProgram(program); gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, targets[front].texture);
      gl.uniform1i(uniform('previousMean'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniform('batch'), 1);
      gl.uniform1f(uniform('weight'), 1 / (count + 1));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      count++; revision = sampleRevision; front = back;
      return targets[front].texture;
    },
    // Sparse linear-radiance samples for the browser regression, before the
    // display curve. Reading is explicit and never part of normal rendering.
    sample(batchFramebuffer) {
      const read = framebuffer => {
        const pixels = new Float32Array(width * height * 4), values = [];
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixels);
        for (let y = 0; y < 24; y++) for (let x = 0; x < 40; x++) {
          const offset = (Math.floor((y + .5) * height / 24) * width + Math.floor((x + .5) * width / 40)) * 4;
          values.push(...pixels.subarray(offset, offset + 3));
        }
        return values;
      };
      const mean = read(targets[front].framebuffer), batch = read(batchFramebuffer);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return {count, width, height, mean, batch};
    },
    dispose() {
      gl.deleteProgram(program); gl.deleteVertexArray(vao);
      for (const target of targets) { gl.deleteTexture(target.texture); gl.deleteFramebuffer(target.framebuffer); }
    }
  };
}
