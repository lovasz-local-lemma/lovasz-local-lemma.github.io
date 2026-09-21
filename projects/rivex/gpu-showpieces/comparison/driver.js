import {buildPrismLight,PROFILE_SIZE,PATH_RECORDS} from './fractal-optics.js';
// Native WebGPU rejects negative bases to pow even when the literal exponent is
// even. The Rive compiler folds these powers. Preserve the same even polynomial
// by guarding its base before WebGPU compilation; canonical assets stay intact.
export function lowerEvenPowers(source){
 let result='',cursor=0;
 while(true){const at=source.indexOf('pow(',cursor);if(at<0){result+=source.slice(cursor);break;}result+=source.slice(cursor,at);let depth=1,comma=-1,end=at+4;for(;end<source.length&&depth;end++){const c=source[end];if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&depth===1)comma=end;}if(depth||comma<0){result+=source.slice(at);break;}const base=source.slice(at+4,comma),exponent=source.slice(comma+1,end-1).trim(),n=Number(exponent);result+='pow('+(Number.isInteger(n)&&n>0&&n%2===0?'abs('+lowerEvenPowers(base)+')':lowerEvenPowers(base))+','+exponent+')';cursor=end;}
 return result;
}
/**
 * External WebGPU comparison route. This deliberately does not use GPU Canvas:
 * JavaScript owns the GPU device, uniform buffer, pipeline, and presentation.
 * Paired studies share their shader with the signed document. Host-only previews
 * may extend that interface and are labeled separately at their entry points.
 */
