import { ApiProperty } from '@nestjs/swagger';
import { AuthSessionUserDto } from '../../users/dto/user-response.dto';

export class LoginDataDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ example: 3600, description: 'Masa berlaku dalam detik.' })
  expiresIn!: number;

  @ApiProperty({ type: AuthSessionUserDto })
  user!: AuthSessionUserDto;
}

export class LoginResponseDto {
  @ApiProperty({ type: LoginDataDto })
  data!: LoginDataDto;
}
