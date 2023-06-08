import {} from "../modules/polygon.js";
import { Vec2 } from "../modules/utils.js";
/**
 * Creates and compiles a shader.
 *
 * @param {!WebGLRenderingContext} gl The WebGL Context.
 * @param {string} shaderSource The GLSL source code for the shader.
 * @param {number} shaderType The type of shader, VERTEX_SHADER or
 *     FRAGMENT_SHADER.
 * @return {!WebGLShader} The shader.
 */
function compileShader(gl, shaderSource, shaderType) {
  // Create the shader object
  var shader = gl.createShader(shaderType);

  // Set the shader source code.
  gl.shaderSource(shader, shaderSource);

  // Compile the shader
  gl.compileShader(shader);

  // Check if it compiled
  var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!success) {
    // Something went wrong during compilation; get the error
    throw "could not compile shader:" + gl.getShaderInfoLog(shader);
  }

  return shader;
}

/**
 * Creates a program from 2 shaders.
 *
 * @param {!WebGLRenderingContext) gl The WebGL context.
 * @param {!WebGLShader} vertexShader A vertex shader.
 * @param {!WebGLShader} fragmentShader A fragment shader.
 * @return {!WebGLProgram} A program.
 */
function createProgram(gl, vertexShader, fragmentShader) {
  // create a program.
  var program = gl.createProgram();

  // attach the shaders.
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  // link the program.
  gl.linkProgram(program);

  // Check if it linked.
  var success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!success) {
    // something went wrong with the link
    throw "program failed to link:" + gl.getProgramInfoLog(program);
  }

  return program;
}

const canvas = document.querySelector("#gpu");

const gl = canvas.getContext("webgl2");

const vertexShader = compileShader(
  gl,
  `
uniform float viewportWidth;
uniform float viewportHeight;
attribute vec3 pos;
void main() {
  gl_Position = vec4(
    pos.x * 2.0 / viewportWidth - 1.0,
    1.0 - pos.y * 2.0 / viewportHeight,
    pos.z,
    1.0
  );
  gl_PointSize = 10.0;
}
`,
  gl.VERTEX_SHADER
);

const fragmentShader = compileShader(
  gl,
  `
precision mediump float;
 
uniform sampler2D uSampler;

void main() {
  gl_FragColor = texture2D(uSampler, vec2(0.0, 0.0));
}
`,
  gl.FRAGMENT_SHADER
);

const program = createProgram(gl, vertexShader, fragmentShader);

gl.useProgram(program);

var buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);

var vao = gl.createVertexArray();
gl.bindVertexArray(vao);

var positionLoc = gl.getAttribLocation(program, "pos");

// turn on getting data out of a buffer for this attribute
gl.enableVertexAttribArray(positionLoc);

var numComponents = 2; // (x, y, z)
var type = gl.FLOAT; // 32bit floating point values
var normalize = false; // leave the values as they are
var offset = 0; // start at the beginning of the buffer
var stride = 0; // how many bytes to move to the next vertex
// 0 = use the correct stride for type and numComponents
gl.vertexAttribPointer(
  positionLoc,
  numComponents,
  type,
  normalize,
  stride,
  offset
);

gl.bindVertexArray(vao);

gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
gl.clearColor(0, 0, 0, 0);
gl.clear(gl.COLOR_BUFFER_BIT);

const texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, texture);
// Because images have to be downloaded over the internet
// they might take a moment until they are ready.
// Until then put a single pixel in the texture so we can
// use it immediately. When the image has finished downloading
// we'll update the texture with the contents of the image.
const level = 0;
const internalFormat = gl.RGBA;
const width = 1;
const height = 1;
const border = 0;
const srcFormat = gl.RGBA;
const srcType = gl.UNSIGNED_BYTE;

gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.uniform1i(gl.getUniformLocation(program, "uSampler"), 0);

gl.texImage2D(
  gl.TEXTURE_2D,
  level,
  internalFormat,
  width,
  height,
  border,
  srcFormat,
  srcType,
  new Uint8Array([0, 0, 255, 255])
);

const indexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

const points = [];
const holes = [];