export async function createShaderView(canvas, { shaderUrl, scene = 'spectral-observatory', width = 1040, height = 640, transparent = false, onError = () => {} } = {}) {
  let device;
  let context;
  let disposed = false;
  let failed = false;

  function report(error) {
    if (disposed || failed) return;
    failed = true;
    onError(error instanceof Error ? error : new Error(String(error)));
  }

  try {
    if (!navigator.gpu) throw new Error('This comparison route requires browser WebGPU.');
    if (!shaderUrl) throw new Error('A shader URL is required for the external route.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter is available for the external route.');
    device = await adapter.requestDevice({ label: 'RIVX external comparison' });
    device.addEventListener('uncapturederror', event => report(event.error));
    device.lost.then(info => {
      if (!disposed) report(new Error('External WebGPU device lost: ' + (info.message || info.reason)));
    });

    const response = await fetch(shaderUrl);
    if (!response.ok) throw new Error('Could not load the shared WGSL (' + response.status + ').');
    const code = lowerEvenPowers(await response.text());
    const shader = device.createShaderModule({ label: 'Shared '+scene+' WGSL', code });
    const info = await shader.getCompilationInfo();
    const errors = info.messages.filter(message => message.type === 'error');
    if (errors.length) {
      throw new Error(errors.map(message => `WGSL ${message.lineNum}:${message.linePos} ${message.message}`).join('\n'));
    }

    canvas.width = width;
    canvas.height = height;
    context = canvas.getContext('webgpu');
    if (!context) throw new Error('Could not create a WebGPU canvas context.');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: transparent ? 'premultiplied' : 'opaque' });

    const uniform = device.createBuffer({
      label: scene==='fractal-prism'?'Garden controls with optical-object options':'Shared material controls',
      size: scene==='fractal-prism'?80:64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    const pipeline = await device.createRenderPipelineAsync({
      label: 'External execution of the shared Rive showpiece shader',
      layout: 'auto',
      vertex: { module: shader, entryPoint: 'vertexMain' },
      fragment: { module: shader, entryPoint: 'fragmentMain', targets: [{ format }] },
      primitive: { topology: 'triangle-list' }
    });
    const gardenLight=scene==='fractal-prism'?device.createBuffer({label:'Finite prism receiver and paths',size:(PROFILE_SIZE+PATH_RECORDS)*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}):null;
    let gardenSignature='',gardenStats=null;
    const group = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniform } },...(gardenLight?[{binding:1,resource:{buffer:gardenLight}}]:[])]
    });
    const values = new Float32Array(scene==='fractal-prism'?20:16);
    values[0] = width;
    values[1] = height;
    values[8] = 0.5;
    values[9] = 0.5;
    values[12] = 1;
    values[13] = 1;
    values[15] = 0.15;
    const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
    const unit = (value, fallback) => Math.max(0, Math.min(1, finite(value, fallback)));

    function render(controls = {}) {
      if (disposed || failed) return false;
      values.fill(0);values[0]=width;values[1]=height;values[2]=Math.max(0,finite(controls.time,0));
      if(scene==='control-skin'){values.set(controls.uniforms);
      }else if(scene==='fractal-prism'){values[4]=finite(controls.lensX,570);values[5]=finite(controls.lensY,340);values[6]=finite(controls.dispersion,1.2);values[7]=finite(controls.rotation,.08);values[8]=finite(controls.cX,-.745);values[9]=finite(controls.cY,.186);values[10]=finite(controls.zoom,.16);values[11]=finite(controls.mode,0);values[12]=finite(controls.lensHover,0);values[13]=finite(controls.sliceMode,0);values[14]=finite(controls.sliceW,0);values[15]=finite(controls.sliceAmount,1);values[3]=finite(controls.slicePhase,0);values[16]=finite(controls.lensShape,0);values[17]=finite(controls.deskSpectrum,1);values[18]=finite(controls.chromaticSplit,1);
      }else if(scene==='interactive-optics'){
        values[4]=finite(controls.lensX,490);values[5]=finite(controls.lensY,310);values[6]=finite(controls.power,1.05);values[7]=finite(controls.dispersion,1.1);values[8]=unit(controls.frost,.12);values[9]=finite(controls.mode,0);values[10]=finite(controls.lensHover,0);values[11]=finite(controls.grabbed,0);values[12]=1;
      }else if(scene==='resonant-membrane'){
        values[4]=finite(controls.n,2);values[5]=finite(controls.m,3);values[6]=finite(controls.mix,.72);values[7]=finite(controls.amplitude,.26);values[8]=finite(controls.excitationMode,0);values[9]=finite(controls.strikeTime,0);values[10]=finite(controls.strikeX,.37);values[11]=finite(controls.strikeY,.41);values[12]=finite(controls.damping,.18);values[13]=finite(controls.fundamental,110);
      }else{
        const spectral=scene==='spectral-observatory';values[4]=spectral?finite(controls.light,.2):unit(controls.roughness,.32);values[5]=spectral?unit(controls.roughness,.32):unit(controls.strength,.8);values[6]=spectral?unit(controls.strength,.75):finite(controls.light,.2);values[7]=spectral?0:1.1;values[8]=values[9]=.5;values[12]=values[13]=1;values[14]=finite(controls.view,0);values[15]=.15;
      }
      if(gardenLight){const key=JSON.stringify(Array.from(values.slice(4,8)).concat(Array.from(values.slice(16,19))));if(key!==gardenSignature){const light=buildPrismLight({lensX:values[4],lensY:values[5],dispersion:values[6],rotation:values[7],lensShape:values[16],deskSpectrum:values[17],chromaticSplit:values[18]},width,height);device.queue.writeBuffer(gardenLight,0,light.data);gardenSignature=key;gardenStats=light.stats;}}
      device.queue.writeBuffer(uniform, 0, values);
      const commands = device.createCommandEncoder();
      const pass = commands.beginRenderPass({
        colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear', storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: transparent ? 0 : 1 }
        }]
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, group);
      pass.draw(3);
      pass.end();
      device.queue.submit([commands.finish()]);
      return true;
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      uniform.destroy();
      gardenLight?.destroy();
      context.unconfigure();
      device.destroy();
    }

    return { render, dispose, width, height, optics:()=>gardenStats, route: 'external-webgpu' };
  } catch (error) {
    report(error);
    disposed = true;
    if (context) context.unconfigure();
    if (device) device.destroy();
    throw error;
  }
}
