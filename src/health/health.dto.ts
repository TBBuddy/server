import { ApiProperty } from '@nestjs/swagger';

class DependencyHealthDto {
  @ApiProperty({ enum: ['up', 'down', 'disabled'] })
  status!: 'up' | 'down' | 'disabled';
}

class HealthDataDto {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status!: 'ok' | 'degraded';

  @ApiProperty({ type: DependencyHealthDto })
  api!: DependencyHealthDto;

  @ApiProperty({ type: DependencyHealthDto })
  mongodb!: DependencyHealthDto;

  @ApiProperty({ type: DependencyHealthDto })
  redis!: DependencyHealthDto;
}

export class HealthResponseDto {
  @ApiProperty({ type: HealthDataDto })
  data!: HealthDataDto;
}