function ccw(a, b, c) {
  // TODO: cross
  return (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
}

function isOuter(vertices) {
  const n = vertices.length;
  let j = -1;
  for (let i = 0; i < n; ++i) {
    if (
      j < 0 ||
      vertices[i].x < vertices[j].x ||
      (vertices[i].x == vertices[j].x && vertices[i].y < vertices[j].y)
    ) {
      j = i;
    }
  }
  if (j < 0) throw "impossible";
  // y-axis is flipped, so the sign is the opposite
  return ccw(vertices[(j - 1 + n) % n], vertices[j], vertices[(j + 1) % n]) > 0;
}

function triangulate(paths) {
  const vertices = [];
  const outerLoops = [];
  const innerLoops = [];

  for (let [i, path] of paths.entries()) {
    path = dedupe(path);
    const n = vertices.length;
    vertices.push(...path);

    if (isOuter(path)) {
      const loop = [];
      for (let i = 0; i < path.length; ++i) {
        loop.push(n + i);
      }
      outerLoops.push(loop);
    } else {
      const n = vertices.length;
      vertices.push(...path);
      const loop = [];
      for (let i = 0; i < path.length; ++i) {
        loop.push(n + i);
      }
      let k = 0;
      let x = vertices[loop[0]].x;
      for (let i = 0; i < loop.length; ++i) {
        const best = vertices[loop[k]];
        const cur = vertices[loop[i]];
        if (cur.x > best.x || (cur.x == best.x && cur.y > best.y)) {
          k = i;
          x = cur.x;
        }
      }
      innerLoops.push([...loop.slice(k), ...loop.slice(0, k)]);
    }
  }

  console.log("inner:", [...innerLoops], "outer", [...outerLoops]);

  // process inner loops
  // for (let j = 0; j < holes.length - 1; ++j) {
  //   const innerIndices = [];
  //   for (let i = holes[j]; i < holes[j + 1]; ++i) {
  //     innerIndices.push(i);
  //   }
  //   let k = 0;
  //   let x = vertices[innerIndices[0]].x;
  //   for (let i = 0; i < innerIndices.length; ++i) {
  //     const best = vertices[innerIndices[k]];
  //     const cur = vertices[innerIndices[i]];
  //     if (cur.x > best.x || (cur.x == best.x && cur.y > best.y)) {
  //       k = i;
  //       x = cur.x;
  //     }
  //   }
  //   innerLoops.push([...innerIndices.slice(k), ...innerIndices.slice(0, k)]);
  // }
  innerLoops.sort((a, b) => vertices[a[0]].x - vertices[b[0]].x);
  // console.log("innerloops", innerLoops);

  // eliminate inner loops
  while (innerLoops.length) {
    // console.log([...innerLoops], innerLoops[0]);
    const inner = innerLoops.pop();
    // console.log("inner", inner);
    const o = vertices[inner[0]];

    let minIntersectionX = Infinity;
    let closest = -1;
    let containing;
    for (const outerLoop of outerLoops) {
      for (let i = 0; i < outerLoop.length; ++i) {
        const a = vertices[index(outerLoop, i)];
        const b = vertices[index(outerLoop, i + 1)];
        // clockwise
        // console.log(a, b, o);
        if (a.y <= o.y && b.y >= o.y) {
          const intersectionX = a.x + ((b.x - a.x) / (b.y - a.y)) * (o.y - a.y);
          if (intersectionX > o.x && intersectionX < minIntersectionX) {
            minIntersectionX = intersectionX;
            closest = i;
            containing = outerLoop;
          }
        }
      }
    }
    if (closest < 0) throw "not possible";
    let visible = closest;
    const c = new Vec2(minIntersectionX, o.y);
    for (let i = 0; i < containing.length; ++i) {
      if (
        isInside(
          o,
          vertices[containing[closest]],
          // vertices[outerLoop[index(closest + 1)]],
          c,
          vertices[containing[i]]
        ) &&
        vertices[containing[i]].normalize().x >
          vertices[containing[visible]].normalize().x
      ) {
        visible = i;
      }
    }
    const n = vertices.length;
    // console.log(["before", ...outerLoop]);
    vertices.push(o.clone(), vertices[containing[visible]].clone());
    containing.splice(visible + 1, 0, ...inner, n, n + 1);
    // console.log(["after", ...outerLoop]);
  }

  console.log("after processing", [...innerLoops], [...outerLoops]);

  const triangles = [];
  return { vertices, triangles };

  for (const outerLoop of outerLoops) {
    // triangulate outside
    let ears = [];
    for (const i of outerLoop) {
      if (isEar(outerLoop, i)) {
        ears.push(index(outerLoop, i));
      }
    }

    while (outerLoop.length > 3 && ears.length) {
      // console.log("ear length:", ears.length);
      const cur = ears.pop();
      const i = outerLoop.indexOf(cur);
      const prev = index(outerLoop, i - 1);
      const next = index(outerLoop, i + 1);
      triangles.push(prev, cur, next);
      outerLoop.splice(i, 1);

      ears = ears.filter((x) => x != prev && x != next);
      if (isEar(outerLoop, i - 1)) {
        // console.log("prev is ear");
        ears.push(prev);
      } else {
        // console.log("prev is not an ear");
      }
      if (isEar(outerLoop, i)) {
        // console.log("next is ear");
        ears.push(next);
      } else {
        // console.log("next is not ear");
      }
    }
    //
    // console.log("exit loop", [...outerLoop], outerLoop.length);
    if (outerLoop.length == 3) {
      triangles.push(...outerLoop);
      outerLoop.length = 0;
    }
    console.log("outerloop.length", outerLoop.length);
  }

  function index(loop, i) {
    const n = loop.length;
    i %= n;
    if (i < 0) i += n;
    return loop[i];
  }

  function isInside(a, b, c, p) {
    const v0 = b.sub(a);
    const v1 = c.sub(a);
    const v2 = p.sub(a);
    const d00 = v0.dot(v0);
    const d01 = v0.dot(v1);
    const d11 = v1.dot(v1);
    const d20 = v2.dot(v0);
    const d21 = v2.dot(v1);
    const denom = d00 * d11 - d01 * d01;
    const v = (d11 * d20 - d01 * d21) / denom;
    const w = (d00 * d21 - d01 * d20) / denom;
    const u = 1 - v - w;
    return v > 0 && w > 0 && u > 0;
  }

  function isConvex(loop, i) {
    return (
      ccw(
        vertices[index(loop, i - 1)],
        vertices[index(loop, i)],
        vertices[index(loop, i + 1)]
      ) >= 0
    ); // FIx!!!!!!!! ,>=
  }

  function isEar(loop, i) {
    if (!isConvex(loop, i)) return false;
    const cur = index(loop, i);
    const prev = index(loop, i - 1);
    const next = index(loop, i + 1);
    // console.log("test", vertices[cur], vertices[prev], vertices[next]);
    for (let idx of loop) {
      // console.log(idx);
      if (
        idx != cur &&
        idx != prev &&
        idx != next &&
        isInside(vertices[prev], vertices[cur], vertices[next], vertices[idx])
      ) {
        return false;
      }
      // console.log(
      //   "inside?",
      //   isInside(vertices[prev], vertices[cur], vertices[next], vertices[idx])
      // );
    }
    return true;
  }

  // for (let i = 0; i + 3 <= vertices.length; i += 3) {
  //   triangles.push(i);
  //   triangles.push(i + 1);
  //   triangles.push(i + 2);
  // }

  return {
    vertices,
    triangles,
  };
}

function drawPolygon({ vertices, triangles }) {
  gl.uniform1f(gl.getUniformLocation(program, "viewportWidth"), canvas.width);
  gl.uniform1f(gl.getUniformLocation(program, "viewportHeight"), canvas.height);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(vertices.flatMap(({ x, y }) => [x, y])),
    gl.STATIC_DRAW
  );
  // gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(triangles),
    gl.STATIC_DRAW
  );
  // gl.drawElements(gl.TRIANGLES, triangles.length, gl.UNSIGNED_SHORT, 0);
  gl.drawArrays(gl.POINTS, 0, vertices.length);
}

