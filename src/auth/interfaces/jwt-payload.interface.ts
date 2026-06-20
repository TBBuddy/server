import { UserRole } from '../../common/enums/user-role.enum';

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
