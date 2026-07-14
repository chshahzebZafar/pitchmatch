import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeeModel } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class MediatorProfileDto {
  @ApiProperty({ example: 'Advocate High Court' })
  @IsString()
  profTitle: string;

  @ApiProperty({ example: 'LLB, Corporate Law' })
  @IsString()
  qualification: string;

  @ApiProperty({ example: 'BC-12345' })
  @IsString()
  licenseNo: string;

  @ApiProperty({ example: 'Punjab Bar Council' })
  @IsString()
  licenseBody: string;

  @ApiProperty({ example: ['Pakistan'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  jurisdictions: string[];

  @ApiProperty({ example: 8 })
  @IsInt()
  @Min(0)
  yearsExp: number;

  @ApiProperty({ example: ['Investment agreements', 'Due diligence'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  specializations: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firm?: string;

  @ApiProperty({ enum: FeeModel })
  @IsEnum(FeeModel)
  feeModel: FeeModel;

  @ApiPropertyOptional({ example: '$150/hr' })
  @IsOptional()
  @IsString()
  feeRange?: string;
}
