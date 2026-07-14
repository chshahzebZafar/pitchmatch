import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BusinessModel,
  FundingBracket,
  InnovatorStage,
  Instrument,
} from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class InnovatorProfileDto {
  @ApiProperty({ example: 'CarbonLedger' })
  @IsString()
  @MaxLength(160)
  title: string;

  @ApiProperty({ example: 'FinTech' })
  @IsString()
  sector: string;

  @ApiProperty({ enum: InnovatorStage })
  @IsEnum(InnovatorStage)
  stage: InnovatorStage;

  @ApiProperty({ maxLength: 140 })
  @IsString()
  @MaxLength(140)
  oneLiner: string;

  @ApiProperty({ maxLength: 600 })
  @IsString()
  @MaxLength(600)
  problem: string;

  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  solution: string;

  @ApiProperty({ enum: BusinessModel })
  @IsEnum(BusinessModel)
  businessModel: BusinessModel;

  @ApiProperty({ enum: FundingBracket })
  @IsEnum(FundingBracket)
  fundingMin: FundingBracket;

  @ApiProperty({ enum: FundingBracket })
  @IsEnum(FundingBracket)
  fundingMax: FundingBracket;

  @ApiProperty({ enum: Instrument })
  @IsEnum(Instrument)
  instrument: Instrument;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  breakevenMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  revY1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  revY2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  revY3?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  traction?: string;

  @ApiProperty({ example: ['Pakistan', 'MENA'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  geoMarket: string[];
}
