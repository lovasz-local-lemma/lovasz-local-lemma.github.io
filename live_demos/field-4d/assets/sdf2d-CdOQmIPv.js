const p=`
fn sd_circle2(p: vec2f, r: f32) -> f32 { return length(p) - r; }
fn sd_box2(p: vec2f, b: vec2f) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2f(0.0, 0.0))) + min(max(d.x, d.y), 0.0);
}
fn sd_tri2(p_in: vec2f, r: f32) -> f32 {
  let k = 1.7320508;
  var p = p_in;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) { p = vec2f(p.x - k * p.y, -k * p.x - p.y) * 0.5; }
  p.x = p.x - clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
`;export{p as s};
