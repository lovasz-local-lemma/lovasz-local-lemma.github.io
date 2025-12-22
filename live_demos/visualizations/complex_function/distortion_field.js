// Conformal distortion field visualization methods

// Compute numerical Jacobian matrix at a point
function computeJacobian(visualizer, z, h = 0.001) {
    const fz = visualizer.applyFunction(z);
    const fz_dx = visualizer.applyFunction({ re: z.re + h, im: z.im });
    const fz_dy = visualizer.applyFunction({ re: z.re, im: z.im + h });
    
    // Jacobian matrix: J = [∂u/∂x  ∂u/∂y]
    //                      [∂v/∂x  ∂v/∂y]
    // where f(z) = u(x,y) + i*v(x,y)
    const J = {
        dudx: (fz_dx.re - fz.re) / h,
        dudy: (fz_dy.re - fz.re) / h,
        dvdx: (fz_dx.im - fz.im) / h,
        dvdy: (fz_dy.im - fz.im) / h
    };
    
    return J;
}

// Get distortion properties from Jacobian
function getDistortionProperties(J) {
    // Determinant = area scaling factor
    const det = J.dudx * J.dvdy - J.dudy * J.dvdx;
    
    // Trace and other properties for eigenvalues
    const trace = J.dudx + J.dvdy;
    const discriminant = Math.sqrt(Math.max(0, trace * trace - 4 * det));
    
    // Eigenvalues (principal stretch factors)
    const lambda1 = (trace + discriminant) / 2;
    const lambda2 = (trace - discriminant) / 2;
    
    // Angle of rotation (for conformal angle)
    const angle = Math.atan2(J.dvdx + J.dudy, J.dudx - J.dvdy) / 2;
    
    // Conformality measure: |λ1 - λ2| / (|λ1| + |λ2|)
    const conformality = Math.abs(lambda1 - lambda2) / (Math.abs(lambda1) + Math.abs(lambda2) + 0.0001);
    
    return {
        det: Math.abs(det),
        lambda1,
        lambda2,
        angle,
        conformality
    };
}
