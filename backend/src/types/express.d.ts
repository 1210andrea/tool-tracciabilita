import 'express';

// Augment Express Request with authenticated user.
declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      role: string;
    };
  }
}

