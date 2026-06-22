import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SymptomResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiPropertyOptional({ nullable: true }) category!: string | null;
  @ApiProperty() isCommonTbSymptom!: boolean;
  @ApiProperty() isPossibleSideEffect!: boolean;
}

export class SymptomListDataResponseDto {
  @ApiProperty({ type: [SymptomResponseDto] })
  data!: SymptomResponseDto[];
}
