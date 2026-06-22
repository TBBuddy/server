import { ApiProperty } from '@nestjs/swagger';

export class SymptomResponseDto {
  @ApiProperty() _id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ nullable: true }) category!: string | null;
  @ApiProperty() is_common_tb_symptom!: boolean;
  @ApiProperty() is_possible_side_effect!: boolean;
}