import { parse } from "https://unpkg.com/opentype.js/dist/opentype.module.js";
import { sampleBezier } from "../modules/bezier.js";

export const FontBook = {
  NotoSans: parse(await (await fetch("./NotoSans.ttf")).arrayBuffer()),
  NotoSerif: parse(await (await fetch("./NotoSerif.ttf")).arrayBuffer()),
  Zapfino: parse(await (await fetch("./Zapfino.ttf")).arrayBuffer()),
};

window.onkeyup = (e) => {
  if (e.key == "i") {
    holes.push(points.length);
  } else if (e.key == "d") {
  }
  const polygons = makeText(e.key, 300, 300, 300, FontBook.NotoSans, 30);
  console.log(polygons);
  for (let paths of polygons) {
    drawPolygon(triangulate(paths));
  }
};

canvas.onclick = (e) => {
  points.push(new Vec2(e.offsetX, e.offsetY));
};

function dedupe(arr) {
  let j = 1;
  for (let i = 1; i < arr.length; ++i) {
    if (!arr[i].equal(arr[i - 1])) {
      arr[j++] = arr[i];
    }
  }
  arr.length = j;
  if (arr[j - 1] == arr[0]) arr.pop();
  return arr;
}

export function makeText(text, dx, dy, size, font, r = 32) {
  const polygons = [];
  for (const path of font.getPaths(text, dx, dy, size)) {
    let start = null;
    let prev = null;
    let pathSet = [];
    let currentPath = [];

    for (const cmd of path.commands) {
      switch (cmd.type) {
        case "M": {
          start = prev = new Vec2(cmd.x, cmd.y);
          break;
        }
        case "L": {
          const p = new Vec2(cmd.x, cmd.y);
          currentPath.push(prev);
          prev = p;
          break;
        }
        case "Q": {
          currentPath.push(
            ...dedupe(
              sampleBezier(
                [prev, new Vec2(cmd.x1, cmd.y1), new Vec2(cmd.x, cmd.y)],
                r
              )
            )
          );
          prev = new Vec2(cmd.x, cmd.y);
          break;
        }
        case "C": {
          currentPath.push(
            ...dedupe(
              sampleBezier(
                [
                  prev,
                  new Vec2(cmd.x1, cmd.y1),
                  new Vec2(cmd.x2, cmd.y2),
                  new Vec2(cmd.x, cmd.y),
                ],
                r
              )
            )
          );
          prev = new Vec2(cmd.x, cmd.y);
          break;
        }
        case "Z": {
          currentPath.push(start);
          pathSet.push(currentPath);
          currentPath = [];
          prev = start;
          break;
        }
      }
    }
    polygons.push(pathSet);
  }
  return polygons;
}