import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthenticatedUser;
    }
  }
}

export {};
